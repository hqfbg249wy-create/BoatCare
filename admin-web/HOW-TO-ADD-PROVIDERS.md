# 📝 Anleitung: Bekannte Provider zur Datenbank hinzufügen

## Problem

Viele maritime Betriebe (besonders in Frankreich) sind **nicht in OpenStreetMap** eingetragen. Die automatische Suche findet sie daher nicht.

**Beispiele:**
- Sud Croisaire (Cap d'Agde)
- Navicap (Cap d'Agde)
- Nav-Elec (Cap d'Agde)

## Lösung: `known-providers.json`

Die Datei `known-providers.json` enthält eine **manuelle Datenbank** bekannter Provider, die bei der "Spezifischen Ortssuche" automatisch gefunden werden.

## Wie du Provider hinzufügst

### 1. Informationen sammeln

Recherchiere auf Google Maps, der Website des Betriebs oder vor Ort:

- **Name** (exakt wie auf der Website)
- **Adresse** (Straße, PLZ, Stadt)
- **Land**
- **Koordinaten** (von Google Maps: Rechtsklick → "Was ist hier?")
- **Kategorie** (Werkstatt, Zubehör, Tankstelle, Marina, etc.)
- **Website** (falls vorhanden)
- **Services/Leistungen**

### 2. JSON-Eintrag erstellen

Öffne `known-providers.json` und füge einen neuen Eintrag hinzu:

```json
{
  "name": "Name des Betriebs",
  "city": "Stadtname",
  "country": "France",
  "category": "Zubehör",
  "description": "Kurzbeschreibung (optional)",
  "coordinates": [43.2953, 3.5142],
  "address": "Straße und Hausnummer",
  "postal_code": "34300",
  "website": "https://www.example.com",
  "phone": "+33 4 67 12 34 56",
  "services": ["Service 1", "Service 2", "Service 3"]
}
```

### 3. Koordinaten finden

**Google Maps:**
1. Suche den Betrieb auf Google Maps
2. Rechtsklick auf den Standort → "Was ist hier?"
3. Koordinaten werden angezeigt (z.B. `43.2953, 3.5142`)
4. **Format:** `[Latitude, Longitude]`

**Wichtig:** Latitude zuerst, dann Longitude!

### 4. Kategorie wählen

Verfügbare Kategorien (exakt so schreiben):
- `Werkstatt` - Bootswerkstätten, Werften, Reparaturen
- `Zubehör` - Accastillage, Shipchandler, Shops
- `Tankstelle` - Marine-Tankstellen
- `Segelmacher` - Voileries
- `Rigg` - Rigger, Mastenbau, Gréement
- `Instrumente` - Elektronik, Navigation, GPS
- `Marina` - Häfen, Marinas, Anlegestellen
- `Sonstige` - Alles andere

### 5. Beispiel: Sud Croisaire (Cap d'Agde)

```json
{
  "name": "Sud Croisaire",
  "city": "Cap d'Agde",
  "country": "France",
  "category": "Zubehör",
  "description": "Accastillage et équipements nautiques",
  "coordinates": [43.2953, 3.5142],
  "address": "Quai Jean Miquel",
  "postal_code": "34300",
  "website": "http://www.sudcroisaire.com",
  "services": ["Accastillage", "Equipements nautiques", "Pièces détachées"]
}
```

## Vollständiges Beispiel

So sieht die `known-providers.json` aus:

```json
{
  "providers": [
    {
      "name": "Sud Croisaire",
      "city": "Cap d'Agde",
      "country": "France",
      "category": "Zubehör",
      "description": "Accastillage et équipements nautiques",
      "coordinates": [43.2953, 3.5142],
      "address": "Quai Jean Miquel",
      "postal_code": "34300",
      "website": "http://www.sudcroisaire.com",
      "services": ["Accastillage", "Equipements nautiques"]
    },
    {
      "name": "Navicap",
      "city": "Cap d'Agde",
      "country": "France",
      "category": "Zubehör",
      "description": "Shipchandler",
      "coordinates": [43.2951, 3.5145],
      "address": "Port Richelieu",
      "postal_code": "34300",
      "services": ["Accastillage", "Shipchandler"]
    }
  ]
}
```

**Wichtig:**
- Komma nach jedem Eintrag (außer dem letzten!)
- Eckige Klammern `[]` für Arrays
- Geschweifte Klammern `{}` für Objekte
- Anführungszeichen `"` für Strings

## Wie wird es genutzt?

1. **Admin-Panel öffnen**
2. **"Auto-Suche"** Seite
3. **"Spezifische Ortssuche"** nutzen
4. Ort eingeben (z.B. "Cap d'Agde")
5. **Alle Provider aus `known-providers.json`** werden automatisch gefunden!

## Tipps

### Mehrere Betriebe im selben Hafen

Wenn du einen Hafen komplett erfassen willst:
1. Besuche die Marina-Website (oft gibt es Verzeichnisse)
2. Notiere alle Betriebe mit Kontaktdaten
3. Füge sie alle zur JSON hinzu

### Koordinaten-Genauigkeit

- Für große Betriebe: 4 Dezimalstellen (`43.2953`)
- Für kleine Shops: 5-6 Dezimalstellen (`43.295342`)

### Französische Häfen

Wichtige Häfen zum Erfassen:
- Cap d'Agde
- Port Camargue (Le Grau du Roi)
- Port-Saint-Louis-du-Rhône
- Sète
- Marseillan
- Palavas-les-Flots

## Häufige Fehler

❌ **Falsch:**
```json
{
  "coordinates": "43.2953, 3.5142"  // String statt Array!
}
```

✅ **Richtig:**
```json
{
  "coordinates": [43.2953, 3.5142]  // Array mit Zahlen
}
```

❌ **Falsch:**
```json
{
  "category": "Accastillage"  // Falsche Kategorie!
}
```

✅ **Richtig:**
```json
{
  "category": "Zubehör"  // Eine der vordefinierten Kategorien
}
```

## JSON Validierung

Nach dem Bearbeiten:
1. Gehe zu https://jsonlint.com
2. Kopiere die komplette JSON-Datei
3. Klicke "Validate JSON"
4. Behebe alle Fehler

## Zusammenfassung

1. ✅ Informationen recherchieren
2. ✅ JSON-Eintrag erstellen
3. ✅ Koordinaten von Google Maps
4. ✅ Richtige Kategorie wählen
5. ✅ JSON validieren
6. ✅ Datei speichern
7. ✅ Im Admin-Panel testen

Die Provider aus `known-providers.json` werden **bevorzugt** und mit **korrekter Kategorie** angezeigt! 🎯
