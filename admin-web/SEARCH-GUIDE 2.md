# 🔍 Anleitung: ServiceProvider-Suche in BoatCare Admin

## Problem: Bestimmte Betriebe werden nicht gefunden

### Warum findet die Suche nicht alle Betriebe?

Die automatische Suche nutzt **OpenStreetMap (OSM)** Daten. Viele maritime Betriebe sind dort:
- ❌ Nicht eingetragen
- ❌ Falsch kategorisiert (z.B. als "Geschäft" statt "Bootswerft")
- ❌ Ohne maritime Tags versehen

**Beispiel Cap d'Agde:**
- "Sud Croisaire" → möglicherweise nicht in OSM eingetragen
- "Navicap" → möglicherweise unter anderem Namen
- Viele kleine Betriebe → fehlen komplett in OSM

## ✅ Lösungen

### 1. Erweiterte Overpass-Query (bereits implementiert)

Die Suche wurde erweitert und findet jetzt:

**Werkstätten & Bauer:**
- `craft=sailmaker` (Segelmacher)
- `craft=boatbuilder` (Bootsbauer)
- `craft=rigger` (Rigger)

**Shops:**
- `shop=boat` (Bootszubehör)
- `shop=marine` (Marine-Shop)
- `shop=water_sports` (Wassersport)
- `shop=fishing` (Angelbedarf)

**Marinas & Häfen:**
- `leisure=marina` (Marina)
- `amenity=boat_rental` (Bootsvermietung)
- `seamark:type=harbour` (Hafen)

**Tankstellen:**
- `amenity=fuel` + `fuel:marine=yes`
- `seamark:type=fuel_station`

**Werften:**
- `industrial=shipyard`
- `man_made=slipway`

### 2. Spezifische Ortssuche (NEU)

Für bekannte Betriebe in einem bestimmten Ort:

1. Gehe zu **Auto-Suche**
2. Nutze die **"Spezifische Ortssuche"** (blauer Kasten)
3. Trage den Ort ein (z.B. "Cap d'Agde")
4. Klicke auf "Ortsspezifische Suche starten"

Diese Funktion sucht gezielt nach:
- Sud Croisaire
- Navicap
- Chantier Naval
- Port Ambonne
- Accastillage
- Marine Service
- ... und kombiniert mit Overpass-Suche

### 3. Manuelle Suche & Hinzufügen

Wenn ein Betrieb nicht gefunden wird:

1. **Google/Website recherchieren:**
   - Name, Adresse, Telefon, Website
   - Koordinaten (Google Maps → Rechtsklick → "Was ist hier?")

2. **Im Admin-Panel hinzufügen:**
   - Gehe zu "Provider hinzufügen"
   - Trage alle Daten manuell ein
   - Nutze "Koordinaten suchen" für Geocoding

### 4. OpenStreetMap verbessern (langfristig)

Wenn du Zeit hast, kannst du OSM ergänzen:

1. Account auf https://www.openstreetmap.org erstellen
2. Fehlende Betriebe eintragen
3. Richtige Tags verwenden:
   - Bootswerft: `craft=boatbuilder`
   - Segelmacher: `craft=sailmaker`
   - Marine-Shop: `shop=marine`
   - Marina: `leisure=marina`

**Wichtig:** Nach Änderungen in OSM dauert es 1-2 Tage, bis die Overpass API aktualisiert ist!

## 🎯 Best Practices

### Grid-Suche optimieren:

**Für dicht besiedelte Küsten:**
- Suchradius: **3-5 km**
- Schrittweite: **5-10 km**
- Suchbereich: **30-50 km**

**Für große Gebiete:**
- Suchradius: **5-10 km**
- Schrittweite: **20-30 km**
- Suchbereich: **100-200 km**

### Mehrfachsuchen vermeiden:

- Suche generiert viele API-Requests
- Warte 1-2 Sekunden zwischen Punkten (bereits implementiert)
- Überprüfe Duplikate vor dem Hinzufügen

## 📊 Statistiken

Nach der Suche siehst du:
- Anzahl gefundener Betriebe
- Koordinaten und Namen
- Kategorie-Vorschlag
- "Hinzufügen"-Button für jeden Betrieb

## ❓ Troubleshooting

**Keine Ergebnisse?**
- ✅ Prüfe Startpunkt (richtige Stadt/Koordinaten?)
- ✅ Erhöhe Suchradius
- ✅ Nutze "Spezifische Ortssuche"
- ✅ Füge Betriebe manuell hinzu

**Zu viele Duplikate?**
- ✅ Prüfe vor dem Hinzufügen ob Provider schon existiert
- ✅ Reduziere Überlappung (größere Schrittweite)

**API-Fehler?**
- ✅ Rate Limiting: Warte 10 Sekunden
- ✅ Reduziere Suchbereich
- ✅ Nutze kleineren Radius

## 🚀 Zusammenfassung

1. **Automatische Suche** für große Gebiete (Overpass API)
2. **Spezifische Ortssuche** für bekannte Betriebe
3. **Manuelle Eingabe** für fehlende/neue Betriebe
4. **OSM ergänzen** für langfristige Verbesserung

Die Kombination aller Methoden liefert die besten Ergebnisse! 🎯
