# LEITWARTE – lokalen OSRM-Routing-Server einrichten und starten (Windows PowerShell)
# Voraussetzung: Docker Desktop läuft.
# Aufruf im Ordner "osrm":   .\setup.ps1            (Standard: Schleswig-Holstein)
#                             .\setup.ps1 -Region hamburg
param([string]$Region = "schleswig-holstein")
$ErrorActionPreference = "Stop"
$Image = "ghcr.io/project-osrm/osrm-backend:v5.27.1"
$File = "$Region-latest.osm.pbf"
$Base = "$Region-latest.osrm"
if (-not (Test-Path $File)) {
  Write-Host "Lade Kartendaten $File von Geofabrik (OpenStreetMap, ODbL) ..."
  Invoke-WebRequest -Uri "https://download.geofabrik.de/europe/germany/$File" -OutFile $File
}
if (-not (Test-Path "$Base.mldgr")) {
  Write-Host "Bereite Routing-Daten vor (einmalig, einige Minuten) ..."
  docker run --rm -t -v "${PWD}:/data" $Image osrm-extract -p /opt/car.lua /data/$File
  docker run --rm -t -v "${PWD}:/data" $Image osrm-partition /data/$Base
  docker run --rm -t -v "${PWD}:/data" $Image osrm-customize /data/$Base
}
Write-Host "Starte OSRM auf http://localhost:5000 (Beenden mit Strg+C) ..."
docker run --rm -t -p 5000:5000 -v "${PWD}:/data" $Image osrm-routed --algorithm mld /data/$Base
