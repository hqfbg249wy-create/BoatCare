#!/usr/bin/env bash
#
# backfill-translations.sh — fuellt fehlende Produkt-Uebersetzungen auf.
# Ruft die Edge-Function translate-product gezielt nur fuer Produkte ohne
# Uebersetzung der jeweiligen Sprache auf (Batches zu 50). Idempotent: bereits
# uebersetzte Produkte werden uebersprungen (RPC products_missing_translation).
#
# Voraussetzung: Migration 208 + 209 eingespielt.
# Benoetigt: curl, jq.
#
# Verwendung (anon-Key reicht; Dashboard -> Project Settings -> API -> anon public):
#   ./scripts/backfill-translations.sh <ANON_KEY> [sprachen...]
# Beispiele:
#   ./scripts/backfill-translations.sh "<anon-key>" de       # nur Deutsch (empfohlen zuerst)
#   ./scripts/backfill-translations.sh "<anon-key>"          # alle: de en it nl fr es
#
# Kosten-Hinweis: uebersetzt via Claude/DeepL. "de" ist am guenstigsten
# (nur 283 Produkte). Alle Sprachen zusammen sind ~4.745 Produkt-Sprach-Paare.

set -euo pipefail

REF="vcjwlyqkfkszumdrfvtm"
BASE="https://${REF}.supabase.co"
BATCH=50

if [ $# -lt 1 ]; then
  echo "Usage: $0 <ANON_KEY> [langs...]" >&2
  exit 1
fi
KEY="$1"; shift
if [ $# -ge 1 ]; then LANGS=("$@"); else LANGS=(de en it nl fr es); fi

for lang in "${LANGS[@]}"; do
  echo "=== Sprache: ${lang} ==="
  ids=$(curl -sS "${BASE}/rest/v1/rpc/products_missing_translation" \
    -H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"p_lang\":\"${lang}\"}" | jq -r '.[]')

  if [ -z "${ids}" ]; then echo "  nichts zu tun (keine Luecken)."; continue; fi

  total=$(echo "${ids}" | wc -l | tr -d ' ')
  echo "  ${total} Produkte ohne ${lang}-Uebersetzung."

  batch=()
  done_n=0
  flush() {
    [ ${#batch[@]} -eq 0 ] && return 0
    arr=$(printf '%s\n' "${batch[@]}" | jq -R . | jq -s -c .)
    resp=$(curl -sS "${BASE}/functions/v1/translate-product" \
      -H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"product_ids\":${arr},\"target_lang\":\"${lang}\"}")
    done_n=$((done_n + ${#batch[@]}))
    echo "  Batch ${done_n}/${total} ok."
    batch=()
    sleep 1   # kleine Pause gegen Rate-Limits
  }

  while IFS= read -r id; do
    [ -z "${id}" ] && continue
    batch+=("${id}")
    if [ ${#batch[@]} -ge ${BATCH} ]; then flush; fi
  done <<< "${ids}"
  flush
  echo "  ${lang} fertig."
done

echo "Backfill abgeschlossen. search_text wird durch den Trigger (Migration 208) automatisch aktualisiert."
