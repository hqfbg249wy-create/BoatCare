# Skipily.app — WordPress Setup auf IONOS

Schritt-für-Schritt-Anleitung, um die komplette Website aus den Dateien in diesem
Ordner in dein WordPress auf IONOS einzubauen.

---

## Dateien in diesem Paket

| Datei                        | Zweck                                             |
|------------------------------|---------------------------------------------------|
| `skipily-home.html`          | Komplette Startseite (Hero, Features, CTAs)       |
| `skipily-datenschutz.html`   | Datenschutzerklärung                              |
| `skipily-agb.html`           | AGB                                               |
| `skipily-impressum.html`     | Impressum                                         |
| `skipily-style.css`          | Design (Orange + Navy, Responsive)                |

---

## Schritt 1 — Medien hochladen

WordPress Admin → **Medien → Datei hinzufügen**. Lade hoch:

- **Logo**: Screenshot des SKIPILY-Logos (das mit orange Unterstrich) → umbenennen in `skipily-logo.png`
- **Screenshot 1 (Karte)** → `screenshot-karte.png` *(„Service-Partner finden")*
- **Screenshot 2 (KI-Chat)** → `screenshot-ki.png` *(„Boots-Assistent")*
- **Screenshot 3 (Suche)** → `screenshot-suche.png` *(„Yanmar-Suche")*
- **Screenshot 4 (Shop)** → `screenshot-shop.png` *(„Ersatzteile bestellen")*

Falls WordPress die Dateinamen leicht anders vergibt, die `<img src="…">` in
`skipily-home.html` entsprechend anpassen. Der Pfad ist typischerweise
`/wp-content/uploads/2026/04/…` — am einfachsten nach dem Upload in der Medienbibliothek
auf das Bild klicken → „Datei-URL kopieren" → in der HTML ersetzen.

---

## Schritt 2 — Globales CSS einbauen

WordPress Admin → **Design → Customizer → Zusätzliches CSS**.

Öffne `skipily-style.css`, kopiere **den kompletten Inhalt** und füge ihn in das
Customizer-Feld ein. → **Veröffentlichen**.

Damit steht das Skipily-Design (Orange + Navy, Schriften, Buttons) auf allen Seiten zur
Verfügung, ohne dass ein spezielles Theme nötig ist.

---

## Schritt 3 — Seiten anlegen

Für jede der vier Seiten gleich vorgehen:

1. **Seiten → Erstellen**
2. Titel eingeben *(z. B. „Start", „Datenschutz", „AGB", „Impressum")*
3. Im Block-Editor oben links auf **+** → nach **„Benutzerdefiniertes HTML"** suchen
   und Block einfügen
4. Inhalt der entsprechenden `.html`-Datei komplett hineinkopieren
5. **Veröffentlichen**

| Seite       | Datei                        | Permalink              |
|-------------|------------------------------|------------------------|
| Start       | `skipily-home.html`          | `/` *(als Startseite)* |
| Datenschutz | `skipily-datenschutz.html`   | `/datenschutz`         |
| AGB         | `skipily-agb.html`           | `/agb`                 |
| Impressum   | `skipily-impressum.html`     | `/impressum`           |

---

## Schritt 4 — Startseite festlegen

**Einstellungen → Lesen → Eine statische Seite** → Homepage: „Start" auswählen
→ **Speichern**.

---

## Schritt 5 — Menü & Footer

### Menü (Design → Menüs)
Neues Menü anlegen, „Hauptmenü" → Seiten hinzufügen:
- Start
- Datenschutz
- AGB
- Impressum

Als **Primary Menu** (oder „Kopfzeile") zuordnen.

### Footer
Wenn dein Theme einen Footer-Widget-Bereich hat: **Design → Widgets → Footer** →
HTML-Widget mit:

```html
<p style="text-align:center; color:#6B7280;">
  © 2026 Skipily ·
  <a href="/impressum">Impressum</a> ·
  <a href="/agb">AGB</a> ·
  <a href="/datenschutz">Datenschutz</a> ·
  <a href="mailto:info@skipily.app">info@skipily.app</a>
</p>
```

---

## Schritt 6 — Platzhalter ersetzen

In **Impressum**, **AGB** und **Datenschutz** stehen noch eckige Klammern:

- `[Dein Vor- und Nachname]`
- `[Strasse und Hausnummer]`
- `[PLZ Ort]`
- `[Deine Telefonnummer]`
- `[DE XXXXXXXXX]` *(Umsatzsteuer-ID, falls vorhanden — sonst Block löschen)*

Diese in der jeweiligen Seite ersetzen und **aktualisieren**.

---

## Schritt 7 — Newsletter-Formular (optional)

Das Formular in `skipily-home.html` (Abschnitt „Bleib informiert") ist rein visuell.
Für echten Versand:

- IONOS bietet kostenlosen Newsletter-Service → Shortcode einfügen
- Oder Plugin installieren: **Brevo (Sendinblue)** / **Mailchimp for WP** / **Newsletter**
- Den `<form>…</form>`-Block in `skipily-home.html` durch den Plugin-Shortcode ersetzen
  *(z. B. `[newsletter_form]`)*.

---

## Schritt 8 — SSL & Apple-Review

- **IONOS-Admin → Domains → skipily.app → SSL** → *Let's Encrypt* aktivieren
  *(kostenlos, meist schon automatisch gesetzt)*
- Teste `https://skipily.app/datenschutz` im Browser — die URL muss im App-Store-Connect
  als „Privacy Policy URL" hinterlegt werden.
- Als „Support URL" kann vorerst `https://skipily.app/` angegeben werden; dort ist
  `info@skipily.app` als Kontakt sichtbar.

---

## Design-Werte (für Feinjustierung)

| Rolle            | Hex        |
|------------------|------------|
| Primary Orange   | `#f97316`  |
| Orange hover     | `#ea580c`  |
| Orange soft      | `#fdba74`  |
| Navy (Hero)      | `#0B1D3A`  |
| Navy deep        | `#081327`  |
| Hellgrau BG      | `#F5F7FA`  |
| Fließtext        | `#1F2937`  |
| Muted / Hint     | `#6B7280`  |

Diese können jederzeit im Customizer (Zusätzliches CSS) über die CSS-Variablen oben
in `skipily-style.css` (`--sk-orange`, `--sk-navy` …) global angepasst werden.

---

## Checkliste vor Apple-Einreichung

- [ ] `https://skipily.app/` lädt die Startseite
- [ ] `https://skipily.app/datenschutz` zeigt Datenschutz (alle Platzhalter ersetzt)
- [ ] `https://skipily.app/agb` zeigt AGB
- [ ] `https://skipily.app/impressum` zeigt Impressum mit echter Adresse
- [ ] Alle Links im Footer funktionieren
- [ ] SSL-Zertifikat aktiv (Schloss-Symbol im Browser)
- [ ] E-Mail `info@skipily.app` empfangsbereit
- [ ] Datenschutz-URL in App Store Connect hinterlegt
