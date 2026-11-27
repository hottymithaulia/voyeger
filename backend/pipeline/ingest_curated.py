from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from server.db import SessionLocal
from server.models import Partner, PartnerText, Place, PlaceText
from server.schemas import parse_tips


def _normalize_text_map(text_map: Dict[str, Any]) -> Dict[str, Any]:
    return {
        lang: {
            "title": t.get("title", ""),
            "summary": t.get("summary", ""),
            "story": t.get("story", ""),
            "tips": parse_tips(t.get("tips")),
            "needs_review": bool(t.get("needs_review", False)),
        }
        for lang, t in text_map.items()
    }


def _curated_place_signature(data: Dict[str, Any]) -> str:
    geo = data.get("geo") or {}
    payload = {
        "slug": data.get("slug"),
        "category": data.get("category"),
        "status": data.get("status", "draft"),
        "tags": data.get("tags") or [],
        "geo": {
            "lat": float(geo["lat"]) if geo.get("lat") is not None else None,
            "lng": float(geo["lng"]) if geo.get("lng") is not None else None,
        },
        "is_anchor": bool(data.get("is_anchor", False)),
        "anchor_for": data.get("anchor_for") or [],
        "theme": data.get("theme"),
        "hours": data.get("hours"),
        "best_time": data.get("best_time"),
        "cost_note": data.get("cost_note"),
        "sensitivity": data.get("sensitivity") or {},
        "partner_id": data.get("partner_id"),
        "media": data.get("media") or {},
        "provenance": data.get("provenance") or {},
        "text": _normalize_text_map(data.get("text") or {}),
        "deleted": bool(data.get("deleted", False)),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _db_place_signature(place: Place, texts: List[PlaceText]) -> str:
    text_map = {
        t.lang: {
            "title": t.title,
            "summary": t.summary,
            "story": t.story,
            "tips": parse_tips(t.tips),
            "needs_review": t.needs_review,
        }
        for t in texts
    }
    payload = {
        "slug": place.slug,
        "category": place.category,
        "status": place.status,
        "tags": place.tags or [],
        "geo": {"lat": place.lat, "lng": place.lng},
        "is_anchor": place.is_anchor,
        "anchor_for": place.anchor_for or [],
        "theme": place.theme,
        "hours": place.hours,
        "best_time": place.best_time,
        "cost_note": place.cost_note,
        "sensitivity": {"is_sacred": place.is_sacred, "note": place.sacred_note},
        "partner_id": place.partner_id,
        "media": place.media or {},
        "provenance": place.provenance or {},
        "text": text_map,
        "deleted": place.deleted,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def ingest_curated(
    db: Session,
    content_dir: Path = Path("content"),
    target_version: int = 1,
) -> Dict[str, int]:
    places_dir = content_dir / "places"
    partners_dir = content_dir / "partners"
    places_upserted = 0
    partners_upserted = 0
    seen_place_ids: set[str] = set()
    seen_partner_ids: set[str] = set()

    if places_dir.is_dir():
        for path in sorted(places_dir.glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            pid = data["id"]
            seen_place_ids.add(pid)
            geo = data.get("geo") or {}
            lat = float(geo["lat"]) if geo.get("lat") is not None else None
            lng = float(geo["lng"]) if geo.get("lng") is not None else None
            status = data.get("status", "draft")
            theme = data.get("theme")
            sensitivity = data.get("sensitivity") or {}
            existing = db.get(Place, pid)

            if existing is None:
                place = Place(
                    id=pid,
                    slug=data["slug"],
                    category=data["category"],
                    status=status,
                    tags=data.get("tags") or [],
                    lat=lat,
                    lng=lng,
                    is_anchor=bool(data.get("is_anchor", False)),
                    anchor_for=data.get("anchor_for") or [],
                    theme=theme,
                    hours=data.get("hours"),
                    best_time=data.get("best_time"),
                    cost_note=data.get("cost_note"),
                    is_sacred=bool(sensitivity.get("is_sacred", False)),
                    sacred_note=sensitivity.get("note"),
                    partner_id=data.get("partner_id"),
                    media=data.get("media") or {},
                    provenance=data.get("provenance") or {},
                    enrichment={},
                    updated_in_version=target_version,
                    deleted=bool(data.get("deleted", False)),
                )
                db.add(place)
                for lang, tdata in (data.get("text") or {}).items():
                    db.add(
                        PlaceText(
                            place_id=pid,
                            lang=lang,
                            title=tdata["title"],
                            summary=tdata["summary"],
                            story=tdata["story"],
                            tips=json.dumps(parse_tips(tdata.get("tips")), ensure_ascii=False),
                            needs_review=bool(tdata.get("needs_review", False)),
                        )
                    )
                places_upserted += 1
            else:
                existing_texts = list(
                    db.scalars(select(PlaceText).where(PlaceText.place_id == pid)).all()
                )
                changed = _curated_place_signature(data) != _db_place_signature(existing, existing_texts)
                existing.slug = data["slug"]
                existing.category = data["category"]
                existing.status = status
                existing.tags = data.get("tags") or []
                existing.lat = lat
                existing.lng = lng
                existing.is_anchor = bool(data.get("is_anchor", False))
                existing.anchor_for = data.get("anchor_for") or []
                existing.theme = theme
                existing.hours = data.get("hours")
                existing.best_time = data.get("best_time")
                existing.cost_note = data.get("cost_note")
                existing.is_sacred = bool(sensitivity.get("is_sacred", False))
                existing.sacred_note = sensitivity.get("note")
                existing.partner_id = data.get("partner_id")
                existing.media = data.get("media") or {}
                existing.provenance = data.get("provenance") or {}
                existing.deleted = bool(data.get("deleted", False))
                if changed:
                    existing.updated_in_version = target_version

                # Upsert text rows
                by_lang = {t.lang: t for t in existing_texts}
                incoming_langs = set()
                for lang, tdata in (data.get("text") or {}).items():
                    incoming_langs.add(lang)
                    if lang in by_lang:
                        trow = by_lang[lang]
                        trow.title = tdata["title"]
                        trow.summary = tdata["summary"]
                        trow.story = tdata["story"]
                        trow.tips = json.dumps(parse_tips(tdata.get("tips")), ensure_ascii=False)
                        trow.needs_review = bool(tdata.get("needs_review", False))
                    else:
                        db.add(
                            PlaceText(
                                place_id=pid,
                                lang=lang,
                                title=tdata["title"],
                                summary=tdata["summary"],
                                story=tdata["story"],
                                tips=json.dumps(parse_tips(tdata.get("tips")), ensure_ascii=False),
                                needs_review=bool(tdata.get("needs_review", False)),
                            )
                        )
                places_upserted += 1

    # Remove DB places whose curated files were removed from content/places
    for existing_place in list(db.scalars(select(Place)).all()):
        if existing_place.id not in seen_place_ids:
            db.delete(existing_place)

    if partners_dir.is_dir():
        for path in sorted(partners_dir.glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            partner_id = data["id"]
            seen_partner_ids.add(partner_id)
            existing = db.get(Partner, partner_id)
            if existing is None:
                partner = Partner(
                    id=partner_id,
                    type=data["type"],
                    name=data["name"],
                    contact=data.get("contact") or {},
                    place_ids=data.get("place_ids") or [],
                    offer=data.get("offer"),
                    featured_until=data.get("featured_until"),
                    onboarded_via=data.get("onboarded_via", "admin"),
                    updated_in_version=target_version,
                    deleted=bool(data.get("deleted", False)),
                )
                db.add(partner)
                for lang, tdata in (data.get("text") or {}).items():
                    db.add(
                        PartnerText(
                            partner_id=partner_id,
                            lang=lang,
                            name=tdata.get("name", data["name"]),
                            description=tdata.get("description"),
                            offer=tdata.get("offer"),
                            needs_review=bool(tdata.get("needs_review", False)),
                        )
                    )
            else:
                existing.type = data["type"]
                existing.name = data["name"]
                existing.contact = data.get("contact") or {}
                existing.place_ids = data.get("place_ids") or []
                existing.offer = data.get("offer")
                existing.featured_until = data.get("featured_until")
                existing.onboarded_via = data.get("onboarded_via", "admin")
                existing.deleted = bool(data.get("deleted", False))
                existing.updated_in_version = target_version

                existing_texts = list(
                    db.scalars(select(PartnerText).where(PartnerText.partner_id == partner_id)).all()
                )
                by_lang = {t.lang: t for t in existing_texts}
                for lang, tdata in (data.get("text") or {}).items():
                    if lang in by_lang:
                        trow = by_lang[lang]
                        trow.name = tdata.get("name", data["name"])
                        trow.description = tdata.get("description")
                        trow.offer = tdata.get("offer")
                        trow.needs_review = bool(tdata.get("needs_review", False))
                    else:
                        db.add(
                            PartnerText(
                                partner_id=partner_id,
                                lang=lang,
                                name=tdata.get("name", data["name"]),
                                description=tdata.get("description"),
                                offer=tdata.get("offer"),
                                needs_review=bool(tdata.get("needs_review", False)),
                            )
                        )
            partners_upserted += 1

    # Remove DB partners whose curated files were removed from content/partners
    for existing_partner in list(db.scalars(select(Partner)).all()):
        if existing_partner.id not in seen_partner_ids:
            db.delete(existing_partner)

    db.commit()
    return {"places": places_upserted, "partners": partners_upserted}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest curated YAML files into DB")
    parser.add_argument("--content-dir", type=Path, default=Path("content"))
    parser.add_argument("--version", type=int, default=1)
    args = parser.parse_args()
    with SessionLocal() as db:
        counts = ingest_curated(db, args.content_dir, args.version)
    print(f"Ingested {counts['places']} places and {counts['partners']} partners.")


if __name__ == "__main__":
    main()
