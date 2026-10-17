#!/usr/bin/env bash
# LEITWARTE – lokalen OSRM-Routing-Server einrichten und starten (Linux/macOS)
# Voraussetzung: Docker läuft.   Aufruf: ./setup.sh [region]   (Standard: schleswig-holstein)
set -euo pipefail
REGION="${1:-schleswig-holstein}"
IMAGE="ghcr.io/project-osrm/osrm-backend:v5.27.1"
FILE="$REGION-latest.osm.pbf"
BASE="$REGION-latest.osrm"
cd "$(dirname "$0")"
[ -f "$FILE" ] || curl -fL -o "$FILE" "https://download.geofabrik.de/europe/germany/$FILE"
if [ ! -f "$BASE.mldgr" ]; then
  docker run --rm -t -v "$PWD:/data" "$IMAGE" osrm-extract -p /opt/car.lua "/data/$FILE"
  docker run --rm -t -v "$PWD:/data" "$IMAGE" osrm-partition "/data/$BASE"
  docker run --rm -t -v "$PWD:/data" "$IMAGE" osrm-customize "/data/$BASE"
fi
echo "Starte OSRM auf http://localhost:5000 (Beenden mit Strg+C) ..."
docker run --rm -t -p 5000:5000 -v "$PWD:/data" "$IMAGE" osrm-routed --algorithm mld "/data/$BASE"
