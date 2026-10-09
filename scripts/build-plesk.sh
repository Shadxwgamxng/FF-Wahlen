#!/usr/bin/env bash
# Baut das Upload-Paket für Plesk (Node.js): ./scripts/build-plesk.sh  →  dist/ff-wahlen-plesk.zip
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist/plesk
rm -rf dist && mkdir -p "$OUT"

npx prisma generate
DATABASE_URL="postgresql://x:x@localhost:5432/x" npx next build

# Standalone-Server + statische Dateien
cp -r .next/standalone/. "$OUT/"
mkdir -p "$OUT/.next" && cp -r .next/static "$OUT/.next/static"
cp -r public "$OUT/public"
rm -f "$OUT/.env" "$OUT/.env.local"
rm -rf "$OUT/node_modules/@img" "$OUT/node_modules/sharp" "$OUT/node_modules/typescript"

# Migrationen + Startdatei (Migration, Standarddaten, Serverstart) als app.js
mkdir -p "$OUT/migrations" && cp -r prisma/migrations/. "$OUT/migrations/"
npx esbuild scripts/plesk-boot.ts --bundle --platform=node --target=node20 \
  --external:@prisma/client --external:pg-native --external:./server.js --outfile="$OUT/app.js"

cp PLESK-ANLEITUNG.md "$OUT/PLESK-ANLEITUNG.md"
cat > "$OUT/LIESMICH-PLESK.txt" <<'TXT'
FF Wahlplattform – Plesk (Node.js)
Siehe PLESK-ANLEITUNG.md (im selben Ordner). Kurzfassung:
1. Datenbank (PostgreSQL) anlegen.
2. Diesen Ordnerinhalt in den Anwendungsstamm hochladen.
3. Plesk > Node.js: Startdatei = app.js, Modus = production, Umgebungsvariablen setzen
   (DATABASE_URL, APP_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SUPERADMIN_DISCORD_IDS).
4. App starten – Datenbank-Tabellen und Standarddaten werden automatisch angelegt.
TXT

(cd dist && rm -f ff-wahlen-plesk.zip && python3 -c "
import shutil; shutil.make_archive('ff-wahlen-plesk','zip','plesk')")
echo "Fertig: dist/ff-wahlen-plesk.zip"
