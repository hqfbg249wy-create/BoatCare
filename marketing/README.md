# Skipily Marketing Assets

Print-ready PDFs für **Endkunden**, **Provider** und **Geschäfts-Aufkleber**.
Sechs Sprachen je Flyer: DE / EN / FR / IT / ES / NL.

## Übersicht

| Asset | Format | Anzahl | Druckempfehlung |
|---|---|---|---|
| Endkunden-Flyer | A6 (105×148 mm) + 3 mm Anschnitt | 6 | 135 g/m² seidenmatt, beidseitig optional |
| Provider-Flyer | A6 (105×148 mm) + 3 mm Anschnitt | 6 | 135 g/m² seidenmatt |
| Geschäfts-Aufkleber | A6-Seite mit 80 mm Ø Stanzkontur | 1 | Vinyl matt, witterungsbeständig |

**Gesamt: 13 PDFs, alle print-ready mit Anschnitt.**

## Dateien

```
marketing/
├── README.md                          ← diese Datei
├── brand-spec.md                      ← Farbsystem, Typografie, Logo-Use
├── flyer-endkunden/
│   ├── endkunden-de.pdf
│   ├── endkunden-en.pdf
│   ├── endkunden-fr.pdf
│   ├── endkunden-it.pdf
│   ├── endkunden-es.pdf
│   └── endkunden-nl.pdf
├── flyer-provider/
│   ├── provider-de.pdf
│   ├── provider-en.pdf
│   ├── provider-fr.pdf
│   ├── provider-it.pdf
│   ├── provider-es.pdf
│   └── provider-nl.pdf
├── sticker/
│   └── sticker-multilang.pdf
└── _src/
    ├── i18n.py       ← Texte, alle Sprachen — hier ändern
    └── generate.py   ← Layout-Code — `python3 marketing/_src/generate.py`
```

## QR-Codes

Alle QR-Codes zeigen auf **Smart-Links** auf skipily.app, die je nach Device
weiterleiten — kein Risiko falls App-Store-IDs sich ändern:

| Flyer | QR-Code | Ziel |
|---|---|---|
| Endkunden | "App Store" QR | `skipily.app/ios` → Apple App Store |
| Endkunden | "Google Play" QR | `skipily.app/android` → Google Play Store |
| Provider | Großer QR | `skipily.app/provider` → Provider-Anmeldung |
| Aufkleber | Mittlerer QR | `skipily.app/ios` → App Store |

**Vor Druck unbedingt einrichten:**
1. Setze auf skipily.app eine Redirect-Logik für `/ios`, `/android`, `/provider`
2. Teste alle QR-Codes mit Handy bevor du an die Druckerei gibst

## Druckerei-Vorgaben

- **Anschnitt (Bleed):** 3 mm rundum (bereits in PDFs enthalten)
- **Sicherheitsabstand:** 4 mm zum Endformat
- **Farbraum:** RGB (Druckerei konvertiert in CMYK; bei Premium-Auftrag CMYK
  liefern lassen oder PDF in Affinity/Acrobat konvertieren)
- **Auflösung Bitmap-Anteile (Logo):** 1024×1024 px = 240+ dpi bei 18 mm Logo-Größe ✅

**Empfohlene Druckdienste mit Online-Upload:**
- diedruckerei.de / saxoprint.de / flyeralarm.com / vistaprint.de
- Format wählen: "A6 Flyer einseitig" oder "Visitenkarte 105×148"
- Aufkleber: "Konturschnitt-Sticker Ø 80 mm" oder "Stanzform-Aufkleber"

## In Affinity Publisher 2 nachbearbeiten

Falls du noch was anpassen willst:

1. **Affinity Publisher 2 öffnen** → Datei → Neu → A6, 3 mm Anschnitt
2. **PDF importieren:** Datei → Platzieren → z.B. `endkunden-de.pdf`
3. **Text editieren:** Texte werden als Pfade importiert (nicht editierbar).
   Für editierbare Texte lieber:
   - `_src/i18n.py` öffnen → Texte ändern
   - `python3 marketing/_src/generate.py` → neue PDFs
4. **Logo austauschen:** Falls neues Logo vorhanden → in `_src/generate.py`
   `ICON_PATH` auf neue Datei zeigen lassen, dann regenerieren
5. **Speichern als** `.afpub` für eigene Bearbeitung

## Texte ändern / Neusprache hinzufügen

In `_src/i18n.py` sind alle Texte zentral:

```python
ENDKUNDEN["de"] = {
    "headline": "Mehr aus deinem Boot herausholen.",
    "features": [
        ("KI-Bordingenieur", "Stell jede Frage..."),
        ...
    ],
}
```

Anpassen → `python3 marketing/_src/generate.py` → PDFs sind neu generiert.

## Was fehlt / Nice-to-have

- [ ] Endgültiger App-Store-Direktlink statt Smart-Redirect
- [ ] Echtes Google-Play-Listing (aktuell Platzhalter)
- [ ] DSGVO-Hinweis auf Endkunden-Flyer falls in DE/AT vertrieben
- [ ] Impressum-Mini-Print auf Rückseite (falls 2-seitig gedruckt)
- [ ] Branded Provider-Sticker "Skipily Partner" für Werkstätten (anders als
      Geschäfts-Aufkleber)

## Regenerieren

```bash
cd /Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare
python3 marketing/_src/generate.py
```

Benötigt: `pip3 install reportlab "qrcode[pil]"`
