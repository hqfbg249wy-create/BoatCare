## Productvarianten (diameter, maat, kleur)

Sommige producten bestaan in meerdere uitvoeringen, bijv. touw in verschillende
diameters of kleding in maten en kleuren. In Skipily leg je **opties** vast (bijv.
"Diameter") met **waarden** (bijv. 6mm, 8mm, 10mm). Elke combinatie is een
**variant** met eigen prijs, voorraad en optionele SKU.

Drie manieren:

**1) In het aanbiedersportaal (handmatig)**
Open het product en ga naar de sectie "Varianten". Voeg opties en waarden toe; vul
voor elke combinatie prijs, voorraad en SKU in.

**2) CSV/Excel-import**
Meerdere regels met **dezelfde productnaam** vormen ÉÉN product met varianten.
Extra kolommen:

| Kolom | Betekenis |
|---|---|
| `variante1_name` | naam van de 1e optie, bijv. Diameter |
| `variante1_wert` | waarde van deze regel, bijv. 8mm |
| `variante2_name` / `variante2_wert` | optionele tweede optie (bijv. kleur) |
| `variante_preis` | prijs van deze variant |
| `variante_bestand` | voorraad van deze variant |
| `variante_sku` | SKU van deze variant |
| `variante_bild` | optionele afbeeldings-URL van de variant |

Tip: met "Voorraad exporteren" download je je huidige producten al in het nieuwe
formaat, voeg je varianten toe en importeer je het bestand opnieuw.

**3) Product-API (POST/PUT)**
Stuur `variant_options` (definitie) en `variants` (combinaties). Bij POST/PUT
vervangt `variants` **alle** bestaande varianten (lege array = verwijderen):

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

**Bestellingen:** bij een aankoop geven de API en de webhook per regel de gekozen
variant mee: `variant_sku` en de kenmerken (`attributes`, bijv.
`{"Durchmesser":"8mm"}`). Zo weet jouw systeem precies welke variant is besteld.


## Productafbeeldingen (tot 5)

Tot **5 afbeeldingen** per product zijn mogelijk. In de shop bladert de klant door de
afbeeldingen door te **vegen** of met de **pijlen** (iOS en web). De eerste
afbeelding is de **omslag**.

**In het leveranciersportaal:** upload onder „Productafbeeldingen" meerdere
afbeeldingen (meervoudige selectie) of plak afbeeldings-URL's. Met „Als omslag
instellen" kies je de eerste afbeelding, met de X verwijder je er een.

**CSV/Excel:** de omslag staat in `image_url` (alias `bild1`). Zet extra afbeeldingen
in deze kolommen:

| Kolom | Betekenis |
|---|---|
| `image_url` / `bild1` | omslag (afbeelding 1) |
| `bild2` | tweede afbeelding (URL) |
| `bild3` | derde afbeelding (URL) |
| `bild4` | vierde afbeelding (URL) |
| `bild5` | vijfde afbeelding (URL) |

„Voorraad exporteren" neemt deze kolommen mee, zodat het bestand 1:1 opnieuw
importeerbaar is. Via de product-API vul je hetzelfde met het veld `images` (array
van URL's). Let op: afbeeldingen worden in de productweergave altijd **volledig**
getoond (nooit bijgesneden), ongeacht de verhouding.
