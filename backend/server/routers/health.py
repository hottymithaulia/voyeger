from fastapi import APIRouter
from fastapi.responses import JSONResponse

from server.config import get_settings

router = APIRouter(prefix="/api", tags=["health"])

_cached_version: int = 0


def set_cached_version(version: int) -> None:
    global _cached_version
    _cached_version = version


def get_cached_version() -> int:
    return _cached_version


def refresh_cached_version_from_disk() -> int:
    """Fast, DB-free scan of PACK_DIR for v{N}/manifest.json."""
    settings = get_settings()
    pack_dir = settings.pack_dir
    if not pack_dir.exists():
        set_cached_version(0)
        return 0
    versions = []
    for entry in pack_dir.iterdir():
        if entry.is_dir() and entry.name.startswith("v"):
            try:
                v = int(entry.name[1:])
                if (entry / "manifest.json").is_file():
                    versions.append(v)
            except ValueError:
                continue
    latest = max(versions) if versions else 0
    set_cached_version(latest)
    return latest


@router.api_route("/health", methods=["GET", "HEAD"])
def health() -> JSONResponse:
    return JSONResponse(
        content={"status": "ok", "version": _cached_version},
        headers={"Cache-Control": "no-store"},
    )
