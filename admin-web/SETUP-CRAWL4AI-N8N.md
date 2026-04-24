# BoatCare Crawl4AI + N8N Setup

Scraping-Pipeline für maritime Service-Provider via Website-Crawling.
Kostenlos, lokal, mit automatischer robots.txt-Prüfung.

---

## Architektur

```
Admin UI → N8N (Port 5678) → robots.txt prüfen → Crawl4AI Service (Port 8765) → Supabase
```

---

## Schritt 1: Crawl Service installieren und starten

Der Service hat zwei Modi – je nach Python-Version:

### Option A: Sofort (Python 3.9, bereits vorhanden)
```bash
# Einmalig installieren:
pip3 install beautifulsoup4 lxml

# Service starten (bei jeder Nutzung):
cd /Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/admin-web
python3 crawl4ai_service.py
```
→ Läuft im **BeautifulSoup-Modus** (kein JavaScript-Rendering, aber für die meisten Sites ausreichend)

### Option B: Mit vollem Browser-Rendering (Python 3.10+)
```bash
# Python 3.11 via Homebrew installieren:
brew install python@3.11

# Crawl4AI installieren:
python3.11 -m pip install crawl4ai playwright
python3.11 -m playwright install chromium

# Service starten:
python3.11 crawl4ai_service.py
```
→ Läuft im **Crawl4AI-Modus** (JavaScript-fähig, bessere Extraktion)

Der Service erkennt automatisch welcher Modus verfügbar ist.
Läuft auf `http://localhost:8765`.

**Endpunkte:**
- `GET /health` – Status prüfen
- `POST /robots-check` – robots.txt prüfen (`{ "url": "https://..." }`)
- `POST /crawl` – Website crawlen (`{ "url": "https://..." }`)

---

## Schritt 2: N8N installieren und starten

```bash
# N8N starten (einmalig installieren, danach direkt starten):
npx n8n
```

N8N öffnet sich unter `http://localhost:5678`.

**Wichtig:** Beim ersten Start Account anlegen (nur lokal, keine Cloud nötig).

---

## Schritt 3: N8N Workflow importieren

1. N8N öffnen: http://localhost:5678
2. Oben rechts: **"+"** → **"Import from file"**
3. Datei wählen: `n8n-workflow-marine-scraper.json`
4. Workflow wird importiert

**Supabase API Key setzen:**
1. In N8N: Settings → Credentials → Environment Variables
2. Variable anlegen: `SUPABASE_ANON_KEY` = (aus config.js kopieren)

5. Workflow aktivieren: Toggle oben rechts auf **"Active"**

---

## Schritt 4: Admin-UI nutzen

1. Admin-UI öffnen (index.html)
2. Navigation: **"Auto-Suche"**
3. Abschnitt: **"🤖 Crawl4AI + N8N Scraping"**

### Status prüfen
Grüner Bereich zeigt ob Crawl4AI und N8N laufen.
Falls ❌: Services in Terminal starten (Schritte 1 & 2).

### Websites crawlen
1. **URLs eintragen** – eine Website pro Zeile
   Tipp: Website-URLs aus Google Maps kopieren (Betrieb → Website)
2. **Stadt, Land, Kategorie** auswählen
3. **"🛡️ robots.txt prüfen"** – zeigt an ob Crawling erlaubt ist
4. **"🚀 Crawling via N8N starten"** – startet den Prozess

### Ergebnis
- Grün ✅: Provider wurde gecrawlt und in Supabase gespeichert
- Grau ⏭️: Übersprungen (robots.txt verboten oder Crawl-Fehler)

---

## Typischer Workflow für "Zone Technique" Betriebe

Das Problem: Nominatim kennt keine Adresse "Zone Technique du Port".
Die Lösung: Website des Betriebs crawlen statt Adresse suchen.

1. Google Maps öffnen: "Werkstätten Frontignan Hafen"
2. Betriebe anklicken → Website-URL kopieren
3. URL in Crawl4AI-Feld eintragen
4. Stadt: "Frontignan", Land: "Frankreich", Kategorie: "Werkstatt"
5. Crawlen → Kontaktdaten werden automatisch extrahiert
6. Danach Koordinaten manuell via "🗺️ In Google Maps suchen" setzen

---

## robots.txt Erklärung

| Status | Bedeutung |
|--------|-----------|
| ✅ Erlaubt | Kein robots.txt oder Crawling explizit erlaubt |
| 🚫 Verboten | `Disallow: /` in robots.txt – nicht automatisch crawlen |

**Rechtlicher Hinweis:** robots.txt ist kein Gesetz, aber respektierter Standard.
Bei 🚫 können Daten trotzdem manuell eingetragen werden.

---

## Troubleshooting

**Crawl4AI startet nicht:**
```bash
pip install --upgrade crawl4ai playwright
playwright install --with-deps chromium
```

**N8N Webhook nicht erreichbar:**
- Ist N8N gestartet? `npx n8n`
- Ist Workflow aktiviert? (Toggle in N8N)
- Richtige URL: `http://localhost:5678/webhook/marine-scraper`

**Keine Daten extrahiert:**
- Manche Websites blockieren automatische Anfragen
- Kontaktdaten manuell in Admin-UI eintragen

**Supabase Insert schlägt fehl:**
- SUPABASE_ANON_KEY in N8N Environment Variables setzen
- RLS Policy erlaubt nur authenticated inserts → Service-Account nötig
