#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# test-invite-flow.sh
#
# Testet die Edge Function invite-existing-provider in beiden Modi
# (cleverreach + mailto) gegen die Live-Supabase-Instanz.
#
# Voraussetzungen:
#   1. Edge Function ist deployed:
#        supabase functions deploy invite-existing-provider
#   2. Edge Function Secrets sind gesetzt:
#        CLEVERREACH_CLIENT_ID, CLEVERREACH_CLIENT_SECRET,
#        CLEVERREACH_GROUP_PROVIDER_ONBOARDING
#   3. In CleverReach: Group + Auto-Responder existieren
#   4. ADMIN_JWT ist gesetzt (siehe unten)
#   5. TEST_PROVIDER_ID ist gesetzt — ein Provider OHNE user_id/claimed_at
#
# So bekommst Du Dein Admin-JWT:
#   - Im Admin-Web einloggen
#   - DevTools → Application → Local Storage → vcjwlyqkfkszumdrfvtm
#   - Key beginnt mit "sb-" → JSON öffnen → "access_token" kopieren
#   - Vor Aufruf hier exportieren:
#       export ADMIN_JWT="eyJhbGc..."
#       export TEST_PROVIDER_ID="<uuid eines noch nicht geclaimten Providers>"
#
# Optional:
#   export TEST_EMAIL_OVERRIDE="dein-test+cr@example.com"
#     → schickt an Deine Test-Inbox statt an die Provider-Mail
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-https://vcjwlyqkfkszumdrfvtm.supabase.co}"
FUNC_URL="${SUPABASE_URL}/functions/v1/invite-existing-provider"

if [ -z "${ADMIN_JWT:-}" ]; then
  echo "❌ ADMIN_JWT nicht gesetzt. Siehe Header dieses Skripts."
  exit 1
fi
if [ -z "${TEST_PROVIDER_ID:-}" ]; then
  echo "❌ TEST_PROVIDER_ID nicht gesetzt. Siehe Header dieses Skripts."
  exit 1
fi

EMAIL_FIELD=""
if [ -n "${TEST_EMAIL_OVERRIDE:-}" ]; then
  EMAIL_FIELD=",\"email\":\"${TEST_EMAIL_OVERRIDE}\""
  echo "ℹ️  Versand-Override aktiv: ${TEST_EMAIL_OVERRIDE}"
fi

pretty() { python3 -m json.tool 2>/dev/null || cat; }

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "TEST 1 — delivery=mailto  (sollte Claim-Link zurückgeben)"
echo "════════════════════════════════════════════════════════════════"
RESP_MAILTO=$(curl -sS -X POST "$FUNC_URL" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"provider_id\":\"${TEST_PROVIDER_ID}\",\"delivery\":\"mailto\"${EMAIL_FIELD}}")
echo "$RESP_MAILTO" | pretty

echo ""
echo "✅ Erwartet:"
echo "   - ok: true"
echo "   - mode: \"mailto\""
echo "   - claim_url: \"https://provider.skipily.app/claim/<token>\""
echo "   - Provider hat KEINE Mail bekommen"
echo ""

CLAIM_URL=$(echo "$RESP_MAILTO" | grep -o '"claim_url":"[^"]*"' | sed 's/"claim_url":"//; s/"$//')
if [ -n "$CLAIM_URL" ]; then
  echo "ℹ️  Claim-URL extrahiert: $CLAIM_URL"
  echo "   → im Browser öffnen, Passwort setzen, Login testen."
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "TEST 2 — delivery=cleverreach  (CR-Auto-Responder triggert)"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "⚠️  Nur ausführen, wenn:"
echo "   - CR-Group existiert + Secrets gesetzt sind"
echo "   - TEST_EMAIL_OVERRIDE auf Deine Test-Inbox zeigt"
echo "     (sonst geht die Mail an den echten Provider!)"
echo ""
read -p "Fortfahren? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Abgebrochen."
  exit 0
fi

RESP_CR=$(curl -sS -X POST "$FUNC_URL" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"provider_id\":\"${TEST_PROVIDER_ID}\",\"delivery\":\"cleverreach\"${EMAIL_FIELD}}")
echo "$RESP_CR" | pretty

echo ""
echo "✅ Erwartet:"
echo "   - ok: true"
echo "   - mode: \"cleverreach\""
echo "   - claim_url: gleicher Link wie in TEST 1 (selber Token)"
echo "   - In Deiner Test-Inbox: CR-Welcome-Mail mit {COMPANY} + {CLAIM_LINK}"
echo "   - In CR-Dashboard sichtbar: Empfänger in Group Provider Onboarding"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "TEST 3 — bereits geclaimter Provider (sollte 409 zurückgeben)"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Nimm einen Provider mit gesetztem user_id/claimed_at als TEST_PROVIDER_ID"
echo "und ruf dieses Skript erneut auf. Erwartet:"
echo "   { \"error\": \"Dieser Provider hat bereits einen Account beansprucht...\" }"
echo "   HTTP 409"
