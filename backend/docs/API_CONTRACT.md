# Voyeger API & Pack Contract

Aligned with `pixel-perfect-picture-4633-main/docs/API_CONTRACT.md` (source of truth).
Base URL: `VITE_API_BASE_URL` (e.g. `http://localhost:8000`).
Tiles URL: `VITE_TILES_URL` (e.g. `http://localhost:8000/tiles/bhopal.pmtiles`).

All API error responses follow:
```json
{ "error": "<code>", "detail": "<human message>" }
```

## Endpoints

### `GET | HEAD /api/health`
- `200 OK`: `{ "status": "ok", "version": 1 }`

### `GET /api/manifest`
- `200 OK`:
```json
{
  "version": 1,
  "built_at": "2026-11-27T08:00:00+00:00",
  "min_app_version": "1.0.0",
  "files": [
    { "path": "/pack/v1/places.json", "bytes": 1234, "sha256": "..." }
  ],
  "languages": ["en", "hi"],
  "total_bytes": 90000
}
```
Note: `files[].path` values start with `/pack/v{version}/...` relative to the API origin.

### `GET /api/delta?from=N&to=M`
- `200 OK`:
```json
{
  "from": 1,
  "to": 2,
  "places": [],
  "partners": [],
  "text": {
    "<placeId>": {
      "<lang>": { "title": "...", "summary": "...", "story": "...", "tips": ["..."] }
    }
  },
  "deleted_ids": []
}
```
- `410 Gone` (when `from > to`, either version unknown, or `to - from > 5`):
```json
{ "error": "full_resync_required", "manifest": { ... } }
```

### `GET /api/enrichment?place_ids=a,b,c` (max 50)
- `200 OK`:
```json
{
  "<placeId>": {
    "osm": { "source": "OpenStreetMap", "license": "ODbL", "url": "...", "opening_hours": "...", "address": "...", "phone": "...", "wheelchair": "..." },
    "wikivoyage": { "source": "Wikivoyage", "license": "CC BY-SA 4.0", "url": "...", "extract": "..." },
    "fetched_at": "2026-11-27T08:00:00+00:00"
  }
}
```

### `POST /api/events`
- Body: raw JSON array `[{ "id": "...", "type": "view|save|directions|enquiry|nudge_click", "place_id": "...", "partner_id": null, "ts": "...", "session_id": "..." }]` (max 50 items, max body 100 KB).
- `202 Accepted`: `{ "accepted": 1, "duplicates": 0 }`

### `POST /api/partners/apply`
- Body: `{ "id": "...", "name": "...", "type": "homestay|food|experience|artisan|performer|vendor|board", "contact": "...", "offer": "...", "place_ids": [], "created_at": "..." }` (max body 20 KB).
- `201 Created` (or `200 OK` on duplicate `id`): `{ "id": "...", "status": "received" }`

### `POST /api/enquiries`
- Body: `{ "id": "...", "partner_id": "...", "place_id": "...", "name": "...", "contact": "...", "message": "...", "lang": "en" }` (max body 20 KB).
- `201 Created` (or `200 OK` on duplicate `id`): `{ "id": "...", "status": "received" }`

### Admin Endpoints (`Authorization: Bearer <ADMIN_TOKEN>`)
- `GET /api/admin/stats?from=&to=`
- `POST /api/admin/publish` -> `200 OK` with new manifest, or `422` on validation error
- `GET /api/admin/applications?limit=50&offset=0`
- `GET /api/admin/enquiries?limit=50&offset=0`

## Pack Structure (`pack/v{N}/`)
- `manifest.json`
- `places.json` (array of Place objects with embedded `i18n` and `tips: string[]`, filtered by `PUBLISH_STATUSES`; `hold` places never included)
- `partners.json` (array of Partner objects with embedded `i18n`; may be empty `[]`)
- `i18n/{lang}.json` (`{ "<placeId>": { "title", "summary", "story", "tips": ["..."] } }`)
- `search/index.json` (`{ "fields": ["title", "summary", "tags"], "searchFields": ["title", "summary", "tags"] }`)
- `images/*.webp` & `images/*.thumb.webp`
- `delta_{N-1}_to_{N}.json` (for `N > 1`)

### Additive Optional Place Fields (Backward-Compatible)
- `status`: `"draft" | "ready"` (in published pack/delta; `"hold"` is never emitted)
- `geo`: `{ "lat": number | null, "lng": number | null }` (nullable for unpublished/draft coordinates)
- `theme` (optional): `{ "primary": "#hex", "secondary": "#hex", "on_primary": "#000000" | "#ffffff" }`
- `provenance.sources` (optional): `[{ "name": string, "url": string, "type": string }]`
- `media.placeholder` (optional `boolean`): `true` when draft media contains only a generated placeholder image
- `media.images[].license` & `media.images[].source_url` (optional strings)
