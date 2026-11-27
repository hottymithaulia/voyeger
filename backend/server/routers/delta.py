from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from server.db import get_db
from server.models import Delta, PackVersion
from server.routers.manifest import get_latest_manifest

router = APIRouter(prefix="/api", tags=["delta"])


def _resync_response(db: Session) -> JSONResponse:
    manifest = get_latest_manifest(db)
    if manifest is None:
        raise HTTPException(status_code=404, detail="No published pack version found")
    return JSONResponse(
        status_code=410,
        content={"error": "full_resync_required", "manifest": manifest},
        headers={"Cache-Control": "no-store"},
    )


@router.get("/delta")
def get_delta(
    from_version: int = Query(..., alias="from", ge=0),
    to_version: int = Query(..., alias="to", ge=0),
    db: Session = Depends(get_db),
) -> JSONResponse:
    if from_version > to_version or (to_version - from_version) > 5:
        return _resync_response(db)

    from_pv = db.get(PackVersion, from_version)
    to_pv = db.get(PackVersion, to_version)
    if from_pv is None or to_pv is None:
        return _resync_response(db)

    if from_version == to_version:
        return JSONResponse(
            content={
                "from": from_version,
                "to": to_version,
                "places": [],
                "partners": [],
                "text": {},
                "deleted_ids": [],
            },
            headers={"Cache-Control": "public, max-age=60"},
        )

    # Merge consecutive stored deltas from from_version -> to_version
    places_by_id: dict[str, dict] = {}
    partners_by_id: dict[str, dict] = {}
    text_by_place: dict[str, dict] = {}
    deleted_ids: set[str] = set()

    for v in range(from_version, to_version):
        row = db.get(Delta, (v, v + 1))
        if row is None:
            return _resync_response(db)
        payload = row.payload
        for p in payload.get("places") or []:
            pid = p["id"]
            deleted_ids.discard(pid)
            places_by_id[pid] = p
        for pt in payload.get("partners") or []:
            ptid = pt["id"]
            deleted_ids.discard(ptid)
            partners_by_id[ptid] = pt
        for pid, langs in (payload.get("text") or {}).items():
            text_by_place.setdefault(pid, {}).update(langs)
        for did in payload.get("deleted_ids") or []:
            places_by_id.pop(did, None)
            partners_by_id.pop(did, None)
            text_by_place.pop(did, None)
            deleted_ids.add(did)

    return JSONResponse(
        content={
            "from": from_version,
            "to": to_version,
            "places": [places_by_id[k] for k in sorted(places_by_id)],
            "partners": [partners_by_id[k] for k in sorted(partners_by_id)],
            "text": {k: text_by_place[k] for k in sorted(text_by_place)},
            "deleted_ids": sorted(deleted_ids),
        },
        headers={"Cache-Control": "public, max-age=60"},
    )
