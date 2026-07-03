# Shopify ↔ Skipily verbinden (Schritt für Schritt)

> **Voraussetzung:** Lies zuerst `00-Skipily-Anbindung-Grundlagen.md` und halte deinen
> **Skipily-API-Schlüssel** bereit. Du brauchst einen Shopify-Login mit Inhaber-/Admin-Rechten.

Wir verbinden beides über das kostenlose No-Code-Werkzeug **Make.com** – alles per Klick,
kein Programmieren.

**Was am Ende funktioniert:**
- Neues/geändertes Produkt in Shopify → erscheint automatisch bei Skipily.
- Bestellung bei Skipily → landet automatisch in Shopify.
- Versand in Shopify (Fulfillment) → Status + Sendungsnummer gehen zurück an Skipily.

Plane **ca. 45 Minuten** ein.

---

## Teil 0 – Vorbereitung (10 Min)

1. **Make.com-Konto** anlegen: https://www.make.com → „Get started free".
2. **Skipily-API-Schlüssel** aus dem Provider-Portal bereitlegen (siehe Grundlagen).
3. Shopify-Verbindung bereitet Make gleich selbst vor – du musst **nichts** manuell in
   Shopify anlegen. Beim ersten Shopify-Baustein wirst du auf deinen Shop weitergeleitet
   und klickst **„Install/Installieren"**, um Make zu erlauben, Produkte und Bestellungen
   zu lesen/schreiben. (Halte deine **Shop-Adresse** bereit, z. B. `dein-shop.myshopify.com`.)

---

## Teil A – Produkte von Shopify zu Skipily schicken (15 Min)

Ziel: Neues/geändertes Produkt in Shopify → automatisch bei Skipily.

1. In **Make.com** oben rechts **„Create a new scenario"**.
2. Auf **„+"** → **„Shopify"** suchen → Baustein **„Watch Products"**.
   - **„Add"** bei Connection → Shop-Adresse eingeben → in Shopify **installieren/bestätigen**.
   - Bei „Watch" **„Created or updated"** wählen.
3. Rechts daneben **„+"** → **„HTTP" → „Make a request"** (Skipily-Aufruf):
   - **URL:** `https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api`
   - **Method:** `POST`
   - **Headers** (je „Add item"):
     - `Authorization` → `Bearer eyJhbGci…` (öffentlicher Wert aus den Grundlagen)
     - `x-api-key` → **dein Skipily-API-Schlüssel**
     - `Content-Type` → `application/json`
   - **Body type:** `Raw` → **JSON (application/json)`
   - **Request content** (Shopify-Felder per Klick einsetzen – die bunten „Chips"):
     ```json
     {
       "name": "{{Title aus Shopify}}",
       "sku": "{{Variant SKU aus Shopify}}",
       "price": "{{Variant Price aus Shopify}}",
       "currency": "EUR",
       "stock_quantity": "{{Inventory Quantity aus Shopify}}",
       "in_stock": true,
       "description": "{{Body HTML / Beschreibung aus Shopify}}"
     }
     ```
4. **Speichern** → **„Run once"** → in Shopify ein Test-Produkt anlegen → Szenario läuft
   grün → Produkt erscheint bei Skipily.
5. Links unten **„Scheduling" auf ON** (z. B. alle 15 Min).

> **Tipp – Änderungen sauber halten:** Speichere die von Skipily zurückgegebene `id` je
> Produkt (z. B. als Shopify-„Metafield"). Für spätere Updates dann **PUT** auf
> `…/products-api?id=DIE-ID`. Für den Start reicht das reine Anlegen.

---

## Teil B – Skipily-Bestellungen in Shopify anlegen (12 Min)

Ziel: Kauf über Skipily → Bestellung automatisch in Shopify. Skipily „klingelt" per
**Webhook** bei einer Make-Adresse.

1. In Make **neues Szenario**.
2. Erster Baustein **„Webhooks" → „Custom webhook"** → **„Add"** → Name
   `Skipily-Bestellungen` → **URL kopieren**.
3. Diese URL bei Skipily hinterlegen: **Provider-Portal → Einstellungen → Integrationen →
   „Webhook-URL für Bestellungen"** → einfügen → speichern.
   *(Kein Feld? URL an support@skipily.app – wir tragen sie ein.)*
4. Zweiter Baustein **„Shopify" → „Create an Order"**. Skipily-Webhook-Felder zuordnen
   (Kunde, Artikel per SKU, Menge, Preis, Lieferadresse).
5. **Speichern** + **Scheduling ON**.
6. **Test:** Test-Bestellung bei Skipily auslösen → erscheint in Shopify.

> **Skipily-Bestell-ID merken** (`order_id` / `order_number` aus dem Webhook) – als Shopify-
> „Note" oder „Metafield" an der Bestellung ablegen. Brauchst du in Teil C.

---

## Teil C – Versand & Tracking an Skipily zurückmelden (10 Min)

Ziel: Versendest du in Shopify (Fulfillment mit Tracking), sieht der Kunde bei Skipily
„versandt" + Sendungsnummer.

1. In Make **neues Szenario**.
2. Erster Baustein **„Shopify" → „Watch Fulfillments"** (oder „Watch Orders" gefiltert auf
   erledigte Sendungen).
3. Zweiter Baustein **„HTTP" → „Make a request"**:
   - **URL:** `https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/orders-api?id={{Skipily-Bestell-ID}}`
   - **Method:** `PUT`
   - **Headers:** dieselben drei wie in Teil A.
   - **Body → Raw → JSON:**
     ```json
     {
       "status": "shipped",
       "tracking_number": "{{Tracking Number aus Shopify}}",
       "tracking_url": "{{Tracking URL aus Shopify}}"
     }
     ```
4. **Speichern**, **Run once** (eine Sendung erstellen), dann **Scheduling ON**.

---

## Fertig! ✅ Kurz-Kontrolle

- [ ] Test-Produkt in Shopify → erscheint bei Skipily (Teil A)
- [ ] Test-Bestellung bei Skipily → erscheint in Shopify (Teil B)
- [ ] Sendung in Shopify → Skipily zeigt „shipped" + Tracking (Teil C)

## Wenn etwas klemmt
- **„401/403":** `x-api-key` oder `Authorization`-Wert falsch/verrutscht – exakt neu kopieren.
- **„400 – name required":** Feld `name` im Body ist leer → Shopify-„Title" neu zuordnen.
- **Bestellung ohne Artikel:** In Shopify muss die **SKU** zum Produkt passen – Artikel
  über die SKU zuordnen.
- **Nichts läuft:** **Scheduling ON?** Szenario in Make aktiv (grün)?
- **Hilfe:** **support@skipily.app** (gern mit Screenshot der Make-Fehlermeldung).
