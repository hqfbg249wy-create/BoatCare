# BoatCare Admin Panel

Webbasierte Administrator-Oberfläche für die Verwaltung von ServiceProvidern und Änderungsanfragen.

## Features

### ✅ 1. Dashboard
- Übersicht über alle wichtigen Statistiken
- Anzahl ServiceProvider
- Ausstehende Änderungsanfragen
- Heute genehmigte Anfragen
- Letzte Aktivitäten

### ✅ 2. Änderungsanfragen verwalten
- Anzeige aller Änderungsvorschläge von Usern
- Filterung nach Status (Ausstehend, Genehmigt, Abgelehnt)
- Detailansicht mit Alt/Neu-Vergleich
- Genehmigen oder Ablehnen mit optionalem Grund
- Automatische Aktualisierung der ServiceProvider-Daten

### ✅ 3. ServiceProvider-Verwaltung
- Übersicht aller ServiceProvider
- Suchfunktion (Name, Stadt, Kategorie)
- Detailansicht einzelner Provider
- Provider löschen
- Vollständige Informationen anzeigen

### ✅ 4. Neue ServiceProvider hinzufügen
- Formular mit allen relevanten Feldern
- Automatische Geocodierung (Koordinaten aus Adresse)
- Unterstützung für Leistungen und Marken
- Kategorien-Auswahl

### ✅ 5. Automatische Suche
- Sequentielle Suche in definierbarem Radius
- Kleiner Suchradius für lokale Handwerksbetriebe
- Verwendung von OpenStreetMap/Overpass API
- Grid-basierte Suche für vollständige Abdeckung
- Automatische Duplikat-Erkennung
- Gefundene Betriebe direkt hinzufügen

### ✅ 6. Suchfunktion
- Suche nach Name, Stadt oder Kategorie
- Echtzeit-Filterung
- Übersichtliche Darstellung

## Installation

### 1. Dateien vorbereiten

Kopieren Sie alle Dateien in einen Webserver-Ordner:
- index.html
- styles.css
- app.js
- config.js

### 2. Konfiguration anpassen

Bearbeiten Sie `config.js`:

```javascript
const SUPABASE_CONFIG = {
    url: 'https://ihre-project-id.supabase.co',
    anonKey: 'ihr-anon-key'
};
```

**WICHTIG:** Die Anon-Key ist sicher, da alle Operationen durch RLS geschützt sind!

### 3. .gitignore erstellen

Erstellen Sie eine `.gitignore` Datei:
```
config.js
.DS_Store
```

### 4. Admin-Rolle vergeben

Führen Sie in Supabase SQL Editor aus:

```sql
UPDATE profiles
SET role = 'admin'
WHERE email = 'ihre-admin-email@example.com';
```

### 5. Webserver starten

#### Option A: Lokaler Test
```bash
cd admin-web
python3 -m http.server 8000
```
Dann öffnen: http://localhost:8000

#### Option B: Production (z.B. Netlify, Vercel)
1. Repository erstellen (ohne config.js!)
2. Bei Netlify/Vercel deployen
3. Environment Variables setzen:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. config.js für Production anpassen

#### Option C: Eigener Server
```bash
# Nginx Example
sudo cp -r admin-web /var/www/boatcare-admin
# Nginx Config für HTTPS nicht vergessen!
```

## Nutzung

### Login
- Öffnen Sie die Admin-Seite
- Melden Sie sich mit Ihren Supabase-Credentials an
- Nur User mit `role = 'admin'` haben Zugriff

### Änderungsanfragen prüfen
1. Klicken Sie auf "Änderungsanfragen"
2. Sehen Sie alle ausstehenden Anfragen
3. Klicken Sie auf eine Anfrage für Details
4. Genehmigen oder Ablehnen Sie die Änderung

### Provider hinzufügen
1. Klicken Sie auf "Provider hinzufügen"
2. Füllen Sie das Formular aus
3. Nutzen Sie "Koordinaten ermitteln" für Geocoding
4. Speichern

### Automatische Suche
1. Klicken Sie auf "Auto-Suche"
2. Geben Sie einen Startpunkt ein (Stadt oder Koordinaten)
3. Konfigurieren Sie:
   - **Suchradius**: 5km empfohlen für lokale Betriebe
   - **Schrittweite**: 3km für dichte Abdeckung
   - **Suchbereich**: Gesamtbereich um Startpunkt
4. Wählen Sie Kategorien
5. Starten Sie die Suche
6. Fügen Sie gefundene Betriebe hinzu

#### Empfohlene Einstellungen:
- **Stadtgebiet**: Radius 5km, Schritt 3km, Bereich 50km
- **Küstenregion**: Radius 10km, Schritt 5km, Bereich 100km
- **Großflächig**: Radius 5km, Schritt 10km, Bereich 200km

### Provider suchen
1. Klicken Sie auf "ServiceProvider"
2. Nutzen Sie die Suchleiste
3. Klicken Sie auf einen Provider für Details
4. Löschen Sie Provider bei Bedarf

## API-Nutzung

### OpenStreetMap Nominatim
- **Kostenlos**, keine API-Key nötig
- Für Geocoding (Adresse → Koordinaten)
- Rate Limit: 1 Request/Sekunde
- Bereits konfiguriert

### Overpass API
- **Kostenlos**, keine API-Key nötig
- Für automatische Suche nach Betrieben
- OpenStreetMap Datenbank
- Rate Limit: Beachten Sie Pausen zwischen Requests

### Alternative: Google Maps API
Falls Sie Google Maps bevorzugen:
1. API-Key bei Google Cloud Console erstellen
2. Geocoding API aktivieren
3. In `config.js` eintragen:
   ```javascript
   const GOOGLE_MAPS_API_KEY = 'ihr-key';
   const USE_NOMINATIM = false;
   ```

## Sicherheit

### RLS Policies
Alle Datenbank-Operationen sind durch Row Level Security geschützt:
- Nur Admins können Provider hinzufügen/löschen
- Nur Admins können Suggestions genehmigen/ablehnen
- Anon-Key ist sicher für Client-Side Code

### Best Practices
- ✅ Nutzen Sie HTTPS für Production
- ✅ config.js NICHT in Git committen
- ✅ Environment Variables für Production
- ✅ Regelmäßige Backups der Datenbank
- ✅ Admin-Rechte nur an vertrauenswürdige Personen

## Troubleshooting

### "Not authenticated"
- Prüfen Sie ob Sie eingeloggt sind
- Prüfen Sie Admin-Rolle in Datenbank
- Löschen Sie Browser-Cache und versuchen Sie erneut

### Geocoding funktioniert nicht
- Prüfen Sie Internet-Verbindung
- Nominatim Rate Limit überschritten → Warten Sie 1 Minute
- Adresse zu ungenau → Fügen Sie mehr Details hinzu

### Auto-Suche findet nichts
- OpenStreetMap hat nicht alle Betriebe
- Versuchen Sie größeren Radius
- Prüfen Sie ob Overpass API erreichbar ist
- Betriebe können manuell hinzugefügt werden

### Provider kann nicht gelöscht werden
- Prüfen Sie ob Provider in anderen Tabellen referenziert ist
- Cascade-Delete sollte funktionieren
- Überprüfen Sie Datenbank-Constraints

## Deployment

### Netlify
```bash
# netlify.toml
[build]
  publish = "admin-web"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Environment Variables in Netlify Dashboard setzen.

### Vercel
```json
// vercel.json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

### Docker
```dockerfile
FROM nginx:alpine
COPY admin-web /usr/share/nginx/html
EXPOSE 80
```

## Support

Bei Fragen oder Problemen:
1. Prüfen Sie die Browser Console (F12)
2. Prüfen Sie Supabase Logs
3. Überprüfen Sie RLS Policies

## Roadmap

Geplante Features:
- [ ] Bulk-Import von Providern (CSV)
- [ ] Erweiterte Statistiken und Charts
- [ ] E-Mail-Benachrichtigungen bei neuen Anfragen
- [ ] Multi-Admin-Support mit Rollen
- [ ] Backup/Export-Funktion
- [ ] Provider-Duplikate automatisch erkennen
- [ ] Integration mit weiteren Datenquellen

## Lizenz

Proprietär - Teil der BoatCare App
