from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request, status

from server.config import get_settings


class InMemoryRateLimiter:
    """Simple per-IP sliding-window rate limiter for POST endpoints."""

    def __init__(self) -> None:
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, key: str, limit_per_minute: int) -> None:
        now = time.monotonic()
        cutoff = now - 60.0
        q = self._hits[key]
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= limit_per_minute:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please try again shortly.",
            )
        q.append(now)

    def reset(self) -> None:
        self._hits.clear()


rate_limiter = InMemoryRateLimiter()


def enforce_rate_limit(request: Request) -> None:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(client_ip, settings.rate_limit_per_minute)


async def enforce_max_body_bytes(request: Request, max_bytes: int) -> None:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Request body exceeds {max_bytes} bytes",
                )
        except ValueError:
            pass
    body = await request.body()
    if len(body) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Request body exceeds {max_bytes} bytes",
        )
