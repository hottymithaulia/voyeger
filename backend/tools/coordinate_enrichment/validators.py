"""
Geographic coordinate validation utilities.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from tools.coordinate_enrichment.models import MatchResult, OSMCandidate


def is_valid_coord(lat: Any, lng: Any) -> bool:
    """Validate that latitude and longitude are valid finite floats within earth bounds."""
    try:
        f_lat = float(lat)
        f_lng = float(lng)
        if math.isnan(f_lat) or math.isnan(f_lng) or math.isinf(f_lat) or math.isinf(f_lng):
            return False
        return -90.0 <= f_lat <= 90.0 and -180.0 <= f_lng <= 180.0
    except (TypeError, ValueError):
        return False


def is_inside_bbox(lat: float, lng: float, bbox: Tuple[float, float, float, float]) -> bool:
    """Check if (lat, lng) falls within south, west, north, east bounding box."""
    south, west, north, east = bbox
    return south <= lat <= north and west <= lng <= east


def check_lat_lng_swapped(lat: float, lng: float, bbox: Tuple[float, float, float, float]) -> bool:
    """
    Check if latitude and longitude were accidentally swapped.
    In Bhopal, lat is ~23.2 and lng is ~77.4. If lat is ~77 and lng is ~23, they are swapped.
    """
    south, west, north, east = bbox
    # If the swapped coordinates fall in the box, flag as swapped
    return is_inside_bbox(lng, lat, bbox)


def find_duplicate_coordinates(results: List[MatchResult]) -> Dict[Tuple[float, float], List[str]]:
    """
    Identify cases where multiple distinct place IDs share the exact same coordinates.
    Returns mapping of (lat, lng) -> list of place IDs.
    """
    coord_map: Dict[Tuple[float, float], List[str]] = {}
    for r in results:
        if r.candidate and is_valid_coord(r.candidate.lat, r.candidate.lng):
            key = (round(r.candidate.lat, 6), round(r.candidate.lng, 6))
            coord_map.setdefault(key, []).append(r.place.id)

    return {coord: pids for coord, pids in coord_map.items() if len(pids) > 1}


def validate_candidate(candidate: OSMCandidate, bbox: Tuple[float, float, float, float]) -> Tuple[bool, List[str]]:
    """
    Comprehensive validation of an OSM candidate.
    Returns (is_valid, list of warning/error messages).
    """
    issues: List[str] = []
    if not is_valid_coord(candidate.lat, candidate.lng):
        issues.append("Coordinates are not valid numeric values within global bounds (-90..90, -180..180).")
        return False, issues

    if check_lat_lng_swapped(candidate.lat, candidate.lng, bbox):
        issues.append(f"Coordinates appear to have latitude and longitude inverted: ({candidate.lat}, {candidate.lng}).")
        return False, issues

    if not is_inside_bbox(candidate.lat, candidate.lng, bbox):
        issues.append(f"Coordinates ({candidate.lat:.6f}, {candidate.lng:.6f}) fall outside Bhopal bounding box {bbox}.")
        return False, issues

    return True, issues
