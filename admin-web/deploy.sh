#!/usr/bin/env bash
#
# Deploy des Admin-Panels auf die ECHTE Produktion: https://admin.skipily.app
#
# WICHTIG — Stolperfalle, die schon mal Stunden gekostet hat:
#   Es gibt ZWEI Vercel-Projekte fuer das Admin-Panel:
#     • skipily-admin   → admin.skipily.app   ← DAS hier nutzt der Admin (RICHTIG)
#     • admin-web        → admin-web-five-silk.vercel.app  (alt/Duplikat, NICHT nutzen)
#   Beide haben Root-Directory = "admin-web", deshalb wird der Ordner beim
#   Deploy in ein Unterverzeichnis "admin-web" verschachtelt.
#
# Nutzung:
#   cd admin-web
#   ./deploy.sh <VERCEL_TOKEN>
#   # oder:  VERCEL_TOKEN=xxx ./deploy.sh
#
# Token erstellen: https://vercel.com/account/tokens  (Scope: hqfbg249wy-creates-projects)
# Nach dem Deploy den Token am besten wieder widerrufen.
#
# Tipp: Wenn du JS-Aenderungen machst, erhoehe die Cache-Version im
#       <script src="app.js?v=..."> in index.html, sonst zeigen Browser altes JS.

set -euo pipefail

TOKEN="${1:-${VERCEL_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "❌ Vercel-Token fehlt."
  echo "   Aufruf:  ./deploy.sh <token>     (oder VERCEL_TOKEN=xxx ./deploy.sh)"
  echo "   Token:   https://vercel.com/account/tokens"
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"          # .../admin-web
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# admin-web-Inhalte in ein Unterverzeichnis "admin-web" spiegeln (Root-Directory-Setting)
mkdir -p "$TMP/admin-web"
rsync -a --exclude 'node_modules' --exclude '.vercel' "$HERE/" "$TMP/admin-web/"

cd "$TMP"
echo "→ Verlinke mit Projekt skipily-admin …"
npx vercel link --project skipily-admin --yes --token="$TOKEN" >/dev/null

echo "→ Deploye nach Produktion …"
npx vercel --prod --token="$TOKEN" --yes

echo ""
echo "✓ Fertig → https://admin.skipily.app  (ggf. mit Cmd+Shift+R neu laden)"
