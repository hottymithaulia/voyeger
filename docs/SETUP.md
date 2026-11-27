# Voyeger Local Setup & Verification Guide

## Prerequisites

- **Node.js** 20+ (with `npm`) or **Bun** (lockfile `frontend/bun.lock` included)
- **Python** 3.11+ (tested on Python 3.14 `.venv`)

---

## 1. Backend Setup (`backend/`)

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:
- **Windows (PowerShell)**: `.venv\Scripts\Activate.ps1`
- **macOS / Linux**: `source .venv/bin/activate`

Install dependencies and configure environment:
```bash
pip install -r requirements.txt
cp .env.example .env
```

Initialize database, build sample or curated pack, and run backend tests:
```bash
python -m alembic upgrade head
python -m pipeline.seed
python -m pipeline.validate
python -m pipeline.build_pack
python -m pytest -v
```

Start the FastAPI backend:
```bash
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify server endpoints:
```bash
python -m pipeline.check_local
```

---

## 2. Frontend Setup (`frontend/`)

```bash
cd frontend
bun install   # preferred (matches bun.lock)
cp .env.example .env
```

> Note: `package.json` uses Bun (`bun.lock`) with `zod@^4` and `@testing-library/react@16`. If installing via `npm`, use `npm install --legacy-peer-deps` (and `--no-save @testing-library/dom` if running Vitest component suites under npm).

### Option A: Standalone Mock Mode (no backend server required)
Keep the defaults in `frontend/.env`:
```env
VITE_API_MODE=mock
VITE_API_BASE_URL=
VITE_PACK_BASE_URL=/pack
VITE_TILES_URL=/tiles/bhopal.pmtiles
```

### Option B: Connected Full-Stack HTTP Mode
Update `frontend/.env` to target the running FastAPI backend:
```env
VITE_API_MODE=http
VITE_API_BASE_URL=http://localhost:8000
VITE_PACK_BASE_URL=http://localhost:8000/pack
VITE_TILES_URL=http://localhost:8000/tiles/bhopal.pmtiles
```

Run checks and start the app:
```bash
npx tsc --noEmit
npm run test
npm run build
npm run dev
```

Open `http://localhost:5173`.
