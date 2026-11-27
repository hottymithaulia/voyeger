"""
Configuration settings for the Coordinate Enrichment utility.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Tuple

# Default canonical Bhopal bounding box: south, west, north, east
DEFAULT_BHOPAL_BBOX: Tuple[float, float, float, float] = (23.10, 77.25, 23.35, 77.55)

# Default User-Agent conforming to OSM Nominatim Usage Policy
DEFAULT_USER_AGENT = "VoyegerBhopal-Enrichment/1.0 (contact@voyeger.local)"

# Service endpoints
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Rate limiting: max 1 request per second for public Nominatim
DEFAULT_RATE_LIMIT_DELAY = 1.1

# HTTP request timeout (seconds)
DEFAULT_REQUEST_TIMEOUT = 15.0

# HTTP max retry attempts on transient network errors
DEFAULT_MAX_RETRIES = 3


def get_canonical_bbox(backend_dir: Path | None = None) -> Tuple[float, float, float, float]:
    """
    Attempt to load the canonical bounding box from backend server.config,
    otherwise fall back to DEFAULT_BHOPAL_BBOX.
    """
    try:
        from server.config import get_settings
        settings = get_settings()
        return settings.bhopal_bbox
    except Exception:
        pass

    # Read from environment or fallback
    raw = os.environ.get("BHOPAL_BBOX", "23.10,77.25,23.35,77.55")
    try:
        parts = [float(x.strip()) for x in raw.split(",")]
        if len(parts) == 4:
            return (parts[0], parts[1], parts[2], parts[3])
    except Exception:
        pass

    return DEFAULT_BHOPAL_BBOX


def get_user_agent() -> str:
    """Retrieve configured user agent or fallback."""
    try:
        from server.config import get_settings
        settings = get_settings()
        return settings.osm_user_agent
    except Exception:
        return DEFAULT_USER_AGENT
