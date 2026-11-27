# Voyeger Architecture Notes

## High-Level Components

1. **`frontend/` (TanStack Start + Vite PWA)**
   - **Routing (`src/routes/`)**: File-based TanStack Router routes (`/`, `/discover`, `/search`, `/planner`, `/saved`, `/partners`, `/partner/$id`, `/settings`, `/attribution`, `/place/$slug`).
   - **Data Layer (`src/data/`)**:
     - `db.ts`: Dexie (`voyeger-bhopal`) schema v2 (`places`, `partners`, `text`, `media_meta`, `meta`, `outbox`, `saved`, `events`, `discoveries`).
     - `repo.ts`: Authoritative read/write boundary for UI features (`getPlaces`, `getPlaceBySlug`, `placesInBounds`, `searchPlaces`, `recordDiscovery`, `getDiscoveryStats`, `toggleSaved`).
     - `sync.ts` & `outbox.ts`: Atomic pack installation, delta application, enrichment merge, and idempotent outbox flushing.
   - **Network Adapters (`src/net/`)**: `ApiClient` interface (`api.ts`) switching between `MockApi` (`mockApi.ts`) and `HttpApi` (`httpApi.ts`) via `VITE_API_MODE`.
   - **Map & Helpers (`src/features/discover/`, `src/lib/`)**: MapLibre GL JS + `pmtiles` protocol registration, `hasValidGeo` null-coordinate guards, and `resolvePackAssetUrl` for cross-origin HTTP pack assets.

2. **`backend/` (FastAPI + Content Pipeline)**
   - **API Server (`server/`)**:
     - `main.py`: FastAPI app with CORS, security headers, and structured error handlers.
     - `routers/`: `health`, `manifest`, `delta`, `enrichment`, `events`, `partners`, `enquiries`, `admin`.
     - `static_range.py`: Serves `/pack/*` and `/tiles/*` with HTTP Byte-Range support required by PMTiles.
     - `security.py`: Sliding-window per-IP rate limiting, max payload size checks, and bearer token validation for admin routes.
   - **Database & Migrations (`server/models.py`, `migrations/`)**: SQLAlchemy 2 ORM models with Alembic migrations (`0001_initial`, `0002_additive_place_schema`).
   - **Curation & Pack Pipeline (`pipeline/`)**: Supports importing incoming YAML batches (`import_incoming.py`), text cleanup, geo review/resolution, haversine anchor linking (`compute_links.py`), image optimization & placeholder generation (`optimize_media.py`), strict validation (`validate.py`), and atomic pack/delta builds (`build_pack.py`).

## Authoritative Contracts

- **HTTP API & Pack JSON Schema**: [../backend/docs/API_CONTRACT.md](../backend/docs/API_CONTRACT.md) (mirrored in [../frontend/docs/API_CONTRACT.md](../frontend/docs/API_CONTRACT.md))
- **Content YAML Schema**: [../backend/docs/CONTENT_SCHEMA.md](../backend/docs/CONTENT_SCHEMA.md)
- **Frontend/Backend Coordination Notes**: [../frontend/docs/BACKEND_COORDINATION.md](../frontend/docs/BACKEND_COORDINATION.md)
