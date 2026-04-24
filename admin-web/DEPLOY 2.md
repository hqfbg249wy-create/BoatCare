# BoatCare Admin Panel - Deployment Anleitung

## Zusammenfassung

Die Admin-Website ist vollständig entwickelt mit allen Features:
- ✅ Dashboard mit Statistiken
- ✅ Änderungsanfragen verwalten (genehmigen/ablehnen)
- ✅ ServiceProvider anzeigen/bearbeiten/löschen
- ✅ Neue Provider hinzufügen
- ✅ Auto-Suche über OpenStreetMap

**Problem:** Die Buttons funktionieren nicht in Safari beim lokalen Testen (wahrscheinlich Safari CSP oder Security Policy).

**Lösung:** Deployment auf einem echten Webserver (siehe unten).

## Option 1: Deployment auf Netlify (Empfohlen - Kostenlos)

### Schritt 1: Netlify Account erstellen
1. Gehe zu https://www.netlify.com
2. Melde dich mit GitHub an (oder erstelle einen Account)

### Schritt 2: Deployment vorbereiten

```bash
cd /Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/admin-web

# Erstelle .gitignore wenn nicht vorhanden
echo "config.js" > .gitignore

# Erstelle eine Beispiel-Config
cat > config.example.js << 'EOF'
// Kopiere diese Datei zu config.js und trage deine echten Werte ein
const SUPABASE_CONFIG = {
    url: 'DEINE_SUPABASE_URL',
    anonKey: 'DEIN_SUPABASE_ANON_KEY'
};
const USE_NOMINATIM = true;
EOF
```

### Schritt 3: Deployment

**Drag & Drop:**
1. Gehe zu https://app.netlify.com/drop
2. Ziehe den `admin-web` Ordner in das Fenster
3. Netlify hostet die Seite automatisch

**Oder mit Netlify CLI:**
```bash
# Installiere Netlify CLI
npm install -g netlify-cli

# Deploye
cd /Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/admin-web
netlify deploy --prod
```

### Schritt 4: Config anpassen
Nach dem Deployment:
1. Erstelle `config.js` mit deinen echten Supabase-Credentials
2. Deploye erneut

**Wichtig:** Füge in Netlify unter "Site Settings" > "Environment Variables" die Supabase-Keys hinzu, damit config.js automatisch generiert wird.

## Option 2: Deployment auf Vercel (Alternativ - Kostenlos)

```bash
# Installiere Vercel CLI
npm install -g vercel

# Deploye
cd /Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/admin-web
vercel --prod
```

## Option 3: Deployment auf eigenem Server

### Mit Apache:
```bash
# Kopiere Dateien
scp -r admin-web/* user@deinserver.de:/var/www/html/admin/

# Apache Config
<VirtualHost *:80>
    ServerName admin.boatcare.de
    DocumentRoot /var/www/html/admin

    <Directory /var/www/html/admin>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

### Mit Nginx:
```nginx
server {
    listen 80;
    server_name admin.boatcare.de;
    root /var/www/admin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Option 4: Lokales Testing (mit besserem Server)

Statt Python's HTTP-Server, verwende einen besseren:

### Mit Node.js (http-server):
```bash
# Installiere http-server
npm install -g http-server

# Starte Server
cd /Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/admin-web
http-server -p 8080 --cors
```

### Mit PHP:
```bash
cd /Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/admin-web
php -S localhost:8080
```

## Sicherheitshinweise

1. **config.js NIEMALS committen!**
   - Enthält sensible Supabase-Keys
   - Ist bereits in .gitignore

2. **HTTPS verwenden in Production:**
   - Netlify/Vercel geben automatisch HTTPS
   - Für eigenen Server: Let's Encrypt verwenden

3. **CORS konfigurieren:**
   - Supabase Dashboard > Settings > API
   - Füge deine Domain zu "Allowed Origins" hinzu

## Supabase RLS Policies

Stelle sicher, dass folgende SQL-Scripts ausgeführt wurden:
- `database/008_fix_admin_rls.sql` - Behebt Admin-Berechtigungen

## Troubleshooting

### Buttons funktionieren nicht
- **Ursache:** Safari Content Security Policy bei file:// oder localhost
- **Lösung:** Deploye auf echtem Webserver (Netlify/Vercel)

### "Invalid API key" Fehler
- **Ursache:** Falscher oder abgelaufener Supabase Key
- **Lösung:** Überprüfe config.js mit Keys aus Supabase Dashboard

### Login funktioniert nicht
- **Ursache:** RLS Policies blockieren Zugriff
- **Lösung:** Führe 008_fix_admin_rls.sql aus

### Dashboard zeigt keine Daten
- **Ursache:** Datenbank ist leer
- **Lösung:** Füge Provider über die iOS-App oder "Provider hinzufügen" hinzu

## Nächste Schritte

1. **Deploye auf Netlify/Vercel** (5 Minuten)
2. **Füge admin.boatcare.de zu Supabase CORS hinzu**
3. **Teste alle Features**
4. **Füge erste ServiceProvider hinzu**

## Support

Bei Problemen:
1. Überprüfe Browser Console (F12)
2. Überprüfe Supabase Logs
3. Teste mit Chrome statt Safari
