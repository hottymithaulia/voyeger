from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.orm import Session

from pipeline.optimize_media import compute_theme_from_image, optimize_image_to_pack
from server.config import get_settings
from server.models import Partner, PartnerText, Place, PlaceText
from server.schemas import parse_tips


def _canonical_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _serialize_place_for_pack(
    place: Place,
    processed_media: Dict[str, Any],
    i18n_map: Dict[str, Dict[str, Any]],
    theme_override: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "id": place.id,
        "slug": place.slug,
        "category": place.category,
        "status": place.status,
        "tags": sorted(place.tags or []) if isinstance(place.tags, list) else [],
        "geo": {"lat": place.lat, "lng": place.lng},
        "is_anchor": bool(place.is_anchor),
        "anchor_for": list(place.anchor_for or []),
        "i18n": dict(sorted(i18n_map.items())),
        "media": processed_media,
        "hours": place.hours or "",
        "best_time": place.best_time or "",
        "cost_note": place.cost_note or "",
        "sensitivity": {
            "is_sacred": bool(place.is_sacred),
            "note": place.sacred_note or "",
        },
        "partner_id": place.partner_id,
        "enrichment": place.enrichment or {},
        "provenance": place.provenance or {},
        "updated_in_version": place.updated_in_version,
        "deleted": bool(place.deleted),
    }
    resolved_theme = theme_override if theme_override is not None else place.theme
    if resolved_theme is not None:
        payload["theme"] = resolved_theme
    return payload


def _serialize_partner_for_pack(
    partner: Partner,
    i18n_map: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "id": partner.id,
        "type": partner.type,
        "name": partner.name,
        "contact": partner.contact or {},
        "place_ids": list(partner.place_ids or []),
        "offer": partner.offer or "",
        "i18n": dict(sorted(i18n_map.items())),
        "featured_until": partner.featured_until,
        "onboarded_via": partner.onboarded_via,
        "updated_in_version": partner.updated_in_version,
        "deleted": bool(partner.deleted),
    }


def write_pack_contents(
    db: Session,
    out_dir: Path,
    version: int,
    built_at: str,
    media_source_dir: Path = Path("content/media"),
    delta_payload: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    settings = get_settings()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "i18n").mkdir(parents=True, exist_ok=True)
    (out_dir / "search").mkdir(parents=True, exist_ok=True)
    (out_dir / "images").mkdir(parents=True, exist_ok=True)

    places = list(db.scalars(select(Place).order_by(Place.id)).all())
    partners = list(db.scalars(select(Partner).order_by(Partner.id)).all())
    place_texts = list(db.scalars(select(PlaceText).order_by(PlaceText.place_id, PlaceText.lang)).all())
    partner_texts = list(
        db.scalars(select(PartnerText).order_by(PartnerText.partner_id, PartnerText.lang)).all()
    )

    # Respect PUBLISH_STATUSES ("hold" is never publishable) and omit deleted records
    allowed_statuses = {s for s in settings.publish_statuses if s in {"ready", "draft"}}
    active_places = [
        p for p in places if not p.deleted and p.status in allowed_statuses
    ]
    active_partners = [
        pt for pt in partners if not (pt.deleted and pt.updated_in_version < version)
    ]

    place_i18n: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    place_text_by_lang: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    active_place_ids = {p.id for p in active_places}
    for pt in place_texts:
        if pt.place_id not in active_place_ids:
            continue
        copy = {
            "title": pt.title,
            "summary": pt.summary,
            "story": pt.story,
            "tips": parse_tips(pt.tips),
        }
        place_i18n[pt.place_id][pt.lang] = copy
        place_text_by_lang[pt.lang][pt.place_id] = copy

    partner_i18n: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    active_partner_ids = {pt.id for pt in active_partners}
    for prt in partner_texts:
        if prt.partner_id not in active_partner_ids:
            continue
        partner_i18n[prt.partner_id][prt.lang] = {
            "name": prt.name,
            "offer": prt.offer or "",
            "description": prt.description or "",
        }

    places_json: List[Dict[str, Any]] = []
    for p in active_places:
        raw_media = p.media or {}
        raw_images = list(raw_media.get("images") or [])
        has_real_image = False
        first_real_path: Path | None = None
        processed_images: List[Dict[str, Any]] = []
        if raw_images:
            for idx, img in enumerate(raw_images):
                img_id = img.get("id") or f"{p.id}-{idx + 1}"
                src_name = img.get("source_file") or img.get("file")
                src_path = (media_source_dir / src_name) if src_name else None
                if src_path is not None and src_path.is_file():
                    has_real_image = True
                    if first_real_path is None:
                        first_real_path = src_path
                rel_full = f"images/{img_id}.webp"
                rel_thumb = f"images/{img_id}.thumb.webp"
                optimize_image_to_pack(
                    source_path=src_path,
                    dest_full=out_dir / rel_full,
                    dest_thumb=out_dir / rel_thumb,
                    placeholder_label=f"{p.id} ({img_id})",
                )
                img_entry: Dict[str, Any] = {
                    "id": img_id,
                    "file": f"/pack/v{version}/{rel_full}",
                    "thumb": f"/pack/v{version}/{rel_thumb}",
                    "alt": img.get("alt") or {},
                    "credit": img.get("credit") or "",
                }
                if img.get("license"):
                    img_entry["license"] = img["license"]
                if img.get("source_url"):
                    img_entry["source_url"] = img["source_url"]
                processed_images.append(img_entry)
        elif p.status == "draft":
            img_id = f"{p.id}-placeholder"
            rel_full = f"images/{img_id}.webp"
            rel_thumb = f"images/{img_id}.thumb.webp"
            optimize_image_to_pack(
                source_path=None,
                dest_full=out_dir / rel_full,
                dest_thumb=out_dir / rel_thumb,
                placeholder_label=f"{p.id} (placeholder)",
            )
            p_i18n = place_i18n.get(p.id, {})
            processed_images.append(
                {
                    "id": img_id,
                    "file": f"/pack/v{version}/{rel_full}",
                    "thumb": f"/pack/v{version}/{rel_thumb}",
                    "alt": {
                        lang: p_i18n.get(lang, {}).get("title", p.slug)
                        for lang in settings.required_languages
                    },
                    "credit": "Voyeger placeholder illustration",
                }
            )
        processed_media: Dict[str, Any] = {
            "images": processed_images,
            "video": raw_media.get("video"),
        }
        if bool(raw_media.get("placeholder", False)) or not has_real_image:
            processed_media["placeholder"] = True
        theme_override = (
            compute_theme_from_image(first_real_path)
            if first_real_path is not None and p.theme is None
            else None
        )
        places_json.append(
            _serialize_place_for_pack(p, processed_media, place_i18n.get(p.id, {}), theme_override=theme_override)
        )

    partners_json = [
        _serialize_partner_for_pack(pt, partner_i18n.get(pt.id, {})) for pt in active_partners
    ]

    (out_dir / "places.json").write_text(_canonical_json(places_json), encoding="utf-8")
    (out_dir / "partners.json").write_text(_canonical_json(partners_json), encoding="utf-8")

    languages = sorted(set(settings.required_languages) | set(place_text_by_lang.keys()))
    for lang in languages:
        lang_places = dict(sorted(place_text_by_lang.get(lang, {}).items()))
        (out_dir / "i18n" / f"{lang}.json").write_text(
            _canonical_json(lang_places), encoding="utf-8"
        )

    # Single search/index.json matching frontend PackPayload.searchIndex
    search_index = {
        "fields": ["title", "summary", "tags"],
        "searchFields": ["title", "summary", "tags"],
    }
    (out_dir / "search" / "index.json").write_text(
        _canonical_json(search_index), encoding="utf-8"
    )

    if delta_payload is not None and version > 1:
        delta_filename = f"delta_{version - 1}_to_{version}.json"
        (out_dir / delta_filename).write_text(_canonical_json(delta_payload), encoding="utf-8")

    # Compute manifest over all files except manifest.json
    manifest_files: List[Dict[str, Any]] = []
    total_bytes = 0
    for file_path in sorted(out_dir.rglob("*")):
        if not file_path.is_file():
            continue
        rel = file_path.relative_to(out_dir).as_posix()
        if rel == "manifest.json":
            continue
        size = file_path.stat().st_size
        total_bytes += size
        manifest_files.append(
            {
                "path": f"/pack/v{version}/{rel}",
                "bytes": size,
                "sha256": _sha256_file(file_path),
            }
        )

    manifest = {
        "version": version,
        "built_at": built_at,
        "min_app_version": settings.app_min_version,
        "files": manifest_files,
        "languages": languages,
        "total_bytes": total_bytes,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    import argparse
    from server.db import SessionLocal
    from server.services.pack_service import get_current_version, publish_pack

    parser = argparse.ArgumentParser(description="Build Voyeger offline content pack")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    parser.add_argument("--bump", action="store_true", help="Publish next version (N+1)")
    parser.add_argument("--strict", action="store_true", help="Fail if needs_review=true")
    args = parser.parse_args()

    with SessionLocal() as db:
        curr = get_current_version(db)
        target = (curr + 1) if args.bump else (curr if curr > 0 else 1)
        manifest = publish_pack(
            db,
            content_dir=args.content_dir,
            strict=args.strict,
            target_version=target,
        )
    print(f"Built pack v{manifest['version']} ({len(manifest['files'])} files, {manifest['total_bytes']} bytes).")


if __name__ == "__main__":
    main()
