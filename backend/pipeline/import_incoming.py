from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from typing import Any, Dict, List

import yaml

PLACEHOLDER_TIPS = {
    "Verify locally",
    "स्थानीय स्तर पर पुष्टि करें",
}
PLACEHOLDER_ETIQUETTE = "PENDING_HUMAN_ETIQUETTE_NOTE"
HOLD_IDS = {"ravindra-bhavan-bhopal"}

KNOWN_SAMPLE_PLACE_IDS = {
    "upper-lake",
    "bharat-bhavan",
    "gauhar-mahal",
    "moti-masjid",
    "shaukat-mahal",
    "sadar-manzil",
    "tribal-museum",
    "old-city-food-lane",
    "lake-view-walk",
    "heritage-courtyard-walk",
}


def _write_yaml_if_changed(path: Path, data: Any) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000)
    if path.is_file() and path.read_text(encoding="utf-8") == rendered:
        return False
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(rendered)
    return True


def _clean_incoming_tips(raw_tips: Any) -> tuple[List[str], bool]:
    if raw_tips is None:
        return [], False
    if isinstance(raw_tips, str):
        val = raw_tips.strip()
        if not val or val in PLACEHOLDER_TIPS:
            return [], bool(val in PLACEHOLDER_TIPS)
        return [val], False
    if isinstance(raw_tips, list):
        pending = False
        cleaned: List[str] = []
        for item in raw_tips:
            s = str(item).strip()
            if not s:
                continue
            if s in PLACEHOLDER_TIPS:
                pending = True
            else:
                cleaned.append(s)
        return cleaned, pending
    return [], False


def archive_sample_content(content_dir: Path = Path("content")) -> Dict[str, int]:
    """Move legacy sample places/partners to content/sample/ so they are never published."""
    places_dir = content_dir / "places"
    partners_dir = content_dir / "partners"
    sample_places_dir = content_dir / "sample" / "places"
    sample_partners_dir = content_dir / "sample" / "partners"
    moved_places = 0
    moved_partners = 0

    if places_dir.is_dir():
        for path in sorted(places_dir.glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            pid = data.get("id") or path.stem
            prov_source = str((data.get("provenance") or {}).get("source") or "")
            is_sample = pid in KNOWN_SAMPLE_PLACE_IDS and prov_source != "curated-research"
            if is_sample:
                sample_places_dir.mkdir(parents=True, exist_ok=True)
                dest = sample_places_dir / path.name
                if not dest.exists():
                    shutil.move(str(path), str(dest))
                else:
                    path.unlink()
                moved_places += 1

    if partners_dir.is_dir():
        for path in sorted(partners_dir.glob("*.yaml")):
            sample_partners_dir.mkdir(parents=True, exist_ok=True)
            dest = sample_partners_dir / path.name
            if not dest.exists():
                shutil.move(str(path), str(dest))
            else:
                path.unlink()
            moved_partners += 1

    return {"moved_places": moved_places, "moved_partners": moved_partners}


def import_incoming(content_dir: Path = Path("content")) -> Dict[str, int]:
    incoming_dir = content_dir / "incoming"
    places_dir = content_dir / "places"
    working_dir = content_dir / "working"
    places_dir.mkdir(parents=True, exist_ok=True)
    working_dir.mkdir(parents=True, exist_ok=True)

    archived = archive_sample_content(content_dir)

    imported = 0
    hold_count = 0
    draft_count = 0

    for incoming_file in sorted(incoming_dir.glob("*.yaml")):
        records = yaml.safe_load(incoming_file.read_text(encoding="utf-8")) or []
        if not isinstance(records, list):
            continue
        for raw in records:
            pid = raw["id"]
            record_type = raw.get("record_type", "candidate")
            is_anchor = record_type == "anchor"
            status = "hold" if pid in HOLD_IDS else "draft"
            if status == "hold":
                hold_count += 1
            else:
                draft_count += 1

            raw_geo = raw.get("geo") or {}
            geo = {
                "lat": raw_geo.get("lat"),
                "lng": raw_geo.get("lng"),
            }

            raw_sens = raw.get("sensitivity") or {}
            is_sacred = bool(raw_sens.get("is_sacred", False))
            raw_note = raw_sens.get("note")
            etiquette_pending = raw_note == PLACEHOLDER_ETIQUETTE
            sens_note = None if (raw_note is None or etiquette_pending) else str(raw_note)

            raw_text = raw.get("text") or {}
            text_out: Dict[str, Any] = {}
            tips_pending = False
            needs_review_map: Dict[str, bool] = {}
            for lang in ("en", "hi"):
                entry = raw_text.get(lang) or {}
                tips_list, lang_tips_pending = _clean_incoming_tips(entry.get("tips"))
                tips_pending = tips_pending or lang_tips_pending
                lang_needs_review = True if lang == "hi" else bool(entry.get("needs_review", False))
                needs_review_map[lang] = lang_needs_review
                text_out[lang] = {
                    "title": str(entry.get("title") or ""),
                    "summary": str(entry.get("summary") or ""),
                    "story": str(entry.get("story") or ""),
                    "tips": tips_list,
                    "needs_review": lang_needs_review,
                }

            place_doc = {
                "id": pid,
                "slug": raw.get("slug") or pid,
                "category": raw["category"],
                "status": status,
                "tags": list(raw.get("tags") or []),
                "geo": geo,
                "is_anchor": is_anchor,
                "anchor_for": [],
                "hours": None,
                "best_time": None,
                "cost_note": None,
                "sensitivity": {
                    "is_sacred": is_sacred,
                    "note": sens_note,
                },
                "partner_id": None,
                "media": {
                    "images": [],
                    "video": None,
                },
                "provenance": {
                    "source": "curated-research",
                    "license": "CC-BY-SA-4.0",
                    "verified_by": None,
                    "verified_at": None,
                    "sources": list(raw.get("sources") or []),
                },
                "text": text_out,
                "deleted": bool(raw.get("deleted", False)),
            }

            meta_doc = {
                "id": pid,
                "source_file": incoming_file.name,
                "record_type": record_type,
                "category_confidence": raw.get("category_confidence"),
                "flags": list(raw.get("flags") or []),
                "osm_search_hint": raw.get("osm_search_hint"),
                "hidden_gem_evidence": raw.get("hidden_gem_evidence"),
                "anchor_for_candidate": raw.get("anchor_for_candidate"),
                "approx_distance_to_anchor_km": raw.get("approx_distance_to_anchor_km"),
                "needs_review": needs_review_map,
                "tips_pending": tips_pending,
                "etiquette_pending": etiquette_pending,
                "hindi_needs_review": True,
                "hold_reason": "weak sources" if pid in HOLD_IDS else None,
            }

            _write_yaml_if_changed(places_dir / f"{pid}.yaml", place_doc)
            _write_yaml_if_changed(working_dir / f"{pid}.meta.yaml", meta_doc)
            imported += 1

    return {
        "imported": imported,
        "draft": draft_count,
        "hold": hold_count,
        "moved_places": archived["moved_places"],
        "moved_partners": archived["moved_partners"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Import content/incoming/*.yaml idempotently")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    args = parser.parse_args()
    summary = import_incoming(args.content_dir)
    print(
        f"Imported {summary['imported']} places "
        f"({summary['draft']} draft, {summary['hold']} hold); "
        f"archived {summary['moved_places']} sample places and {summary['moved_partners']} sample partners."
    )


if __name__ == "__main__":
    main()
