from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from server.config import get_settings
from server.routers import admin, delta, enrichment, enquiries, events, health, manifest, partners
from server.static_range import static_router

logger = logging.getLogger("voyeger")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    health.refresh_cached_version_from_disk()
    tiles_file = settings.tiles_dir / "bhopal.pmtiles"
    if not tiles_file.is_file():
        logger.warning(
            "Tiles file %s not found; /tiles/* will return 404 until you add bhopal.pmtiles.",
            tiles_file,
        )
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Voyeger Bhopal API",
        version="1.0.0",
        docs_url=None if settings.is_prod else "/docs",
        redoc_url=None if settings.is_prod else "/redoc",
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "HEAD", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        code_map = {
            400: "bad_request",
            401: "unauthorized",
            403: "forbidden",
            404: "not_found",
            410: "gone",
            413: "payload_too_large",
            416: "range_not_satisfiable",
            422: "validation_error",
            429: "rate_limited",
        }
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": code_map.get(exc.status_code, "http_error"), "detail": str(exc.detail)},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        detail = "Invalid request payload" if settings.is_prod else str(exc.errors())
        return JSONResponse(
            status_code=422,
            content={"error": "validation_error", "detail": detail},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled server error")
        detail = "Internal server error" if settings.is_prod else str(exc)
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error", "detail": detail},
        )

    app.include_router(health.router)
    app.include_router(manifest.router)
    app.include_router(delta.router)
    app.include_router(enrichment.router)
    app.include_router(events.router)
    app.include_router(partners.router)
    app.include_router(enquiries.router)
    app.include_router(admin.router)
    app.include_router(static_router)

    return app


app = create_app()
