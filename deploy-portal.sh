#!/usr/bin/env bash
#
# Deploy eines der drei Skipily-Web-Portale auf Produktion (Vercel).
#
# Hintergrund / Stolperfalle: Jedes Portal hat ein EIGENES Vercel-Projekt,
# und jedes Projekt hat Root-Directory = sein Ordnername. Wenn man aus dem
# Ordner heraus deployt, sucht Vercel "<ordner>/<ordner>" -> Fehler. Dieses
# Skript verschachtelt deshalb korrekt und verlinkt mit dem RICHTIGEN Projekt.
#
#   Portal     Quelle            Vercel-Projekt           Domain
#   ------------------------------------------------------------------
#   admin      admin-web/        skipily-admin            admin.skipily.app
#   owner      owner-portal/     owner-portal             app.skipily.app
#   provider   provider-portal/  skipily-provider-portal  provider.skipily.app
#
# (Es gibt ein veraltetes Duplikat-Projekt "admin-web" -> NICHT nutzen.)
#
# Nutzung:
#   ./deploy-portal.sh <admin|owner|provider> <VERCEL_TOKEN>
#   # oder:  VERCEL_TOKEN=xxx ./deploy-portal.sh owner
#
# Token: https://vercel.com/account/tokens (Scope hqfbg249wy-creates-projects);
#        nach dem Deploy widerrufen.
#
# Achtung: Es wird der AKTUELLE Stand des Portal-Ordners deployt (auch nicht
#          committete Aenderungen). Vercel fuehrt den Build (vite build) selbst aus.
#          Bei reinen JS-Aenderungen am Admin-Panel die Cache-Version im
#          <script src="app.js?v=..."> in admin-web/index.html hochzaehlen.

set -euo pipefail

PORTAL="${1:-}"
TOKEN="${2:-${VERCEL_TOKEN:-}}"

case "$PORTAL" in
  admin)    SRC="admin-web";       PROJECT="skipily-admin";           DOMAIN="admin.skipily.app" ;;
  owner)    SRC="owner-portal";    PROJECT="owner-portal";            DOMAIN="app.skipily.app" ;;
  provider) SRC="provider-portal"; PROJECT="skipily-provider-portal"; DOMAIN="provider.skipily.app" ;;
  *)
    echo "❌ Portal fehlt/unbekannt."
    echo "   Nutzung: ./deploy-portal.sh <admin|owner|provider> <token>"
    exit 1 ;;
esac

if [ -z "$TOKEN" ]; then
  echo "❌ Vercel-Token fehlt.  Nutzung: ./deploy-portal.sh $PORTAL <token>"
  echo "   Token: https://vercel.com/account/tokens"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ ! -d "$ROOT/$SRC" ]; then echo "❌ Ordner $SRC nicht gefunden."; exit 1; fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Quelle in Unterordner spiegeln (Root-Directory = "$SRC")
mkdir -p "$TMP/$SRC"
rsync -a --exclude 'node_modules' --exclude '.vercel' --exclude 'dist' "$ROOT/$SRC/" "$TMP/$SRC/"

cd "$TMP"
echo "→ Verlinke mit Projekt $PROJECT …"
npx vercel link --project "$PROJECT" --yes --token="$TOKEN" >/dev/null
echo "→ Deploye $PORTAL nach Produktion (Vercel baut) …"
npx vercel --prod --token="$TOKEN" --yes

echo ""
echo "✓ Fertig → https://$DOMAIN  (ggf. mit Cmd+Shift+R neu laden)"
