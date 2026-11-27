"""
Unit tests for the Coordinate Enrichment package.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict

import pytest
import yaml

from tools.coordinate_enrichment.cache import GeoCache
from tools.coordinate_enrichment.config import DEFAULT_BHOPAL_BBOX
from tools.coordinate_enrichment.main import (
    apply_approved_coordinates,
    discover_place_records,
    write_review_artifacts,
)
from tools.coordinate_enrichment.matcher import MatchEngine, score_candidate
from tools.coordinate_enrichment.models import MatchResult, OSMCandidate, PlaceRecord
from tools.coordinate_enrichment.validators import (
    check_lat_lng_swapped,
    find_duplicate_coordinates,
    is_inside_bbox,
    is_valid_coord,
    validate_candidate,
)


# ---------------------------------------------------------------------------
# 1. Validator Tests
# ---------------------------------------------------------------------------

def test_is_valid_coord():
    assert is_valid_coord(23.25, 77.40) is True
    assert is_valid_coord(-90.0, 180.0) is True
    assert is_valid_coord(91.0, 50.0) is False
    assert is_valid_coord(23.25, 181.0) is False
    assert is_valid_coord("not_a_number", 77.40) is False
    assert is_valid_coord(float("nan"), 77.40) is False
    assert is_valid_coord(23.25, float("inf")) is False


def test_is_inside_bbox():
    bbox = (23.10, 77.25, 23.35, 77.55)
    assert is_inside_bbox(23.25, 77.40, bbox) is True
    assert is_inside_bbox(23.05, 77.40, bbox) is False  # Too far south
    assert is_inside_bbox(23.40, 77.40, bbox) is False  # Too far north
    assert is_inside_bbox(23.25, 77.20, bbox) is False  # Too far west
    assert is_inside_bbox(23.25, 77.60, bbox) is False  # Too far east


def test_check_lat_lng_swapped():
    bbox = (23.10, 77.25, 23.35, 77.55)
    # Normal coordinates: not swapped
    assert check_lat_lng_swapped(23.25, 77.40, bbox) is False
    # Accidental swap (lat is 77.4, lng is 23.25): should detect swap
    assert check_lat_lng_swapped(77.40, 23.25, bbox) is True


def test_find_duplicate_coordinates():
    p1 = PlaceRecord("p1", "Place 1", "culture", False, "place", None, None, "", "", "", Path("p1.yaml"))
    p2 = PlaceRecord("p2", "Place 2", "hidden_gem", False, "place", None, None, "", "", "", Path("p2.yaml"))
    p3 = PlaceRecord("p3", "Place 3", "experience", True, "anchor", None, None, "", "", "", Path("p3.yaml"))

    cand1 = OSMCandidate(lat=23.250000, lng=77.400000, display_name="Dup Spot")
    cand2 = OSMCandidate(lat=23.250000, lng=77.400000, display_name="Dup Spot")
    cand3 = OSMCandidate(lat=23.260000, lng=77.410000, display_name="Unique Spot")

    r1 = MatchResult(p1, cand1, 95.0, "high_confidence", "")
    r2 = MatchResult(p2, cand2, 90.0, "high_confidence", "")
    r3 = MatchResult(p3, cand3, 92.0, "high_confidence", "")

    dups = find_duplicate_coordinates([r1, r2, r3])
    assert len(dups) == 1
    assert (23.25, 77.40) in dups
    assert set(dups[(23.25, 77.40)]) == {"p1", "p2"}


def test_validate_candidate():
    bbox = (23.10, 77.25, 23.35, 77.55)
    valid_cand = OSMCandidate(lat=23.25, lng=77.40, display_name="Bhopal Spot")
    ok, issues = validate_candidate(valid_cand, bbox)
    assert ok is True
    assert len(issues) == 0

    out_cand = OSMCandidate(lat=28.61, lng=77.20, display_name="Delhi Spot")
    ok, issues = validate_candidate(out_cand, bbox)
    assert ok is False
    assert any("outside Bhopal bounding box" in msg for msg in issues)


# ---------------------------------------------------------------------------
# 2. Cache Tests
# ---------------------------------------------------------------------------

def test_cache_lifecycle(tmp_path: Path):
    cache_path = tmp_path / "test_geo_cache.json"
    cache = GeoCache(cache_path)
    assert cache.count() == 0

    cache.set("kamlapati-palace", {"lat": 23.25, "lng": 77.40}, query="Rani Kamlapati Palace Bhopal")
    cache.save()
    assert cache_path.is_file()

    # Interrupted-run recovery test: re-instantiate from disk
    reloaded = GeoCache(cache_path)
    assert reloaded.count() == 1
    res = reloaded.get("kamlapati-palace")
    assert res == {"lat": 23.25, "lng": 77.40}


# ---------------------------------------------------------------------------
# 3. Matcher & Scoring Tests
# ---------------------------------------------------------------------------

def test_matcher_confidence_scoring():
    bbox = (23.10, 77.25, 23.35, 77.55)
    place = PlaceRecord(
        id="kamlapati-palace",
        name="Rani Kamlapati Palace",
        category="hidden_gem",
        is_anchor=False,
        record_type="candidate",
        lat=None,
        lng=None,
        search_hint="Rani Kamlapati Palace Kamla Park Bhopal",
        associated_anchor="upper-lake-bhojtal",
        source_file="hidden_g1.yaml",
        yaml_path=Path("dummy.yaml"),
    )

    # 1. High confidence match
    high_cand = OSMCandidate(
        lat=23.2458,
        lng=77.3912,
        display_name="Rani Kamlapati Palace, Kamla Park, Shamla Hills, Bhopal, Madhya Pradesh, India",
        osm_class="historic",
        osm_type_detail="palace",
    )
    score, status, reason = score_candidate(place, high_cand, bbox)
    assert score >= 90.0
    assert status == "high_confidence"

    # 2. Ambiguous match
    low_cand = OSMCandidate(
        lat=23.2300,
        lng=77.4100,
        display_name="Some Random Shop, Kolar Road, Bhopal, Madhya Pradesh, India",
        osm_class="shop",
        osm_type_detail="convenience",
    )
    score_low, status_low, _ = score_candidate(place, low_cand, bbox)
    assert score_low < 70.0
    assert status_low == "ambiguous"

    # 3. Out of bounds match
    oob_cand = OSMCandidate(
        lat=22.5000,
        lng=75.8000,
        display_name="Rani Kamlapati Palace, Indore, Madhya Pradesh, India",
    )
    score_oob, status_oob, reason_oob = score_candidate(place, oob_cand, bbox)
    assert score_oob == 0.0
    assert status_oob == "out_of_bounds"


# ---------------------------------------------------------------------------
# 4. Discovery & YAML Write-back Tests (Fixture Based)
# ---------------------------------------------------------------------------

def test_discovery_and_write_approved_workflow(tmp_path: Path):
    content_dir = tmp_path / "content"
    places_dir = content_dir / "places"
    working_dir = content_dir / "working"
    places_dir.mkdir(parents=True)
    working_dir.mkdir(parents=True)

    # Create dummy place YAML
    place_yaml = places_dir / "kamlapati-palace.yaml"
    initial_content = {
        "id": "kamlapati-palace",
        "category": "hidden_gem",
        "is_anchor": False,
        "geo": {"lat": None, "lng": None},
        "text": {"en": {"title": "Rani Kamlapati Palace"}},
        "unrelated_field": "must_preserve_this",
        "provenance": {"license": "CC-BY-SA-4.0"},
    }
    place_yaml.write_text(yaml.safe_dump(initial_content), encoding="utf-8")

    # Create dummy meta
    meta_yaml = working_dir / "kamlapati-palace.meta.yaml"
    meta_yaml.write_text(
        yaml.safe_dump({"osm_search_hint": "Rani Kamlapati Palace Bhopal", "record_type": "candidate"}),
        encoding="utf-8",
    )

    # 1. Test discovery
    records = discover_place_records(content_dir, only_missing=True, include_anchors=True)
    assert len(records) == 1
    assert records[0].id == "kamlapati-palace"
    assert records[0].name == "Rani Kamlapati Palace"

    # 2. Test review artifact generation
    cand = OSMCandidate(lat=23.2458, lng=77.3912, display_name="Rani Kamlapati Palace, Bhopal")
    result = MatchResult(
        place=records[0],
        candidate=cand,
        confidence=95.0,
        match_status="high_confidence",
        review_reason="Test match",
        approved="Y",  # Simulate user marking approved
    )

    output_dir = tmp_path / "output"
    csv_out, json_out, _ = write_review_artifacts([result], content_dir, output_dir)
    assert csv_out.is_file()
    assert (working_dir / "geo_review.csv").is_file()

    # 3. Test apply_approved_coordinates with backup
    summary = apply_approved_coordinates(content_dir=content_dir, backup=True)
    assert summary["approved_found"] == 1
    assert summary["applied"] == 1
    assert summary["backup_path"] is not None
    assert Path(summary["backup_path"]).is_dir()

    # 4. Verify updated YAML
    updated_data = yaml.safe_load(place_yaml.read_text(encoding="utf-8"))
    assert updated_data["geo"]["lat"] == 23.2458
    assert updated_data["geo"]["lng"] == 77.3912
    # Verify unrelated fields and provenance were preserved
    assert updated_data["unrelated_field"] == "must_preserve_this"
    assert updated_data["provenance"]["license"] == "CC-BY-SA-4.0"
    assert "geo_attribution" in updated_data["provenance"]
