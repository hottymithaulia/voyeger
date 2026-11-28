# Voyeger — Full-Stack Integration Audit

## 1. System Architecture Overview

Voyeger pairs an offline-first Progressive Web App (`frontend/`: React 19, TypeScript, TanStack Start/Router, Vite 8, Dexie IndexedDB, MapLibre GL JS, MiniSearch) with a FastAPI + SQLAlchemy/Alembic + SQLite backend (`backend/`: `voyeger.db` + versioned static pack server).

```text
Curated YAML (backend/content/places/*.yaml)
   │  pipeline.ingest_curated -> pipeline.validate -> pipeline.build_pack
   ▼
SQLite DB (voyeger.db) + Versioned Pack Artifacts (backend/pack/v{N}/)
   │  FastAPI HTTP + Range Static Server (:8000)
   ├── GET  /api/health, /api/manifest, /api/delta, /api/enrichment
   ├── POST /api/events, /api/partners/apply, /api/enquiries
   └── GET/HEAD /pack/*, /tiles/*
   │
   ▼  HttpApi (frontend/src/net/httpApi.ts)
Frontend IndexedDB via Dexie (voyeger-bhopal)
   │  places, partners, text, media_meta, meta, outbox, saved, events, discoveries
   ▼  src/data/repo.ts
TanStack Router Views (/, /discover, /search, /planner, /place/:slug, /partners, /submit-place, /about, /settings, /attribution)
```

---

## 2. Frontend-to-Backend API Contract Table

| Feature | HTTP Method | Endpoint | Request Schema / Params | Response Schema | Persistence (`voyeger.db`) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **Health Probe** | `GET` / `HEAD` | `/api/health` | — | `{ status: "ok", version: int }` | — |
| **Pack Manifest** | `GET` | `/api/manifest` | — | `Manifest` (`version`, `files[]`, `languages[]`) | `pack_versions` (`is_current = 1`) |
| **Delta Sync** | `GET` | `/api/delta` | `?from={int}&to={int}` | `Delta` (`places`, `partners`, `text`, `deleted_ids`) or `410` | `deltas`, `pack_versions` |
| **Live Enrichment** | `GET` | `/api/enrichment` | `?place_ids=id1,id2` | `Record<string, Enrichment>` | `enrichment_cache` |
| **Analytics Events** | `POST` | `/api/events` | `Event[]` (batch) | `202 Accepted` | `events` |
| **Partner Application** | `POST` | `/api/partners/apply` | `PartnerApplication` | `201 Created` / JSON | `applications` |
| **Enquiry Submission** | `POST` | `/api/enquiries` | `Enquiry` | `201 Created` / JSON | `enquiries` |
| **Pack Static Assets** | `GET` / `HEAD` | `/pack/{file_path:path}` | Range header supported | Binary / JSON (`immutable` for `vN/`) | Filesystem (`backend/pack/`) |
| **PMTiles Archive** | `GET` / `HEAD` | `/tiles/{file_path:path}` | Range header supported | `application/vnd.pmtiles` or `404` | Filesystem (`backend/tiles/`) |
| **Admin Endpoints** | `GET` / `POST` | `/api/admin/*` | `Authorization: Bearer <ADMIN_TOKEN>` | Stats / Publish / Applications / Enquiries | Multiple tables |

---

## 3. Content Pack & Data Flow Audit

* **Authoritative Version:** **Pack v4** (`pack_versions.version = 4`, `is_current = 1`).
* **Place Counts & Categories Verified:**
  * **Total Places:** **28** (all 28 have valid numeric `geo.lat` & `geo.lng` inside canonical Bhopal bbox `(23.10, 77.25, 23.35, 77.55)`).
  * **Hidden Gems (`category = "hidden_gem"`):** **15** (9 from `hidden_g1.yaml`, 6 from `hidden_g2.yaml`).
  * **Anchor Landmarks (`is_anchor = true`):** **10** (7 `culture`, 3 `experience`).
  * **Cultural Institutions (`category = "culture"`, `is_anchor = false`):** **3**.
  * **Translations:** 56 `place_text` rows (28 `en` + 28 `hi`).
* **Offline Synchronization (`frontend/src/data/sync.ts` & `AppFrame.tsx`):**
  * On startup when online, `AppFrame` checks `loadManifest()` against Dexie's `content_version` even within the 6-hour window so newly published packs are discovered immediately.
  * `performSync()` attempts incremental `api.getDelta()` first and falls back to `api.getPack()` + `writePack()` if a delta fails or returns `410`.
  * **User Data Preservation:** `writePack()` only replaces `places`, `partners`, and `text`; it never touches `saved`, `discoveries` (XP), `events`, `outbox`, or `pending_place_submissions`.

---

## 4. Database Persistence Audit (`backend/voyeger.db`)

| Table | Current Rows | Purpose & Status |
| :--- | :---: | :--- |
| `alembic_version` | 1 | Tracks Alembic migration head. |
| `places` | 28 | Authoritative place records (all 28 with numeric coordinates). |
| `place_text` | 56 | Bilingual (`en`, `hi`) titles, summaries, stories, tips. |
| `partners` / `partner_text` | 0 / 0 | Ready for approved partners. |
| `pack_versions` | 4 | Stores manifests for `v1`, `v2`, `v3`, `v4` (`v4` is `is_current = 1`). |
| `deltas` | 3 | Stores `(1->2)`, `(2->3)`, `(3->4)` delta payloads. |
| `events` | 27 | Persists analytics events flushed from frontend outbox. |
| `applications` | 0 | Persists partner applications from `POST /api/partners/apply`. |
| `enquiries` | 0 | Persists partner enquiries from `POST /api/enquiries`. |
| `enrichment_cache` | 0 | Caches live OSM/Wikivoyage enrichment responses. |

---

## 5. Map Architecture & Fallback Status

* **Worker Resolution:** `MapCanvas.tsx` explicitly registers `maplibre-gl/dist/maplibre-gl-worker.mjs?url` via `setWorkerUrl()`, preventing Vite pre-bundle worker load failures.
* **PMTiles Handling:** On `map.on("load")`, `addLocalArchive()` checks `unavailableTileArchives` (session `Set`) before requesting `/tiles/bhopal.pmtiles`. If missing (`404`), the URL is cached in `unavailableTileArchives` so subsequent route changes/re-mounts immediately activate the OpenStreetMap raster fallback (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) without repeated 404 requests.
* **Markers & Clustering:** All 28 places with valid coordinates are projected onto `.map-marker-layer` independently of basemap success, with 40px pixel clustering when zoomed out.

---

## 6. Integration Gaps

* **Community Place Submissions (`/submit-place`):** Currently **local-only** (stored in browser IndexedDB `db.meta["pending_place_submissions"]` + `formsubmit.co` email). Local approval writes only to that browser's `db.places`. No backend `POST /api/places/submit` endpoint or `place_submissions` table exists yet.
  * **Recommended Backend Plan:** Add a `place_submissions` table (via Alembic migration), `POST /api/places/submit` with Pydantic validation & rate limiting, and admin moderation endpoints (`GET /api/admin/submissions`, `POST /api/admin/submissions/{id}/approve`) that export approved entries to `backend/content/places/*.yaml` before running `pipeline.validate` + `pipeline.build_pack --bump`.
