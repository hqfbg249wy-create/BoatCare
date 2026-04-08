# Skipily Provider API — Checkliste & Nutzungs-Protokoll

Letzte Prüfung: 2026-04-08
Endpoint: `https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api`

---

## 🔴 Deployment-Status (wichtig, bitte zuerst lesen)

Zum Testzeitpunkt war die `products-api` Edge-Function **nicht** auf Supabase
deployed. Alle Aufrufe — egal ob GET, POST, OPTIONS — gaben HTTP 404 mit
`{"code":"NOT_FOUND","message":"Requested function was not found"}` zurück.

Ohne Deployment kann **kein einziger Provider** die API benutzen.

### Was schon stimmt (DB-Seite verifiziert via PostgREST anon)

| Baustein | Status | Hinweis |
|---|---|---|
| Tabelle `metashop_products` | ✅ existiert | 3500+ Produkte, inkl. `provider_id`, `part_number`, `in_stock` |
| Tabelle `service_providers` | ✅ existiert | Spalten `api_key`, `is_shop_active`, `webhook_url` vorhanden |
| Tabelle `api_usage_logs` | ✅ existiert | Wird von der Function befüllt (audit trail) |
| Tabelle `product_categories` | ✅ existiert | `name_de`, `name_en`, `slug` |
| Supabase Secret `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ muss gesetzt sein | Function nutzt ihn zum DB-Zugriff |
| Funktions-Code `supabase/functions/products-api/index.ts` | ✅ korrekt | (Schema-Bug `company_name` → `name` heute gefixt) |

### Was fehlt für Go-Live

1. **Function deployen** — `supabase functions deploy products-api`
2. **Secrets prüfen** — `SUPABASE_SERVICE_ROLE_KEY` muss im Functions-Environment gesetzt sein (ist normalerweise automatisch da, aber verifizieren)
3. **CORS** — aktuell wird `../_shared/cors.ts` importiert; bei Deploy sicherstellen dass der shared-Ordner mit hochgeladen wird
4. **Test-Run nach Deploy** — siehe "Testprotokoll" weiter unten, alle 8 Tests müssen grün sein

---

## 📋 Admin-Checkliste (einmalig, von dir)

| # | Schritt | Wie | Status |
|---|---|---|---|
| 1 | Supabase CLI installieren | `brew install supabase/tap/supabase` | ⬜ |
| 2 | Bei Supabase einloggen | `supabase login` (Token aus Dashboard) | ⬜ |
| 3 | Repo mit Projekt verknüpfen | `supabase link --project-ref vcjwlyqkfkszumdrfvtm` | ⬜ |
| 4 | `products-api` Function deployen | `supabase functions deploy products-api` | ⬜ |
| 5 | Deployment verifizieren | `curl -X OPTIONS https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api` → muss `200` sein | ⬜ |
| 6 | Testprotokoll durchlaufen | siehe Abschnitt weiter unten | ⬜ |
| 7 | (Optional) `order-webhooks` gleich mit deployen | `supabase functions deploy order-webhooks` — ist ebenfalls nicht deployed | ⬜ |
| 8 | Provider-Portal: API-Docs-Link in `Profile.jsx` auf echte Docs-URL setzen | aktuell nur Inline-Hinweis | ⬜ |

---

## 📋 Provider-Checkliste (wie ein Dienstleister die API nutzt)

### A. Einmalige Einrichtung

| # | Schritt | Wo | Dauer |
|---|---|---|---|
| 1 | Konto im Provider-Portal anlegen (Email + Passwort) | https://portal.skipily.com/ (TBD) | 2 min |
| 2 | Stammdaten vervollständigen: Firma, Adresse, Kontakt, USt-IdNr. | `Stammdaten` | 5 min |
| 3 | **`is_shop_active = true` setzen** (wird aktuell vom Admin freigeschaltet, nicht self-service) | Admin setzt per SQL | — |
| 4 | API-Schlüssel generieren | `Stammdaten → API & Integration → API-Schlüssel generieren` | 10 s |
| 5 | Schlüssel sicher ablegen (1Password, Bitwarden, .env) — **wird nach dem ersten Reload maskiert angezeigt** | — | 1 min |
| 6 | (Optional) Webhook-URL eintragen — wird bei Bestelländerungen aufgerufen | `Stammdaten → API & Integration → Webhook-URL` | 2 min |
| 7 | Ersten Test-Call mit dem Schlüssel machen (siehe "Quick Start" unten) | Terminal/curl oder Postman | 2 min |

### B. Quick Start — erster API-Call

**Ein Produkt abrufen (keine Auth nötig, öffentlich lesbar):**

```bash
curl "https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api?limit=5"
```

**Produkte erstellen (Auth erforderlich über `x-api-key`):**

```bash
curl -X POST "https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api" \
  -H "x-api-key: bc_DEIN_SCHLUESSEL_HIER" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Volvo Penta Impeller 3588475",
    "description": "Original Volvo Penta Seewasserpumpen-Impeller für D2-40/55",
    "manufacturer": "Volvo Penta",
    "part_number": "3588475",
    "price": 38.90,
    "currency": "EUR",
    "in_stock": true,
    "stock_quantity": 12,
    "shipping_cost": 5.90,
    "delivery_days": 2,
    "fits_manufacturers": ["Volvo Penta"],
    "tags": ["impeller", "seewasserpumpe", "d2-40", "d2-55"]
  }'
```

**Produkt aktualisieren (z.B. Preis ändern):**

```bash
curl -X PUT "https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api?id=PRODUCT_UUID" \
  -H "x-api-key: bc_DEIN_SCHLUESSEL_HIER" \
  -H "Content-Type: application/json" \
  -d '{"price": 42.00, "stock_quantity": 8}'
```

### C. Endpunkt-Referenz

| Methode | Pfad | Auth | Zweck |
|---|---|---|---|
| `GET` | `/products-api` | — | Produktliste (paginiert, filterbar) |
| `GET` | `/products-api?id=<uuid>` | — | Einzelprodukt |
| `POST` | `/products-api` | `x-api-key` | Produkt anlegen |
| `PUT` | `/products-api?id=<uuid>` | `x-api-key` | Produkt aktualisieren |
| `OPTIONS` | `/products-api` | — | CORS preflight |

### D. GET-Query-Parameter

| Parameter | Typ | Beispiel | Wirkung |
|---|---|---|---|
| `id` | UUID | `id=abc-…` | Einzelnes Produkt |
| `category_id` | UUID | `category_id=0f8…` | Nach Kategorie filtern |
| `search` | String | `search=impeller` | Name-Suche (ILIKE) |
| `boat_type` | String | `boat_type=Segelyacht` | Kompatibilität Boottyp |
| `manufacturer` | String | `manufacturer=Volvo Penta` | Kompatibilität Hersteller |
| `provider_id` | UUID | `provider_id=…` | Nur Produkte eines Anbieters |
| `in_stock` | bool | `in_stock=true` | Lagerbestand filtern |
| `limit` | int | `limit=50` | Seitengröße, max 100 |
| `offset` | int | `offset=20` | Pagination |
| `sort` | enum | `sort=price` | `name`, `price`, `created_at`, `updated_at` |
| `order` | enum | `order=asc` | `asc` / `desc` |

### E. POST/PUT-Felder (Request-Body)

| Feld | Pflicht | Typ | Beschreibung |
|---|---|---|---|
| `name` | ✅ (POST) | String | Produktname |
| `description` | — | String | Freitext, Markdown erlaubt |
| `manufacturer` | — | String | Hersteller des Produkts |
| `part_number` | — | String | Artikel-/Herstellernummer |
| `price` | — | Number | Bruttopreis |
| `currency` | — | String | Default `"EUR"` |
| `shipping_cost` | — | Number | Versandkosten |
| `delivery_days` | — | int | Lieferzeit in Tagen |
| `in_stock` | — | bool | Default `true` |
| `sku` | — | String | interne Artikelnummer |
| `ean` | — | String | GTIN/EAN |
| `weight_kg` | — | Number | Gewicht für Versandkalkulation |
| `stock_quantity` | — | int | Bestand |
| `min_order_quantity` | — | int | Default `1` |
| `fits_boat_types` | — | String[] | z.B. `["Segelyacht","Motorboot"]` |
| `fits_manufacturers` | — | String[] | z.B. `["Volvo Penta","Yanmar"]` |
| `compatible_equipment` | — | String[] | Freie Tags für Equipment-Matching |
| `tags` | — | String[] | Für interne Suche / AI-Vorschläge |
| `images` | — | String[] | URL-Liste (https) |
| `category_id` | — | UUID | Foreign-Key `product_categories.id` |
| `is_active` | — | bool | `false` = versteckt |

### F. Fehlercodes

| HTTP | Bedeutung | Beispiel-Body |
|---|---|---|
| `200` | OK | `{"data":…}` |
| `201` | Angelegt (POST) | `{"data":…}` |
| `400` | Request fehlerhaft | `{"error":"Product name is required"}` |
| `401` | Auth fehlt / Key ungültig | `{"error":"Invalid API key"}` |
| `404` | Produkt nicht gefunden | `{"error":"Product not found"}` oder Function nicht deployed |
| `405` | Methode nicht erlaubt | `{"error":"Method not allowed"}` |
| `500` | Server-Fehler | `{"error":"Internal server error"}` |

### G. Rate-Limits & Audit

- Jeder erfolgreiche `POST`/`PUT` wird in `api_usage_logs` geloggt (`provider_id`, `action`, `timestamp`)
- **Aktuell keine harten Rate-Limits** (Launch-Blocker-Empfehlung: Throttling auf Edge Function einbauen, sonst läuft ein schlecht programmierter Provider-Sync den Anthropic-Bill-Budget leer — siehe Launch-Checklist #57)

---

## 🧪 Testprotokoll (Stand 2026-04-08, **vor Deployment-Fix**)

| # | Test | Request | Erwartet | Tatsächlich | Status |
|---|---|---|---|---|---|
| 1 | GET ohne Auth | `GET /products-api?limit=2` | 200 + Daten | **404 NOT_FOUND** | 🔴 |
| 2 | GET mit anon-apikey | `GET … + apikey` | 200 + Daten | **404 NOT_FOUND** | 🔴 |
| 3 | GET Suche | `GET ?search=impeller` | 200 + Treffer | **404 NOT_FOUND** | 🔴 |
| 4 | POST ohne Key | `POST /products-api` | 401 | **404 NOT_FOUND** | 🔴 |
| 5 | POST mit invalidem Key | `POST + x-api-key: bc_invalid` | 401 | **404 NOT_FOUND** | 🔴 |
| 6 | GET Einzelprodukt (fake UUID) | `GET ?id=00000…` | 404 | **404 NOT_FOUND** (aber falsche Ursache) | 🔴 |
| 7 | OPTIONS preflight | `OPTIONS /products-api` | 200 | **404** | 🔴 |
| 8 | PUT ohne id | `PUT /products-api` | 400 | **404 NOT_FOUND** | 🔴 |

**Ergebnis: 0/8 grün.** Alleinige Ursache: Function ist nicht deployed.

### Kontroll-Tests, die ich parallel gemacht habe (beweisen dass die Infrastruktur steht):

| Komponente | Ergebnis |
|---|---|
| `ai-chat` Edge Function `OPTIONS` | ✅ 200 (deployed) |
| `stripe-webhook` Edge Function `OPTIONS` | ✅ 200 (deployed) |
| `create-connect-account` Edge Function `OPTIONS` | ✅ 200 (deployed) |
| `order-webhooks` Edge Function `OPTIONS` | 🔴 404 (ebenfalls nicht deployed) |
| PostgREST `service_providers.api_key` lesbar | ✅ funktioniert |
| PostgREST `api_usage_logs` lesbar | ✅ funktioniert (leer) |
| PostgREST `metashop_products` lesbar | ✅ funktioniert |

### Post-Deploy Smoke-Test (sollte jeder machen, der die Function gerade deployed hat)

Speichere als `docs/smoke-test-products-api.sh` oder führe ad hoc aus:

```bash
#!/bin/bash
set -e
URL="https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api"

echo "1. OPTIONS preflight"
curl -sf -o /dev/null -X OPTIONS "$URL" && echo "  ✅ 200"

echo "2. GET liste"
curl -sf "$URL?limit=1" > /dev/null && echo "  ✅ 200"

echo "3. POST ohne Auth → 401 erwartet"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"name":"x"}' "$URL")
[ "$code" = "401" ] && echo "  ✅ $code" || { echo "  🔴 $code"; exit 1; }

echo "4. Schema-Join service_providers.name (nicht company_name)"
curl -sf "$URL?limit=1" | grep -q '"name"' && echo "  ✅ gefunden"

echo "🎉 Alle Tests grün — API ist live"
```

---

## 🔍 Bugs beim Test gefunden und gefixt

1. **`supabase/functions/products-api/index.ts:116`** — Der `selectFields`-Block referenzierte `service_providers(id, company_name, city)`, aber die Spalte heißt `name`. Jeder GET-Request wäre mit HTTP 500 (PostgREST-Fehler `42703 column does not exist`) gescheitert, selbst wenn die Function deployed wäre. **Fix: `company_name` → `name` geändert.**

2. **`supabase/functions/products-api/` nicht deployed** — Siehe Haupt-Finding oben. Nur Code im Repo, nicht auf Supabase live.

3. **`supabase/functions/order-webhooks/` ebenfalls nicht deployed** — Falls Provider-Webhooks produktiv genutzt werden sollen, müssen die auch deployed werden. Aus Scope dieses Audits aber nur als Hinweis.

---

## Next Actions für dich

1. **Supabase CLI installieren + `supabase functions deploy products-api`** — unblockt alles
2. Smoke-Test-Script von oben laufen lassen → alle 4 Checks müssen grün sein
3. (Optional) `order-webhooks` gleich mit deployen, falls Webhook-Flow aktiv genutzt wird
4. Sobald live: einem Test-Provider einen `api_key` setzen, ihn den Quick-Start-POST aus Abschnitt B machen lassen, `api_usage_logs` kontrollieren
5. Launch-Checkliste Item #57 "Rate-Limits Edge Functions" einplanen — aktuell ist die API ohne Throttling offen

Wenn du möchtest, dass ich die Supabase CLI installiere und versuche, von hier aus zu deployen, sag Bescheid — ich brauche dann allerdings einen `SUPABASE_ACCESS_TOKEN` von dir (aus https://supabase.com/dashboard/account/tokens).
