from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Any, Dict

import yaml

from pipeline.resolve_geo import is_inside_bbox
from server.config import get_settings

OSM_ATTRIBUTION_SOURCE = {
    "name": "Coordinates from OpenStreetMap contributors (ODbL)",
    "url": "https://www.openstreetmap.org/copyright",
    "type": "osm-odbl",
}


def apply_geo(content_dir: Path = Path("content")) -> Dict[str, int]:
    settings = get_settings()
    places_dir = content_dir / "places"
    review_csv = content_dir / "working" / "geo_review.csv"
    if not review_csv.is_file():
        return {"applied": 0, "skipped": 0}

    applied = 0
    skipped = 0

    with review_csv.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            pid = (row.get("id") or "").strip()
            approved = (row.get("approved") or "").strip().upper()
            inside_flag = (row.get("inside_bbox") or "").strip().lower()
            if approved != "Y" or inside_flag != "true":
                skipped += 1
                continue

            try:
                lat = float(row["lat"])
                lng = float(row["lng"])
            except (KeyError, TypeError, ValueError):
                skipped += 1
                continue

            if not is_inside_bbox(lat, lng, settings.bhopal_bbox):
                skipped += 1
                continue

            place_path = places_dir / f"{pid}.yaml"
            if not place_path.is_file():
                skipped += 1
                continue

            data = yaml.safe_load(place_path.read_text(encoding="utf-8")) or {}
            data["geo"] = {"lat": lat, "lng": lng}
            prov = data.setdefault("provenance", {})
            prov["geo_attribution"] = "Coordinates from OpenStreetMap contributors (ODbL)"
            sources = list(prov.get("sources") or [])
            if not any(s.get("type") == "osm-odbl" for s in sources if isinstance(s, dict)):
                sources.append(dict(OSM_ATTRIBUTION_SOURCE))
            prov["sources"] = sources

            rendered = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000)
            with place_path.open("w", encoding="utf-8", newline="\n") as out_fh:
                out_fh.write(rendered)
            applied += 1

    return {"applied": applied, "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply approved coordinates from geo_review.csv")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    args = parser.parse_args()
    summary = apply_geo(args.content_dir)
    print(f"Applied geo to {summary['applied']} places (skipped {summary['skipped']}).")


if __name__ == "__main__":
    main()
