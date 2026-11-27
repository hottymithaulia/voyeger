from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from pathlib import Path

import yaml

from pipeline.build_pack import write_pack_contents
from pipeline.ingest_curated import ingest_curated
from pipeline.seed import SAMPLE_PLACES
from pipeline.validate import validate_content_dir, validate_place_dict
from server.services.enrichment_service import apply_enrichment
from server.services.pack_service import PublishValidationError, publish_pack


def _valid_place() -> dict:
    return deepcopy(SAMPLE_PLACES[0])


def test_validate_rejects_bad_records() -> None:
    bbox = (23.10, 77.25, 23.35, 77.55)
    langs = ["en", "hi"]

    # 1. Coordinates outside bbox
    p = _valid_place()
    p["geo"] = {"lat": 19.07, "lng": 72.87}
    errs, _ = validate_place_dict(p, bbox, langs)
    assert any("outside BHOPAL_BBOX" in e for e in errs)

    # 2. Missing Hindi title
    p = _valid_place()
    p["text"]["hi"]["title"] = ""
    errs, _ = validate_place_dict(p, bbox, langs)
    assert any("missing 'title' in 'hi'" in e for e in errs)

    # 3. Image without alt or credit
    p = _valid_place()
    p["media"]["images"][0]["credit"] = ""
    p["media"]["images"][0]["alt"] = {}
    errs, _ = validate_place_dict(p, bbox, langs)
    assert any("missing 'credit'" in e for e in errs)
    assert any("missing 'alt'" in e for e in errs)

    # 4. Sacred place without sacred_note (warning in draft, error in ready)
    p = _valid_place()
    p["sensitivity"] = {"is_sacred": True, "note": ""}
    errs_draft, warns_draft = validate_place_dict(p, bbox, langs)
    assert any("sacred_note" in w for w in warns_draft)
    p["status"] = "ready"
    p["media"]["images"][0]["license"] = "CC-BY-SA-4.0"
    errs, _ = validate_place_dict(p, bbox, langs)
    assert any("sacred_note" in e for e in errs)

    # 5. Unknown category
    p = _valid_place()
    p["category"] = "nightclub"
    errs, _ = validate_place_dict(p, bbox, langs)
    assert any("invalid category" in e for e in errs)


def test_validate_strict_rejects_needs_review(test_env: dict) -> None:
    content_dir: Path = test_env["content_dir"]
    place_file = content_dir / "places" / "gauhar-mahal.yaml"
    data = yaml.safe_load(place_file.read_text(encoding="utf-8"))
    data["text"]["hi"]["needs_review"] = True
    place_file.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")

    assert validate_content_dir(content_dir, strict=False).ok is True
    res_strict = validate_content_dir(content_dir, strict=True)
    assert res_strict.ok is False
    assert any("needs_review=true" in e for e in res_strict.errors)


def test_build_pack_determinism_and_manifest_hashes(test_env: dict) -> None:
    SessionLocal = test_env["SessionLocal"]
    content_dir: Path = test_env["content_dir"]
    tmp_path: Path = test_env["tmp_path"]

    with SessionLocal() as db:
        ingest_curated(db, content_dir=content_dir, target_version=1)
        out1 = tmp_path / "build1"
        out2 = tmp_path / "build2"
        m1 = write_pack_contents(db, out1, version=1, built_at="2026-11-27T00:00:00Z")
        m2 = write_pack_contents(db, out2, version=1, built_at="2026-11-27T01:00:00Z")

    assert m1["files"] == m2["files"]
    assert m1["total_bytes"] == m2["total_bytes"]

    # Verify manifest paths start with /pack/v1/ and hashes match actual files on disk
    for entry in m1["files"]:
        assert entry["path"].startswith("/pack/v1/")
        rel = entry["path"][len("/pack/v1/"):]
        fpath = out1 / rel
        assert fpath.is_file()
        raw = fpath.read_bytes()
        assert len(raw) == entry["bytes"]
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"]

    # Verify places.json embeds i18n with tips as list[str] and search/index.json exists
    places = json.loads((out1 / "places.json").read_text(encoding="utf-8"))
    assert len(places) == 10
    assert isinstance(places[0]["i18n"]["en"]["tips"], list)
    search_idx = json.loads((out1 / "search" / "index.json").read_text(encoding="utf-8"))
    assert search_idx == {"fields": ["title", "summary", "tags"], "searchFields": ["title", "summary", "tags"]}


def test_enrichment_merge_rule_never_mutates_curated_fields() -> None:
    curated = _valid_place()
    curated_before = deepcopy(curated)
    enrichment = {
        "osm": {"source": "OpenStreetMap", "license": "ODbL", "opening_hours": "09:00-17:00"},
        "wikivoyage": {"source": "Wikivoyage", "license": "CC BY-SA 4.0", "extract": "Historic lake"},
        # Even if maliciously shaped keys are passed inside enrichment, curated top-level fields stay untouched
        "title": "HACKED TITLE",
        "hours": "HACKED HOURS",
    }
    merged = apply_enrichment(curated, enrichment)
    for key in curated_before:
        if key != "enrichment":
            assert merged[key] == curated_before[key]
    assert merged["enrichment"] == enrichment


def test_delta_publish_tombstone_and_atomic_failure(test_env: dict) -> None:
    SessionLocal = test_env["SessionLocal"]
    content_dir: Path = test_env["content_dir"]
    pack_dir: Path = test_env["pack_dir"]
    client = test_env["client"]

    # Publish v1
    with SessionLocal() as db:
        m1 = publish_pack(db, content_dir=content_dir)
    assert m1["version"] == 1

    # Edit one place and publish v2
    pfile = content_dir / "places" / "gauhar-mahal.yaml"
    pdata = yaml.safe_load(pfile.read_text(encoding="utf-8"))
    pdata["cost_note"] = "INR 10 heritage upkeep"
    pdata["text"]["en"]["summary"] = "Updated summary for Gauhar Mahal."
    pfile.write_text(yaml.safe_dump(pdata, allow_unicode=True), encoding="utf-8")

    with SessionLocal() as db:
        m2 = publish_pack(db, content_dir=content_dir)
    assert m2["version"] == 2

    r_delta = client.get("/api/delta?from=1&to=2")
    assert r_delta.status_code == 200
    delta_body = r_delta.json()
    assert [p["id"] for p in delta_body["places"]] == ["gauhar-mahal"]
    assert "gauhar-mahal" in delta_body["text"]
    assert isinstance(delta_body["places"][0]["i18n"]["en"]["tips"], list)
    assert delta_body["deleted_ids"] == []

    # Same version delta returns empty
    r_same = client.get("/api/delta?from=2&to=2")
    assert r_same.status_code == 200
    assert r_same.json()["places"] == []

    # Tombstone a place in v3, verify deleted_ids, and verify purged in v4
    pfile_del = content_dir / "places" / "lake-view-walk.yaml"
    pdel = yaml.safe_load(pfile_del.read_text(encoding="utf-8"))
    pdel["deleted"] = True
    pfile_del.write_text(yaml.safe_dump(pdel, allow_unicode=True), encoding="utf-8")

    with SessionLocal() as db:
        m3 = publish_pack(db, content_dir=content_dir)
    assert m3["version"] == 3
    r_d23 = client.get("/api/delta?from=2&to=3")
    assert r_d23.status_code == 200
    assert "lake-view-walk" in r_d23.json()["deleted_ids"]

    # In v4, lake-view-walk must be purged from places.json
    with SessionLocal() as db:
        m4 = publish_pack(db, content_dir=content_dir)
    assert m4["version"] == 4
    v4_places = json.loads((pack_dir / "v4" / "places.json").read_text(encoding="utf-8"))
    assert all(p["id"] != "lake-view-walk" for p in v4_places)

    # Atomic publish failure: break a place and confirm v4 remains current
    bad_file = content_dir / "places" / "gauhar-mahal.yaml"
    bad_data = yaml.safe_load(bad_file.read_text(encoding="utf-8"))
    bad_data["geo"]["lat"] = 99.0  # outside Bhopal bbox
    bad_file.write_text(yaml.safe_dump(bad_data, allow_unicode=True), encoding="utf-8")

    with SessionLocal() as db:
        try:
            publish_pack(db, content_dir=content_dir)
            assert False, "Expected PublishValidationError"
        except PublishValidationError:
            pass

    r_man = client.get("/api/manifest")
    assert r_man.status_code == 200
    assert r_man.json()["version"] == 4

    # Fix bad file, publish v5..v7, and test to-from > 5 returns 410 with manifest
    bad_data["geo"]["lat"] = 23.2512
    bad_file.write_text(yaml.safe_dump(bad_data, allow_unicode=True), encoding="utf-8")
    with SessionLocal() as db:
        publish_pack(db, content_dir=content_dir)  # v5
        publish_pack(db, content_dir=content_dir)  # v6
        publish_pack(db, content_dir=content_dir)  # v7

    r_410 = client.get("/api/delta?from=1&to=7")
    assert r_410.status_code == 410
    body_410 = r_410.json()
    assert body_410["error"] == "full_resync_required"
    assert body_410["manifest"]["version"] == 7
