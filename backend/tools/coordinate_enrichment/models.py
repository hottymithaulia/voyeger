"""
Data models for the coordinate enrichment process.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class PlaceRecord:
    """Represents a place record discovered from YAML files."""
    id: str
    name: str
    category: str
    is_anchor: bool
    record_type: str
    lat: Optional[float]
    lng: Optional[float]
    search_hint: str
    associated_anchor: str
    source_file: str
    yaml_path: Path
    status: str = "ready"
    tags: List[str] = field(default_factory=list)


@dataclass
class OSMCandidate:
    """Represents a potential geographic coordinate match from OSM."""
    lat: float
    lng: float
    display_name: str
    osm_id: Optional[str] = None
    osm_type: Optional[str] = None
    osm_class: Optional[str] = None
    osm_type_detail: Optional[str] = None
    boundingbox: Optional[List[float]] = None
    tags: Dict[str, Any] = field(default_factory=dict)
    source: str = "nominatim"
    source_url: str = ""
    timestamp: str = ""


@dataclass
class MatchResult:
    """The result of matching a PlaceRecord against geographic candidates."""
    place: PlaceRecord
    candidate: Optional[OSMCandidate]
    confidence: float  # 0 to 100
    match_status: str  # high_confidence, probable, ambiguous, rejected, out_of_bounds, unresolved
    review_reason: str
    approved: str = ""  # "Y", "N", or ""

    def to_csv_dict(self) -> Dict[str, str]:
        """Convert match result to schema expected by apply_geo.py and reviewers."""
        lat_str = f"{self.candidate.lat:.6f}" if self.candidate else ""
        lng_str = f"{self.candidate.lng:.6f}" if self.candidate else ""
        inside_bbox_str = "true" if self.match_status != "out_of_bounds" and self.candidate else "false"

        return {
            "id": self.place.id,
            "title": self.place.name,
            "category": self.place.category,
            "is_anchor": "true" if self.place.is_anchor else "false",
            "lat": lat_str,
            "lng": lng_str,
            "inside_bbox": inside_bbox_str,
            "matched OSM display name": self.candidate.display_name if self.candidate else "",
            "osm_id": str(self.candidate.osm_id or "") if self.candidate else "",
            "osm_type": str(self.candidate.osm_type or "") if self.candidate else "",
            "osm_class": str(self.candidate.osm_class or "") if self.candidate else "",
            "confidence": f"{self.confidence:.1f}",
            "match_status": self.match_status,
            "review_reason": self.review_reason,
            "source": self.candidate.source if self.candidate else "",
            "source_url": self.candidate.source_url if self.candidate else "",
            "approved": self.approved,
        }
