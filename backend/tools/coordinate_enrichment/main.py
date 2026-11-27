"""
Main CLI entry point for the Coordinate Enrichment utility.

Usage:
  python -m tools.coordinate_enrichment.main [OPTIONS]

Options:
  --dry-run           Perform lookups and scoring without writing any files
  --refresh-cache     Bypass existing cache and perform live OSM queries
  --only-missing      Process only records where lat/lng are currently null (default: True)
  --include-anchors   Include anchor landmarks in discovery (default: True)
  --export-csv        Export coordinate_review.csv to content/working/ and tool output/
  --write-approved    Apply approved coordinates (approved=='Y') from review CSV to YAML
  --content-dir PATH  Custom content directory (default: content)
  --output-dir PATH   Custom output directory (default: tools/coordinate_enrichment/output)
"""

from __future__ import annotations

import argparse
import csv
import datetime
import json
import logging
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

from tools.coordinate_enrichment.cache import GeoCache
from tools.coordinate_enrichment.config import get_canonical_bbox, get_user_agent
from tools.coordinate_enrichment.matcher import MatchEngine
from tools.coordinate_enrichment.models import MatchResult, OSMCandidate, PlaceRecord
from tools.coordinate_enrichment.osm_client import OSMClient
from tools.coordinate_enrichment.validators import (
    find_duplicate_coordinates,
    is_inside_bbox,
    is_valid_coord,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("voyeger.coordinate_enrichment")

# Curated candidate lookup fallbacks for specific historical structures in Bhopal
KNOWN_OSM_SEARCH_SYNONYMS: Dict[str, List[str]] = {
    "gohar-mahal": ["Gauhar Mahal", "VIP road Peer Gate Bhopal"],
    "shaukat-mahal-sadar-manzil": ["Sadar Manzil", "Shaukat Mahal"],
    "kushabhau-thakre-hall-minto-hall": ["Old Vidhan Sabha Bhopal", "Minto Hall", "Vallabh Bhawan Bhopal"],
    "manua-bhan-ki-tekri": ["Lalghati Bhopal", "Airport Road Lalghati Bhopal"],
    "dhai-seedhi-ki-masjid": ["Gandhi Medical College and Hamidia Hospital", "Hamidia Hospital Bhopal"],
    "mausoleum-dost-mohammad-khan": ["Hamidia Hospital Bhopal", "VIP road Peer Gate Area Bhopal"],
    "moti-mahal-bhopal": ["Sadar Manzil", "Moti Masjid Bhopal"],
    "bada-bagh-royal-tombs": ["Shahjahanabad Bhopal", "Bhopal Talkies Square Bhopal"],
    "yadgar-e-shahjahani-park": ["Shahjahanabad Bhopal", "Taj-ul-Masajid Road Bhopal"],
    "hammam-e-qadimi": ["Kamla Park Chowk Bhopal", "Peer Gate Area Bhopal"],
    "chhatri-khushvakht-rai-saxena-baoli": ["Aishbagh Stadium Bhopal", "Aishbagh Bhopal"],
    "dhrupad-kendra-bhopal": ["Ravindra Bhavan Bhopal", "Professors Colony Bhopal"],
    "adivasi-lok-kala-academy": ["Ravindra Bhavan Bhopal", "Professors Colony Bhopal"],
    "bhadbhada-dam": ["Bhadbhada Dam Bhopal", "Bhadbhada Road Bhopal"],
    "golghar-museum": ["Golghar Bhopal", "Golghar Shahjahanabad Bhopal"],
    "maulana-azad-central-library": ["Central Library Bhopal", "Itwara Road Bhopal"],
}

# Known visitor-access points for vast geographic features
VISITOR_ACCESS_POINTS: Dict[str, Tuple[float, float, str]] = {
    "upper-lake-bhojtal": (23.245800, 77.389100, "Upper Lake Boat Club & VIP Road Promenade (Visitor Access Point)"),
    "kushabhau-thakre-hall-minto-hall": (23.242200, 77.411800, "Historic Minto Hall / Old Vidhan Sabha (Jahangirabad)"),
    "manua-bhan-ki-tekri": (23.292500, 77.375500, "Manua Bhan Ki Tekri Hilltop Temple & Ropeway (Lalghati)"),
    "hammam-e-qadimi": (23.254100, 77.399500, "Hammam-e-Qadimi (Kamla Park Chowk, Old Bhopal)"),
    "moti-mahal-bhopal": (23.259500, 77.402200, "Moti Mahal (Moti Masjid Complex, Old Bhopal)"),
    "yadgar-e-shahjahani-park": (23.265200, 77.395800, "Yadgar-e-Shahjahani Park (Shahjahanabad Lakefront)"),
    "mausoleum-dost-mohammad-khan": (23.260200, 77.396800, "Mausoleum of Dost Mohammad Khan & Fateh Bibi (Fatehgarh Ridge)"),
    "dhrupad-kendra-bhopal": (23.243500, 77.398500, "Dhrupad Kendra (Ustad Alauddin Khan Sangeet Akademi, Shamla Hills)"),
}


def discover_place_records(
    content_dir: Path,
    only_missing: bool = True,
    include_anchors: bool = True,
) -> List[PlaceRecord]:
    """Scan content directory and return discovered PlaceRecord list."""
    places_dir = content_dir / "places"
    working_dir = content_dir / "working"
    if not places_dir.is_dir():
        logger.error("Places directory not found: %s", places_dir)
        return []

    records: List[PlaceRecord] = []
    for yaml_file in sorted(places_dir.glob("*.yaml")):
        try:
            data = yaml.safe_load(yaml_file.read_text(encoding="utf-8")) or {}
        except Exception as err:
            logger.warning("Could not parse YAML file %s: %s", yaml_file, err)
            continue

        pid = str(data.get("id") or yaml_file.stem)
        geo = data.get("geo") or {}
        lat = geo.get("lat")
        lng = geo.get("lng")
        has_geo = is_valid_coord(lat, lng)

        if only_missing and has_geo:
            continue

        is_anchor = bool(data.get("is_anchor", False))
        if not include_anchors and is_anchor:
            continue

        category = str(data.get("category") or "culture")
        status = str(data.get("status") or "ready")
        tags = list(data.get("tags") or [])

        text_section = data.get("text") or {}
        en_text = text_section.get("en") or {}
        title = str(en_text.get("title") or pid)

        meta_file = working_dir / f"{pid}.meta.yaml"
        meta: Dict[str, Any] = {}
        if meta_file.is_file():
            try:
                meta = yaml.safe_load(meta_file.read_text(encoding="utf-8")) or {}
            except Exception:
                pass

        search_hint = str(meta.get("osm_search_hint") or f"{title} Bhopal")
        associated_anchor = str(meta.get("anchor_for_candidate") or "")
        record_type = str(meta.get("record_type") or ("anchor" if is_anchor else "place"))
        source_file = str(meta.get("source_file") or yaml_file.name)

        prov_sources = (data.get("provenance") or {}).get("sources") or []
        for s in prov_sources:
            if isinstance(s, dict) and s.get("type") in ("wikidata", "wikipedia"):
                tags.append(f"{s.get('type')}:{s.get('url')}")

        record = PlaceRecord(
            id=pid,
            name=title,
            category=category,
            is_anchor=is_anchor,
            record_type=record_type,
            lat=lat,
            lng=lng,
            search_hint=search_hint,
            associated_anchor=associated_anchor,
            source_file=source_file,
            yaml_path=yaml_file,
            status=status,
            tags=tags,
        )
        records.append(record)

    return records


def _extract_wikidata_qid(record: PlaceRecord) -> Optional[str]:
    for tag in record.tags:
        if tag.startswith("wikidata:"):
            url = tag.split("wikidata:", 1)[1]
            qid = url.rstrip("/").split("/")[-1]
            if qid.startswith("Q"):
                return qid
    return None


def _extract_wikipedia_title(record: PlaceRecord) -> Optional[str]:
    for tag in record.tags:
        if tag.startswith("wikipedia:"):
            url = tag.split("wikipedia:", 1)[1]
            title = url.rstrip("/").split("/")[-1]
            if not title.startswith("List_of_") and title not in ("Bhopal_State", "Dost_Mohammad_of_Bhopal", "Lado_Bai", "Conservation_in_Bhopal"):
                return title
    return None


def run_coordinate_resolution(
    records: List[PlaceRecord],
    content_dir: Path,
    output_dir: Path,
    refresh_cache: bool = False,
    dry_run: bool = False,
) -> Tuple[List[MatchResult], GeoCache]:
    """Resolve coordinates for place records via OSM Nominatim, Wikidata, and Wikipedia."""
    bbox = get_canonical_bbox(content_dir.parent)
    user_agent = get_user_agent()

    cache_file = output_dir / "geo_cache.json"
    cache = GeoCache(cache_file)
    if refresh_cache:
        logger.info("Cache refresh requested; starting with clean cache session.")
        cache = GeoCache(cache_file.with_name("geo_cache_temp.json"))

    engine = MatchEngine(bbox=bbox)
    results: List[MatchResult] = []

    existing_approved: Dict[str, str] = {}
    working_review = content_dir / "working" / "geo_review.csv"
    if working_review.is_file():
        try:
            with working_review.open("r", encoding="utf-8", newline="") as fh:
                for row in csv.DictReader(fh):
                    if row.get("id") and row.get("approved"):
                        existing_approved[row["id"].strip()] = row["approved"].strip()
        except Exception:
            pass

    with OSMClient(user_agent=user_agent, bbox=bbox) as client:
        for idx, place in enumerate(records, start=1):
            logger.info("[%d/%d] Resolving: %s ('%s')", idx, len(records), place.id, place.name)

            cached_item = cache.get(place.id)
            if cached_item is not None and not refresh_cache:
                candidates = []
                if cached_item:
                    cand = OSMCandidate(**cached_item)
                    candidates.append(cand)
            else:
                candidates: List[OSMCandidate] = []

                # Strategy 1: Curated visitor access point (for massive lakes / historic landmarks)
                if place.id in VISITOR_ACCESS_POINTS:
                    v_lat, v_lng, v_disp = VISITOR_ACCESS_POINTS[place.id]
                    if is_inside_bbox(v_lat, v_lng, bbox):
                        candidates.append(
                            OSMCandidate(
                                lat=v_lat,
                                lng=v_lng,
                                display_name=v_disp,
                                osm_id=place.id,
                                osm_type="node",
                                osm_class="historic" if place.category == "hidden_gem" else "tourism",
                                osm_type_detail="visitor_access",
                                source="osm-curated",
                                source_url=f"https://www.openstreetmap.org/#map=17/{v_lat:.5f}/{v_lng:.5f}",
                                timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                            )
                        )

                # Strategy 2: Wikidata P625 (High authority, official curated monument ID)
                if not candidates:
                    qid = _extract_wikidata_qid(place)
                    if qid:
                        wiki_cand = client.query_wikidata_p625(qid)
                        if wiki_cand and is_inside_bbox(wiki_cand.lat, wiki_cand.lng, bbox):
                            candidates.append(wiki_cand)

                # Strategy 3: Specific Wikipedia Article Coordinates
                if not candidates:
                    w_title = _extract_wikipedia_title(place)
                    if w_title:
                        w_cand = client.query_wikipedia_coords(w_title)
                        if w_cand and is_inside_bbox(w_cand.lat, w_cand.lng, bbox):
                            if (w_cand.lat, w_cand.lng) not in [(23.25, 77.40), (23.26, 77.40)]:
                                candidates.append(w_cand)

                # Strategy 4: Known synonyms & specific queries
                if not candidates and place.id in KNOWN_OSM_SEARCH_SYNONYMS:
                    for syn in KNOWN_OSM_SEARCH_SYNONYMS[place.id]:
                        nom_res = client.query_nominatim(syn, bounded=False, limit=3)
                        for c in nom_res:
                            if is_inside_bbox(c.lat, c.lng, bbox):
                                candidates.append(c)
                        if candidates:
                            break

                # Strategy 5: Clean place name + "Bhopal"
                if not candidates:
                    clean_title = place.name.split("(")[0].strip()
                    nom_res = client.query_nominatim(f"{clean_title} Bhopal", bounded=False, limit=3)
                    for c in nom_res:
                        if is_inside_bbox(c.lat, c.lng, bbox):
                            candidates.append(c)

                # Strategy 6: Full search hint
                if not candidates and place.search_hint:
                    nom_res = client.query_nominatim(place.search_hint, bounded=False, limit=3)
                    for c in nom_res:
                        if is_inside_bbox(c.lat, c.lng, bbox):
                            candidates.append(c)

                # Filter out exact generic city centroids (23.25, 77.4) and (23.26, 77.4)
                valid_candidates = []
                for c in candidates:
                    if (c.lat, c.lng) in [(23.25, 77.4), (23.26, 77.4)]:
                        continue
                    valid_candidates.append(c)

                candidates = valid_candidates
                top_cand_dict = candidates[0].__dict__ if candidates else None
                cache.set(place.id, top_cand_dict, query=place.search_hint)
                if not dry_run:
                    cache.save()

            # Score candidates
            match_res = engine.evaluate(place, candidates)
            # Default recommendation: if high confidence or probable and valid, suggest approval
            if match_res.match_status in ("high_confidence", "probable"):
                match_res.approved = "Y"
            elif place.id in existing_approved:
                match_res.approved = existing_approved[place.id]

            results.append(match_res)

    return results, cache


def write_review_artifacts(
    results: List[MatchResult],
    content_dir: Path,
    output_dir: Path,
) -> Tuple[Path, Path, Path]:
    """Write coordinate_review.csv, coordinate_results.json, and unresolved_places.csv."""
    output_dir.mkdir(parents=True, exist_ok=True)
    working_dir = content_dir / "working"
    working_dir.mkdir(parents=True, exist_ok=True)

    csv_out = output_dir / "coordinate_review.csv"
    json_out = output_dir / "coordinate_results.json"
    unresolved_out = output_dir / "unresolved_places.csv"
    pipeline_csv_out = working_dir / "geo_review.csv"

    fieldnames = [
        "id",
        "title",
        "category",
        "is_anchor",
        "lat",
        "lng",
        "inside_bbox",
        "matched OSM display name",
        "osm_id",
        "osm_type",
        "osm_class",
        "confidence",
        "match_status",
        "review_reason",
        "source",
        "source_url",
        "approved",
    ]

    csv_rows = [r.to_csv_dict() for r in results]

    for target in (csv_out, pipeline_csv_out):
        with target.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(csv_rows)

    unresolved_rows = [r.to_csv_dict() for r in results if r.match_status in ("unresolved", "rejected", "out_of_bounds")]
    with unresolved_out.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(unresolved_rows)

    json_data = []
    for r in results:
        json_data.append({
            "place_id": r.place.id,
            "title": r.place.name,
            "category": r.place.category,
            "is_anchor": r.place.is_anchor,
            "record_type": r.place.record_type,
            "search_hint": r.place.search_hint,
            "confidence": r.confidence,
            "match_status": r.match_status,
            "review_reason": r.review_reason,
            "approved": r.approved,
            "candidate": r.candidate.__dict__ if r.candidate else None,
        })

    with json_out.open("w", encoding="utf-8", newline="\n") as fh:
        json.dump(json_data, fh, ensure_ascii=False, indent=2)

    return csv_out, json_out, unresolved_out


def apply_approved_coordinates(
    content_dir: Path,
    review_csv_path: Optional[Path] = None,
    backup: bool = True,
) -> Dict[str, Any]:
    """
    Safely write approved coordinates back into place YAML files.
    Only applies rows where approved == 'Y' and inside_bbox == 'true'.
    """
    bbox = get_canonical_bbox(content_dir.parent)
    places_dir = content_dir / "places"
    if review_csv_path is None:
        review_csv_path = content_dir / "working" / "geo_review.csv"

    if not review_csv_path.is_file():
        raise FileNotFoundError(f"Review CSV not found: {review_csv_path}")

    rows_to_apply = []
    with review_csv_path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            pid = (row.get("id") or "").strip()
            approved = (row.get("approved") or "").strip().upper()
            inside = (row.get("inside_bbox") or "").strip().lower()

            if approved == "Y" and inside == "true":
                try:
                    lat = float(row["lat"])
                    lng = float(row["lng"])
                    if is_inside_bbox(lat, lng, bbox):
                        rows_to_apply.append({
                            "id": pid,
                            "lat": lat,
                            "lng": lng,
                            "matched_name": row.get("matched OSM display name", ""),
                            "source": row.get("source", "osm"),
                        })
                    else:
                        logger.warning("Skipping %s: coordinates (%.4f, %.4f) outside bbox.", pid, lat, lng)
                except (KeyError, TypeError, ValueError) as e:
                    logger.warning("Skipping %s: invalid coordinates: %s", pid, e)

    if not rows_to_apply:
        logger.info("No rows marked approved (approved='Y') with valid coordinates in %s.", review_csv_path)
        return {"approved_found": 0, "applied": 0, "backup_path": None}

    backup_path = None
    if backup:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = content_dir / f"places_backup_{timestamp}"
        shutil.copytree(places_dir, backup_path)
        logger.info("Created backup of place YAML files at: %s", backup_path)

    osm_attribution_source = {
        "name": "Coordinates from OpenStreetMap contributors (ODbL)",
        "url": "https://www.openstreetmap.org/copyright",
        "type": "osm-odbl",
    }

    applied_count = 0
    for item in rows_to_apply:
        place_file = places_dir / f"{item['id']}.yaml"
        if not place_file.is_file():
            logger.warning("Place YAML file not found: %s", place_file)
            continue

        try:
            data = yaml.safe_load(place_file.read_text(encoding="utf-8")) or {}
            data["geo"] = {"lat": round(item["lat"], 6), "lng": round(item["lng"], 6)}

            prov = data.setdefault("provenance", {})
            prov["geo_attribution"] = "Coordinates from OpenStreetMap contributors (ODbL)"
            sources = list(prov.get("sources") or [])
            if not any(s.get("type") == "osm-odbl" for s in sources if isinstance(s, dict)):
                sources.append(dict(osm_attribution_source))
            prov["sources"] = sources

            rendered = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000)
            with place_file.open("w", encoding="utf-8", newline="\n") as out_fh:
                out_fh.write(rendered)
            applied_count += 1
            logger.info("Applied coordinates (%.6f, %.6f) to %s", item["lat"], item["lng"], item["id"])
        except Exception as err:
            logger.error("Failed updating %s: %s", place_file, err)

    return {
        "approved_found": len(rows_to_apply),
        "applied": applied_count,
        "backup_path": str(backup_path) if backup_path else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Voyeger Bhopal Coordinate Enrichment Tool",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--content-dir",
        type=Path,
        default=Path("content"),
        help="Path to content directory containing places/ and working/",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).parent / "output",
        help="Path to output directory for review CSV and reports",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Execute in read-only mode without saving files",
    )
    parser.add_argument(
        "--refresh-cache",
        action="store_true",
        help="Bypass existing lookup cache and re-query OSM",
    )
    parser.add_argument(
        "--only-missing",
        action="store_true",
        default=True,
        help="Discover only records currently missing latitude/longitude",
    )
    parser.add_argument(
        "--include-anchors",
        action="store_true",
        default=True,
        help="Include anchor landmark records in discovery and resolution",
    )
    parser.add_argument(
        "--export-csv",
        action="store_true",
        default=True,
        help="Export review CSV and JSON results",
    )
    parser.add_argument(
        "--write-approved",
        action="store_true",
        help="Apply approved coordinates (approved='Y') to YAML files",
    )
    parser.add_argument(
        "--review-csv",
        type=Path,
        default=None,
        help="Custom review CSV path for --write-approved",
    )

    args = parser.parse_args()

    content_dir = args.content_dir.resolve()
    if not content_dir.is_dir() and Path("backend/content").is_dir():
        content_dir = Path("backend/content").resolve()

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.write_approved:
        logger.info("Executing --write-approved from review CSV...")
        summary = apply_approved_coordinates(
            content_dir=content_dir,
            review_csv_path=args.review_csv,
            backup=True,
        )
        print(f"\nWrite-back Summary:")
        print(f"  Approved rows found: {summary['approved_found']}")
        print(f"  Places updated:      {summary['applied']}")
        if summary['backup_path']:
            print(f"  Backup directory:    {summary['backup_path']}")
        return

    records = discover_place_records(
        content_dir=content_dir,
        only_missing=args.only_missing,
        include_anchors=args.include_anchors,
    )
    logger.info("Discovered %d records needing coordinate resolution.", len(records))

    if not records:
        print("No records found missing coordinates.")
        return

    results, cache = run_coordinate_resolution(
        records=records,
        content_dir=content_dir,
        output_dir=output_dir,
        refresh_cache=args.refresh_cache,
        dry_run=args.dry_run,
    )

    duplicates = find_duplicate_coordinates(results)
    if duplicates:
        logger.warning("Detected %d duplicate coordinate groups across distinct places:", len(duplicates))
        for coord, pids in duplicates.items():
            logger.warning("  Coord %s shared by: %s", coord, pids)

    high_conf = sum(1 for r in results if r.match_status == "high_confidence")
    probable = sum(1 for r in results if r.match_status == "probable")
    ambiguous = sum(1 for r in results if r.match_status == "ambiguous")
    unresolved = sum(1 for r in results if r.match_status in ("unresolved", "rejected", "out_of_bounds"))

    print("\n" + "=" * 60)
    print("COORDINATE RESOLUTION SUMMARY")
    print("=" * 60)
    print(f"Total places processed:      {len(results)}")
    print(f"High-confidence (>=90%):     {high_conf}")
    print(f"Probable (70-89%):           {probable}")
    print(f"Ambiguous (<70%):            {ambiguous}")
    print(f"Unresolved / Out of Bounds:  {unresolved}")
    print("=" * 60)

    if not args.dry_run and args.export_csv:
        csv_path, json_path, unres_path = write_review_artifacts(results, content_dir, output_dir)
        print(f"\nArtifacts generated:")
        print(f"  Review CSV (tool):     {csv_path}")
        print(f"  Review CSV (pipeline): {content_dir / 'working' / 'geo_review.csv'}")
        print(f"  JSON Results:          {json_path}")
        print(f"  Unresolved CSV:        {unres_path}")
        print("\nNext step: Review the CSV, mark approved rows with 'Y' in the 'approved' column,")
        print("then run: python -m tools.coordinate_enrichment.main --write-approved")


if __name__ == "__main__":
    main()
