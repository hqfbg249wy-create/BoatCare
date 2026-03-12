# Vendor-Shop Integration Plan – BoatCare

## 1. IST-Zustand

| Komponente | Status |
|---|---|
| iOS App (SwiftUI) | Marketplace zeigt nur Promotions, leitet zu externen Shops |
| `metashop_products` Tabelle | Existiert bereits (Name, Preis, Hersteller, Lieferzeit etc.) |
| Service-Provider-Login | `user_id` in `service_providers` vorhanden, aber kein eigenes Provider-Portal |
| Admin-Web | Vanilla JS, verwaltet Provider, kein Shop-Management |
| Payment | Nicht vorhanden |
| Messaging | Nicht vorhanden |
| Equipment/Boats | Voll funktional mit Wartungszyklen |

---

## 2. Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│                      SUPABASE (Backend)                      │
│  PostgreSQL + Auth + Storage + Edge Functions + Realtime      │
└──────┬──────────────┬──────────────┬───────────────┬─────────┘
       │              │              │               │
  ┌────▼────┐   ┌─────▼─────┐  ┌────▼─────┐   ┌────▼──────┐
  │ iOS App │   │ Provider  │  │ Admin    │   │ Stripe    │
  │ (Käufer)│   │ Portal    │  │ Web      │   │ Connect   │
  │ SwiftUI │   │ (Neu/Web) │  │ (Erw.)  │   │ (Payment) │
  └─────────┘   └───────────┘  └──────────┘   └───────────┘
```

### Kernentscheidung: Provider-Portal als Web-App

Das Provider-Portal wird als **separate Web-App** realisiert (z.B. `provider.boatcare.app`), nicht als Teil der iOS-App. Gründe:
- Provider arbeiten am Desktop (Produktpflege, Auswertungen, Bestellmanagement)
- Einfacher für Bulk-Operationen und API-Anbindung
- Unabhängig von App-Store-Releases
- Technologie: **React/Next.js** oder alternativ **Vanilla JS** (konsistent mit Admin-Web)

**Empfehlung:** React + Vite für das Provider-Portal (moderner, bessere DX für komplexe Formulare und Tabellen). Das Admin-Web kann später migriert werden.

---

## 3. Datenbank-Erweiterungen

### 3.1 Erweiterte `service_providers` Tabelle

```sql
ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'provider',
  ADD COLUMN IF NOT EXISTS payment_method TEXT,          -- z.B. 'stripe_connect'
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,       -- Stripe Connect Account ID
  ADD COLUMN IF NOT EXISTS iban TEXT,                    -- Fallback Bankverbindung
  ADD COLUMN IF NOT EXISTS tax_id TEXT,                  -- USt-ID
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(4,2) DEFAULT 10.00,  -- Individuell 7-10%
  ADD COLUMN IF NOT EXISTS is_shop_active BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_key TEXT,                 -- Für Standard-API-Anbindung
  ADD COLUMN IF NOT EXISTS api_type TEXT;                -- 'manual' | 'rest_api' | 'csv_import'
```

### 3.2 Erweiterte `metashop_products` Tabelle

```sql
ALTER TABLE metashop_products
  ADD COLUMN IF NOT EXISTS sku TEXT,                      -- Interne Artikelnummer Provider
  ADD COLUMN IF NOT EXISTS ean TEXT,                      -- EAN/GTIN Barcode
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_quantity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS fits_boat_types TEXT[],        -- z.B. {'Segelboot', 'Motorboot'}
  ADD COLUMN IF NOT EXISTS fits_manufacturers TEXT[],     -- z.B. {'Bavaria', 'Jeanneau'}
  ADD COLUMN IF NOT EXISTS compatible_equipment TEXT[],   -- Verknüpfung mit Equipment-Kategorien
  ADD COLUMN IF NOT EXISTS tags TEXT[],                   -- Freitext-Tags für Suche
  ADD COLUMN IF NOT EXISTS images TEXT[],                 -- Mehrere Produktbilder
  ADD COLUMN IF NOT EXISTS external_product_id TEXT,      -- ID aus externem System
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';  -- 'manual' | 'api' | 'csv'
```

### 3.3 Neue Tabelle `product_categories`

```sql
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    name_de TEXT NOT NULL,
    name_en TEXT NOT NULL,
    parent_id UUID REFERENCES product_categories(id),
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Beispiel-Kategorien:
-- Antifouling & Farben > Antifouling | Bootslack | Grundierung
-- Motor & Antrieb > Motoröl | Filter | Impeller | Zündkerzen
-- Segel & Rigg > Fallen | Schoten | Blöcke | Segel
-- Elektrik & Elektronik > Batterien | Ladegeräte | Navigationselektronik
-- Deck & Beschläge > Klampen | Winschen | Relingsdrähte
-- Sicherheit > Rettungswesten | Feuerlöscher | Signalmittel
-- Sanitär & Komfort > Toiletten | Pumpen | Wassertanks
-- Pflege & Reinigung > Reinigungsmittel | Poliermittel | Teakpflege
```

### 3.4 Neue Tabelle `orders`

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,       -- z.B. BC-2026-00001
    buyer_id UUID NOT NULL REFERENCES auth.users(id),
    provider_id UUID NOT NULL REFERENCES service_providers(id),
    boat_id UUID REFERENCES boats(id),       -- Optional: Für welches Boot bestellt
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | confirmed | shipped | delivered | cancelled | refunded
    subtotal NUMERIC(10,2) NOT NULL,
    shipping_cost NUMERIC(10,2) DEFAULT 0,
    commission_rate NUMERIC(4,2) NOT NULL,    -- Snapshot zum Bestellzeitpunkt
    commission_amount NUMERIC(10,2) NOT NULL, -- Berechnete Gebühr
    total NUMERIC(10,2) NOT NULL,
    currency TEXT DEFAULT 'EUR',

    -- Lieferadresse (Snapshot)
    shipping_name TEXT NOT NULL,
    shipping_street TEXT NOT NULL,
    shipping_city TEXT NOT NULL,
    shipping_postal_code TEXT NOT NULL,
    shipping_country TEXT NOT NULL DEFAULT 'DE',

    -- Payment
    stripe_payment_intent_id TEXT,
    stripe_transfer_id TEXT,               -- Auszahlung an Provider
    payment_status TEXT DEFAULT 'pending',  -- pending | paid | failed | refunded

    -- Tracking
    tracking_number TEXT,
    tracking_url TEXT,
    estimated_delivery DATE,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,

    -- Notizen
    buyer_note TEXT,
    provider_note TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.5 Neue Tabelle `order_items`

```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES metashop_products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,      -- Preis zum Bestellzeitpunkt
    discount_percent NUMERIC(4,2) DEFAULT 0,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2) NOT NULL,

    -- Snapshot der Produktdaten zum Bestellzeitpunkt
    product_name TEXT NOT NULL,
    product_sku TEXT,
    product_manufacturer TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.6 Neue Tabelle `provider_promotions` (Filter-basierte Rabatte)

```sql
CREATE TABLE provider_promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                      -- z.B. "Frühlings-Rabatt Segelboote"
    discount_type TEXT NOT NULL DEFAULT 'percent',  -- 'percent' | 'fixed'
    discount_value NUMERIC(10,2) NOT NULL,   -- z.B. 5.00 (= 5%)

    -- Filter-Kriterien (alle optional, kombinierbar)
    filter_categories TEXT[],                -- Produktkategorien
    filter_boat_types TEXT[],                -- Bootstypen
    filter_manufacturers TEXT[],             -- Bootshersteller
    filter_min_order NUMERIC(10,2),          -- Mindestbestellwert
    filter_equipment_categories TEXT[],      -- Equipment-Kategorien (Wartung fällig)

    -- Gültigkeit
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT true,
    max_uses INTEGER,                        -- Optional: Maximale Einlösungen
    current_uses INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.7 Neue Tabelle `messages` (In-App Nachrichten)

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    sender_type TEXT NOT NULL,               -- 'user' | 'provider'
    recipient_id UUID NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    related_order_id UUID REFERENCES orders(id),
    related_product_id UUID REFERENCES metashop_products(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    provider_id UUID NOT NULL REFERENCES service_providers(id),
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, provider_id)
);
```

### 3.8 Erweiterte `profiles` Tabelle (Käufer-Daten)

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS shipping_street TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'DE',
  ADD COLUMN IF NOT EXISTS phone_number TEXT,       -- Für Lieferfragen
  ADD COLUMN IF NOT EXISTS preferred_boat_id UUID REFERENCES boats(id);  -- Standard-Boot
```

---

## 4. Provider-Portal (Web-App)

### 4.1 Seiten-Übersicht

| Seite | Funktion |
|---|---|
| **Dashboard** | Übersicht: Offene Bestellungen, Umsatz, Produktanzahl |
| **Produkte** | CRUD für Produkte, Bulk-Import (CSV), API-Anbindung |
| **Bestellungen** | Eingehende Bestellungen, Status-Verwaltung, Tracking |
| **Angebote/Rabatte** | Filter-basierte Rabatte erstellen und verwalten |
| **Auswertungen** | Produktstatistiken, Wartungsübersicht der Kunden-Boote |
| **Nachrichten** | Kunden-Anfragen beantworten |
| **Stammdaten** | Profil, Kontakt, Zahlungsdaten, Logo, Beschreibung |
| **API-Einstellungen** | API-Key, Webhook-URL, Sync-Status |

### 4.2 Produkt-Einpflege (3 Wege)

#### Weg 1: Manuell über UI
- Formular mit allen Feldern
- Bild-Upload über Supabase Storage
- Kategorie-Auswahl (Dropdown-Baum)
- Kompatibilitäts-Tags (Bootstyp, Hersteller)

#### Weg 2: CSV/Excel-Import
- Template-Download
- Bulk-Upload mit Validierung
- Vorschau vor Übernahme
- Fehler-Report

#### Weg 3: Standard-API (REST)
- API-Key-Authentifizierung pro Provider
- Endpoints:
  ```
  POST   /api/v1/products          – Produkt anlegen
  PUT    /api/v1/products/:id      – Produkt aktualisieren
  DELETE /api/v1/products/:id      – Produkt löschen
  GET    /api/v1/products          – Eigene Produkte abrufen
  POST   /api/v1/products/bulk     – Bulk-Import (JSON)
  GET    /api/v1/orders            – Bestellungen abrufen
  PUT    /api/v1/orders/:id/status – Bestellstatus aktualisieren
  ```
- Webhook-Benachrichtigungen bei neuen Bestellungen
- Realisiert als **Supabase Edge Functions** (Deno/TypeScript)

### 4.3 Auswertungen für Provider

Der Provider sieht:
- **Produktübersicht**: Welche Produkte sind hinterlegt, Alter, Lagerbestand
- **Wartungs-Insights**: Anonymisierte Daten über fällige Wartungen der Kunden → Provider sieht z.B. "23 Boote in Ihrer Region haben Impeller-Wartung fällig in den nächsten 3 Monaten"
- **Bestellstatistiken**: Umsatz, beliebteste Produkte, Conversion
- **Rabatt-Performance**: Welche Angebote wurden wie oft eingelöst

### 4.4 Filter-basierte Rabatte (Punkt 13)

Workflow:
1. Provider geht zu "Angebote" → "Neues Angebot"
2. Wählt Filter-Kriterien:
   - Produktkategorie (z.B. "Antifouling")
   - Bootstyp (z.B. "Segelboot")
   - Bootshersteller (z.B. "Bavaria")
   - Equipment mit fälliger Wartung (z.B. "Motor-Wartung fällig")
3. Setzt Rabatt: z.B. 5% BoatCare-Rabatt
4. Setzt Gültigkeitszeitraum
5. Aktiviert das Angebot

In der iOS-App sieht der Bootsbesitzer dann:
- Personalisierte Angebote basierend auf seinem Boot und Equipment
- "Für Ihr Boot empfohlen: 5% auf Impeller bei [Provider]"
- Wartungs-basierte Empfehlungen: "Wartung fällig → Passende Teile mit Rabatt"

---

## 5. iOS App – Shop-Erweiterungen

### 5.1 Neue/Erweiterte Screens

| Screen | Beschreibung |
|---|---|
| **Shop-Tab** (erweitert MarketplaceScreen) | Produktkatalog mit Suche, Filtern, Kategorien |
| **Produktdetail** | Bilder, Beschreibung, Preis, Verfügbarkeit, "In den Warenkorb" |
| **Warenkorb** | Übersicht, Mengen ändern, Rabatte angezeigt, Checkout |
| **Checkout** | Lieferadresse, Zahlungsmethode, Bestellübersicht |
| **Bestellungen** | Eigene Bestellungen, Status-Tracking |
| **Chat/Nachrichten** | Anfragen an Provider (pro Provider eine Konversation) |
| **Profil erweitert** | Lieferadresse, Zahlungsmethode verwalten |

### 5.2 Intelligente Produktempfehlungen

Basierend auf den vorhandenen Boots- und Equipment-Daten:
- "Passend für Ihr Boot" → Filtert nach Bootstyp und Hersteller
- "Wartung fällig" → Zeigt Produkte, die zum fälligen Equipment passen
- "Andere Besitzer kauften" → Basierend auf ähnlichen Booten

### 5.3 Warenkorb & Checkout

```
Warenkorb
├── Provider A
│   ├── Produkt 1  (2x 49,90€)
│   └── Produkt 2  (1x 89,00€)
│   └── Zwischensumme: 188,80€
│   └── Versand: 5,90€
│   └── Rabatt (5% Frühling): -9,44€
│   └── Gesamt: 185,26€
│
├── Provider B
│   ├── Produkt 3  (1x 299,00€)
│   └── Versand: 0,00€ (Kostenloser Versand)
│   └── Gesamt: 299,00€
│
└── Gesamtbetrag: 484,26€
```

Wichtig: Jeder Provider ist eine separate Bestellung (separater Versand, separate Zahlung).

---

## 6. Payment-System

### 6.1 Empfehlung: Stripe Connect (Europe)

**Warum Stripe Connect:**
- Marketplace-Payment aus einer Hand
- Split-Payments: Käufer zahlt → BoatCare erhält Provision → Provider erhält Rest
- Stark in Europa (SEPA, Kreditkarte, iDEAL, Bancontact, Klarna etc.)
- PSD2/SCA-konform
- Onboarding für Provider über Stripe Express (KYC automatisch)
- **Testmodus komplett kostenlos** (keine Gebühren in der Testphase!)

### 6.2 Payment-Flow

```
Käufer bestellt (484,26€)
    │
    ▼
Stripe Payment Intent erstellen
    │
    ▼
Käufer zahlt (Kreditkarte / SEPA / Klarna / Apple Pay)
    │
    ▼
Zahlung erfolgreich
    │
    ├──▶ Provider A erhält 185,26€ - 10% (18,53€) = 166,73€
    │    (Stripe Transfer an Provider-A-Connect-Account)
    │
    └──▶ Provider B erhält 299,00€ - 8% (23,92€) = 275,08€
         (Stripe Transfer an Provider-B-Connect-Account)
    │
    ▼
BoatCare-Konto erhält: 18,53€ + 23,92€ = 42,45€ Provision
(Abzüglich Stripe-Transaktionsgebühren: ~1,4% + 0,25€ pro Transaktion)
```

### 6.3 Provider Onboarding (Stripe Express)

1. Provider registriert sich im Portal
2. BoatCare leitet zu Stripe Express Onboarding weiter
3. Stripe verifiziert den Provider (KYC: Identität, Bankverbindung)
4. Provider erhält `stripe_account_id` → wird in `service_providers` gespeichert
5. Ab sofort kann der Provider Zahlungen empfangen

### 6.4 Kostenübersicht Stripe

| Posten | Kosten | Testphase |
|---|---|---|
| Stripe Connect Plattformgebühr | 0€/Monat | 0€ |
| Transaktionsgebühr (Kreditkarte) | 1,5% + 0,25€ | 0€ (Testmodus) |
| Transaktionsgebühr (SEPA) | 0,35€ | 0€ (Testmodus) |
| Stripe Express Onboarding | 0€ | 0€ |
| Auszahlung an Provider | 0,25€ (SEPA) | 0€ |

**In der Testphase fallen keine Kosten an.** Stripe bietet vollständige Sandbox-Umgebung mit Test-Kreditkarten, Test-SEPA etc.

### 6.5 Alternative: Mollie (NL-basiert)

Falls Stripe nicht gewünscht:
- Mollie Connect (ähnliches Modell)
- Stark in Benelux/DACH
- Kein monatlicher Grundpreis
- Testmodus ebenfalls kostenlos

---

## 7. Vom Bootsbesitzer benötigte Informationen

### 7.1 Bei Registrierung (Profil)

| Feld | Pflicht | Wann |
|---|---|---|
| E-Mail | Ja | Bei Registrierung (existiert) |
| Vollständiger Name | Ja | Bei erster Bestellung |
| Telefonnummer | Empfohlen | Bei erster Bestellung |

### 7.2 Bei erster Bestellung (Lieferadresse)

| Feld | Pflicht |
|---|---|
| Straße + Hausnummer | Ja |
| PLZ | Ja |
| Stadt | Ja |
| Land | Ja (Dropdown, EU-Länder) |

### 7.3 Bei Zahlung

| Feld | Pflicht |
|---|---|
| Zahlungsmethode | Ja (Stripe-Auswahl: Karte, SEPA, Klarna, Apple Pay) |

→ Stripe Checkout/Payment Sheet übernimmt die Eingabe. Keine sensiblen Zahlungsdaten werden in BoatCare gespeichert.

### 7.4 Boot-Zuordnung (optional aber empfohlen)

| Feld | Pflicht |
|---|---|
| Für welches Boot wird bestellt? | Optional (Dropdown) |

→ Ermöglicht personalisierte Empfehlungen und Wartungs-basierte Angebote.

---

## 8. Admin-Web – Erweiterungen

### 8.1 Neue Admin-Funktionen

| Funktion | Beschreibung |
|---|---|
| **Provider-Provision** | Individuell 7-10% pro Provider einstellen |
| **Shop-Freischaltung** | Provider für Shop aktivieren/deaktivieren |
| **Bestellübersicht** | Alle Bestellungen plattformweit einsehen |
| **Umsatz-Dashboard** | Provisionseinnahmen, Top-Provider, Conversion |
| **Stripe-Status** | Onboarding-Status der Provider, Auszahlungen |
| **Produkt-Moderation** | Gemeldete Produkte prüfen, Produkte sperren |

### 8.2 Commission-Rate pro Provider

```
Provider-Detail im Admin:
┌──────────────────────────────────────────┐
│  Bootswerft Schmidt                       │
│                                           │
│  Provision: [  8,5  ] %  ← Slider/Input  │
│  (Standard: 10%, Verhandelbar: 7-10%)     │
│                                           │
│  Shop aktiv: [✓]                          │
│  Stripe Status: ✅ Verifiziert             │
│  Stripe Account: acct_1234...             │
└──────────────────────────────────────────┘
```

---

## 9. API-Schnittstelle für Provider

### 9.1 Authentifizierung

```
Header: X-API-Key: <provider_api_key>
```

Jeder Provider erhält einen eindeutigen API-Key, der im Provider-Portal generiert wird.

### 9.2 Produkt-Sync Endpoint (Beispiel)

```json
POST /api/v1/products
Content-Type: application/json
X-API-Key: pk_live_abc123...

{
  "name": "Impeller Jabsco 1210-0001",
  "manufacturer": "Jabsco",
  "part_number": "1210-0001",
  "sku": "JAB-IMP-1210",
  "ean": "4012345678901",
  "price": 24.90,
  "currency": "EUR",
  "stock_quantity": 45,
  "category": "Motor & Antrieb > Impeller",
  "description": "Original Jabsco Impeller...",
  "images": ["https://..."],
  "fits_boat_types": ["Segelboot", "Motorboot"],
  "fits_manufacturers": ["Bavaria", "Jeanneau"],
  "shipping_cost": 4.90,
  "delivery_days": 3,
  "in_stock": true
}
```

### 9.3 Webhook für Bestellungen

```json
POST https://provider-webhook-url.com/orders
{
  "event": "order.created",
  "order": {
    "id": "bc-2026-00042",
    "items": [...],
    "shipping_address": {...},
    "total": 185.26,
    "buyer_note": "Bitte liefern an Steg 5, Marina Kiel"
  }
}
```

Realisiert über Supabase Edge Functions + Database Webhooks.

---

## 10. Implementierungsplan (Phasen)

### Phase 1: Fundament (2-3 Wochen)

**Datenbank:**
- [ ] Tabellen erweitern/erstellen (product_categories, orders, order_items, provider_promotions, messages, conversations)
- [ ] RLS Policies für alle neuen Tabellen
- [ ] Provider-Rolle in Auth-System einbauen (`role = 'provider'`)

**Provider-Portal (MVP):**
- [ ] Projekt-Setup (React + Vite + Supabase Client)
- [ ] Auth (Login mit Supabase, Provider-Rolle prüfen)
- [ ] Stammdaten-Seite (alle Provider-Felder lesen/bearbeiten)
- [ ] Produkt-CRUD (manuell anlegen, bearbeiten, löschen)
- [ ] Bild-Upload (Supabase Storage)

**Admin-Web:**
- [ ] Commission-Rate pro Provider einstellbar
- [ ] Shop-Freischaltung pro Provider

### Phase 2: Shop in iOS App (2-3 Wochen)

**iOS App:**
- [ ] MarketplaceScreen → vollwertiger Shop mit Kategorie-Navigation
- [ ] Produktdetail-Screen
- [ ] Suchfunktion (Volltext, Kategorie, Hersteller)
- [ ] Warenkorb (lokal + Supabase-Sync)
- [ ] Profil-Erweiterung (Lieferadresse)
- [ ] Bestellübersicht

### Phase 3: Payment (1-2 Wochen)

**Stripe Connect:**
- [ ] Stripe Account anlegen, Connect aktivieren
- [ ] Provider-Onboarding-Flow (Stripe Express)
- [ ] Payment Intent erstellen (Edge Function)
- [ ] Split-Payment (Provision automatisch abziehen)
- [ ] Stripe Payment Sheet in iOS App (Apple Pay, Kreditkarte, SEPA)
- [ ] Webhook für Zahlungsbestätigungen (Edge Function)

**Testphase:** Stripe Testmodus → keine echten Zahlungen, keine Kosten.

### Phase 4: Bestellmanagement & Messaging (2 Wochen)

**Provider-Portal:**
- [ ] Bestelleingang mit Echtzeit-Benachrichtigung (Supabase Realtime)
- [ ] Status-Verwaltung (bestätigt → versendet → geliefert)
- [ ] Tracking-Nummer eintragen
- [ ] Nachrichten-System (Chat mit Kunden)

**iOS App:**
- [ ] Bestellstatus-Tracking
- [ ] Push-Notifications bei Status-Änderung
- [ ] Chat mit Provider

### Phase 5: Intelligenz & Rabatte (1-2 Wochen)

**Provider-Portal:**
- [ ] Filter-basierte Rabatt-Erstellung
- [ ] Auswertungen (Produkte, Wartungs-Insights, Umsatz)
- [ ] CSV-Import

**iOS App:**
- [ ] Personalisierte Empfehlungen (basierend auf Boot + Equipment)
- [ ] Wartungs-basierte Produkt-Vorschläge
- [ ] Rabatt-Anzeige im Shop

### Phase 6: API & Skalierung (1-2 Wochen)

- [ ] REST-API (Supabase Edge Functions)
- [ ] API-Key-Management im Provider-Portal
- [ ] Webhook-System für Bestellbenachrichtigungen
- [ ] API-Dokumentation

---

## 11. Kostenübersicht (Testphase)

| Service | Kosten Testphase | Kosten Produktion |
|---|---|---|
| Supabase (Free Tier) | 0€ | 25€/Monat (Pro) |
| Stripe Connect | 0€ (Testmodus) | 1,5% + 0,25€ pro Transaktion |
| Vercel/Hosting Provider-Portal | 0€ (Free Tier) | 0-20€/Monat |
| Supabase Storage (Bilder) | 1 GB frei | 0,021€/GB darüber |
| Push Notifications (APNs) | 0€ | 0€ |
| **Gesamt Testphase** | **0€** | — |

---

## 12. Sicherheits- und Rechtsaspekte

- **PSD2/SCA**: Stripe übernimmt Strong Customer Authentication
- **DSGVO**: Nur notwendige Daten speichern, Löschmöglichkeit, Datenschutzerklärung erweitern
- **Widerrufsrecht**: 14-Tage-Frist für Verbraucher, muss im Checkout angezeigt werden
- **Impressumspflicht**: Provider müssen Impressum hinterlegen
- **AGB**: Neue AGB für Marketplace-Nutzung (BoatCare als Vermittler, nicht als Verkäufer)
- **Rechnungsstellung**: Provider stellt Rechnung an Käufer, BoatCare stellt Provisionsrechnung an Provider

---

## 13. Zusammenfassung der Anforderungen → Lösung

| # | Anforderung | Lösung |
|---|---|---|
| 1 | Produkte einpflegen / API | Provider-Portal: Manuell, CSV, REST-API |
| 2 | Filter + Angebote | Provider-Portal: Rabatt-System mit Filtern |
| 4 | Auswertungen | Provider-Portal: Dashboard mit Statistiken |
| 5 | Auftragseingang über Plattform | Bestellsystem + Echtzeit-Benachrichtigung |
| 6 | Lieferzeit & Verfügbarkeit | Produktdaten: delivery_days, in_stock, stock_quantity |
| 8 | Provider-Stammdaten bearbeiten | Provider-Portal: Stammdaten-Seite |
| 10 | Produkte einstellen | Provider-Portal: Produkt-CRUD |
| 12 | Anfragen beantworten | In-App Messaging-System |
| 13 | Filter-basierte Rabatte | provider_promotions Tabelle + Matching-Logik |
| 14 | Versand über Provider, 7-10% Provision | Stripe Connect Split-Payment, commission_rate pro Provider |
| 15 | Abrechnung direkt bei Zahlung | Stripe Connect: automatischer Split bei Zahlung |
| 16 | Käufer-Daten | Lieferadresse, Telefon, Boot-Zuordnung |
| 17 | Payment in Europa | Stripe Connect (SEPA, Karte, Klarna, Apple Pay) |
| 18 | Keine Kosten in Testphase | Stripe Testmodus, Supabase Free Tier, Vercel Free |
