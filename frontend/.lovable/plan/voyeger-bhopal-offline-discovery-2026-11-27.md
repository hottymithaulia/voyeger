# Voyeger — Bhopal Offline Discovery

## Build plan
- Replace the starter screen with Voyeger's mobile-first Bhopal travel experience, complete app-specific page metadata, and a restrained map-led design system.
- Add the shared types, Dexie stores, repository, English/Hindi sample packs, mock and HTTP API adapters, atomic sync, enrichment-only updates, outbox queue, and written API contract.
- Create a first-run language/pack download, MapLibre map with Bhopal bounds and category filters, place detail, nearby hidden-spot discovery, itinerary planner, search, saved places, partners, settings, attribution, and the requested dev controls.
- Add installable/offline support with a guarded Workbox service worker, offline-safe tiles and images, online-only video, and the specified cache/update behavior.
- Add focused tests for curated-field protection, pack/sync behavior, and core discovery logic; verify the running app and latest build diagnostics.

## Technical details
- Keep TanStack Start as the existing Vite/React/TypeScript application framework; implement the supplied Vite/React/Tailwind architecture within it rather than replacing the framework.
- Use MapLibre GL JS, PMTiles, Dexie, MiniSearch, i18next, and vite-plugin-pwa; dynamically load browser-only map code after hydration.
- Keep content reads behind `src/data/repo.ts`; network responses flow through `src/net` into IndexedDB only. Default to the local mock adapter, with HTTP selected by environment variables.
- Do not add a hosted backend, user accounts, or features listed as out of scope.
