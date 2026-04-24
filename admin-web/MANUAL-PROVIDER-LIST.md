# 📋 Manuelle Provider-Liste für Cap d'Agde

## Warum manuell?

Web-Scraping ist kompliziert wegen:
- Anti-Bot-Maßnahmen (CAPTCHA, Rate Limiting)
- Unstrukturierte Daten auf Websites
- Verschiedene Formate pro Website

**Besserer Ansatz:** Du gibst mir eine Liste, ich erstelle die JSON! ⚡

## So machst du es:

### 1. Öffne Google Maps

https://www.google.com/maps/search/accastillage+cap+d'agde

### 2. Kopiere die Liste

Für jeden Betrieb, den du siehst:
- Name
- Adresse (optional, Google zeigt sie an)
- Website (wenn verfügbar)

### 3. Schick mir eine einfache Liste

**Format:**
```
Sud Croisaire - http://www.sudcroisaire.com
Navicap - Quai Jean Miquel
Nav-Elec - Port Richelieu
Chantier Naval Cap d'Agde
Accastillage Diffusion
...
```

**Oder noch einfacher - nur Namen:**
```
Sud Croisaire
Navicap
Nav-Elec
Chantier Naval Cap d'Agde
Accastillage Diffusion
Marine Service
...
```

### 4. Ich erstelle automatisch die JSON

Ich nutze dann:
- **Google Places API** für Koordinaten
- **Nominatim** für Geocoding
- **Automatische Kategorisierung** basierend auf Namen

## Beispiel-Workflow

**Du:**
```
Sud Croisaire
Navicap
Nav-Elec
Chantier Naval Cap d'Agde
```

**Ich erstelle:**
```json
{
  "providers": [
    {
      "name": "Sud Croisaire",
      "city": "Cap d'Agde",
      "country": "France",
      "category": "Zubehör",
      "coordinates": [43.2953, 3.5142],
      "website": "http://www.sudcroisaire.com",
      ...
    },
    ...
  ]
}
```

## 🚀 Schnellste Methode

**Google Maps → Liste kopieren → Mir schicken → Fertig!**

### Beispiel Google Maps Suchen:

1. **Accastillage:**
   https://www.google.com/maps/search/accastillage+cap+d'agde

2. **Chantier Naval:**
   https://www.google.com/maps/search/chantier+naval+cap+d'agde

3. **Marine Service:**
   https://www.google.com/maps/search/marine+service+cap+d'agde

4. **Électronique Marine:**
   https://www.google.com/maps/search/electronique+marine+cap+d'agde

5. **Voilerie:**
   https://www.google.com/maps/search/voilerie+cap+d'agde

## Alternative: Marina-Verzeichnis

Viele Marinas haben Online-Verzeichnisse ihrer Dienstleister:

**Cap d'Agde Port Richelieu:**
- Suche nach "Port Richelieu services" oder "Port Richelieu annuaire"
- Oft gibt es PDF-Listen oder Webseiten mit allen Betrieben

## Zusammenfassung

1. ✅ Google Maps öffnen
2. ✅ Nach "accastillage cap d'agde", "chantier naval cap d'agde", etc. suchen
3. ✅ Namen kopieren (mit oder ohne Website)
4. ✅ Mir schicken
5. ✅ Ich erstelle die JSON automatisch!

**Das dauert 5 Minuten und funktioniert garantiert!** 🎯
