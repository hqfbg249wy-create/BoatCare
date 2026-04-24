# 🌍 Global Marine Business Scraping - Komplettanleitung

## Ziel

**Automatisches Finden von maritimen Betrieben weltweit** für die BoatCare-App.

Nicht manuell, sondern intelligent und skalierbar!

## 🚀 Die Lösung: Multi-Source Aggregation

### Was wird verwendet?

1. **Overpass API (OpenStreetMap)** - Strukturierte maritime Tags
2. **Nominatim (OSM Geocoding)** - Keyword-basierte Suche
3. **Intelligente Kategorisierung** - Automatische Zuordnung zu BoatCare-Kategorien

### Was findet es?

✅ **Werkstätten & Werften** (`craft=boatbuilder`, `industrial=shipyard`)
✅ **Segelmacher** (`craft=sailmaker`, Namen mit "voile", "segel")
✅ **Rigger** (`craft=rigger`, "gréement", "rigg")
✅ **Zubehör-Shops** (`shop=boat`, `shop=marine`, "accastillage", "shipchandler")
✅ **Instrumente** ("elektronik", "navigation", "GPS")
✅ **Tankstellen** (`amenity=fuel` + `fuel:marine=yes`)
✅ **Marinas** (`leisure=marina`, "port", "hafen")

## 📋 Scripts

### 1. `global_marine_scraper.py`

**Einzelner Ort:**
```bash
python3 global_marine_scraper.py "Cap d'Agde, France" 15
```

**Parameter:**
- Argument 1: Ort (z.B. "Hamburg, Germany")
- Argument 2: Radius in km (Standard: 10)

**Output:**
- `global-providers.json` - Alle gefundenen Provider

**Beispiel:**
```bash
python3 global_marine_scraper.py "Barcelona, Spain" 20
# Findet ~50-100 Provider in Barcelona + Umkreis 20km
```

### 2. `scrape_europe.py`

**Ganzes Europa (80+ Häfen):**
```bash
python3 scrape_europe.py
```

**Test-Modus (3 Orte):**
```bash
python3 scrape_europe.py --test
```

**Was passiert:**
- Scraped systematisch alle wichtigen Häfen Europas
- Speichert Zwischenstände pro Region
- Finale Ausgabe: `europe_all_providers.json`

**Dauer:** Ca. 2-3 Stunden für ganz Europa (mit Rate Limiting)

**Regionen:**
- 🇫🇷 France Mediterranean (13 Häfen)
- 🇫🇷 France Atlantic (7 Häfen)
- 🇪🇸 Spain Mediterranean (6 Häfen)
- 🇮🇹 Italy (6 Häfen)
- 🇭🇷 Croatia (4 Häfen)
- 🇬🇷 Greece (4 Häfen)
- 🇩🇪 Germany (4 Häfen)
- 🇳🇱 Netherlands (3 Häfen)
- 🇬🇧 UK (4 Häfen)
- 🇸🇪 🇩🇰 🇳🇴 Scandinavia (5 Häfen)

## 🔄 Integration in die App

### Schritt 1: Scraping durchführen

```bash
# Test mit einem Ort
python3 global_marine_scraper.py "Cap d'Agde, France" 15

# Oder ganz Europa
python3 scrape_europe.py
```

### Schritt 2: Provider ins Admin-Panel importieren

Die JSON-Datei enthält alle Provider im richtigen Format:

```json
{
  "providers": [
    {
      "name": "Sud Croisaire",
      "category": "Zubehör",
      "coordinates": [43.2953, 3.5142],
      "address": "Quai Jean Miquel",
      "postal_code": "34300",
      "city": "Cap d'Agde",
      "country": "France",
      "phone": "+33 4 67 12 34 56",
      "website": "http://www.example.com"
    }
  ]
}
```

### Schritt 3: Bulk-Import ins Admin-Panel

Erstelle einen Bulk-Import-Button im Admin-Panel:

```javascript
async function bulkImportProviders(jsonData) {
    const providers = jsonData.providers;

    for (const provider of providers) {
        try {
            await supabaseClient
                .from('service_providers')
                .insert([{
                    name: provider.name,
                    category: provider.category,
                    street: provider.address,
                    postal_code: provider.postal_code,
                    city: provider.city,
                    country: provider.country,
                    latitude: provider.coordinates[0],
                    longitude: provider.coordinates[1],
                    phone: provider.phone,
                    website: provider.website
                }]);
        } catch (error) {
            console.error(`Fehler bei ${provider.name}:`, error);
        }
    }
}
```

## 📊 Erwartete Ergebnisse

**Pro Hafen:**
- Kleine Häfen: 10-30 Provider
- Mittlere Häfen: 30-80 Provider
- Große Häfen: 80-200 Provider

**Ganz Europa:**
- **Geschätzt: 3.000-6.000 Provider**

**Kategorien-Verteilung:**
- Werkstatt: ~40%
- Marinas: ~25%
- Zubehör: ~20%
- Instrumente: ~5%
- Segelmacher: ~5%
- Tankstellen: ~3%
- Rigg: ~2%

## 🌐 Erweiterung auf die Welt

### Karibik

```python
CARIBBEAN_PORTS = [
    "Charlotte Amalie, Virgin Islands",
    "Bridgetown, Barbados",
    "St. Martin",
    "Antigua",
    ...
]
```

### USA

```python
USA_PORTS = [
    "Miami, Florida",
    "Fort Lauderdale, Florida",
    "San Diego, California",
    "Newport, Rhode Island",
    ...
]
```

### Mittelmeer Ost

```python
EASTERN_MED_PORTS = [
    "Istanbul, Turkey",
    "Bodrum, Turkey",
    "Cyprus",
    ...
]
```

## ⚙️ Konfiguration & Optimierung

### Rate Limiting anpassen

In `global_marine_scraper.py`:

```python
time.sleep(1)  # Nominatim: 1 Sekunde zwischen Requests
time.sleep(5)  # Zwischen Orten: 5 Sekunden
```

**Schneller (riskanter):**
```python
time.sleep(0.5)  # Vorsicht: Kann zu Blocks führen!
```

**Langsamer (sicherer):**
```python
time.sleep(2)   # Für große Batch-Jobs
```

### Suchradius anpassen

```python
# Kleine Häfen
scraper.scrape_location("Cap d'Agde", radius_km=5)

# Große Städte
scraper.scrape_location("Hamburg", radius_km=20)

# Regionen
scraper.scrape_location("French Riviera", radius_km=50)
```

### Kategorisierung verbessern

Füge weitere Keywords hinzu in `detect_category()`:

```python
# Beispiel: Kran-Services
if any(x in name_lower for x in ['kran', 'crane', 'grue']):
    return 'Sonstige'
```

## 🐛 Troubleshooting

### "Too Many Requests" Error

**Problem:** Overpass API blockiert wegen zu vieler Requests

**Lösung:**
```python
time.sleep(10)  # Längere Pause zwischen Orten
```

### Keine Ergebnisse gefunden

**Problem:** Ort nicht in OSM oder falsche Schreibweise

**Lösung:**
```python
# Versuche verschiedene Namen
"Cap d'Agde, France"
"Agde, France"
"Port Richelieu, Cap d'Agde"
```

### Zu viele irrelevante Ergebnisse

**Problem:** Viele Touristen-Büros, Restaurants, etc.

**Lösung:** Filtere in `scrape_location()`:
```python
# Ignoriere bestimmte Namen
blacklist = ['office de tourisme', 'tourist info', 'restaurant']
if not any(bl in name.lower() for bl in blacklist):
    providers.append(provider)
```

## 📈 Next Steps

1. **Teste mit einem Hafen:**
   ```bash
   python3 global_marine_scraper.py "Cap d'Agde, France" 15
   ```

2. **Prüfe die Qualität:**
   - Öffne `global-providers.json`
   - Sind die Kategorien korrekt?
   - Sind die Koordinaten plausibel?

3. **Scraped eine Region:**
   ```bash
   python3 scrape_europe.py --test
   ```

4. **Vollständiges Europa:**
   ```bash
   python3 scrape_europe.py
   # Lass es über Nacht laufen
   ```

5. **Import ins Admin-Panel:**
   - Bulk-Import-Funktion erstellen
   - `europe_all_providers.json` importieren
   - In Supabase hochladen

6. **Weltweit expandieren:**
   - Erweitere `PORTS` um Karibik, USA, Asien
   - Führe erneut aus

## 🎯 Zusammenfassung

**Statt manuell:** Automatisches Scraping von OSM/Nominatim
**Statt einzeln:** Batch-Processing für ganze Regionen
**Statt lokal:** Skalierbar für die ganze Welt

**Ein Script-Lauf = Tausende Provider!** 🚀
