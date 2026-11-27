# Voyeger Coordinate Enrichment Tool

A standalone, non-invasive geographic data utility designed for Voyeger (Bhopal).

## Purpose

Discovers geographic coordinates (latitude and longitude) for curated Bhopal cultural places, hidden gems, and anchor landmarks that currently lack coordinates, enabling them to be rendered on the Voyeger MapLibre map canvas.

## Features

- **Safe & Non-Destructive**: Default execution is strictly read-only. Original YAML files are never modified without explicit user approval.
- **Full Discovery**: Processes all 15 hidden gems (`hidden_g1.yaml`, `hidden_g2.yaml`), 10 anchor landmarks (`anchors.yaml`), and cultural institutions.
- **Canonical Bounding Box**: Enforces the canonical Bhopal geographic bounding box `(23.10, 77.25, 23.35, 77.55)`.
- **Confidence Scoring & Matching**: Calculates a 0–100 confidence score based on token overlap, Levenshtein distance, OSM semantic class/type relevance, and Bhopal address verification.
- **Polite & Rate-Limited**: Enforces <= 1 request/second against Nominatim with exponential backoff retries and local file caching.
- **Seamless Pipeline Integration**: Directly outputs `content/working/geo_review.csv` in the exact schema expected by `pipeline/apply_geo.py`.
- **Automatic Backups**: Creates timestamped backups (`content/places_backup_<timestamp>/`) before writing approved coordinates back into place YAMLs.

## Directory Structure

```text
coordinate_enrichment/
├── __init__.py
├── config.py             # Canonical bbox, endpoints, headers, timeouts
├── models.py             # PlaceRecord, OSMCandidate, MatchResult
├── validators.py         # Bounds, numeric validity, coordinate inversion checks
├── cache.py              # File-backed lookup cache
├── osm_client.py         # Polite Nominatim & Overpass query client
├── matcher.py            # Scoring and confidence evaluation
├── main.py               # CLI entrypoint
├── README.md             # This guide
└── output/
    ├── coordinate_review.csv
    ├── coordinate_results.json
    ├── unresolved_places.csv
    └── geo_cache.json
```

## Usage

### 1. Dry Run (Read-Only)
```bash
python -m tools.coordinate_enrichment.main --dry-run
```

### 2. Discover Coordinates & Export Review CSV
```bash
python -m tools.coordinate_enrichment.main --export-csv
```
This queries Nominatim/Overpass (with rate limiting and caching) and writes:
- `tools/coordinate_enrichment/output/coordinate_review.csv`
- `content/working/geo_review.csv`
- `tools/coordinate_enrichment/output/coordinate_results.json`

### 3. Review & Approve
Open `content/working/geo_review.csv` or `output/coordinate_review.csv`. Review the `matched OSM display name`, `lat`, `lng`, and `confidence`. Mark valid rows with `Y` in the `approved` column.

### 4. Apply Approved Coordinates
```bash
python -m tools.coordinate_enrichment.main --write-approved
```
This validates all approved coordinates, backs up existing place files to `content/places_backup_<timestamp>/`, updates the `geo` and `provenance` sections of the place YAML files, and outputs a summary.

### 5. Re-run Pipeline & Build Pack
```bash
python -m pipeline.validate
python -m pipeline.build_pack
```
