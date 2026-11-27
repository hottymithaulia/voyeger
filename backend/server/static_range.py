import mimetypes
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse

from server.config import get_settings

_VERSIONED_PACK_RE = re.compile(r"^v\d+/")

mimetypes.add_type("application/vnd.pmtiles", ".pmtiles")
mimetypes.add_type("image/webp", ".webp")


def _safe_resolve(base_dir: Path, rel_path: str) -> Optional[Path]:
    base = base_dir.resolve()
    target = (base / rel_path).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        return None
    if not target.is_file():
        return None
    return target


def _cors_origin(request: Request) -> str:
    settings = get_settings()
    origin = request.headers.get("origin")
    if origin and (origin in settings.cors_origins or "*" in settings.cors_origins):
        return origin
    return settings.cors_origins[0] if settings.cors_origins else "*"


def _serve_range_file(
    request: Request,
    file_path: Path,
    cache_control: str,
) -> Response:
    file_size = file_path.stat().st_size
    content_type, _ = mimetypes.guess_type(str(file_path))
    if not content_type:
        content_type = "application/octet-stream"

    base_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": cache_control,
        "Access-Control-Allow-Origin": _cors_origin(request),
        "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
    }

    range_header = request.headers.get("range")
    if not range_header:
        if request.method == "HEAD":
            return Response(
                status_code=200,
                media_type=content_type,
                headers={**base_headers, "Content-Length": str(file_size)},
            )
        return FileResponse(path=file_path, media_type=content_type, headers=base_headers)

    if not range_header.startswith("bytes="):
        raise HTTPException(status_code=416, detail="Invalid Range unit")

    spec = range_header[len("bytes="):].split(",")[0].strip()
    if "-" not in spec:
        raise HTTPException(status_code=416, detail="Invalid Range header")

    start_s, end_s = spec.split("-", 1)
    try:
        if start_s == "":
            suffix_len = int(end_s)
            if suffix_len <= 0:
                raise ValueError
            start = max(0, file_size - suffix_len)
            end = file_size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else file_size - 1
    except ValueError:
        raise HTTPException(status_code=416, detail="Invalid Range bounds")

    if file_size == 0 or start < 0 or start >= file_size or end < start:
        return Response(
            status_code=416,
            headers={**base_headers, "Content-Range": f"bytes */{file_size}"},
        )

    end = min(end, file_size - 1)
    length = end - start + 1

    headers = {
        **base_headers,
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(length),
    }

    if request.method == "HEAD":
        return Response(status_code=206, media_type=content_type, headers=headers)

    def _iter_range():
        chunk_size = 65536
        with file_path.open("rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fh.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(_iter_range(), status_code=206, media_type=content_type, headers=headers)


static_router = APIRouter(tags=["static"])


@static_router.api_route("/pack/{file_path:path}", methods=["GET", "HEAD"])
def serve_pack_file(file_path: str, request: Request) -> Response:
    settings = get_settings()
    resolved = _safe_resolve(settings.pack_dir, file_path)
    if resolved is None:
        raise HTTPException(status_code=404, detail="Pack file not found")
    cache_control = (
        "public, max-age=31536000, immutable"
        if _VERSIONED_PACK_RE.match(file_path)
        else "public, max-age=60"
    )
    return _serve_range_file(request, resolved, cache_control)


@static_router.api_route("/tiles/{file_path:path}", methods=["GET", "HEAD"])
def serve_tiles_file(file_path: str, request: Request) -> Response:
    settings = get_settings()
    resolved = _safe_resolve(settings.tiles_dir, file_path)
    if resolved is None:
        raise HTTPException(status_code=404, detail="Tiles file not found")
    return _serve_range_file(request, resolved, "public, max-age=86400")
