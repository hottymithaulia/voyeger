from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path

import yaml
from PIL import Image

from pipeline.apply_geo import apply_geo
from pipeline.cleanup_text import clean_field_text, cleanup_content_dir
from pipeline.compute_links import compute_links, haversine_km
from pipeline.import_incoming import import_incoming
from pipeline.ingest_media import ingest_media
from pipeline.optimize_media import compute_theme_from_image, contrast_ratio_hex
from pipeline.resolve_geo import resolve_geo
from pipeline.todo_report import generate_todo_csv
from pipeline.validate import PLACEHOLDER_STRINGS, validate_content_dir, validate_place_dict
from server.config import get_settings
from server.services.pack_service import publish_pack


def _copy_incoming_to_tmp(dst_content: Path) -> None:
    src_incoming = Path("content/incoming")
    (dst_content / "incoming").mkdir(parents=True, exist_ok=True)
    for f in src_incoming.glob("*.yaml"):
        shutil.copy2(f, dst_content / "incoming" / f.name)


def test_import_idempotent_and_cleanup_byte_identical(tmp_path: Path) -> None:
    content_dir = tmp_path / "content"
    _copy_incoming_to_tmp(content_dir)

    s1 = import_incoming(content_dir)
    assert s1["imported"] == 28
    assert s1["draft"] == 27
    assert s1["hold"] == 1

    snap1 = {
        p.name: p.read_bytes()
        for p in sorted((content_dir / "places").glob("*.yaml"))
    }
    meta1 = {
        p.name: p.read_bytes()
        for p in sorted((content_dir / "working").glob("*.meta.yaml"))
    }

    import_incoming(content_dir)

    snap2 = {
        p.name: p.read_bytes()
        for p in sorted((content_dir / "places").glob("*.yaml"))
    }
    meta2 = {
        p.name: p.read_bytes()
        for p in sorted((content_dir / "working").glob("*.meta.yaml"))
    }
    assert snap1 == snap2
    assert meta1 == meta2

    # Unmodified text stays byte-identical after cleanup; targeted sentences removed
    unchanged_text = "Bhojtal has shaped Bhopal for centuries. Evening walks stay lively."
    out_unchanged, entries = clean_field_text("upper-lake-bhojtal", "story", "en", unchanged_text)
    assert out_unchanged == unchanged_text
    assert entries == []

    leaked = (
        "Historic spot on the hillside. "
        "It is classified under culture rather than hidden_gem. "
        "Rarely listed on mainstream routes."
    )
    out_cleaned, log_entries = clean_field_text("spot", "story", "en", leaked)
    assert "classified" not in out_cleaned
    assert "hidden_gem" not in out_cleaned
    assert "Rarely listed on mainstream routes." in out_cleaned
    assert any(e.kind == "REMOVED" for e in log_entries)
    assert any(e.kind == "REVIEW" for e in log_entries)

    res = cleanup_content_dir(content_dir)
    assert res["removed_count"] == 9
    assert res["review_count"] == 8
    assert (content_dir / "working" / "cleanup_log.md").is_file()


def test_hold_excluded_draft_filtered_and_no_placeholders_in_pack(test_env: dict, monkeypatch) -> None:
    content_dir: Path = test_env["content_dir"]
    pack_dir: Path = test_env["pack_dir"]
    SessionLocal = test_env["SessionLocal"]
    client = test_env["client"]

    # Clear seed files so only incoming 28 places are present
    shutil.rmtree(content_dir / "places", ignore_errors=True)
    shutil.rmtree(content_dir / "partners", ignore_errors=True)
    _copy_incoming_to_tmp(content_dir)
    import_incoming(content_dir)
    cleanup_content_dir(content_dir)

    assert validate_content_dir(content_dir, strict=False).ok is True

    # Publish v1 with PUBLISH_STATUSES=ready,draft
    monkeypatch.setenv("PUBLISH_STATUSES", "ready,draft")
    get_settings.cache_clear()
    with SessionLocal() as db:
        m1 = publish_pack(db, content_dir=content_dir)
    assert m1["version"] == 1

    v1_places = json.loads((pack_dir / "v1" / "places.json").read_text(encoding="utf-8"))
    v1_en = json.loads((pack_dir / "v1" / "i18n" / "en.json").read_text(encoding="utf-8"))
    v1_hi = json.loads((pack_dir / "v1" / "i18n" / "hi.json").read_text(encoding="utf-8"))

    # hold place never appears anywhere
    ids = {p["id"] for p in v1_places}
    assert len(v1_places) == 27
    assert "ravindra-bhavan-bhopal" not in ids
    assert "ravindra-bhavan-bhopal" not in v1_en
    assert "ravindra-bhavan-bhopal" not in v1_hi
    assert all("ravindra-bhavan-bhopal" not in f["path"] for f in m1["files"])

    # Empty partners list
    v1_partners = json.loads((pack_dir / "v1" / "partners.json").read_text(encoding="utf-8"))
    assert v1_partners == []

    # Placeholders must never appear in built i18n text or sensitivity.note
    for p in v1_places:
        for lang in ("en", "hi"):
            t = p["i18n"][lang]
            blob = " ".join([t["title"], t["summary"], t["story"], *t["tips"], p["sensitivity"]["note"]])
            for ph in PLACEHOLDER_STRINGS:
                assert ph not in blob, f"Placeholder {ph!r} leaked in {p['id']}.{lang}"
    for lang_map in (v1_en, v1_hi):
        for pid, t in lang_map.items():
            blob = " ".join([t["title"], t["summary"], t["story"], *t["tips"]])
            for ph in PLACEHOLDER_STRINGS:
                assert ph not in blob, f"Placeholder {ph!r} leaked in i18n.{pid}"

    # Publish v2 with PUBLISH_STATUSES=ready -> drafts excluded and hold excluded from delta too
    # Make one ready place with real image/geo/tips/verified
    img_dir = content_dir / "media" / "bhadbhada-dam"
    img_dir.mkdir(parents=True, exist_ok=True)
    img_file = img_dir / "1.jpg"
    Image.new("RGB", (120, 90), color=(24, 96, 130)).save(img_file)
    (img_dir / "credits.yaml").write_text(
        yaml.safe_dump(
            {
                "images": [
                    {
                        "file": "1.jpg",
                        "credit": "Photo: Test",
                        "license": "CC BY-SA 4.0",
                        "source_url": "",
                        "alt": {"en": "Dam gate", "hi": "बांध गेट"},
                    }
                ]
            },
            allow_unicode=True,
        ),
        encoding="utf-8",
    )
    ingest_media(content_dir)

    bhad_path = content_dir / "places" / "bhadbhada-dam.yaml"
    bhad = yaml.safe_load(bhad_path.read_text(encoding="utf-8"))
    bhad["status"] = "ready"
    bhad["geo"] = {"lat": 23.216, "lng": 77.386}
    bhad["provenance"]["verified_by"] = "tester"
    bhad["provenance"]["verified_at"] = "2026-11-27"
    bhad["text"]["en"]["tips"] = ["Visit after monsoon rains."]
    bhad["text"]["en"]["needs_review"] = False
    bhad["text"]["hi"]["tips"] = ["मानसून के बाद जाएं।"]
    bhad["text"]["hi"]["needs_review"] = False
    bhad_path.write_text(yaml.safe_dump(bhad, allow_unicode=True, sort_keys=False), encoding="utf-8")

    monkeypatch.setenv("PUBLISH_STATUSES", "ready")
    get_settings.cache_clear()
    with SessionLocal() as db:
        m2 = publish_pack(db, content_dir=content_dir)
    assert m2["version"] == 2

    v2_places = json.loads((pack_dir / "v2" / "places.json").read_text(encoding="utf-8"))
    assert [p["id"] for p in v2_places] == ["bhadbhada-dam"]
    assert v2_places[0]["theme"] is not None

    delta = client.get("/api/delta?from=1&to=2").json()
    assert "ravindra-bhavan-bhopal" not in [p["id"] for p in delta["places"]]
    assert "ravindra-bhavan-bhopal" not in delta["text"]
    assert "ravindra-bhavan-bhopal" not in delta["deleted_ids"]


def test_ready_validation_requirements(tmp_path: Path) -> None:
    bbox = (23.10, 77.25, 23.35, 77.55)
    media_dir = tmp_path / "media"
    place = {
        "id": "sample-ready",
        "slug": "sample-ready",
        "category": "hidden_gem",
        "status": "ready",
        "geo": {"lat": None, "lng": None},
        "sensitivity": {"is_sacred": True, "note": None},
        "media": {"images": []},
        "provenance": {"source": "curated-research", "license": "CC-BY-SA-4.0", "verified_by": None, "verified_at": None},
        "text": {
            "en": {"title": "Title", "summary": "Sum", "story": "Story", "tips": [], "needs_review": False},
            "hi": {"title": "शीर्षक", "summary": "सार", "story": "कथा", "tips": [], "needs_review": True},
        },
    }
    errs, _ = validate_place_dict(place, bbox, ["en", "hi"], strict=False, media_dir=media_dir)
    joined = "\n".join(errs)
    assert "missing geo" in joined
    assert "missing real photograph" in joined
    assert "sacred_note" in joined
    assert "verified_by" in joined
    assert "empty 'tips'" in joined
    assert "needs_review=true" in joined


def test_resolve_and_apply_geo_only_when_approved(tmp_path: Path, monkeypatch) -> None:
    content_dir = tmp_path / "content"
    _copy_incoming_to_tmp(content_dir)
    import_incoming(content_dir)

    # Keep only 2 places to keep test fast
    for f in list((content_dir / "places").glob("*.yaml")):
        if f.stem not in ("upper-lake-bhojtal", "kamlapati-palace"):
            f.unlink()

    def fake_nom(_client, query, _bbox, _ua):
        if "Bhojtal" in query:
            return {"display_name": "Bhojtal, Bhopal", "lat": 23.258, "lng": 77.400, "source": "nominatim"}
        return None

    def fake_overpass(_client, _url, title, _bbox, _ua):
        return {"display_name": title, "lat": 23.250, "lng": 77.395, "source": "overpass"}

    summary = resolve_geo(
        content_dir,
        rate_delay_seconds=0.0,
        nominatim_fn=fake_nom,
        overpass_fn=fake_overpass,
    )
    assert summary["candidates"] == 2
    assert summary["resolved"] == 2

    # Second run uses cache (0 network calls)
    summary2 = resolve_geo(content_dir, rate_delay_seconds=0.0, nominatim_fn=fake_nom, overpass_fn=fake_overpass)
    assert summary2["network_calls"] == 0

    # Without approval, nothing is written
    res0 = apply_geo(content_dir)
    assert res0["applied"] == 0

    # Approve ONLY kamlapati-palace
    csv_path = content_dir / "working" / "geo_review.csv"
    with csv_path.open("r", encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        if r["id"] == "kamlapati-palace":
            r["approved"] = "Y"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    res1 = apply_geo(content_dir)
    assert res1["applied"] == 1

    upper = yaml.safe_load((content_dir / "places" / "upper-lake-bhojtal.yaml").read_text(encoding="utf-8"))
    kamla = yaml.safe_load((content_dir / "places" / "kamlapati-palace.yaml").read_text(encoding="utf-8"))
    assert upper["geo"]["lat"] is None
    assert kamla["geo"] == {"lat": 23.25, "lng": 77.395}
    assert "OpenStreetMap contributors (ODbL)" in kamla["provenance"]["geo_attribution"]


def test_compute_links_ignores_incoming_distances_and_respects_3km(tmp_path: Path) -> None:
    content_dir = tmp_path / "content"
    places_dir = content_dir / "places"
    working_dir = content_dir / "working"
    places_dir.mkdir(parents=True)
    working_dir.mkdir(parents=True)

    anchor = {
        "id": "anchor-a",
        "slug": "anchor-a",
        "category": "culture",
        "status": "draft",
        "is_anchor": True,
        "anchor_for": [],
        "geo": {"lat": 23.2500, "lng": 77.4000},
    }
    near_spot = {
        "id": "near-spot",
        "slug": "near-spot",
        "category": "hidden_gem",
        "status": "draft",
        "is_anchor": False,
        "anchor_for": [],
        "geo": {"lat": 23.2590, "lng": 77.4000},  # ~1.0 km north
    }
    far_spot = {
        "id": "far-spot",
        "slug": "far-spot",
        "category": "hidden_gem",
        "status": "draft",
        "is_anchor": False,
        "anchor_for": [],
        "geo": {"lat": 23.2950, "lng": 77.4000},  # ~5.0 km north (> 3 km)
    }
    (places_dir / "anchor-a.yaml").write_text(yaml.safe_dump(anchor), encoding="utf-8")
    (places_dir / "near-spot.yaml").write_text(yaml.safe_dump(near_spot), encoding="utf-8")
    (places_dir / "far-spot.yaml").write_text(yaml.safe_dump(far_spot), encoding="utf-8")
    # Put misleading approx_distance in meta to ensure it is ignored
    (working_dir / "far-spot.meta.yaml").write_text(
        yaml.safe_dump({"approx_distance_to_anchor_km": 0.5}), encoding="utf-8"
    )

    assert haversine_km(23.25, 77.40, 23.259, 77.40) <= 3.0
    assert haversine_km(23.25, 77.40, 23.295, 77.40) > 3.0

    report = compute_links(content_dir)
    updated_anchor = yaml.safe_load((places_dir / "anchor-a.yaml").read_text(encoding="utf-8"))
    assert updated_anchor["anchor_for"] == ["near-spot"]
    assert "far-spot" in report["no_anchor_within_3km"]
    assert "anchor-a" in report["anchors_lt_3_links"]


def test_generated_themes_meet_wcag_contrast_and_todo_flags(tmp_path: Path) -> None:
    colors = [
        (12, 34, 56),
        (240, 230, 140),
        (185, 28, 28),
        (128, 128, 128),
        (250, 250, 250),
    ]
    for idx, rgb in enumerate(colors):
        img_path = tmp_path / f"sample_{idx}.png"
        img = Image.new("RGB", (64, 64), color=rgb)
        for x in range(16):
            img.putpixel((x, x), (min(255, rgb[0] + 60), max(0, rgb[1] - 40), rgb[2]))
        img.save(img_path)
        theme = compute_theme_from_image(img_path)
        ratio = contrast_ratio_hex(theme["primary"], theme["on_primary"])
        assert ratio >= 4.5, f"Low contrast {ratio:.2f} for {theme}"

    # Verify todo_report marks access_unverified properly
    content_dir = tmp_path / "content"
    _copy_incoming_to_tmp(content_dir)
    import_incoming(content_dir)
    todo_csv = generate_todo_csv(content_dir)
    with todo_csv.open("r", encoding="utf-8", newline="") as fh:
        todo_rows = {r["id"]: r for r in csv.DictReader(fh)}
    assert todo_rows["dhrupad-kendra-bhopal"]["access_unverified"] == "true"
    assert todo_rows["kushabhau-thakre-hall-minto-hall"]["access_unverified"] == "true"
    assert todo_rows["taj-ul-masajid"]["etiquette_missing"] == "true"
    assert todo_rows["upper-lake-bhojtal"]["access_unverified"] == "false"
