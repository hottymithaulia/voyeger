from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import httpx
import yaml

from server.config import get_settings

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


def is_inside_bbox(lat: float, lng: float, bbox: Tuple[float, float, float, float]) -> bool:
    south, west, north, east = bbox
    return south <= lat <= north and west <= lng <= east


def _load_cache(cache_path: Path) -> Dict[str, Dict[str, Any]]:
    if cache_path.is_file():
        try:
            return json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_cache(cache_path: Path, cache: Dict[str, Dict[str, Any]]) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with cache_path.open("w", encoding="utf-8", newline="\n") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=2, sort_keys=True)


def _query_nominatim(
    client: httpx.Client,
    query: str,
    bbox: Tuple[float, float, float, float],
    user_agent: str,
) -> Optional[Dict[str, Any]]:
    south, west, north, east = bbox
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": "1",
        "viewbox": f"{west},{north},{east},{south}",
        "bounded": "1",
    }
    for attempt in range(2):
        try:
            resp = client.get(NOMINATIM_URL, params=params, headers={"User-Agent": user_agent})
            resp.raise_for_status()
            rows = resp.json()
            if isinstance(rows, list) and rows:
                top = rows[0]
                return {
                    "display_name": str(top.get("display_name") or ""),
                    "lat": float(top["lat"]),
                    "lng": float(top["lon"]),
                    "source": "nominatim",
                }
            return None
        except Exception:
            if attempt == 0:
                time.sleep(1.0)
    return None


def _query_overpass(
    client: httpx.Client,
    overpass_url: str,
    name_hint: str,
    bbox: Tuple[float, float, float, float],
    user_agent: str,
) -> Optional[Dict[str, Any]]:
    south, west, north, east = bbox
    safe = name_hint.replace('"', "").strip()
    if not safe:
        return None
    query = (
        f"[out:json][timeout:10];"
        f'(node({south},{west},{north},{east})["name"~"{safe}",i];'
        f'way({south},{west},{north},{east})["name"~"{safe}",i];'
        f'relation({south},{west},{north},{east})["name"~"{safe}",i];);'
        f"out center 1;"
    )
    for attempt in range(2):
        try:
            resp = client.post(
                overpass_url,
                data={"data": query},
                headers={"User-Agent": user_agent},
            )
            resp.raise_for_status()
            elements = (resp.json() or {}).get("elements") or []
            if elements:
                el = elements[0]
                center = el.get("center") or {}
                lat = el.get("lat", center.get("lat"))
                lng = el.get("lon", center.get("lon"))
                if lat is not None and lng is not None:
                    tags = el.get("tags") or {}
                    return {
                        "display_name": str(tags.get("name") or safe),
                        "lat": float(lat),
                        "lng": float(lng),
                        "source": "overpass",
                    }
            return None
        except Exception:
            if attempt == 0:
                time.sleep(1.0)
    return None


def resolve_geo(
    content_dir: Path = Path("content"),
    rate_delay_seconds: float = 1.0,
    refresh_cache: bool = False,
    nominatim_fn: Callable[..., Optional[Dict[str, Any]]] = _query_nominatim,
    overpass_fn: Callable[..., Optional[Dict[str, Any]]] = _query_overpass,
) -> Dict[str, Any]:
    settings = get_settings()
    places_dir = content_dir / "places"
    working_dir = content_dir / "working"
    working_dir.mkdir(parents=True, exist_ok=True)
    cache_path = working_dir / "geo_cache.json"
    review_csv = working_dir / "geo_review.csv"

    cache = {} if refresh_cache else _load_cache(cache_path)
    existing_approved: Dict[str, str] = {}
    if review_csv.is_file():
        with review_csv.open("r", encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                if row.get("id") and row.get("approved"):
                    existing_approved[row["id"]] = row["approved"]

    rows: List[Dict[str, Any]] = []
    network_calls = 0

    with httpx.Client(timeout=12.0) as client:
        for path in sorted(places_dir.glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            pid = data.get("id") or path.stem
            geo = data.get("geo") or {}
            if geo.get("lat") is not None and geo.get("lng") is not None:
                continue

            meta_path = working_dir / f"{pid}.meta.yaml"
            meta = yaml.safe_load(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {}
            title = str(((data.get("text") or {}).get("en") or {}).get("title") or pid)
            hint = str((meta or {}).get("osm_search_hint") or f"{title} Bhopal")

            if pid in cache and cache[pid].get("query") == hint:
                hit = cache[pid].get("result")
            else:
                if network_calls > 0 and rate_delay_seconds > 0:
                    time.sleep(rate_delay_seconds)
                hit = nominatim_fn(client, hint, settings.bhopal_bbox, settings.osm_user_agent)
                network_calls += 1
                if hit is None:
                    if rate_delay_seconds > 0:
                        time.sleep(rate_delay_seconds)
                    hit = overpass_fn(
                        client,
                        settings.overpass_url,
                        title,
                        settings.bhopal_bbox,
                        settings.osm_user_agent,
                    )
                    network_calls += 1
                cache[pid] = {"query": hint, "result": hit}
                _save_cache(cache_path, cache)

            if hit is not None:
                lat = float(hit["lat"])
                lng = float(hit["lng"])
                inside = is_inside_bbox(lat, lng, settings.bhopal_bbox)
                rows.append(
                    {
                        "id": pid,
                        "title": title,
                        "matched OSM display name": hit.get("display_name") or "",
                        "lat": f"{lat:.6f}",
                        "lng": f"{lng:.6f}",
                        "inside_bbox": "true" if inside else "false",
                        "source": hit.get("source") or "",
                        "approved": existing_approved.get(pid, ""),
                    }
                )
            else:
                rows.append(
                    {
                        "id": pid,
                        "title": title,
                        "matched OSM display name": "",
                        "lat": "",
                        "lng": "",
                        "inside_bbox": "false",
                        "source": "",
                        "approved": existing_approved.get(pid, ""),
                    }
                )

    fieldnames = [
        "id",
        "title",
        "matched OSM display name",
        "lat",
        "lng",
        "inside_bbox",
        "source",
        "approved",
    ]
    with review_csv.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    resolved_count = sum(1 for r in rows if r["lat"] and r["lng"])
    return {
        "candidates": len(rows),
        "resolved": resolved_count,
        "network_calls": network_calls,
        "review_csv": str(review_csv),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Resolve missing geo into content/working/geo_review.csv")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    summary = resolve_geo(args.content_dir, refresh_cache=args.refresh)
    print(
        f"Geo review written: {summary['resolved']}/{summary['candidates']} candidates resolved "
        f"({summary['network_calls']} network calls) -> {summary['review_csv']}"
    )


if __name__ == "__main__":
    main()
