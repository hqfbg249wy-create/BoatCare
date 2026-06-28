# Polylang einrichten — Schritt-für-Schritt (skipily.app)

Ziel: WordPress-Seite zweisprachig (DE Standard + EN), EN-Inhalte aus
`website-skipily/en/` einfügen. ~30–45 Min.

## 0. Vorbereitung
- [ ] Backup machen (IONOS: „Website sichern" oder Plugin „UpdraftPlus").
- [ ] EN-Dateien bereithalten: `en/skipily-home.html`, `en/skipily-impressum.html`,
      `en/skipily-datenschutz.html`, `en/skipily-agb.html`.

## 1. Plugin installieren
- [ ] WP-Admin → **Plugins → Installieren** → Suche „**Polylang**" → **Installieren** → **Aktivieren**.
- [ ] Der Setup-Assistent startet automatisch (sonst: **Sprachen → Setup**).

## 2. Sprachen anlegen
- [ ] **Sprachen → Sprachen**: **Deutsch** hinzufügen → als **Standardsprache** markieren.
- [ ] **English** hinzufügen.
- [ ] Reihenfolge: Deutsch = 0, English = 1 (Sortierung egal).

## 3. Vorhandene (deutsche) Inhalte der Sprache zuordnen
Polylang fragt im Assistenten: „Bestehende Inhalte der Standardsprache zuweisen?" →
- [ ] **Ja, alles Deutsch zuweisen** bestätigen. (Sonst später: Sprachen → „Inhalte ohne Sprache" → Deutsch zuweisen.)

## 4. URL-Einstellungen
- [ ] **Sprachen → Einstellungen → URL-Änderungen**:
      „Die Sprache wird gesetzt durch den **Verzeichnisnamen in der URL**" → ergibt `skipily.app/en/…`.
- [ ] „Verzeichnis-/Sprachcode für Standardsprache **verbergen**" aktivieren → Deutsch bleibt `skipily.app/…`, Englisch wird `skipily.app/en/…`.
- [ ] **Einstellungen → Permalinks → Speichern** klicken (aktualisiert die Rewrite-Regeln).

## 5. Seiten übersetzen (pro Seite gleich)
Für **Startseite, Impressum, Datenschutz, AGB**:
- [ ] Seite im Editor öffnen → rechte Seitenleiste Block **„Sprachen"** → neben **English** auf **„+"**.
- [ ] In der neuen EN-Seite: Block **„Benutzerdefiniertes HTML"** einfügen → Inhalt der passenden Datei aus `en/` komplett einfügen.
- [ ] Titel + Slug auf Englisch setzen (z. B. „Privacy", Slug `privacy`).
- [ ] **Veröffentlichen**.

Zuordnung:
| DE-Seite | EN-Datei | EN-Slug-Vorschlag |
|---|---|---|
| Startseite | `en/skipily-home.html` | (Front-Page, siehe Schritt 6) |
| Impressum | `en/skipily-impressum.html` | `imprint` |
| Datenschutz | `en/skipily-datenschutz.html` | `privacy` |
| AGB | `en/skipily-agb.html` | `terms` |

## 6. Startseite je Sprache (wichtig!)
Polylang braucht pro Sprache eine eigene Front-Page.
- [ ] Die in Schritt 5 erstellte **EN-Startseite** veröffentlichen.
- [ ] **Sprachen → Einstellungen → „Statische Startseite"**: Polylang verknüpft die
      DE- und EN-Startseite automatisch als Front-Page. Falls nicht: unter
      **Einstellungen → Lesen** die DE-Startseite als Front-Page setzen — die
      EN-Übersetzung wird dann automatisch zur EN-Front-Page.

## 7. Menüs je Sprache
Polylang trennt Menüs pro Sprache, sonst zeigt die EN-Seite deutsche Menüpunkte.
- [ ] **Design → Menüs**: pro Sprache ein Menü (z. B. „Main DE", „Main EN") mit den
      jeweils sprachrichtigen Seiten.
- [ ] Menü-Position „Primär/Header" für **beide** Sprachen zuweisen (Auswahl je Sprache).

## 8. Sprachumschalter einbauen
- [ ] **Design → Widgets** oder Block-Editor → Block/Widget **„Sprachwechsler"** in
      Header oder Menü einfügen. Optionen: Flaggen, Sprachnamen, Dropdown.
- [ ] Alternativ als Menüpunkt: Beim Menü unter „Sprachwechsler" anhaken.

## 9. Testen
- [ ] `skipily.app` → Deutsch. Umschalter → `skipily.app/en/` → Englisch.
- [ ] Impressum/Datenschutz/AGB in EN aufrufbar und korrekt verlinkt (Footer!).
- [ ] Footer-Links (Impressum/Datenschutz/AGB) zeigen je Sprache auf die richtige Seite.
- [ ] Newsletter-Formular auf EN-Home vorhanden (gleichen Shortcode wie DE einsetzen).
- [ ] Quelltext einer EN-Seite prüfen: `<link rel="alternate" hreflang="en" …>` ist
      automatisch da (gut für Google).

## 10. Danach
- [ ] Rechtstexte (EN) **anwaltlich prüfen** lassen; Platzhalter im Impressum/
      Datenschutz (`[Vor- und Nachname]` …) wie in der DE-Fassung füllen.
- [ ] Weitere Sprachen (FR/IT/ES/NL): in Polylang Sprache hinzufügen → übersetzte
      Blöcke einfügen (Übersetzungen liefere ich auf Zuruf).

## Häufige Stolpersteine
- **EN-Seite zeigt deutsches Menü** → Schritt 7 (Menü je Sprache zuweisen).
- **404 unter /en/** → Schritt 4 (Permalinks neu speichern).
- **Startseite EN leer/Blogliste** → Schritt 6 (EN-Front-Page zuweisen).
- **Custom-HTML-Block zeigt Code statt Inhalt** → „Benutzerdefiniertes HTML" verwenden,
  nicht „Absatz"/„Code".
