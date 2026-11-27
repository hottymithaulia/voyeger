from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.orm import Session

from server.config import get_settings
from server.models import Delta, Partner, PartnerText, Place, PlaceText
from server.schemas import parse_tips


def _processed_media(place: Place, version: int) -> Dict[str, Any]:
    raw_media = place.media or {}
    images: List[Dict[str, Any]] = []
    for idx, img in enumerate(raw_media.get("images") or []):
        img_id = img.get("id") or f"{place.id}-{idx + 1}"
        entry: Dict[str, Any] = {
            "id": img_id,
            "file": f"/pack/v{version}/images/{img_id}.webp",
            "thumb": f"/pack/v{version}/images/{img_id}.thumb.webp",
            "alt": img.get("alt") or {},
            "credit": img.get("credit") or "",
        }
        if img.get("license"):
            entry["license"] = img["license"]
        if img.get("source_url"):
            entry["source_url"] = img["source_url"]
        images.append(entry)
    out: Dict[str, Any] = {"images": images, "video": raw_media.get("video")}
    if raw_media.get("placeholder"):
        out["placeholder"] = True
    return out


def compute_delta_payload(
    db: Session,
    from_version: int,
    to_version: int,
    prev_places: List[Dict[str, Any]] | None = None,
    prev_partners: List[Dict[str, Any]] | None = None,
    prev_text: Dict[str, Dict[str, Dict[str, Any]]] | None = None,
) -> Dict[str, Any]:
    """Compute delta from from_version to to_version matching frontend Delta type."""
    settings = get_settings()
    allowed_statuses = {s for s in settings.publish_statuses if s in {"ready", "draft"}}
    places = list(db.scalars(select(Place).order_by(Place.id)).all())
    partners = list(db.scalars(select(Partner).order_by(Partner.id)).all())
    place_texts = list(db.scalars(select(PlaceText).order_by(PlaceText.place_id, PlaceText.lang)).all())
    partner_texts = list(
        db.scalars(select(PartnerText).order_by(PartnerText.partner_id, PartnerText.lang)).all()
    )

    place_i18n_map: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    for t in place_texts:
        place_i18n_map[t.place_id][t.lang] = {
            "title": t.title,
            "summary": t.summary,
            "story": t.story,
            "tips": parse_tips(t.tips),
        }

    partner_i18n_map: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    for prt in partner_texts:
        partner_i18n_map[prt.partner_id][prt.lang] = {
            "name": prt.name,
            "offer": prt.offer or "",
            "description": prt.description or "",
        }

    changed_places: List[Dict[str, Any]] = []
    deleted_ids: List[str] = []
    publishable_place_ids: set[str] = set()
    hold_place_ids: set[str] = set()

    for p in places:
        if p.status == "hold":
            hold_place_ids.add(p.id)
            continue
        if p.deleted:
            if from_version < p.updated_in_version <= to_version:
                deleted_ids.append(p.id)
            continue
        if p.status not in allowed_statuses:
            continue
        publishable_place_ids.add(p.id)
        if from_version < p.updated_in_version <= to_version:
            p_dict: Dict[str, Any] = {
                "id": p.id,
                "slug": p.slug,
                "category": p.category,
                "status": p.status,
                "tags": sorted(p.tags or []),
                "geo": {"lat": p.lat, "lng": p.lng},
                "is_anchor": bool(p.is_anchor),
                "anchor_for": list(p.anchor_for or []),
                "i18n": dict(sorted(place_i18n_map.get(p.id, {}).items())),
                "media": _processed_media(p, to_version),
                "hours": p.hours or "",
                "best_time": p.best_time or "",
                "cost_note": p.cost_note or "",
                "sensitivity": {"is_sacred": bool(p.is_sacred), "note": p.sacred_note or ""},
                "partner_id": p.partner_id,
                "enrichment": p.enrichment or {},
                "provenance": p.provenance or {},
                "updated_in_version": p.updated_in_version,
                "deleted": False,
            }
            if p.theme is not None:
                p_dict["theme"] = p.theme
            changed_places.append(p_dict)

    if prev_places is not None:
        for old_p in prev_places:
            old_id = old_p.get("id")
            if old_id and old_id not in publishable_place_ids and old_id not in hold_place_ids:
                deleted_ids.append(old_id)

    changed_partners: List[Dict[str, Any]] = []
    publishable_partner_ids: set[str] = set()
    for pt in partners:
        if pt.deleted:
            if from_version < pt.updated_in_version <= to_version:
                deleted_ids.append(pt.id)
            continue
        publishable_partner_ids.add(pt.id)
        if from_version < pt.updated_in_version <= to_version:
            changed_partners.append(
                {
                    "id": pt.id,
                    "type": pt.type,
                    "name": pt.name,
                    "contact": pt.contact or {},
                    "place_ids": list(pt.place_ids or []),
                    "offer": pt.offer or "",
                    "i18n": dict(sorted(partner_i18n_map.get(pt.id, {}).items())),
                    "featured_until": pt.featured_until,
                    "onboarded_via": pt.onboarded_via,
                    "updated_in_version": pt.updated_in_version,
                    "deleted": False,
                }
            )

    if prev_partners is not None:
        for old_pt in prev_partners:
            old_id = old_pt.get("id")
            if old_id and old_id not in publishable_partner_ids:
                deleted_ids.append(old_id)

    changed_place_ids = {p["id"] for p in changed_places}
    text_out: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    for t in place_texts:
        if t.place_id not in publishable_place_ids:
            continue
        t_dict = {
            "title": t.title,
            "summary": t.summary,
            "story": t.story,
            "tips": parse_tips(t.tips),
        }
        include = t.place_id in changed_place_ids
        if prev_text is not None:
            old_t = (prev_text.get(t.place_id) or {}).get(t.lang)
            if old_t != t_dict:
                include = True
        if include:
            text_out[t.place_id][t.lang] = t_dict

    return {
        "from": from_version,
        "to": to_version,
        "places": changed_places,
        "partners": changed_partners,
        "text": dict(text_out),
        "deleted_ids": sorted(set(deleted_ids)),
    }


def save_delta(db: Session, from_version: int, to_version: int, payload: Dict[str, Any]) -> Delta:
    existing = db.get(Delta, (from_version, to_version))
    if existing:
        existing.payload = payload
        db.commit()
        return existing
    row = Delta(from_version=from_version, to_version=to_version, payload=payload)
    db.add(row)
    db.commit()
    return row
