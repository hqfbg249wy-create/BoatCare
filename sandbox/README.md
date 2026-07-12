# Skipily Provider-Sandbox (Testumgebung)

Eine **eigenständige** Web-App, in der Provider alle wichtigen Skipily-Funktionen
gefahrlos ausprobieren können. **Vollständig getrennt von der Produktivumgebung:**
keine Supabase-Verbindung, keine echten Zahlungen, keine echten API-Calls — alles
läuft auf reinen Mock-/Simulationsdaten im Browser.

## Was simuliert wird

- **Shop (App-Ansicht als Web-App):** Produkte aller Kategorien durchsuchen,
  filtern, in den Warenkorb legen, Checkout simulieren (inkl. Versandkosten-Logik).
- **Ausrüstung & Matching:** Bauteile des Demo-Boots mit **allen Wartungsstufen**
  (in Ordnung / bald fällig / überfällig) und dem **Equipment→Produkt-Matching**
  aus der Suche:
  - **Originalteil** (Artikelnummer-Treffer, Score 100)
  - **Passendes Derivat** (Hersteller/Modell, Score 60–99)
  - **Sinnvolle Ergänzung** (Kategorie, Score < 60)
- **Provider-Funktionen:**
  - **Shopify- / WooCommerce-Anbindung (simuliert):** Shop-URL + API-Key eingeben
    → Beispielprodukte werden „importiert" und erscheinen sofort im Shop und in
    der Ausrüstungssuche.
  - **Sendcloud-Versand (simuliert):** Konto verbinden/trennen.
  - **Produktverwaltung:** Produkte manuell anlegen.

## Lokal starten

```bash
cd sandbox
npm install
npm run dev
```

## Bauen / Deployen

```bash
npm run build     # erzeugt dist/
```

Deploy als eigenes, statisches Vercel-Projekt (bewusst **getrennt** von den
Produktiv-Portalen; `noindex`). Es werden keinerlei Umgebungsvariablen/Secrets
benötigt.

## Wichtig

Die Daten in `src/data.js` sind Beispiel-/Simulationsdaten. Diese App darf **nie**
mit Produktiv-Credentials verbunden werden — sie ist ein reines Demonstrations-
und Testwerkzeug.
