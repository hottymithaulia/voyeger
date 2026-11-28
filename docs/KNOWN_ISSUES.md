# Voyeger — Known Issues & Remaining Gaps

## 1. Missing Offline Vector Tile Archive (`bhopal.pmtiles`)
* **Status:** Expected fallback active.
* **Details:** `backend/tiles/bhopal.pmtiles` is not included in the repository (due to binary size). When absent, `MapCanvas.tsx` caches the initial `404` for the session and falls back to **OpenStreetMap raster tiles** (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) when online, or marker-only mode when offline.
* **To Supply Production Tiles:** Run `SOURCE_PMTILES=/path/to/india.pmtiles ./backend/pipeline/make_tiles.sh` using the `pmtiles` CLI to extract Bhopal bounds (`77.25,23.10,77.55,23.35`) into `backend/tiles/bhopal.pmtiles`.

## 2. External Tile Provider Dependency (Online Fallback)
* When `bhopal.pmtiles` is absent and the user is online, the map requests raster PNGs from `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with proper `© OpenStreetMap contributors` attribution. This requires internet connectivity until `bhopal.pmtiles` is supplied.

## 3. Local-Only Feature: Community Place Submission (`/submit-place`)
* **Status:** `NOT IMPLEMENTED` on backend.
* **Details:** [`SubmitPlacePage.tsx`](file:///d:/workstation/voyeger-submission/frontend/src/features/submit/SubmitPlacePage.tsx) stores pending submissions in browser IndexedDB (`db.meta["pending_place_submissions"]`), sends an email via `formsubmit.co`, and writes locally approved places only into that browser's IndexedDB `db.places`. There is no backend `POST /api/places/submit` route or `place_submissions` table in `voyeger.db` yet.

## 4. Outdated Teammate Unit Tests (3 Pre-Existing Test Failures)
* **`frontend/src/features/partners/PartnersPage.test.tsx`** (1 test): Fails looking for `"Photographs (planned future integration)"` which was replaced by the teammate's modal/email UI in commit `32f7ab6`.
* **`frontend/src/features/welcome/WelcomePage.test.tsx`** (2 tests): Fails on older heading/copy assertions superseded by the teammate's `WelcomePage.tsx` updates in `50fff23` / `3b83c6e`.
* *(Note: `eslint .` also reports `prettier/prettier` CRLF line-ending warnings/errors on Windows across existing files.)*

## 5. Production Deployment Requirements
* Set real `CORS_ORIGINS`, `ADMIN_TOKEN`, and `PUBLIC_BASE_URL` in `backend/.env` before deploying.
* Ensure `frontend/.env` is saved as **UTF-8 without BOM** with production `VITE_API_BASE_URL`, `VITE_PACK_BASE_URL`, and `VITE_TILES_URL`.
