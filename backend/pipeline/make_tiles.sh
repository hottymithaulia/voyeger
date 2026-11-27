#!/usr/bin/env bash
set -euo pipefail

# Extract Bhopal bounding box (z0-z16) into tiles/bhopal.pmtiles using the pmtiles CLI.
# Install pmtiles CLI from: https://github.com/protomaps/go-pmtiles/releases
# Download a Protomaps planet or India extract (e.g. from https://maps.protomaps.com/builds/)
# and pass it as SOURCE_PMTILES, or place it at ./tiles/india.pmtiles.
#
# Usage:
#   SOURCE_PMTILES=./tiles/india.pmtiles ./pipeline/make_tiles.sh

SOURCE_PMTILES="${SOURCE_PMTILES:-./tiles/india.pmtiles}"
OUT_PMTILES="${OUT_PMTILES:-./tiles/bhopal.pmtiles}"
# BHOPAL_BBOX: south,west,north,east -> pmtiles extract expects minlon,minlat,maxlon,maxlat
BBOX="77.25,23.10,77.55,23.35"

if ! command -v pmtiles >/dev/null 2>&1; then
  echo "ERROR: 'pmtiles' CLI not found on PATH."
  echo "Install from: https://github.com/protomaps/go-pmtiles/releases"
  exit 1
fi

if [ ! -f "$SOURCE_PMTILES" ]; then
  echo "Source PMTiles file not found at: $SOURCE_PMTILES"
  echo "Please download a Protomaps build (do not auto-download huge planet files) and re-run:"
  echo "  SOURCE_PMTILES=/path/to/extract.pmtiles ./pipeline/make_tiles.sh"
  exit 1
fi

mkdir -p "$(dirname "$OUT_PMTILES")"
pmtiles extract "$SOURCE_PMTILES" "$OUT_PMTILES" --bbox="$BBOX" --maxzoom=16
echo "Created $OUT_PMTILES"
