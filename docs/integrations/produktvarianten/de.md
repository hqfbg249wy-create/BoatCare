## Produktvarianten (Durchmesser, Größe, Farbe)

Manche Produkte gibt es in mehreren Ausführungen, z. B. Tauwerk in verschiedenen
Durchmessern oder Kleidung in Größen und Farben. In Skipily hinterlegst du dafür
**Optionen** (z. B. „Durchmesser") mit **Werten** (z. B. 6mm, 8mm, 10mm). Jede
Kombination ist eine **Variante** mit eigenem Preis, Bestand und optionaler SKU.

Du hast drei Wege:

**1) Im Anbieter-Portal (manuell)**
Öffne das Produkt und gehe zum Abschnitt „Varianten". Lege Optionen und Werte an;
für jede Kombination trägst du Preis, Bestand und SKU ein.

**2) CSV/Excel-Import**
Mehrere Zeilen mit **demselben Produktnamen** ergeben EIN Produkt mit Varianten.
Zusätzliche Spalten:

| Spalte | Bedeutung |
|---|---|
| `variante1_name` | Name der 1. Option, z. B. Durchmesser |
| `variante1_wert` | Wert dieser Zeile, z. B. 8mm |
| `variante2_name` / `variante2_wert` | optional zweite Option (z. B. Farbe) |
| `variante_preis` | Preis dieser Variante |
| `variante_bestand` | Bestand dieser Variante |
| `variante_sku` | Artikelnummer dieser Variante |
| `variante_bild` | optionale Bild-URL der Variante |

Tipp: Über **„Bestand exportieren"** lädst du deinen aktuellen Bestand bereits im
neuen Format herunter, ergänzt Varianten und importierst die Datei wieder.

**3) Produkt-API (POST/PUT)**
Sende `variant_options` (Definition) und `variants` (Kombinationen). `variants`
ersetzt beim POST/PUT **alle** vorhandenen Varianten (leeres Array = löschen):

```json
{
  "name": "Liros Race SK78",
  "price": 100.0,
  "variant_options": [{ "name": "Durchmesser", "values": ["6mm", "8mm"] }],
  "variants": [
    { "attributes": { "Durchmesser": "6mm" }, "price": 100.0, "stock_quantity": 20, "sku": "SK78-6" },
    { "attributes": { "Durchmesser": "8mm" }, "price": 120.0, "stock_quantity": 15, "sku": "SK78-8" }
  ]
}
```

**Bestellungen:** Bei einem Kauf liefern API und Webhook je Position die gewählte
Variante mit: `variant_sku` und die Ausprägungen (`attributes`, z. B.
`{"Durchmesser":"8mm"}`). So weißt du in deinem System genau, welche Variante
bestellt wurde.


## Produktbilder (bis zu 5)

Pro Produkt sind bis zu **5 Bilder** möglich. Im Shop blättert der Kunde per
**Wischen** oder über die **Pfeile** durch die Bilder (iOS und Web). Das erste
Bild ist das **Titelbild**.

**Im Anbieter-Portal:** Unter „Produktbilder" mehrere Bilder hochladen
(Mehrfachauswahl) oder Bild-URLs einfügen. Mit „Als Titelbild" bestimmst du das
erste Bild, mit dem X entfernst du eines.

**CSV/Excel:** Das Titelbild steht in `image_url` (Alias `bild1`). Weitere Bilder
trägst du in diese Spalten ein:

| Spalte | Bedeutung |
|---|---|
| `image_url` / `bild1` | Titelbild (Bild 1) |
| `bild2` | zweites Bild (URL) |
| `bild3` | drittes Bild (URL) |
| `bild4` | viertes Bild (URL) |
| `bild5` | fünftes Bild (URL) |

Beim Export „Bestand exportieren" werden diese Spalten mit ausgegeben, sodass die
Datei 1:1 wieder importierbar ist. Über die Produkt-API füllst du dasselbe über das
Feld `images` (Array von URLs). Hinweis: Bilder werden in der Produktansicht immer
**vollständig** angezeigt (nicht beschnitten), unabhängig vom Seitenverhältnis.
