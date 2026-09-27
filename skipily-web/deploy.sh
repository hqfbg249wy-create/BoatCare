#!/usr/bin/env bash
#
# Deploy der Marketing-Site auf die ECHTE Produktion: https://skipily.app
#
# Deployt den Ordner skipily-web/dist/ ALS ROOT ins Vercel-Projekt skipily-web.
# Die neue Landingpage (index.html + en/fr/it/es/nl.html + media/) liegt bereits
# in dist/; die Rechts-/FAQ-/Preis-Unterseiten (preise, faq, impressum,
# datenschutz, agb, account-deletion, en/…) bleiben unveraendert erhalten.
#
# Nutzung:
#   cd skipily-web
#   ./deploy.sh <VERCEL_TOKEN>
#   # oder:  VERCEL_TOKEN=xxx ./deploy.sh
#
# Token erstellen: https://vercel.com/account/tokens
# Nach dem Deploy den Token am besten wieder widerrufen.
#
# Zuerst ohne --prod testen? -> Zeile unten auf "npx vercel" (Preview-URL) aendern.

set -euo pipefail

TOKEN="${1:-${VERCEL_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "❌ Vercel-Token fehlt."
  echo "   Aufruf:  ./deploy.sh <token>     (oder VERCEL_TOKEN=xxx ./deploy.sh)"
  echo "   Token:   https://vercel.com/account/tokens"
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/dist"

echo "→ Verlinke mit Projekt skipily-web …"
npx vercel link --project skipily-web --yes --token="$TOKEN" >/dev/null

echo "→ Deploye dist/ nach Produktion (skipily.app) …"
npx vercel --prod --token="$TOKEN" --yes

echo ""
echo "✓ Fertig → https://skipily.app  (ggf. mit Cmd+Shift+R neu laden)"
