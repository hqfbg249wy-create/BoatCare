# Skipily Clip — Marina-Aufsteller

Druckfertiger Tisch-Aufsteller mit QR-Code für den App Clip. **Ein QR-Code
funktioniert weltweit** — die Geolokalisierung im Clip zeigt automatisch
Service-Provider in der Nähe der aktuellen Position.

## Dateien

| Datei | Zweck |
|---|---|
| `skipily-clip-aufsteller.html` | Druckfertiges Layout, A5 quer, zum Falten |
| `skipily-clip-qr.svg` | Reiner QR-Code (skalierbar), Inhalt: `https://skipily.app/clip` |
| `skipily-icon.png` | Skipily-Icon 512px für das Layout |

## Drucken

1. **`skipily-clip-aufsteller.html`** im Browser öffnen (Safari oder Chrome)
2. **Drucken** (`Cmd+P`)
3. Wichtige Einstellungen:
   - **Papierformat:** A5 quer (210 × 148 mm)
   - **Skalierung:** 100 % / kein „auf Seite anpassen"
   - **Hintergrundgrafiken drucken:** AN (sonst fehlt der Verlauf)
   - **Ränder:** Keine / Minimum
4. Drucken auf **Karton 250–300 g/m²** für stabile Aufsteller
5. Mittig falten (gepunktete Linie ist der Knick)
6. Aufstellen — funktioniert von beiden Seiten

## Alternative: PDF erzeugen

Im Druck-Dialog statt zu drucken: **„Als PDF sichern"** → ergibt eine
fertige PDF, die du an eine Druckerei (Flyeralarm, Saxoprint etc.)
schicken kannst — z. B. für Größere Mengen für Yachtclubs und Marinas.

## Landing-Page für `skipily.app/clip`

Damit der QR-Code SOFORT funktioniert (auch vor App-Store-Launch), gibt's
ein zweites Code-Snippet das eine Landing-Page mit Geolokalisierung
und Provider-Liste zeigt: **`skipily-clip-landing-snippet.php`**

**Einbau:**

1. WordPress-Admin → **Snippets → Add New**
2. Titel: `Skipily Clip Landing Page`
3. Kompletten Inhalt von `skipily-clip-landing-snippet.php` in das Code-Feld
4. **Save Changes and Activate**

Danach öffnet `https://skipily.app/clip` eine schlanke responsive Seite,
die:
- die Browser-Sprache erkennt (DE/EN/FR/IT/ES/NL)
- Geolokalisierung anfragt
- Provider im 50-km-Umkreis aus Supabase lädt
- mit Distanz + Route-Link zeigt
- am Ende einen App-Store-Hinweis hat

Funktioniert auf iOS, Android, Desktop. Nach App-Store-Launch zeigt
iOS zusätzlich das App-Clip-Banner darüber.

## QR-Code-Inhalt

```
https://skipily.app/clip
```

Funktioniert mit:
- **iOS Camera-App** → tippt auf Banner → App Clip Card erscheint → öffnen
- **Standard-QR-Scanner-Apps** → öffnen URL in Safari → Smart-App-Banner zeigt Clip
- **Android** (ohne Clip) → öffnet skipily.app/clip im Browser → kann nach
  Wunsch eine Web-Fallback-Seite zeigen

## QR-Code in anderen Formaten

SVG ist verlustfrei und skaliert beliebig. Für andere Formate:

```bash
# PNG, hoch aufgelöst (z. B. für Druckmaterial)
python3 -c "
import qrcode
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H,
                   box_size=20, border=2)
qr.add_data('https://skipily.app/clip')
qr.make(fit=True)
img = qr.make_image(fill_color='black', back_color='white')
img.save('skipily-clip-qr-hires.png')
"
```

## Distribution

Ideal für:
- **Yachtclub-Theken**, Hafenmeister-Büros
- **Tankstellen am Hafen**
- **Charterunternehmen-Empfang**
- **Bootsmessen / Stände**
- **Werften-Empfang**

Aufkleber-Variante (für draußen, witterungsfest) lässt sich aus dem
gleichen Layout machen — bei der Druckerei "wetterfeste Folie /
UV-Lackierung" angeben.
