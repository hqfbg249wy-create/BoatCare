# Website-Screenshots für skipily.app — Anleitung

Stand: Mai 2026 (Launch-Version)

Die überarbeitete Startseite (`skipily-home.html`) nutzt **6 große Feature-Screenshots**.
Die App-Store-Screenshots können wiederverwendet werden — sie sind in iPhone-Auflösung
und passen perfekt zum Website-Layout.

---

## Übersicht der benötigten Dateien

| Dateiname                       | Was zeigt es                       | Status   |
|---------------------------------|------------------------------------|----------|
| `skipily-logo.png`              | Skipily-Logo (orange Unterstrich)  | bestehend |
| `screenshot-karte.png`          | Map mit Service-Partner-Pins       | bestehend |
| `screenshot-ersatzteile.png` ⭐ | 3-Bucket Spare-Parts-Suche         | **NEU** |
| `screenshot-anfrage.png` ⭐     | Service-Anfrage mit Briefing       | **NEU** |
| `screenshot-wartung.png` ⭐     | Wartungs-Liste mit Ampeln          | **NEU** |
| `screenshot-ki.png`             | KI-Chat zum Boot                   | bestehend |
| `screenshot-bewertungen.png` ⭐ | Provider mit Bewertungen           | **NEU** |

⭐ = **neu** für die überarbeitete Version, müssen aufgenommen werden

Empfohlene Auflösung: **600 × 1300 px** (Portrait, optimiert für Web).
Originale App-Store-Screenshots haben 1290 × 2796 — einfach auf Web-Größe
herunterskalieren (PNG, ~150-300 KB pro Bild).

---

## Was auf jedem Screenshot zu sehen sein soll

### 1. screenshot-karte.png — Service-Partner-Map (Hero)
- Karten-Tab geöffnet
- Mehrere blaue Provider-Pins sichtbar (z. B. Mittelmeer oder DACH-Region)
- Filter-Chip oben aktiviert (z. B. "Werkstatt")
- **Hero-Shot: zeigt die Breite des Netzwerks**

### 2. screenshot-ersatzteile.png ⭐ Killer-Feature
- Aus Equipment "Yanmar 3JH5E" → Shop-Button geklickt
- **Drei farbige Sektionen** sichtbar:
  - ✓ Originalteile (grün)
  - ◉ 1:1 Derivate (blau)
  - + Weitere passende Ausrüstung (orange)
- Reason-Badge auf jedem Treffer
- **Unique Selling Point der App — dieser Screenshot verkauft!**

### 3. screenshot-anfrage.png — Service-Anfrage mit Briefing
- "Neue Anfrage"-Screen (Compose-View)
- Provider oben (z. B. "Marina Hamburg")
- Betreff vorausgefüllt: "Service: Yanmar 3JH5E"
- Nachrichtenfeld zeigt das automatische Briefing:
  ```
  Hallo,
  ich suche Service für folgende Ausrüstung auf meinem Boot "Sea Spirit":

  Bezeichnung: Yanmar 3JH5E Impeller Kit
  Hersteller: Yanmar
  Modell: 3JH5E
  Teilenummer: 129670-42531
  ...
  ```
- Foto-Anhang sichtbar
- Sende-Button prominent

### 4. screenshot-wartung.png — Status-Ampeln
- Wartungs-Tab geöffnet
- Mix aus 3 Status-Kategorien:
  - 🔴 **Überfällig**: "Impeller — 12 Tage überfällig"
  - 🟡 **Bald fällig**: "Ölwechsel — in 23 Tagen"
  - 🟢 **OK**: "Anodenwechsel — in 4 Monaten"
- Verschiedene Equipment-Typen gemischt (Motor, Segel, etc.)

### 5. screenshot-ki.png — KI-Assistent
- Chat-View
- User-Frage: "Wie wechsle ich den Impeller bei meiner Yanmar 3JH5E?"
- KI-Antwort: 4-5 Schritte mit Sicherheitshinweis
- Falls Plus-User: "Schadens-Foto-Analyse"-Hinweis sichtbar

### 6. screenshot-bewertungen.png ⭐ Vertrauenssignal
- Provider-Detailseite (z. B. echte Werft oder Beispiel)
- 5-Sterne-Durchschnitt prominent
- 3-5 Bewertungstexte sichtbar (echte oder Beispiel-Bewertungen)
- "Anfrage senden"-Button prominent

---

## Aufnahme-Workflow

### Option A — App-Store-Screenshots wiederverwenden (empfohlen)

Du hast die App-Store-Screenshots schon. Die kannst du 1:1 nutzen:

1. **Vorschau** oder **Photoshop / Affinity** öffnen
2. Auf 600 px Breite skalieren (Web-Qualität reicht)
3. Als PNG mit dem Dateinamen oben speichern
4. In WordPress hochladen unter **Medien → Datei hinzufügen**

### Option B — Frisch aus dem Simulator

Falls neue Aufnahmen nötig (z. B. weil die Ersatzteile-Funktion in den
App-Store-Screenshots noch nicht enthalten war):

```bash
# Status-Bar pinnen (9:41, voller Akku — Apple-Standard)
xcrun simctl status_bar booted override --time "9:41" \
  --batteryState charged --batteryLevel 100 \
  --wifiBars 3 --cellularBars 4

# App im Simulator starten
# Pro Screen: Cmd+S → Datei landet auf Desktop
```

Device-Empfehlung: **iPhone 16 Pro Max** (Konsistenz mit App-Store-Set).

---

## In WordPress einbauen

1. Alle PNGs hochladen in **Medien → Datei hinzufügen**
2. Pfade in `skipily-home.html` sind als `/wp-content/uploads/<filename>.png`
   referenziert — funktioniert in den meisten WordPress-Setups direkt
3. Falls WordPress Jahr/Monat-Subfolder nutzt (z. B. `/2026/05/`):
   - Entweder die echten URLs aus der Mediathek kopieren und im HTML ersetzen
   - Oder die Mediathek-Einstellung "Organize uploads into month- and year-based folders" temporär deaktivieren

---

## Optional: Marketing-Polish

Für noch professionelleren Look (wie bei Top-Apps im Store):

- Tool-Empfehlung: **Figma** (kostenlos), **Screenshots.pro**, oder **appmockup.com**
- Pattern: iPhone-Frame um den Screenshot + Headline darüber + Skipily-Brand-Farbe (orange) als Akzent
- Tipp: Die Frame-Variante eignet sich besser für Landing-Pages, pure Screenshots wirken besser in der App-Store-Listing

Pure Screenshots wirken aber auch sehr sauber — die meisten Utility-Apps machen das genau so.
