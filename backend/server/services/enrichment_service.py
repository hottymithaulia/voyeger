from __future__ import annotations

import asyncio
import html
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx
from sqlalchemy.orm import Session

from server.config import get_settings
from server.models import EnrichmentCache, Place, PlaceText

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")
_OUTBOUND_SEMAPHORE = asyncio.Semaphore(2)


def sanitize_plain_text(raw: str | None) -> str:
    if not raw:
        return ""
    stripped = _HTML_TAG_RE.sub(" ", raw)
    unescaped = html.unescape(stripped)
    return _WHITESPACE_RE.sub(" ", unescaped).strip()


def apply_enrichment(place: Dict[str, Any], enrichment: Dict[str, Any]) -> Dict[str, Any]:
    """Merge rule: enrichment writes ONLY into place['enrichment'], never into curated fields."""
    updated = deepcopy(place)
    updated["enrichment"] = deepcopy(enrichment)
    return updated


def _is_fresh(row: EnrichmentCache, now: datetime) -> bool:
    fetched = row.fetched_at
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=timezone.utc)
    return (now - fetched) < timedelta(hours=row.ttl_hours)


async def fetch_osm_enrichment(
    client: httpx.AsyncClient,
    place: Place,
    title: str,
) -> Optional[Dict[str, Any]]:
    settings = get_settings()
    safe_title = sanitize_plain_text(title).replace('"', "")
    south, west, north, east = settings.bhopal_bbox
    query = (
        f'[out:json][timeout:5];'
        f'(node(around:100,{place.lat},{place.lng})["name"];'
        f'way(around:100,{place.lat},{place.lng})["name"];'
        f'node({south},{west},{north},{east})["name"~"{safe_title}",i];);'
        f'out center 5;'
    )
    async with _OUTBOUND_SEMAPHORE:
        resp = await client.post(
            settings.overpass_url,
            data={"data": query},
            headers={"User-Agent": settings.osm_user_agent},
        )
        resp.raise_for_status()
        data = resp.json()

    elements = data.get("elements") or []
    if not elements:
        return None
    tags = elements[0].get("tags") or {}
    osm_type = elements[0].get("type", "node")
    osm_id = elements[0].get("id", "")
    address_parts = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:suburb"),
        tags.get("addr:city"),
    ]
    address = sanitize_plain_text(", ".join(p for p in address_parts if p)) or None
    return {
        "source": "OpenStreetMap",
        "license": "ODbL",
        "url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}" if osm_id else "https://www.openstreetmap.org/",
        "opening_hours": sanitize_plain_text(tags.get("opening_hours")) or None,
        "address": address,
        "phone": sanitize_plain_text(tags.get("phone") or tags.get("contact:phone")) or None,
        "wheelchair": sanitize_plain_text(tags.get("wheelchair")) or None,
    }


async def fetch_wikivoyage_enrichment(
    client: httpx.AsyncClient,
    title: str,
) -> Optional[Dict[str, Any]]:
    settings = get_settings()
    clean_title = sanitize_plain_text(title)
    if not clean_title:
        return None
    params = {
        "action": "query",
        "prop": "extracts",
        "exintro": "1",
        "explaintext": "1",
        "titles": clean_title,
        "format": "json",
        "redirects": "1",
    }
    async with _OUTBOUND_SEMAPHORE:
        resp = await client.get(
            settings.wikivoyage_api,
            params=params,
            headers={"User-Agent": settings.osm_user_agent},
        )
        resp.raise_for_status()
        data = resp.json()

    pages = (data.get("query") or {}).get("pages") or {}
    for page_id, page in pages.items():
        if str(page_id) == "-1":
            continue
        extract = sanitize_plain_text(page.get("extract"))
        page_title = sanitize_plain_text(page.get("title") or clean_title)
        if not extract:
            continue
        return {
            "source": "Wikivoyage",
            "license": "CC BY-SA 4.0",
            "url": f"https://en.wikivoyage.org/wiki/{quote(page_title.replace(' ', '_'))}",
            "extract": extract[:1000],
        }
    return None


def _upsert_cache(
    db: Session,
    place_id: str,
    source: str,
    payload: Dict[str, Any],
    now: datetime,
    ttl_hours: int,
) -> None:
    row = db.get(EnrichmentCache, (place_id, source))
    if row is None:
        db.add(
            EnrichmentCache(
                place_id=place_id,
                source=source,
                payload=payload,
                fetched_at=now,
                ttl_hours=ttl_hours,
            )
        )
    else:
        row.payload = payload
        row.fetched_at = now
        row.ttl_hours = ttl_hours


async def get_enrichment_for_places(
    db: Session,
    place_ids: List[str],
    timeout_seconds: float = 8.0,
) -> Dict[str, Dict[str, Any]]:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    result: Dict[str, Dict[str, Any]] = {}
    to_fetch: List[tuple[Place, str, List[str]]] = []

    for pid in place_ids:
        place = db.get(Place, pid)
        if place is None:
            result[pid] = {"osm": None, "wikivoyage": None, "fetched_at": None}
            continue

        osm_row = db.get(EnrichmentCache, (pid, "osm"))
        wiki_row = db.get(EnrichmentCache, (pid, "wikivoyage"))

        osm_val = osm_row.payload if osm_row else None
        wiki_val = wiki_row.payload if wiki_row else None
        fetched_times = [
            r.fetched_at.replace(tzinfo=timezone.utc) if r.fetched_at.tzinfo is None else r.fetched_at
            for r in (osm_row, wiki_row)
            if r is not None
        ]
        latest_fetched = max(fetched_times).isoformat() if fetched_times else None
        result[pid] = {
            "osm": osm_val,
            "wikivoyage": wiki_val,
            "fetched_at": latest_fetched,
        }

        missing_sources: List[str] = []
        if osm_row is None or not _is_fresh(osm_row, now):
            missing_sources.append("osm")
        if wiki_row is None or not _is_fresh(wiki_row, now):
            missing_sources.append("wikivoyage")

        if missing_sources:
            en_text = db.get(PlaceText, (pid, "en"))
            title = en_text.title if en_text else pid.replace("-", " ")
            to_fetch.append((place, title, missing_sources))

    if not to_fetch:
        return result

    async def _fetch_all() -> None:
        async with httpx.AsyncClient(timeout=5.0) as client:
            tasks = []
            task_meta = []
            for place, title, sources in to_fetch:
                if "osm" in sources:
                    tasks.append(fetch_osm_enrichment(client, place, title))
                    task_meta.append((place.id, "osm"))
                if "wikivoyage" in sources:
                    tasks.append(fetch_wikivoyage_enrichment(client, title))
                    task_meta.append((place.id, "wikivoyage"))

            outcomes = await asyncio.gather(*tasks, return_exceptions=True)
            for (pid, src), outcome in zip(task_meta, outcomes):
                if isinstance(outcome, Exception) or outcome is None:
                    # Stale-while-error: keep stale cache or None
                    continue
                _upsert_cache(db, pid, src, outcome, now, settings.enrichment_ttl_hours)
                result[pid][src] = outcome
                result[pid]["fetched_at"] = now.isoformat()
            db.commit()

    try:
        await asyncio.wait_for(_fetch_all(), timeout=timeout_seconds)
    except (asyncio.TimeoutError, Exception):
        # Never 5xx on upstream failure/timeout; return stale cache or nulls
        pass

    return result
