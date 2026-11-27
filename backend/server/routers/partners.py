from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from server.db import get_db
from server.models import Application, utcnow
from server.schemas import PartnerApplyRequest
from server.security import enforce_max_body_bytes, enforce_rate_limit

router = APIRouter(prefix="/api", tags=["partners"])


async def _check_form_limits(request: Request) -> None:
    enforce_rate_limit(request)
    await enforce_max_body_bytes(request, 20 * 1024)


@router.post("/partners/apply", dependencies=[Depends(_check_form_limits)])
def apply_partner(
    payload: PartnerApplyRequest,
    db: Session = Depends(get_db),
) -> JSONResponse:
    existing = db.get(Application, payload.id)
    if existing is not None:
        return JSONResponse(
            status_code=200,
            content={"id": existing.id, "status": existing.status},
        )

    app_row = Application(
        id=payload.id,
        applicant_type=payload.type,
        name=payload.name,
        contact=payload.contact,
        details={
            "offer": payload.offer,
            "place_ids": payload.place_ids,
            "created_at": payload.created_at,
        },
        created_at=utcnow(),
        status="received",
    )
    db.add(app_row)
    db.commit()
    return JSONResponse(
        status_code=201,
        content={"id": app_row.id, "status": "received"},
    )
