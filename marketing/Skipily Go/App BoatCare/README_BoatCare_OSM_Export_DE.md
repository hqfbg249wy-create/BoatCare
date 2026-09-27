# BoatCare – Europa Servicebetriebe-CSV aus OpenStreetMap (OSM)

Du wolltest >10.000 Einträge „für ganz Europa“. Das lässt sich realistisch nur automatisiert erzeugen – dafür ist OpenStreetMap + Overpass API die pragmatischste Datenquelle.

Diese kleine Pipeline erzeugt eine CSV in genau dem von dir gewünschten Schema:

**Name, Straße, Hausnummer, PLZ, Ort, Land, Email, Telefonnummer, Website, Produktkategorien**

## Voraussetzungen

- Python 3.10+
- Pakete: `requests`

Installation:
```bash
python3 -m pip install --upgrade requests
```

## Nutzung (Komplett Europa)

```bash
python3 boatcare_osm_europa_export.py --countries EUROPE --out boatcare_servicebetriebe_europa.csv
```

Je nach Overpass-Last kann das länger dauern. Du kannst die Länder auch in Blöcken abrufen:

```bash
python3 boatcare_osm_europa_export.py --countries DE,FR,NL,BE,IT,ES,PT --out boatcare_westeuropa.csv
python3 boatcare_osm_europa_export.py --countries SE,NO,DK,FI,EE,LV,LT --out boatcare_nordeuropa.csv
```

## Ausschlüsse (Charter & Gebrauchtboot-Handel)

Das Script schließt Charter / Rental und Gebrauchtboot-Handel *heuristisch* aus:
- über typische OSM-Tags (boat_rental)
- zusätzlich über Namensmuster („charter“, „gebraucht“, „broker“ …)

Das ist nötig, weil OSM-Tags nicht überall konsistent sind.


## Produktkategorien (Mapping) – standardisiert für BoatCare

Das Script schreibt `Produktkategorien` als **kontrolliertes Vokabular** (Semikolon-separiert), damit du in BoatCare sauber filtern kannst.
Aktuelle Kategorienliste (in fester Reihenfolge, wenn vorhanden):

- Motor
- Segelmacher
- Persenning
- Polster/Sattlerei
- Werften
- Service/Repair
- Kran
- Klimaanlage
- Heizung
- Kühlung
- Elektrik/Elektronik
- Navigation/Instrumente
- Rigg
- Tauwerk
- Beschläge
- Anker/Deck
- Sanitär
- Hydraulik
- Farben/Pflege
- GFK/Composite
- Metallbau
- Trailer/Transport
- Bootszubehör
- Rettungsmittel
- Etc.

Du kannst die Zuordnung in `map_categories()` erweitern (Keywords/Brands) oder verschlanken, je nachdem wie BoatCare die Kategorien anzeigen soll.
