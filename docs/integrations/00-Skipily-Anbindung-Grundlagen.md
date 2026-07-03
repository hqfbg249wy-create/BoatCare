# Skipily-Shop-Anbindung – Grundlagen (bitte zuerst lesen)

Diese Anleitungen zeigen dir, wie du deinen bestehenden Online-Shop bzw. dein
Warenwirtschafts-/ERP-System mit **Skipily** verbindest – **ohne Programmierkenntnisse**.

Es gibt separate Schritt-für-Schritt-Anleitungen:
- `01-WooCommerce.md`
- `02-Shopify.md`
- `03-Odoo-ERP.md`

---

## Was wird eigentlich verbunden? (in einfachen Worten)

Stell dir Skipily wie einen **Marktplatz auf der Landkarte** vor, auf dem Bootseigner
Betriebe und Produkte finden. Damit dein Shop dort mitspielt, tauschen zwei Systeme
automatisch Daten aus – in **zwei Richtungen**:

1. **Deine Produkte → Skipily** (damit Kunden sie finden)
   Immer wenn du ein Produkt anlegst oder änderst, wird es zu Skipily „gemeldet".

2. **Bestellungen ↔ zurück**
   - **Skipily → dein System:** Kauft jemand bei dir über Skipily, bekommst du sofort
     eine Bestellung (per **Webhook**).
   - **Dein System → Skipily:** Wenn du versendest, meldest du **Status + Sendungs­nummer**
     zurück, damit der Kunde den Versand sieht.

Zwei Fachbegriffe – ganz einfach erklärt:
- **API** = eine „Steckdose" bei Skipily, in die dein System Daten hineinschieben
  (Produkte) oder herausholen (Bestellungen) kann.
- **Webhook** = ein „Klingelknopf". Passiert etwas (z. B. neue Bestellung), drückt
  Skipily automatisch die Klingel bei deinem System – du musst nicht ständig nachschauen.

Zum Verbinden nutzen wir ein **No-Code-Werkzeug** als „Übersetzer" zwischen den Systemen:
**[Make.com](https://www.make.com)** (kostenloser Tarif reicht zum Start; Alternative: Zapier).
Damit klickst du die Verbindung zusammen, statt zu programmieren.

---

## Was du EINMALIG brauchst (für alle Anleitungen gleich)

1. **Dein Skipily-API-Schlüssel** (identifiziert deinen Betrieb)
   - Anmelden auf **https://provider.skipily.app**
   - **Einstellungen → Integrationen / API** öffnen → **API-Schlüssel anzeigen/erstellen**
   - Sieht aus wie eine lange Zeichenkette. **Geheim halten** (wie ein Passwort).
   - *Findest du den Bereich nicht?* → kurze Mail an **support@skipily.app**, wir schalten
     ihn frei (nötig ist der **Pro-/Enterprise-Tarif** oder eine Freischaltung).

2. **Die Skipily-Adressen** (die trägst du später ein – hier einmal gesammelt):

   | Zweck | Adresse (URL) | Methode |
   |---|---|---|
   | Produkt anlegen | `https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api` | POST |
   | Produkt ändern | `…/products-api?id=PRODUKT-ID` | PUT |
   | Bestellungen abrufen | `…/functions/v1/orders-api` | GET |
   | Versand/Tracking melden | `…/orders-api?id=BESTELL-ID` | PUT |

3. **Zwei „Kopfzeilen" (Header)**, die bei JEDEM Aufruf mitgeschickt werden. Kopiere sie
   später 1:1 in Make/Zapier:

   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ
   x-api-key: DEIN-SKIPILY-API-SCHLUESSEL
   Content-Type: application/json
   ```
   - Der **`Authorization`-Wert ist öffentlich** und für alle gleich (Türöffner zum Skipily-Tor).
   - Der **`x-api-key` ist DEIN geheimer Schlüssel** aus Schritt 1 (sagt Skipily, wer du bist).

---

## Skipily-Produktfelder (welche Daten wandern rüber)

Beim Anlegen/Ändern eines Produkts kannst du diese Felder senden (alle optional außer
**name**):

| Skipily-Feld | Bedeutung | Beispiel |
|---|---|---|
| `name` | Produktname (Pflicht) | „Impeller Jabsco 1210-0001" |
| `sku` | deine Artikelnummer | „IMP-1210" |
| `part_number` | Teile-/Herstellernummer | „1210-0001" |
| `manufacturer` | Hersteller | „Jabsco" |
| `price` | Preis (Zahl) | 24.90 |
| `currency` | Währung | „EUR" |
| `stock_quantity` | Lagerbestand | 45 |
| `in_stock` | lieferbar? (true/false) | true |
| `shipping_cost` | Versandkosten | 4.90 |
| `delivery_days` | Lieferzeit in Tagen | 3 |
| `ean` | EAN/Barcode | „400123…" |
| `weight_kg` | Gewicht | 0.3 |
| `description` | Beschreibung | „Original-Impeller …" |

Merke dir die **Skipily-Produkt-ID**, die beim Anlegen zurückkommt (Feld `id`) – die
brauchst du zum späteren **Ändern** (PUT).

---

## Bestellungen: Status & Rückmeldung

- **Bestell-Status** bei Skipily: `pending` → `confirmed` → `shipped` → `delivered`
  (oder `cancelled`).
- **Versand zurückmelden** (PUT `orders-api?id=…`), Beispiel-Inhalt:
  ```json
  { "status": "shipped", "tracking_number": "00340123…", "tracking_url": "https://…" }
  ```

---

## Der rote Faden (gilt für alle drei Systeme)

1. **API-Schlüssel holen** (oben).
2. **Make.com-Konto** anlegen (kostenlos).
3. **Produkte → Skipily:** In Make ein „Szenario" bauen: *Auslöser = neues/geändertes
   Produkt in deinem Shop* → *Aktion = Skipily-API aufrufen (products-api)*.
4. **Bestellungen ← Skipily:** In Make ein zweites Szenario: *Auslöser = Skipily-Webhook
   (neue Bestellung)* → *Aktion = Bestellung in deinem Shop/ERP anlegen*.
5. **Versand → Skipily:** Drittes Szenario: *Auslöser = Sendung erstellt* → *Aktion =
   Skipily-API `orders-api` (Status „shipped" + Tracking)*.
6. **Testen** mit einem Test-Produkt und einer Test-Bestellung.

Die drei Detail-Anleitungen führen dich für dein System **Klick für Klick** durch genau
diese Schritte.

> **Wichtig:** Behandle den `x-api-key` wie ein Passwort. Wer ihn hat, kann in deinem
> Namen Produkte anlegen. Nicht per E-Mail/Chat weitergeben, nicht in Screenshots zeigen.
