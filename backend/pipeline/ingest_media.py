from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, List

import yaml

from pipeline.optimize_media import compute_theme_from_image

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def ingest_media(content_dir: Path = Path("content")) -> Dict[str, Any]:
    places_dir = content_dir / "places"
    media_dir = content_dir / "media"

    errors: List[str] = []
    warnings: List[str] = []
    updated_places = 0

    if not places_dir.is_dir():
        return {"updated": 0, "errors": [], "warnings": []}

    for path in sorted(places_dir.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        pid = data.get("id") or path.stem
        status = data.get("status", "draft")
        place_media_dir = media_dir / pid

        if not place_media_dir.is_dir():
            if status == "draft":
                media_obj = dict(data.get("media") or {})
                if not media_obj.get("images"):
                    media_obj["placeholder"] = True
                    data["media"] = media_obj
                    data.pop("theme", None)
                    with path.open("w", encoding="utf-8", newline="\n") as fh:
                        fh.write(yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000))
                    updated_places += 1
            continue

        disk_files = {
            f.name: f
            for f in sorted(place_media_dir.iterdir())
            if f.is_file() and f.suffix.lower() in IMAGE_EXTS
        }
        credits_path = place_media_dir / "credits.yaml"
        credits_doc = (
            yaml.safe_load(credits_path.read_text(encoding="utf-8")) or {}
            if credits_path.is_file()
            else {}
        )
        credit_images = list(credits_doc.get("images") or [])
        by_file = {
            str(entry.get("file")): entry
            for entry in credit_images
            if isinstance(entry, dict) and entry.get("file")
        }

        for fname in sorted(disk_files):
            entry = by_file.get(fname)
            if entry is None or not str(entry.get("credit") or "").strip():
                msg = f"place '{pid}': image '{fname}' missing credit entry in credits.yaml"
                if status == "ready":
                    errors.append(msg)
                else:
                    warnings.append(msg)

        merged_images: List[Dict[str, Any]] = []
        first_real_file: Path | None = None
        for idx, entry in enumerate(credit_images):
            if not isinstance(entry, dict):
                continue
            fname = str(entry.get("file") or "").strip()
            if not fname or fname not in disk_files:
                continue
            credit = str(entry.get("credit") or "").strip()
            if not credit and status != "ready":
                # Keep uncredited warning without inventing credits
                continue
            if first_real_file is None:
                first_real_file = disk_files[fname]
            alt_raw = entry.get("alt") or {}
            merged_images.append(
                {
                    "id": f"{pid}-{idx + 1}",
                    "source_file": f"{pid}/{fname}",
                    "alt": {
                        "en": str(alt_raw.get("en") or ""),
                        "hi": str(alt_raw.get("hi") or ""),
                    },
                    "credit": credit,
                    "license": str(entry.get("license") or ""),
                    "source_url": str(entry.get("source_url") or ""),
                }
            )

        media_obj: Dict[str, Any] = {
            "images": merged_images,
            "video": None,
        }
        video_url = str(credits_doc.get("video_url") or "").strip()
        if video_url:
            poster = str(credits_doc.get("poster") or "").strip()
            media_obj["video"] = {"url": video_url, "poster": poster, "offline": False}

        if first_real_file is not None:
            data["theme"] = compute_theme_from_image(first_real_file)
            media_obj.pop("placeholder", None)
        else:
            data.pop("theme", None)
            if status == "draft":
                media_obj["placeholder"] = True

        data["media"] = media_obj
        with path.open("w", encoding="utf-8", newline="\n") as fh:
            fh.write(yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=1000))
        updated_places += 1

    return {"updated": updated_places, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge content/media/<id> assets and compute themes")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    args = parser.parse_args()
    summary = ingest_media(args.content_dir)
    for w in summary["warnings"]:
        print(f"[WARN] {w}")
    for e in summary["errors"]:
        print(f"[ERROR] {e}")
    print(f"Media ingest complete: updated {summary['updated']} places.")
    if summary["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
