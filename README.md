# Voyeger — Offline-First Cultural & Local Discovery Platform (Bhopal)

**Voyeger** is an offline-first, multilingual web application and content-pack platform designed to help travellers discover lesser-known heritage sites, local kitchens, cultural spaces, and neighbourhood experiences around Bhopal — even when mobile connectivity drops.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Proposed Solution](#proposed-solution)
3. [Core Features](#core-features)
4. [Repository Structure](#repository-structure)
5. [System Architecture](#system-architecture)
6. [Technology Stack](#technology-stack)
7. [Environment Configuration](#environment-configuration)
8. [Local Setup & Running Full Stack](#local-setup--running-full-stack)
9. [Offline-First Architecture & Synchronization](#offline-first-architecture--synchronization)
10. [Demo & Screenshots](#demo--screenshots)
11. [Known Limitations & Future Scope](#known-limitations--future-scope)
12. [Licensing Note](#licensing-note)
13. [Team & Contributors](#team--contributors)

---

## Problem Statement

Visitors exploring heritage-rich cities often rely on cloud-only map apps that:
- Struggle or fail completely in low-connectivity precincts, lakeside zones, and old-city lanes.
- Prioritize high-volume commercial listings while overlooking local stepwells, oral histories, neighbourhood artisans, and small eateries.
- Lack integrated bilingual navigation (English / Hindi), quick regional travel phrases, and contextual sensitivity cues for sacred spaces.

---

## Proposed Solution

Voyeger pairs an installable offline-first Progressive Web App (**frontend/**) backed by client-side IndexedDB (`Dexie`) with a versioned content-pack & delta FastAPI server (**backend/**) and YAML curation pipeline:
- Travellers download a lightweight regional city pack (`places.json`, `partners.json`, `i18n/{lang}.json`, optimized `.webp` media) once and browse maps, search, itineraries, and stories offline.
- Editorial research records (`backend/content/places/*.yaml`) preserve curated narratives, provenance URLs, sensitivity indicators, and visual themes without being overwritten by third-party enrichment feeds.

---

## Core Features

- **City Welcome (`/`)**: Dynamic city branding (`getActiveCity()`), opt-in browser geolocation proximity launch (`Near this location?` without silently altering the active city), and local exploration statistics (`last exploration`, `hidden gems discovered`, `XP`) stored in IndexedDB.
- **Map Explorer (`/discover`)**: Interactive MapLibre GL JS canvas supporting local PMTiles vector archives (`/tiles/bhopal.pmtiles`) with online OpenStreetMap raster fallback, vertical category filters (`Hidden Gems`, `Local Flavours`, `Culture & Heritage`, `Local Experiences`), zoom-based marker hierarchy (anchors visible at all zoom levels; non-anchor spots appearing from zoom 13+), and nearby non-anchor nudges (`Beyond this landmark`).
- **Editorial Place Pages (`/place/:slug`)**: Story, verified visitor facts (`hours`, `best_time`, `cost_note` — cleanly omitted when absent), local tips, sacred-site indicator badge (`is_sacred`), optional photo gallery / placeholder handling, adaptive per-place colour theme (`place.theme`), and deterministic per-place discovery XP (`10` / `20` / `30` XP awarded once per place ID).
- **Offline Multilingual Support & Phrasebook**: Full English (`en`) and Hindi (`hi`) interface localization plus a bundled 5-language offline travel phrasebook (`en`, `hi`, Tamil `ta`, Bengali `bn`, Marathi `mr`) with transliteration and copy-to-clipboard support.
- **Full-Text Search (`/search`) & Day Planner (`/planner`)**: Client-side offline MiniSearch across titles, summaries, and tags, plus a greedy haversine walking itinerary builder (`buildDayItinerary`) pairing one anchor with nearby hidden gems and a food stop.
- **Saved Bookmarks (`/saved`), Community Partners (`/partners`, `/partner/:id`), Settings & Attribution (`/settings`, `/attribution`)**: Saved places, offline-queued partner application & enquiry forms (via IndexedDB outbox), pack version management, and deduplicated `provenance.sources[]` CC BY-SA / ODbL attributions.

---

## Repository Structure

```text
voyeger-submission/
├── backend/          # FastAPI API, SQLAlchemy/Alembic DB, YAML content & pack pipeline, pytest suite
├── frontend/         # TanStack Start + React + Vite PWA, Dexie offline store, MapLibre UI, Vitest suite
├── docs/             # Unified architecture and setup notes
├── README.md         # Judge overview and quickstart guide
└── .gitignore        # Shared ignore rules for Python, Node/Bun, SQLite, generated packs, and .env
```

---

## System Architecture

```text
Curated YAML (backend/content/places/*.yaml)
   │  pipeline.validate + pipeline.build_pack
   ▼
SQLite / SQLAlchemy DB + Versioned Pack Artifacts (pack/v{N}/places.json, delta_*.json, images/*.webp)
   │  FastAPI HTTP + Range Static Server (:8000)
   ├── GET  /api/manifest                GET  /api/health
   ├── GET  /api/delta?from=N&to=M       GET  /api/enrichment?place_ids=...
   └── POST /api/events  /api/partners/apply  /api/enquiries
   │
   ▼  ApiClient (HttpApi or standalone MockApi)
Frontend IndexedDB via Dexie (voyeger-bhopal)
   │  places, partners, text, media_meta, meta, outbox, saved, events, discoveries
   ▼  src/data/repo.ts (single read boundary)
TanStack Router Views (Welcome, Discover Map, Search, Planner, Place Detail, Saved, Partners, Settings)
```

For deeper module-level notes, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [backend/docs/API_CONTRACT.md](backend/docs/API_CONTRACT.md).

---

## Technology Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 19, TypeScript 5.8, Vite 8, TanStack Start / Router / Query, Tailwind CSS v4, Radix UI, Lucide React |
| **Offline & Map** | Dexie (IndexedDB), MiniSearch, MapLibre GL JS, PMTiles, Workbox (`vite-plugin-pwa`), i18next / react-i18next |
| **Backend API** | Python 3, FastAPI, Uvicorn, SQLAlchemy 2, Alembic, Pydantic 2 |
| **Content Pipeline** | PyYAML, Pillow, httpx |
| **Testing** | Vitest, React Testing Library, fake-indexeddb, jsdom (`frontend/`); pytest (`backend/`) |

---

## Environment Configuration

Real `.env` files are excluded from this repository. Copy each template before running locally:

### Backend (`backend/.env.example` -> `backend/.env`)
- `APP_ENV=dev` (`dev` or `prod`)
- `HOST=0.0.0.0`, `PORT=8000`
- `DATABASE_URL=sqlite:///./voyeger.db`
- `ADMIN_TOKEN=change-me` (replace before non-local use; guards `/api/admin/*`)
- `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080`
- `PACK_DIR=./pack`, `TILES_DIR=./tiles`, `PUBLIC_BASE_URL=http://localhost:8000`
- `BHOPAL_BBOX=23.10,77.25,23.35,77.55`
- `REQUIRED_LANGUAGES=en,hi`
- `PUBLISH_STATUSES=ready,draft` (controls whether `draft` places emit into packs; `hold` places never publish)
- `APP_MIN_VERSION=1.0.0`, `RATE_LIMIT_PER_MINUTE=60`
- `OVERPASS_URL`, `WIKIVOYAGE_API`, `ENRICHMENT_TTL_HOURS`, `OSM_USER_AGENT`

### Frontend (`frontend/.env.example` -> `frontend/.env`)
- **Standalone Mock Mode (no backend required)**:
  ```env
  VITE_API_MODE=mock
  VITE_API_BASE_URL=
  VITE_PACK_BASE_URL=/pack
  VITE_TILES_URL=/tiles/bhopal.pmtiles
  ```
- **Connected Full-Stack HTTP Mode**:
  ```env
  VITE_API_MODE=http
  VITE_API_BASE_URL=http://localhost:8000
  VITE_PACK_BASE_URL=http://localhost:8000/pack
  VITE_TILES_URL=http://localhost:8000/tiles/bhopal.pmtiles
  ```

---

## Local Setup & Running Full Stack

Detailed step-by-step instructions (including Windows PowerShell & macOS/Linux commands) are in [docs/SETUP.md](docs/SETUP.md).

### Quick Start (Connected Mode)

**Terminal 1 — Backend (`backend/`)**:
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m alembic upgrade head
python -m pipeline.seed
python -m pipeline.validate
python -m pipeline.build_pack
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend (`frontend/`)**:
```bash
cd frontend
bun install   # preferred (matches bun.lock); with npm: npm install --legacy-peer-deps
cp .env.example .env
# Edit frontend/.env to set VITE_API_MODE=http and VITE_API_BASE_URL=http://localhost:8000
npm run dev   # serves http://localhost:5173
```

---

## Offline-First Architecture & Synchronization

1. **Single Client Read Boundary**: All UI views read exclusively from IndexedDB (`voyeger-bhopal`) via `frontend/src/data/repo.ts`; API responses from `MockApi` or `HttpApi` only populate IndexedDB via `src/data/sync.ts`.
2. **Versioned Pack & Delta Sync**:
   - First-run downloads `/api/manifest` and loads `/pack/v{N}/places.json`, `/pack/v{N}/partners.json`, and `/pack/v{N}/i18n/{lang}.json` transactionally into Dexie.
   - Subsequent updates fetch incremental `/api/delta?from=N&to=M` patches (for gaps `<= 5`; gaps `> 5` return `410 full_resync_required` and trigger a clean full pack re-install).
3. **Curated-Over-Enrichment Guarantee**: Both backend enrichment pipelines and frontend `mergeEnrichment()` strictly store third-party OpenStreetMap/Wikivoyage metadata under `place.enrichment` without overwriting curated titles, stories, or coordinates.
4. **Offline Outbox & Caching**: Partner applications, visitor enquiries, and telemetry events queue in Dexie `outbox` with idempotency IDs and flush when online. Workbox caches shell assets (`dist/client/sw.js`) and `/pack/v{N}/` responses.

---

## Demo & Screenshots

> _Screenshot / demo placeholders — visual captures can be added here prior to final pitch._
- `[Screenshot Placeholder] Welcome Screen (/) — Editorial city hero, local XP summary, opt-in geolocation control`
- `[Screenshot Placeholder] Offline Map Explorer (/discover) — MapLibre stage, category filters, and Beyond This Landmark nudge`
- `[Screenshot Placeholder] Place Detail (/place/:slug) — Bilingual story, sacred indicator, and sources attribution`
- `[Demo Recording Placeholder] Walkthrough showing pack download -> offline airplane-mode browsing -> partner form queuing`

---

## Known Limitations & Future Scope

- **Draft Dataset (`v3`) Coordinates & Media**: The 27 imported research places in `backend/content/places/` currently carry `status: draft`, nullable coordinates (`geo: {lat: null, lng: null}`), generated placeholder images, and empty `hours`/`tips` fields until field verification is completed. The frontend safely hides map markers, `Directions`, credits, and missing fact panels for null/placeholder records.
- **Empty Live Partners in `v3`**: `partners.json` in generated `v3` packs is empty `[]` until partner records are approved; the Partners directory renders an empty state cleanly while keeping `/partners` form submission operational. (Mock `v1`/`v2` bundles include sample partners for standalone UI testing.)
- **Offline Vector Map Archive (`bhopal.pmtiles`)**: The repository includes `/tiles/README.md` rather than a large prebuilt `.pmtiles` binary; when `bhopal.pmtiles` is absent, MapLibre falls back to online OpenStreetMap raster tiles (with Workbox caching), or can load any generated archive placed in `tiles/bhopal.pmtiles` via `backend/pipeline/make_tiles.sh`.
- **On-Device Discovery / XP & Draft Phrasebook**: Discovery XP is persisted locally in Dexie (`discoveries`) rather than synced to user accounts, and non-English travel phrasebook entries (`hi`, `ta`, `bn`, `mr`) carry `needs_review: true` awaiting native-speaker review. Partner photo upload is represented as a planned integration notice in the UI.
- **License Selection Pending**: No open-source repository `LICENSE` file has been finalized yet (see below).

---

## Licensing Note

No `LICENSE` file is currently included because project-wide licensing terms have not yet been selected by the team. Content source references within place records retain their attributed open licenses (such as `CC BY-SA 4.0` and OpenStreetMap `ODbL`).

---

## Team & Contributors

- `[Contributor 1 Name]` — `[Role, e.g., Frontend / Offline Architecture]`
- `[Contributor 2 Name]` — `[Role, e.g., Backend API / Content Pipeline]`
- `[Contributor 3 Name]` — `[Role, e.g., Research & Curation]`
