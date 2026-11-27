from __future__ import annotations

from pathlib import Path

from server.services.pack_service import publish_pack


def test_health_get_and_head_and_cors_preflight(test_env: dict) -> None:
    client = test_env["client"]

    r_get = client.get("/api/health")
    assert r_get.status_code == 200
    assert r_get.json()["status"] == "ok"

    r_head = client.head("/api/health")
    assert r_head.status_code == 200

    r_cors = client.options(
        "/api/manifest",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert r_cors.status_code == 200
    assert r_cors.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_range_requests_on_pack_and_tiles(test_env: dict) -> None:
    client = test_env["client"]
    SessionLocal = test_env["SessionLocal"]
    content_dir: Path = test_env["content_dir"]
    tiles_dir: Path = test_env["tiles_dir"]

    with SessionLocal() as db:
        publish_pack(db, content_dir=content_dir)

    # Create a dummy 4KB tiles file
    tile_file = tiles_dir / "bhopal.pmtiles"
    tile_file.write_bytes(bytes(range(256)) * 16)

    r_tile = client.get("/tiles/bhopal.pmtiles", headers={"Range": "bytes=0-1023"})
    assert r_tile.status_code == 206
    assert len(r_tile.content) == 1024
    assert r_tile.headers.get("accept-ranges") == "bytes"
    assert r_tile.headers.get("content-range") == "bytes 0-1023/4096"
    assert "Content-Range" in r_tile.headers.get("access-control-expose-headers", "")

    r_pack = client.get("/pack/v1/places.json", headers={"Range": "bytes=0-99"})
    assert r_pack.status_code == 206
    assert len(r_pack.content) == 100
    assert "immutable" in r_pack.headers.get("cache-control", "")


def test_events_enquiries_applications_idempotent(test_env: dict) -> None:
    client = test_env["client"]

    events_payload = [
        {
            "id": "evt-1",
            "type": "view",
            "place_id": "upper-lake",
            "partner_id": None,
            "ts": "2026-11-27T08:00:00Z",
            "session_id": "sess-abc",
        },
        {
            "id": "evt-2",
            "type": "enquiry",
            "place_id": "old-city-food-lane",
            "partner_id": "sample-chowk-kitchen",
            "ts": "2026-11-27T08:01:00Z",
            "session_id": "sess-abc",
        },
    ]
    r1 = client.post("/api/events", json=events_payload)
    assert r1.status_code == 202
    assert r1.json() == {"accepted": 2, "duplicates": 0}

    r2 = client.post("/api/events", json=events_payload)
    assert r2.status_code == 202
    assert r2.json() == {"accepted": 0, "duplicates": 2}

    enq_payload = {
        "id": "enq-1",
        "partner_id": "sample-lakeside-stay",
        "place_id": "upper-lake",
        "name": "Asha\x00",
        "contact": "+919999999999",
        "message": "Interested in weekend stay.",
        "lang": "en",
    }
    e1 = client.post("/api/enquiries", json=enq_payload)
    assert e1.status_code == 201
    e2 = client.post("/api/enquiries", json=enq_payload)
    assert e2.status_code == 200

    app_payload = {
        "id": "app-1",
        "name": "Ramesh",
        "type": "artisan",
        "contact": "ramesh@example.org",
        "offer": "Gond art workshop",
        "place_ids": ["heritage-courtyard-walk"],
        "created_at": "2026-11-27T08:00:00Z",
    }
    a1 = client.post("/api/partners/apply", json=app_payload)
    assert a1.status_code == 201
    a2 = client.post("/api/partners/apply", json=app_payload)
    assert a2.status_code == 200


def test_admin_auth_stats_and_lists(test_env: dict) -> None:
    client = test_env["client"]
    SessionLocal = test_env["SessionLocal"]
    content_dir: Path = test_env["content_dir"]

    with SessionLocal() as db:
        publish_pack(db, content_dir=content_dir)

    # Missing/wrong token rejected
    assert client.get("/api/admin/stats").status_code == 401
    assert (
        client.get("/api/admin/stats", headers={"Authorization": "Bearer wrong"}).status_code
        == 403
    )
    assert client.post("/api/admin/publish").status_code == 401

    headers = {"Authorization": "Bearer test-secret-token"}
    r_stats = client.get("/api/admin/stats", headers=headers)
    assert r_stats.status_code == 200
    body = r_stats.json()
    assert "totals" in body and "partners" in body and "top_places" in body

    r_apps = client.get("/api/admin/applications", headers=headers)
    assert r_apps.status_code == 200
    r_enqs = client.get("/api/admin/enquiries", headers=headers)
    assert r_enqs.status_code == 200
    r_pub = client.post("/api/admin/publish", headers=headers)
    assert r_pub.status_code == 200
    assert r_pub.json()["version"] == 2


def test_enrichment_cache_and_stale_fallback(test_env: dict, monkeypatch) -> None:
    from datetime import datetime, timedelta, timezone
    from server.models import EnrichmentCache
    from server.services import enrichment_service

    client = test_env["client"]
    SessionLocal = test_env["SessionLocal"]
    content_dir: Path = test_env["content_dir"]

    with SessionLocal() as db:
        publish_pack(db, content_dir=content_dir)
        # Pre-populate a stale cache entry
        stale_time = datetime.now(timezone.utc) - timedelta(hours=500)
        db.add(
            EnrichmentCache(
                place_id="upper-lake",
                source="osm",
                payload={"source": "OpenStreetMap", "license": "ODbL", "opening_hours": "24/7"},
                fetched_at=stale_time,
                ttl_hours=168,
            )
        )
        db.commit()

    async def _fail_osm(*args, **kwargs):
        raise RuntimeError("Upstream Overpass down")

    async def _fail_wiki(*args, **kwargs):
        raise RuntimeError("Upstream Wikivoyage down")

    monkeypatch.setattr(enrichment_service, "fetch_osm_enrichment", _fail_osm)
    monkeypatch.setattr(enrichment_service, "fetch_wikivoyage_enrichment", _fail_wiki)

    resp = client.get("/api/enrichment?place_ids=upper-lake")
    assert resp.status_code == 200
    data = resp.json()["upper-lake"]
    assert data["osm"]["opening_hours"] == "24/7"
    assert data["wikivoyage"] is None
    assert enrichment_service.sanitize_plain_text("<p>Hello <b>Bhopal</b>&amp;Lake</p>") == "Hello Bhopal &Lake"
