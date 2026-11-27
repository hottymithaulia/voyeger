from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from server.db import get_db
from server.models import Enquiry, utcnow
from server.schemas import EnquiryRequest
from server.security import enforce_max_body_bytes, enforce_rate_limit

router = APIRouter(prefix="/api", tags=["enquiries"])


async def _check_form_limits(request: Request) -> None:
    enforce_rate_limit(request)
    await enforce_max_body_bytes(request, 20 * 1024)


@router.post("/enquiries", dependencies=[Depends(_check_form_limits)])
def create_enquiry(
    payload: EnquiryRequest,
    db: Session = Depends(get_db),
) -> JSONResponse:
    existing = db.get(Enquiry, payload.id)
    if existing is not None:
        return JSONResponse(
            status_code=200,
            content={"id": existing.id, "status": existing.status},
        )

    row = Enquiry(
        id=payload.id,
        partner_id=payload.partner_id,
        place_id=payload.place_id,
        name=payload.name,
        contact=payload.contact,
        message=payload.message,
        lang=payload.lang,
        created_at=utcnow(),
        status="received",
    )
    db.add(row)
    db.commit()
    return JSONResponse(
        status_code=201,
        content={"id": row.id, "status": "received"},
    )
