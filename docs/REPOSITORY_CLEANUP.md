# Voyeger — Repository Cleanup Report

## 1. Removed Artifacts (Verified Unused / Duplicate)

| File or Directory | Reason | Evidence | Risk | Action |
| :--- | :--- | :--- | :---: | :---: |
| `backend/pack/pack/` | Accidental nested duplicate of `v1/v2/v3` created during earlier directory copy. | `server/static_range.py` serves `/pack/v{N}/...` from `backend/pack/`, never `backend/pack/pack/`. | None | **Removed** |
| `frontend/public/pack/v3/` | Untracked duplicate of `v3` in `frontend/public/pack/`. | `VITE_API_MODE=http` serves `v4` from `backend/pack/v4/`; `mockApi.ts` only references `v1` and `v2`. | None | **Removed** |
| `backend/tools/coordinate_enrichment/output/geo_cache_temp.json` | Temporary cache file created during `--refresh-cache` run. | Not referenced by any runtime code, pipeline, or tests. | None | **Removed** |

---

## 2. Dependencies Added / Adjusted

| Package | Location | Reason |
| :--- | :--- | :--- |
| `@testing-library/dom` (devDependency) | `frontend/package.json` | Required peer dependency of `@testing-library/react` (`^16.0.0`); its absence caused `tsc --noEmit` (`TS2305`) and 7 Vitest component test files to fail. |

No existing production dependencies were upgraded or removed.

---

## 3. Files Deliberately Retained

* **`backend/content/places_backup_20261128_014553/`:** Historical backup of pre-enrichment place YAMLs (preserved per change-control safety rules).
* **`backend/pack/v1`, `v2`, `v3`, `v4`:** Retained for delta compatibility (`1->2`, `2->3`, `3->4`) and rollback support.
* **`frontend/public/pack/v1`, `v2`:** Retained for standalone `MockApi` mode and unit tests (`sync.test.ts`, `db.migration.test.ts`).
* **`frontend/package-lock.json` & `frontend/bun.lock`:** Both lockfiles preserved.
* **`frontend/public/manifest.webmanifest`:** Static copy of the built PWA manifest so `vite dev` serves `/manifest.webmanifest` with `200 OK` instead of `404`.
