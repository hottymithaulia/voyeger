from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from server.db import get_db
from server.deps import require_admin
from server.models import Application, Enquiry, Event, Partner
from server.services.pack_service import PublishValidationError, publish_pack

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _parse_iso_dt(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("/stats")
def get_stats(
    from_date: Optional[str] = Query(default=None, alias="from"),
    to_date: Optional[str] = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
) -> JSONResponse:
    from_dt = _parse_iso_dt(from_date)
    to_dt = _parse_iso_dt(to_date)

    ev_query = select(Event)
    enq_query = select(Enquiry)
    if from_dt:
        ev_query = ev_query.where(Event.received_at >= from_dt)
        enq_query = enq_query.where(Enquiry.created_at >= from_dt)
    if to_dt:
        ev_query = ev_query.where(Event.received_at <= to_dt)
        enq_query = enq_query.where(Enquiry.created_at <= to_dt)

    events = list(db.scalars(ev_query).all())
    enquiries = list(db.scalars(enq_query).all())
    partners = {p.id: p.name for p in db.scalars(select(Partner)).all()}

    totals = {"views": 0, "saves": 0, "directions": 0, "enquiries": 0, "nudge_clicks": 0}
    partner_stats: Dict[str, Dict[str, Any]] = {}
    place_stats: Dict[str, Dict[str, int]] = defaultdict(
        lambda: {"views": 0, "saves": 0, "directions": 0, "enquiries": 0, "nudge_clicks": 0, "total_events": 0}
    )

    def _ensure_partner(pid: str) -> Dict[str, Any]:
        if pid not in partner_stats:
            partner_stats[pid] = {
                "partner_id": pid,
                "name": partners.get(pid, pid),
                "views": 0,
                "saves": 0,
                "directions": 0,
                "enquiries": 0,
                "nudge_clicks": 0,
            }
        return partner_stats[pid]

    for pid in partners:
        _ensure_partner(pid)

    type_to_key = {
        "view": "views",
        "save": "saves",
        "directions": "directions",
        "enquiry": "enquiries",
        "nudge_click": "nudge_clicks",
    }

    for ev in events:
        key = type_to_key.get(ev.type)
        if not key:
            continue
        totals[key] += 1
        if ev.partner_id:
            _ensure_partner(ev.partner_id)[key] += 1
        if ev.place_id:
            place_stats[ev.place_id][key] += 1
            place_stats[ev.place_id]["total_events"] += 1

    # Also count submitted enquiries per partner if not already counted via event
    for enq in enquiries:
        if enq.partner_id:
            _ensure_partner(enq.partner_id)["enquiries"] += 1
        totals["enquiries"] += 1
        if enq.place_id:
            place_stats[enq.place_id]["enquiries"] += 1
            place_stats[enq.place_id]["total_events"] += 1

    top_places = sorted(
        [{"place_id": pid, **counts} for pid, counts in place_stats.items()],
        key=lambda x: x["total_events"],
        reverse=True,
    )[:10]

    return JSONResponse(
        content={
            "partners": list(partner_stats.values()),
            "totals": totals,
            "top_places": top_places,
        }
    )


@router.post("/publish")
def admin_publish(
    strict: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> JSONResponse:
    try:
        manifest = publish_pack(db, strict=strict)
    except PublishValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={"error": "validation_failed", "detail": "; ".join(exc.errors)},
        )
    return JSONResponse(status_code=200, content=manifest)


@router.get("/applications")
def list_applications(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> JSONResponse:
    total = db.scalar(select(func.count()).select_from(Application)) or 0
    rows = list(
        db.scalars(
            select(Application).order_by(Application.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    items = [
        {
            "id": r.id,
            "applicant_type": r.applicant_type,
            "name": r.name,
            "contact": r.contact,
            "details": r.details,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "status": r.status,
        }
        for r in rows
    ]
    return JSONResponse(content={"items": items, "total": total, "limit": limit, "offset": offset})


@router.get("/enquiries")
def list_enquiries(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> JSONResponse:
    total = db.scalar(select(func.count()).select_from(Enquiry)) or 0
    rows = list(
        db.scalars(
            select(Enquiry).order_by(Enquiry.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    items = [
        {
            "id": r.id,
            "partner_id": r.partner_id,
            "place_id": r.place_id,
            "name": r.name,
            "contact": r.contact,
            "message": r.message,
            "lang": r.lang,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "status": r.status,
        }
        for r in rows
    ]
    return JSONResponse(content={"items": items, "total": total, "limit": limit, "offset": offset})
