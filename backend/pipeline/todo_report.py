from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Dict, List

import yaml

ACCESS_UNVERIFIED_IDS = {
    "kushabhau-thakre-hall-minto-hall",
    "dhrupad-kendra-bhopal",
    "mausoleum-dost-mohammad-khan",
    "bada-bagh-royal-tombs",
    "yadgar-e-shahjahani-park",
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def _bool_str(val: bool) -> str:
    return "true" if val else "false"


def generate_todo_csv(content_dir: Path = Path("content")) -> Path:
    places_dir = content_dir / "places"
    working_dir = content_dir / "working"
    media_dir = content_dir / "media"
    working_dir.mkdir(parents=True, exist_ok=True)
    todo_path = working_dir / "todo.csv"

    rows: List[Dict[str, str]] = []
    if places_dir.is_dir():
        for path in sorted(places_dir.glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            pid = str(data.get("id") or path.stem)
            status = str(data.get("status") or "draft")
            text_map = data.get("text") or {}
            en = text_map.get("en") or {}
            hi = text_map.get("hi") or {}
            title = str(en.get("title") or pid)

            geo = data.get("geo") or {}
            geo_missing = geo.get("lat") is None or geo.get("lng") is None

            media = data.get("media") or {}
            images = list(media.get("images") or [])
            photo_missing = len(images) == 0 or bool(media.get("placeholder", False))

            # Check uncredited files in content/media/<id> or image entries missing credit/license
            credit_missing = any(
                not str(img.get("credit") or "").strip() or not str(img.get("license") or "").strip()
                for img in images
                if isinstance(img, dict)
            )
            place_media_dir = media_dir / pid
            if place_media_dir.is_dir():
                disk_files = [
                    f.name
                    for f in place_media_dir.iterdir()
                    if f.is_file() and f.suffix.lower() in IMAGE_EXTS
                ]
                credits_file = place_media_dir / "credits.yaml"
                credited_names = set()
                if credits_file.is_file():
                    cdoc = yaml.safe_load(credits_file.read_text(encoding="utf-8")) or {}
                    for entry in cdoc.get("images") or []:
                        if isinstance(entry, dict) and str(entry.get("credit") or "").strip():
                            credited_names.add(str(entry.get("file") or ""))
                if any(f not in credited_names for f in disk_files):
                    credit_missing = True

            tips_en = en.get("tips") or []
            tips_hi = hi.get("tips") or []
            tips_missing = len(tips_en) == 0 or len(tips_hi) == 0

            sens = data.get("sensitivity") or {}
            is_sacred = bool(sens.get("is_sacred", False))
            etiquette_missing = is_sacred and not str(sens.get("note") or "").strip()

            hours_missing = not str(data.get("hours") or "").strip()
            hindi_unreviewed = bool(hi.get("needs_review", False))
            access_unverified = pid in ACCESS_UNVERIFIED_IDS

            rows.append(
                {
                    "id": pid,
                    "title": title,
                    "status": status,
                    "geo_missing": _bool_str(geo_missing),
                    "photo_missing": _bool_str(photo_missing),
                    "credit_missing": _bool_str(credit_missing),
                    "tips_missing": _bool_str(tips_missing),
                    "etiquette_missing": _bool_str(etiquette_missing),
                    "hours_missing": _bool_str(hours_missing),
                    "hindi_unreviewed": _bool_str(hindi_unreviewed),
                    "access_unverified": _bool_str(access_unverified),
                }
            )

    fieldnames = [
        "id",
        "title",
        "status",
        "geo_missing",
        "photo_missing",
        "credit_missing",
        "tips_missing",
        "etiquette_missing",
        "hours_missing",
        "hindi_unreviewed",
        "access_unverified",
    ]
    with todo_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return todo_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Write content/working/todo.csv")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    args = parser.parse_args()
    out = generate_todo_csv(args.content_dir)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
