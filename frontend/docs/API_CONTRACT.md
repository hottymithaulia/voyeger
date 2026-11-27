# Voyeger API contract

All JSON is UTF-8. The client stores place content in IndexedDB before screens read it. The mock adapter serves the same versioned pack files locally from `/public/pack/v{N}/`; set `VITE_API_MODE=http` and `VITE_API_BASE_URL` to switch to a backend without changing screen code.

## Shared objects

`Place`, `Partner`, `Event`, `Manifest`, `Delta`, `Enrichment`, `PartnerApplication`, and `Enquiry` use the TypeScript definitions in `src/types.ts`. Place categories are `hidden_gem`, `food`, `culture`, and `experience`. Languages are `en` and `hi`. Dates are ISO 8601 UTC strings. Coordinates are decimal latitude/longitude.

## Endpoints

### `GET /api/health`

Returns HTTP 200 while the service is available. The client first probes with `HEAD`; it retries with `GET` if the server does not support `HEAD`.

```json
{ "ok": true }
```

### `GET /api/manifest`

Returns the current pack manifest. Each listed file is fetched and SHA-256 verified before it is installed.

```json
{
  "version": 1,
  "built_at": "2026-11-27T00:00:00Z",
  "min_app_version": "1.0.0",
  "files": [
    { "path": "/pack/v1/places.json", "bytes": 12000, "sha256": "<64 lowercase hex characters>" },
    { "path": "/pack/v1/partners.json", "bytes": 1800, "sha256": "<64 lowercase hex characters>" },
    { "path": "/pack/v1/i18n/en.json", "bytes": 9000, "sha256": "<64 lowercase hex characters>" },
    { "path": "/pack/v1/i18n/hi.json", "bytes": 9500, "sha256": "<64 lowercase hex characters>" },
    { "path": "/pack/v1/search/index.json", "bytes": 90, "sha256": "<64 lowercase hex characters>" },
    { "path": "/pack/v1/images/upper-lake.webp", "bytes": 12000, "sha256": "<64 lowercase hex characters>" }
  ],
  "languages": ["en", "hi"],
  "total_bytes": 42390
}
```

### Versioned pack files

The manifest's `files[].path` values are relative to the API origin and return the exact bytes described by `bytes` and `sha256`.

- `GET /pack/v{N}/places.json` → `Place[]`
- `GET /pack/v{N}/partners.json` → `Partner[]`
- `GET /pack/v{N}/i18n/{en|hi}.json` → `{ [placeId: string]: PlaceCopy }`
- `GET /pack/v{N}/search/index.json` → `{ "fields": ["title", "summary", "tags"], "searchFields": ["title", "summary", "tags"] }`
- `GET /pack/v{N}/images/{file}.webp` → image bytes

### `GET /api/delta?from=N&to=M`

Returns every curated record needed to move directly from `from` to `to`. The client applies all fields in one IndexedDB transaction and only publishes the new version after commit.

```json
{
  "from": 1,
  "to": 2,
  "places": [],
  "partners": [],
  "text": { "place-id": { "en": { "title": "Updated title", "summary": "Updated summary", "story": "Story", "tips": ["Tip"] } } },
  "deleted_ids": []
}
```

### `GET /api/enrichment?place_ids=id1%2Cid2`

Returns only web-derived fields, keyed by place ID. This response may update `place.enrichment` only; it must not replace curated place fields.

```json
{
  "place-id": {
    "osm": { "url": "https://www.openstreetmap.org/", "note": "Map reference" },
    "wikivoyage": { "url": "https://en.wikivoyage.org/", "note": "Travel reference" },
    "fetched_at": "2026-11-27T12:00:00Z"
  }
}
```

### `POST /api/events`

Accepts up to 50 queued, idempotent events. No personal information is collected in event records.

```json
[
  { "id": "uuid", "type": "view", "place_id": "upper-lake", "partner_id": "sample-partner", "ts": "2026-11-27T12:00:00Z", "session_id": "uuid" }
]
```

Returns HTTP 204 after accepting the batch.

### `POST /api/partners/apply`

Accepts one outbox-backed partner application and returns HTTP 204.

```json
{
  "id": "uuid", "name": "Studio name", "type": "artisan", "contact": "email or phone",
  "offer": "What visitors can experience", "place_ids": [], "created_at": "2026-11-27T12:00:00Z"
}
```

### `POST /api/enquiries`

Accepts one outbox-backed enquiry and returns HTTP 204.

```json
{
  "id": "uuid", "partner_id": "sample-partner", "place_id": "upper-lake", "name": "Visitor",
  "contact": "email or phone", "message": "Question", "created_at": "2026-11-27T12:00:00Z"
}
```

## Error handling and idempotency

Return a non-2xx status for rejected requests and include an optional JSON error body such as `{ "error": "message" }`. Event IDs and queued item IDs are stable idempotency keys across retries. Delta application is atomic; a failed response or failed transaction must leave the previous local content version intact.