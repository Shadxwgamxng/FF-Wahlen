#!/usr/bin/env bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Bitte zuerst Node.js installieren: https://nodejs.org"; read -r; exit 1; }
[ -d node_modules ] || npm install
node scripts/local.mjs
