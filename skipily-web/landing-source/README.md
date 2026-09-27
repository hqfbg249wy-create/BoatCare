# Skipily Landingpage – Quelle & Ablauf

Die **bearbeitbare** Startseite von skipily.app lebt als **Claude-Design-Canvas**
(nur Deutsch = Master). Alle anderen Sprachen und die Live-Seite werden daraus
erzeugt.

## Wo liegt was
- **Bearbeitbare Seite (Master, Deutsch):** Claude-Design-Canvas
  `https://claude.ai/code/artifact/d4a87ad2-0e65-41b4-ab60-7a63e11bb7c5`
  (privat in Ekkeharts Claude-Konto; anmelden → bearbeiten → **Speichern**).
- **Quell-Schnappschuss (versioniert):** `de/Main.dc.html` + `de/media/`.
  Das ist ein Abzug des Canvas-Standes zum Zeitpunkt des letzten Deploys – die
  „echte" Quelle ist der Canvas, dies dient als Backup/Historie.
- **Live-Seite:** `skipily-web/dist/` (index.html DE + en/fr/it/es/nl.html + media/),
  Deploy per `skipily-web/deploy.sh <VERCEL_TOKEN>`.

## Der „Knopf": Deutsch ändern → in 5 Sprachen live
Gewählter Ablauf = **Claude als Knopf** (kein API-Key nötig):

1. In der Canvas die **deutsche** Seite bearbeiten, **Speichern**.
2. Claude Bescheid geben: **„übersetzen & live"**.
3. Claude erledigt dann:
   - liest die gespeicherte Canvas-Version (Artifact `read` → `--extract`),
   - baut daraus die deutsche Live-Seite (helmet→head, Video-Poster→YouTube-iframe,
     Bild-Basisnamen→`media/`),
   - **übersetzt** die geänderten Texte nach EN/FR/IT/ES/NL,
   - erzeugt alle 6 Seiten, spielt sie nach `dist/` und deployt.

## Feste Regeln
- **Keine KI-Gedankenstriche (—).** Statt `—` Doppelpunkt/Komma/Punkt je nach Kontext.
- Video-Startbild = Skipily-Logo. Rechts-/FAQ-/Preis-Unterseiten in `dist/` NICHT
  überschreiben (die kommen aus `build.js`).
- `node build.js` erzeugt die ALTE Startseite – nach einem Build die neue
  Landingpage wieder nach `dist/` legen (Backup: `dist/index.html.pre-redesign.bak`).

## Hilfsskripte (Referenz)
`flatten.py`, `make_artboards_all.py`, `inject_responsive.py` – erzeugen aus dem
x-dc-Quellformat die Canvas-Artboards bzw. die statischen Live-Seiten und spielen
den responsiven Stylesheet ein.
