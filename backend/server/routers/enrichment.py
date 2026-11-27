from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from server.db import get_db
from server.services.enrichment_service import get_enrichment_for_places

router = APIRouter(prefix="/api", tags=["enrichment"])


@router.get("/enrichment")
async def get_enrichment(
    place_ids: str = Query(..., description="Comma-separated place IDs (max 50)"),
    db: Session = Depends(get_db),
) -> JSONResponse:
    ids = [p.strip() for p in place_ids.split(",") if p.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="place_ids must not be empty")
    if len(ids) > 50:
        raise HTTPException(status_code=400, detail="At most 50 place_ids per request")

    data = await get_enrichment_for_places(db, ids, timeout_seconds=8.0)
    return JSONResponse(
        content=data,
        headers={"Cache-Control": "public, max-age=300"},
    )
