from typing import List

from fastapi import APIRouter, Body, Depends, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from server.db import get_db
from server.models import Event, utcnow
from server.schemas import EventItem
from server.security import enforce_max_body_bytes, enforce_rate_limit

router = APIRouter(prefix="/api", tags=["events"])


async def _check_events_limits(request: Request) -> None:
    enforce_rate_limit(request)
    await enforce_max_body_bytes(request, 100 * 1024)


@router.post("/events", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(_check_events_limits)])
def ingest_events(
    events: List[EventItem] = Body(..., max_length=50),
    db: Session = Depends(get_db),
) -> JSONResponse:
    if not events:
        return JSONResponse(status_code=202, content={"accepted": 0, "duplicates": 0})

    incoming_ids = [ev.id for ev in events]
    existing_ids = set(
        db.scalars(select(Event.id).where(Event.id.in_(incoming_ids))).all()
    )

    accepted = 0
    duplicates = 0
    now = utcnow()
    seen_in_batch: set[str] = set()

    for ev in events:
        if ev.id in existing_ids or ev.id in seen_in_batch:
            duplicates += 1
            continue
        seen_in_batch.add(ev.id)
        try:
            with db.begin_nested():
                db.add(
                    Event(
                        id=ev.id,
                        type=ev.type,
                        place_id=ev.place_id,
                        partner_id=ev.partner_id,
                        ts=ev.ts,
                        session_id=ev.session_id,
                        received_at=now,
                    )
                )
            accepted += 1
        except IntegrityError:
            duplicates += 1

    db.commit()
    return JSONResponse(
        status_code=202,
        content={"accepted": accepted, "duplicates": duplicates},
    )
