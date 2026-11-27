from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from server.db import get_db
from server.models import PackVersion

router = APIRouter(prefix="/api", tags=["manifest"])


def get_latest_manifest(db: Session) -> dict | None:
    row = db.scalar(select(PackVersion).where(PackVersion.is_current.is_(True)))
    if row is None:
        row = db.scalar(select(PackVersion).order_by(PackVersion.version.desc()))
    return row.manifest if row else None


@router.get("/manifest")
def get_manifest(db: Session = Depends(get_db)) -> JSONResponse:
    manifest = get_latest_manifest(db)
    if manifest is None:
        raise HTTPException(status_code=404, detail="No published pack version found")
    return JSONResponse(
        content=manifest,
        headers={"Cache-Control": "public, max-age=30"},
    )
