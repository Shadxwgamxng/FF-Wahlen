#!/usr/bin/env bash
# Lokales Setup (Linux/macOS/Git-Bash): Datenbank, Abhängigkeiten, Migration, Seed
set -e
[ -f .env ] || { cp .env.example .env; sed -i.bak 's/DEV_LOGIN="false"/DEV_LOGIN="true"/' .env && rm -f .env.bak; }
docker compose up -d
npm install
until docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
npx prisma migrate deploy
npm run db:seed
echo
echo "Fertig. Start mit: npm run dev  →  http://localhost:3000"
echo "Ohne Discord-App: Dev-Login auf der Login-Seite, Discord-ID z. B. 100000000000000001 (siehe SUPERADMIN_DISCORD_IDS in .env)."
