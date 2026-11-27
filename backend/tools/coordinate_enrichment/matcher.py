"""
Matching engine and confidence scoring system for geographic candidates.
"""

from __future__ import annotations

import difflib
import math
import re
from typing import List, Optional, Tuple

from tools.coordinate_enrichment.models import MatchResult, OSMCandidate, PlaceRecord
from tools.coordinate_enrichment.validators import is_inside_bbox, is_valid_coord


def _clean_str(text: str) -> str:
    """Normalize text for comparison: lower, alphanumeric and spaces only."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return " ".join(text.split())


def _token_overlap_ratio(s1: str, s2: str) -> float:
    """Calculate Jaccard similarity between word tokens of two strings."""
    tokens1 = set(_clean_str(s1).split())
    tokens2 = set(_clean_str(s2).split())
    fillers = {"bhopal", "madhya", "pradesh", "india", "road", "near", "district", "huzur", "tahsil"}
    sig1 = tokens1 - fillers
    sig2 = tokens2 - fillers
    if not sig1 or not sig2:
        sig1 = tokens1
        sig2 = tokens2
    if not sig1 or not sig2:
        return 0.0
    return len(sig1 & sig2) / len(sig1 | sig2)


def _string_similarity(s1: str, s2: str) -> float:
    """Calculate SequenceMatcher similarity ratio."""
    return difflib.SequenceMatcher(None, _clean_str(s1), _clean_str(s2)).ratio()


BOOSTED_OSM_CLASSES = {
    "tourism": 15.0,
    "historic": 15.0,
    "leisure": 10.0,
    "amenity": 8.0,
    "waterway": 8.0,
    "natural": 8.0,
    "wikidata": 25.0,
    "wikipedia": 20.0,
}

BOOSTED_TYPES = {
    "museum": 15.0,
    "monument": 15.0,
    "memorial": 12.0,
    "attraction": 15.0,
    "gallery": 12.0,
    "park": 10.0,
    "place_of_worship": 10.0,
    "theatre": 10.0,
    "arts_centre": 12.0,
    "lake": 12.0,
    "water": 12.0,
    "castle": 15.0,
    "palace": 15.0,
    "tomb": 15.0,
    "archaeological_site": 15.0,
    "P625": 20.0,
    "article_coordinates": 15.0,
}


def score_candidate(
    place: PlaceRecord,
    candidate: OSMCandidate,
    bbox: Tuple[float, float, float, float],
) -> Tuple[float, str, str]:
    """
    Score candidate against place record on a scale of 0 to 100.
    Returns (confidence, match_status, review_reason).
    """
    # 1. Coordinate validity & Bounding Box Check (Mandatory Gate)
    if not is_valid_coord(candidate.lat, candidate.lng):
        return 0.0, "rejected", "Invalid numeric coordinates."

    if not is_inside_bbox(candidate.lat, candidate.lng, bbox):
        return 0.0, "out_of_bounds", f"Coordinates ({candidate.lat:.4f}, {candidate.lng:.4f}) outside canonical Bhopal bounds."

    # 2. Source-specific scoring for authoritative open sources
    if candidate.source == "wikidata":
        return 95.0, "high_confidence", f"Authoritative coordinate location (P625) from Wikidata item {candidate.osm_id} inside Bhopal."

    if candidate.source == "wikipedia":
        return 92.0, "high_confidence", f"Authoritative article coordinates from Wikipedia '{candidate.display_name}' inside Bhopal."

    # 3. Bhopal Address Verification for OSM Nominatim/Overpass
    disp_lower = candidate.display_name.lower()
    if "bhopal" not in disp_lower:
        return 20.0, "ambiguous", "Result does not mention Bhopal in address hierarchy."

    # 4. Name & Hint Similarity
    name_sim = _string_similarity(place.name, candidate.display_name)
    name_tok = _token_overlap_ratio(place.name, candidate.display_name)
    hint_sim = _string_similarity(place.search_hint, candidate.display_name)
    hint_tok = _token_overlap_ratio(place.search_hint, candidate.display_name)

    text_score = max(name_sim * 45.0, name_tok * 50.0, hint_sim * 40.0, hint_tok * 45.0)

    clean_title = _clean_str(place.name)
    clean_disp = _clean_str(candidate.display_name)
    if clean_title in clean_disp:
        text_score = max(text_score, 50.0)

    # 5. Feature Type Relevance
    type_score = 0.0
    if candidate.osm_class in BOOSTED_OSM_CLASSES:
        type_score += BOOSTED_OSM_CLASSES[candidate.osm_class]

    detail = candidate.osm_type_detail or ""
    if detail in BOOSTED_TYPES:
        type_score += BOOSTED_TYPES[detail]

    type_score = min(type_score, 25.0)

    # 6. Base Confidence Calculation
    confidence = min(text_score + type_score + 20.0, 100.0)

    if candidate.osm_class == "boundary" and candidate.osm_type_detail == "administrative":
        confidence -= 30.0

    confidence = max(0.0, min(confidence, 100.0))

    if confidence >= 90.0:
        status = "high_confidence"
        reason = f"Strong name/hint match ({text_score:.1f}pts) and relevant OSM {candidate.osm_class}/{detail} feature in Bhopal."
    elif confidence >= 70.0:
        status = "probable"
        reason = f"Plausible match in Bhopal with moderate name overlap ({text_score:.1f}pts); review recommended."
    else:
        status = "ambiguous"
        reason = f"Low textual/feature confidence ({confidence:.1f}pts) for query '{place.search_hint}'."

    return round(confidence, 1), status, reason


class MatchEngine:
    """Evaluates candidate matches for PlaceRecords."""

    def __init__(self, bbox: Tuple[float, float, float, float]):
        self.bbox = bbox

    def evaluate(self, place: PlaceRecord, candidates: List[OSMCandidate]) -> MatchResult:
        """Find best candidate from list and compute confidence."""
        if not candidates:
            return MatchResult(
                place=place,
                candidate=None,
                confidence=0.0,
                match_status="unresolved",
                review_reason=f"No OSM results returned for search hint '{place.search_hint}'.",
                approved="",
            )

        scored_candidates: List[Tuple[float, str, str, OSMCandidate]] = []
        for cand in candidates:
            score, status, reason = score_candidate(place, cand, self.bbox)
            scored_candidates.append((score, status, reason, cand))

        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        best_score, best_status, best_reason, best_cand = scored_candidates[0]

        return MatchResult(
            place=place,
            candidate=best_cand,
            confidence=best_score,
            match_status=best_status,
            review_reason=best_reason,
            approved="",
        )
