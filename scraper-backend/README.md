# BoatCare Google Search Scraper Backend

Kostenloser Backend-Service zum Scrapen von Google Search Ergebnissen für maritime Service-Provider.

## 🚀 Setup

### 1. Node.js installieren (falls noch nicht vorhanden)

**Via Homebrew:**
```bash
brew install node
```

**Oder:** Download von https://nodejs.org/ (LTS Version)

### 2. Dependencies installieren

```bash
cd /Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/scraper-backend
npm install
```

Dies installiert:
- `express` - Web Server
- `puppeteer` - Headless Chrome Browser (~300MB Download!)
- `cors` - CORS Support für Frontend

### 3. Backend starten

```bash
npm start
```

Backend läuft dann auf: **http://localhost:3001**

## 📡 API Endpoints

### POST /api/google-search

Scrapt Google Search und gibt Ergebnisse zurück.

**Request:**
```json
{
  "query": "Gruissan Yachtservice Motor",
  "language": "fr",
  "country": "fr",
  "maxResults": 20
}
```

**Response:**
```json
{
  "results": [
    {
      "title": "Yachtservice Gruissan - Marine Reparatur",
      "link": "https://example.com",
      "snippet": "Professioneller Yachtservice in Gruissan...",
      "source": "organic"
    }
  ],
  "count": 15
}
```

### GET /health

Health Check Endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "google-scraper",
  "version": "1.0.0"
}
```

## 🧪 Testing

```bash
# Test Health Check
curl http://localhost:3001/health

# Test Google Search
curl -X POST http://localhost:3001/api/google-search \
  -H "Content-Type: application/json" \
  -d '{"query":"Gruissan Yachtservice","language":"fr","country":"fr"}'
```

## 🔧 Development

Mit Nodemon (auto-restart bei Änderungen):
```bash
npm run dev
```

## ⚠️ Wichtige Hinweise

1. **Rate Limiting**: Google kann bei zu vielen Requests blockieren
   - Empfehlung: 1 Sekunde Pause zwischen Requests
   - Anti-Blocking: User-Agent wird automatisch gesetzt

2. **Puppeteer Download**: Beim ersten `npm install` werden ~300MB Chromium heruntergeladen

3. **Firewall**: Port 3001 muss für localhost verfügbar sein

## 🚀 Deployment (Optional)

### Vercel:
```bash
npm install -g vercel
vercel login
vercel --prod
```

### Railway:
```bash
# Erstelle railway.toml
railway up
```

### Lokaler Betrieb:
Starte Backend jedesmal vor Verwendung der Admin-Web-App:
```bash
cd scraper-backend && npm start
```

## 📝 Logs

Backend loggt alle Requests in Console:
- 🔍 Scraping-Start
- ✅ Erfolgreiche Requests
- ❌ Fehler

## 💰 Kosten

**$0/Monat** - Vollständig kostenlos!
- Keine API Keys nötig
- Unbegrenzte Suchen möglich
- Nur lokale Rechenzeit wird benötigt
