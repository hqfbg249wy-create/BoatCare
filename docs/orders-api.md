# Skipily Orders API

Bestellungen per API abrufen und Fulfillment zurückschreiben — für die
Anbindung an Shopify, Odoo oder ein eigenes ERP. Kein zweites Tool, keine
manuelle Übertragung.

- **Endpoint:** `https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/orders-api`
- **Auth:** Header `x-api-key: <dein API-Schlüssel>` (Provider-Portal → Stammdaten → API & Integration)
- **Voraussetzung:** Pro-/Enterprise-Tarif, Shop aktiv
- **Scoping:** Jeder Schlüssel sieht ausschließlich die eigenen Bestellungen.

## Zwei Integrationswege (kombinierbar)

| Weg | Richtung | Wofür |
|-----|----------|-------|
| **Pull (diese API)** | Skipily → dein System | Bestellungen abrufen, Inkrement-Sync (`updated_since`), Backfill |
| **Push (Webhooks)** | Skipily → deine URL | Echtzeit-Benachrichtigung bei neuer/­geänderter Bestellung (`webhook_url` setzen) |

Empfehlung für ~50 Bestellungen/Tag: **Webhook** für Echtzeit + **stündlicher Pull mit `updated_since`** als Sicherheitsnetz (verpasste Webhooks nachholen).

## Endpoints

### Bestellungen auflisten
```bash
curl "https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/orders-api?status=confirmed&limit=50" \
  -H "x-api-key: DEIN_KEY"
```

**Filter:**
| Parameter | Beispiel | Zweck |
|-----------|----------|-------|
| `status` | `confirmed` | pending/confirmed/shipped/delivered/cancelled |
| `payment_status` | `paid` | nur bezahlte abrufen |
| `updated_since` | `2026-06-15T00:00:00Z` | **Inkrement-Sync** — nur seither Geändertes |
| `created_since` | `2026-06-15T00:00:00Z` | nur neue Bestellungen |
| `limit` / `offset` | `50` / `0` | Pagination (max 200) |
| `sort` / `order` | `updated_at` / `desc` | Sortierung |

### Einzelne Bestellung
```bash
curl ".../orders-api?order_number=SKP-2026-00123" -H "x-api-key: DEIN_KEY"
```

### Antwort (gekürzt)
```json
{
  "orders": [{
    "id": "uuid",
    "order_number": "SKP-2026-00123",
    "status": "confirmed",
    "payment_status": "paid",
    "subtotal": 129.00, "shipping_cost": 5.90, "total": 134.90, "currency": "EUR",
    "commission_rate": 7.0, "commission_amount": 9.03,
    "shipping_name": "Max Mustermann",
    "shipping_street": "Hafenweg 1", "shipping_postal_code": "24159",
    "shipping_city": "Kiel", "shipping_country": "DE",
    "tracking_number": null, "tracking_url": null,
    "created_at": "2026-06-15T09:12:00Z", "updated_at": "2026-06-15T09:20:00Z",
    "items": [
      { "product_name": "Impeller Jabsco 1210-0001", "product_sku": "JAB-IMP-01",
        "quantity": 2, "unit_price": 29.90, "total": 59.80 }
    ]
  }],
  "pagination": { "limit": 50, "offset": 0, "total": 1, "returned": 1 }
}
```

### Fulfillment zurückschreiben (Versand melden)
Wenn dein ERP/Shopify versendet, schreib Status + Tracking zurück — der
Käufer wird automatisch benachrichtigt:
```bash
curl -X PUT ".../orders-api?id=ORDER_UUID" \
  -H "x-api-key: DEIN_KEY" -H "Content-Type: application/json" \
  -d '{ "status": "shipped", "tracking_number": "00340434161234567890", "tracking_url": "https://dhl.de/..." }'
```
Erlaubte `status`: `confirmed`, `shipped`, `delivered`, `cancelled`.

## Integration Odoo
- **Pull:** Geplante Aktion (Scheduled Action), z.B. alle 15 Min:
  `GET …?updated_since=<letzter Sync>` → Sale Orders / Pickings anlegen/aktualisieren.
- **Push zurück:** Beim Bestätigen der Lieferung in Odoo → `PUT …?id=` mit `status=shipped` + Tracking.
- Idempotenz: `order_number` als externe Referenz (`client_order_ref`) speichern → keine Duplikate.

## Integration Shopify
- Skipily-Bestellungen via Pull als Shopify-Orders spiegeln (Order Create API), `order_number` als `note`/`tags`.
- Shopify-Fulfillment-Webhook → `PUT …` an Skipily mit Tracking.
- Alternativ direkter Webhook-Empfang: `webhook_url` im Provider-Profil auf einen Shopify-Flow/Middleware-Endpoint setzen.

## Fehlercodes
| HTTP | Bedeutung |
|------|-----------|
| 401 | `x-api-key` fehlt oder ungültig |
| 403 | Tarif zu niedrig (Pro/Enterprise nötig) |
| 404 | Bestellung nicht gefunden (oder gehört nicht zu diesem Key) |
| 400 | ungültiger Parameter / leeres PUT |
