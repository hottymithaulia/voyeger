# Voyeger Backend (Bhopal Offline-First Tourism PWA)

Offline-first backend, content pipeline, and static pack/tiles server for **Voyeger** (Bhopal, India).

## Quickstart (Local Dev)

1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv .venv
   # Windows: .venv\Scripts\activate
   # macOS/Linux: source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Configure environment:
   ```bash
   cp .env.example .env
   ```
3. Run database migrations, seed the 10 Bhopal sample places & 3 partners, and build pack `v1`:
   ```bash
   make migrate && make seed && make build-pack
   ```
4. Start the API server:
   ```bash
   make run
   ```
   (Runs Uvicorn on `http://localhost:8000` with reload.)
5. Frontend side: in the frontend `.env` set:
   ```env
   VITE_API_MODE=http
   VITE_API_BASE_URL=http://localhost:8000
   VITE_PACK_BASE_URL=http://localhost:8000/pack
   VITE_TILES_URL=http://localhost:8000/tiles/bhopal.pmtiles
   ```
   then run:
   ```bash
   npm run dev
   ```
   (`http://localhost:5173`)
6. Verify the running server:
   ```bash
   make check
   ```
   (`make check` probes `/api/health`, `/api/manifest`, a pack file, and a Range request on `/tiles/` or `/pack/` and prints PASS/FAIL per check.)

## Publishing Updates (v2+ & Deltas)

Edit any file in `content/places/*.yaml`, then run:
```bash
make publish
```
or `POST /api/admin/publish` with `Authorization: Bearer <ADMIN_TOKEN>`.

## Map Tiles

See [pipeline/make_tiles.sh](pipeline/make_tiles.sh) to extract `tiles/bhopal.pmtiles` from a Protomaps build. The server starts normally if `bhopal.pmtiles` is absent (returning 404 on `/tiles/*`).
