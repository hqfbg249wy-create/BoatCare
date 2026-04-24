# Skipily.app Website – IONOS + WordPress + Elementor Setup

## Uebersicht der erstellten Dateien

| Datei | Inhalt |
|-------|--------|
| `landing-page-content.html` | Komplette Landing Page (Hero, Features, Provider-CTA, Newsletter, Footer) |
| `impressum.html` | Impressum gemaess § 5 TMG — **[]-Platzhalter ausfuellen!** |
| `agb.html` | Allgemeine Geschaeftsbedingungen fuer die App |
| `datenschutz.html` | Datenschutzerklaerung gemaess DSGVO |

---

## Schritt 1: WordPress bei IONOS einrichten

1. **IONOS Login** → https://login.ionos.de
2. Gehe zu **Hosting** → **Managed WordPress** (oder **Webspace** falls bereits bestellt)
3. Falls noch nicht vorhanden: **WordPress installieren**
   - Domain: `skipily.app` auswaehlen
   - Admin-Benutzername + Passwort festlegen
   - Sprache: Deutsch
4. **SSL aktivieren** (sollte bei IONOS automatisch sein)
   - Pruefe unter Domains → SSL → `skipily.app` hat Zertifikat
   - In WordPress: Einstellungen → Allgemein → beide URLs auf `https://skipily.app`

## Schritt 2: Elementor installieren

1. **WordPress Admin** → `https://skipily.app/wp-admin`
2. **Plugins** → **Installieren** → suche "Elementor"
3. **Elementor Website Builder** installieren und aktivieren
4. Optional: **Starter Templates** Plugin installieren (liefert fertige Vorlagen)

## Schritt 3: Theme konfigurieren

1. **Design** → **Themes** → installiere **"Hello Elementor"** (minimales Theme, ideal fuer Elementor)
2. Aktivieren
3. Optional: IONOS liefert manchmal ein eigenes Theme — Hello Elementor ist besser fuer Elementor

## Schritt 4: Seiten anlegen

Erstelle folgende **4 Seiten** unter **Seiten** → **Erstellen**:

### 4.1 Startseite (Landing Page)
1. Neue Seite → Titel: "Startseite"
2. Template: **Elementor Canvas** (kein Header/Footer vom Theme)
3. Klick **"Mit Elementor bearbeiten"**
4. Baue die Sections aus `landing-page-content.html` nach:

#### Hero Section
- **Abschnitt** hinzufuegen → Volle Breite
- **Hintergrund**: Farbe `#0B1D3A` (oder eigenes Foto mit Overlay 70% dunkel)
- **Heading Widget**: "Dein Boot. Dein Assistent. Deine Community." → H1, weiss, zentriert
- **Text Widget**: Untertitel-Text
- **Button Widget**: "Bald im App Store verfuegbar" → Hintergrund `#FFD700`, Text `#0B1D3A`
- **Button Widget**: "Benachrichtige mich zum Launch" → Hintergrund `#0066FF`, Link zu `#notify`
- **Abstand**: oben/unten 100px

#### Features Section (6 Kacheln)
- **Abschnitt** → 3 Spalten
- Pro Spalte: **Icon Box Widget**
  - Icon: passend (Anker, Schraubenschluessel, Roboter, Einkaufswagen, Weltkugel, Glocke)
  - Titel + Beschreibung aus der HTML-Datei
- Darunter: nochmal 3 Spalten fuer Features 4-6
- Hintergrund: weiss

#### "Fuer wen" Section
- **Abschnitt** → 2 Spalten
- Links: **Image Widget** (App-Screenshot einfuegen)
- Rechts: **Heading** + **Text** + **Icon List Widget** (Checkmarks)
- Hintergrund: `#F5F7FA`

#### Provider Section
- **Abschnitt** → Volle Breite, Hintergrund `#0B1D3A`
- **Heading**: "Sie sind Service-Provider?" weiss
- **Text**: Beschreibung
- **Button**: "Jetzt als Provider registrieren" → mailto:provider@skipily.app

#### Newsletter Section (id: notify)
- **Abschnitt** → Content-Breite
- **Heading**: "Bleib informiert"
- **Form Widget** (Elementor Pro) oder **WPForms** (kostenlos):
  - 1 Feld: E-Mail
  - Submit: "Benachrichtigen"
  - **Alternative ohne Formular-Plugin**: Button → mailto:info@skipily.app?subject=Launch-Benachrichtigung

#### Footer Section
- **Abschnitt** → Volle Breite, Hintergrund `#1A1A1A`
- **Text Widget**: © 2026 Skipily – Links zu /impressum, /agb, /datenschutz
- **Text Widget**: info@skipily.app

5. **Veroeffentlichen**

### 4.2 Impressum
1. Neue Seite → Titel: "Impressum"
2. Mit Elementor bearbeiten ODER im klassischen Editor
3. Inhalt aus `impressum.html` einfuegen (HTML-Block oder Text einfuegen)
4. **WICHTIG: Alle []-Platzhalter durch deine echten Daten ersetzen!**
5. Veroeffentlichen

### 4.3 AGB
1. Neue Seite → Titel: "AGB"
2. Inhalt aus `agb.html` einfuegen
3. **[]-Platzhalter ersetzen!**
4. Veroeffentlichen

### 4.4 Datenschutz
1. Neue Seite → Titel: "Datenschutz"
2. Inhalt aus `datenschutz.html` einfuegen
3. **[]-Platzhalter ersetzen!**
4. Veroeffentlichen

## Schritt 5: Startseite festlegen

1. **Einstellungen** → **Lesen**
2. "Deine Startseite zeigt" → **Eine statische Seite**
3. Startseite: **Startseite** auswaehlen
4. Speichern

## Schritt 6: Permalinks

1. **Einstellungen** → **Permalinks**
2. Waehle: **Beitragsname** (`/beispiel-beitrag/`)
3. Speichern
4. Pruefe: `skipily.app/impressum`, `skipily.app/agb`, `skipily.app/datenschutz`

## Schritt 7: Feinschliff

### Favicon / Site Icon
1. **Design** → **Customizer** → **Website-Identitaet**
2. Skipily-Logo als Favicon hochladen (512x512 PNG)

### Cookie-Banner (DSGVO)
- Plugin **"Complianz"** (kostenlos) installieren
- Konfiguriere: "Nur technisch notwendige Cookies"
- Zeigt einen minimalen Banner

### SEO
- Plugin **"Yoast SEO"** installieren (kostenlos)
- Startseite: SEO-Titel = "Skipily – Die App fuer Bootseigner"
- Meta-Description = "Verwalte dein Boot, finde Service-Partner und Ersatzteile. Mit KI-Assistent. Bald im App Store."

### Google Search Console (optional)
- https://search.google.com/search-console
- Property `skipily.app` hinzufuegen
- IONOS DNS → TXT-Record zur Verifizierung

---

## Zusammenfassung: Was du ausfuellen/ersetzen musst

In ALLEN 3 Rechtstexten (Impressum, AGB, Datenschutz):
- `[Dein Vor- und Nachname]`
- `[Strasse und Hausnummer]`
- `[PLZ Ort]`
- `[Deine Telefonnummer]`
- `[DE XXXXXXXXX]` (USt-ID, falls vorhanden, sonst Block entfernen)

---

## Spaeters Upgrade zur vollen Website

Wenn Skipily live geht, kannst du die Landing Page erweitern:
- App-Store-Badge mit echtem Link
- Testimonials / Reviews
- Feature-Screenshots aus der App
- Blog/News-Bereich
- Provider-Verzeichnis (oeffentlich durchsuchbar)
