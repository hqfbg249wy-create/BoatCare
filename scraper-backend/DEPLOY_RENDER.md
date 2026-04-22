# Skipily Scraper — Deploy auf Render.com

## Voraussetzungen
- Repo liegt auf GitHub (oder Render kann aus lokalem Upload deployen)
- Render-Account (kostenlos) auf https://render.com

## Schritt 1 — Repo vorbereiten
Die Anpassungen sind bereits erledigt:
- `server.js` liest `process.env.PORT` (Render setzt das automatisch)
- CORS ist auf `admin.skipily.app` + localhost beschränkt
- `app.listen` bindet an `0.0.0.0`
- `/health` Endpoint für Render Health-Checks
- `render.yaml` liegt bei (Blueprint-Deploy)

## Schritt 2 — Render Web Service anlegen
1. Render Dashboard → **New** → **Web Service**
2. GitHub-Repo verbinden → `scraper-backend` auswählen (oder falls Monorepo: Root Directory = `scraper-backend`)
3. Einstellungen:
   - **Name**: `skipily-scraper`
   - **Region**: Frankfurt
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (schläft nach 15 Min Inaktivität — für Produktion: Starter 7$/Monat)

## Schritt 3 — Environment Variables setzen
Unter **Environment → Add Environment Variable**:

| Key | Value | Woher? |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | `AIza...` | Google Cloud Console → Credentials |
| `SUPABASE_URL` | `https://vcjwlyqkfkszumdrfvtm.supabase.co` | Supabase Projekt-URL |
| `SUPABASE_ANON_KEY` | `eyJ...` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | Supabase → Settings → API → service_role **(geheim!)** |

## Schritt 4 — Deploy
Create Web Service → Render zieht das Repo, baut und startet.
Log sollte zeigen: `🚀 Skipily Places Scraper v4.0 läuft auf Port 10000` (Render vergibt dynamisch).

## Schritt 5 — Smoke-Test
```bash
curl https://skipily-scraper.onrender.com/health
# → {"status":"ok","service":"boatcare-places-scraper","version":"4.0.0",...}
```

## Schritt 6 — admin-web umstellen
In `admin-web/app.js` ist der Default bereits:
```js
'https://skipily-scraper.onrender.com'
```
Falls deine Render-URL abweicht, entweder:
- (A) die Zeile anpassen → admin-web auf Vercel redeployen, oder
- (B) in `admin-web/config.js` hinzufügen:
  ```js
  window.SCRAPER_BACKEND_URL = 'https://dein-custom-name.onrender.com';
  ```

## Wichtig
- **Free-Tier schläft** nach 15 Min ohne Request → erster Scrape braucht ~30 s Cold Start.
- **Google Places Quota** im Auge behalten (täglich 200$ kostenloses Kontingent).
- **Service-Role-Key rotieren** wenn er je im Repo war.
