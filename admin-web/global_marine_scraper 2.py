#!/usr/bin/env python3
"""
Global Marine Business Scraper
Automatisches Finden von maritimen Betrieben weltweit über mehrere Quellen
"""

import requests
import json
import time
from typing import List, Dict
import re

class GlobalMarineScraper:
    """Scraped maritime Betriebe aus verschiedenen Quellen"""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })

    def search_overpass_detailed(self, lat: float, lon: float, radius_km: int = 10) -> List[Dict]:
        """
        Erweiterte Overpass-Suche mit ALLEN maritimen Tags
        """
        radius_m = radius_km * 1000

        # SEHR ERWEITERTE Overpass Query
        query = f"""
        [out:json][timeout:60];
        (
          /* Werkstätten & Werften */
          node["craft"="boatbuilder"](around:{radius_m},{lat},{lon});
          node["craft"="sailmaker"](around:{radius_m},{lat},{lon});
          node["craft"="rigger"](around:{radius_m},{lat},{lon});
          node["industrial"="shipyard"](around:{radius_m},{lat},{lon});
          way["craft"="boatbuilder"](around:{radius_m},{lat},{lon});
          way["industrial"="shipyard"](around:{radius_m},{lat},{lon});

          /* Shops & Zubehör */
          node["shop"="boat"](around:{radius_m},{lat},{lon});
          node["shop"="marine"](around:{radius_m},{lat},{lon});
          node["shop"="fishing"](around:{radius_m},{lat},{lon});
          node["shop"="water_sports"](around:{radius_m},{lat},{lon});
          way["shop"="boat"](around:{radius_m},{lat},{lon});
          way["shop"="marine"](around:{radius_m},{lat},{lon});

          /* Marinas & Häfen */
          node["leisure"="marina"](around:{radius_m},{lat},{lon});
          node["amenity"="boat_rental"](around:{radius_m},{lat},{lon});
          node["seamark:type"="harbour"](around:{radius_m},{lat},{lon});
          way["leisure"="marina"](around:{radius_m},{lat},{lon});
          way["harbour"](around:{radius_m},{lat},{lon});

          /* Tankstellen */
          node["amenity"="fuel"]["fuel:marine"="yes"](around:{radius_m},{lat},{lon});
          node["seamark:type"="fuel_station"](around:{radius_m},{lat},{lon});

          /* Slipanlagen & Kräne */
          node["man_made"="slipway"](around:{radius_m},{lat},{lon});
          node["man_made"="crane"]["crane:type"="portal"](around:{radius_m},{lat},{lon});

          /* POIs in Marinas (oft haben Marinas viele Services) */
          node["name"]["tourism"="information"](around:{radius_m},{lat},{lon});
        );
        out body;
        >;
        out skel qt;
        """

        print(f"🔍 Overpass-Suche: {lat:.4f}, {lon:.4f} (Radius: {radius_km}km)")

        try:
            response = self.session.post(
                'https://overpass-api.de/api/interpreter',
                data=query,
                timeout=90
            )
            data = response.json()
            elements = data.get('elements', [])

            # Filtere nur Elemente mit Namen
            results = []
            for el in elements:
                if 'tags' in el and 'name' in el['tags']:
                    results.append(el)

            print(f"   ✅ {len(results)} benannte Betriebe gefunden")
            return results

        except Exception as e:
            print(f"   ❌ Overpass-Fehler: {e}")
            return []

    def search_nominatim_by_keywords(self, location: str, keywords: List[str]) -> List[Dict]:
        """
        Sucht via Nominatim nach spezifischen Keywords
        """
        results = []

        print(f"🔍 Nominatim-Suche in {location}")

        for keyword in keywords:
            query = f"{keyword} {location}"
            url = f"https://nominatim.openstreetmap.org/search"
            params = {
                'q': query,
                'format': 'json',
                'limit': 20,
                'addressdetails': 1
            }

            try:
                time.sleep(1)  # Rate limiting
                response = self.session.get(url, params=params, timeout=10)
                data = response.json()

                for item in data:
                    if 'display_name' in item:
                        results.append({
                            'name': item.get('name', item['display_name'].split(',')[0]),
                            'lat': float(item['lat']),
                            'lon': float(item['lon']),
                            'address': item.get('address', {}),
                            'display_name': item['display_name'],
                            'keyword': keyword
                        })

                print(f"   {keyword}: {len(data)} Ergebnisse")

            except Exception as e:
                print(f"   ❌ Fehler bei {keyword}: {e}")

        print(f"   ✅ Gesamt {len(results)} Nominatim-Ergebnisse")
        return results

    def detect_category(self, tags: Dict, name: str = "", keyword: str = "") -> str:
        """Intelligente Kategorisierung"""
        name_lower = name.lower()
        keyword_lower = keyword.lower()

        # Segelmacher
        if (tags.get('craft') == 'sailmaker' or
            any(x in name_lower for x in ['segel', 'voile', 'sail'])):
            return 'Segelmacher'

        # Rigg
        if (tags.get('craft') == 'rigger' or
            any(x in name_lower for x in ['rigg', 'gréement', 'mast'])):
            return 'Rigg'

        # Zubehör
        if (tags.get('shop') in ['boat', 'marine', 'water_sports', 'fishing'] or
            any(x in name_lower for x in ['accastillage', 'shipchandler', 'chandler', 'marine shop', 'zubehör'])):
            return 'Zubehör'

        # Tankstelle
        if (tags.get('amenity') == 'fuel' or
            tags.get('seamark:type') == 'fuel_station' or
            any(x in name_lower for x in ['tankstelle', 'fuel', 'station service'])):
            return 'Tankstelle'

        # Instrumente
        if any(x in name_lower for x in ['elektronik', 'électronique', 'electronics', 'navigation', 'gps', 'instrument']):
            return 'Instrumente'

        # Marina
        if (tags.get('leisure') == 'marina' or
            tags.get('amenity') == 'boat_rental' or
            any(x in name_lower for x in ['marina', 'port', 'hafen', 'haven', 'harbour'])):
            return 'Marina'

        # Werkstatt (Default)
        return 'Werkstatt'

    def geocode_location(self, location: str) -> tuple:
        """Geocodiert einen Ortsnamen"""
        url = f"https://nominatim.openstreetmap.org/search"
        params = {
            'q': location,
            'format': 'json',
            'limit': 1
        }

        try:
            response = self.session.get(url, params=params, timeout=10)
            data = response.json()

            if data:
                return (float(data[0]['lat']), float(data[0]['lon']))
        except:
            pass

        return None

    def scrape_location(self, location: str, radius_km: int = 10) -> List[Dict]:
        """
        Komplette Scraping-Pipeline für einen Ort
        """
        print(f"\n{'='*70}")
        print(f"🌍 Starte Scraping für: {location}")
        print(f"{'='*70}\n")

        # 1. Geocode Location
        coords = self.geocode_location(location)
        if not coords:
            print(f"❌ Ort '{location}' konnte nicht gefunden werden")
            return []

        lat, lon = coords
        print(f"📍 Koordinaten: {lat:.4f}, {lon:.4f}\n")

        # 2. Overpass-Suche (sehr umfangreich)
        overpass_results = self.search_overpass_detailed(lat, lon, radius_km)

        # 3. Nominatim Keyword-Suche
        keywords = [
            'accastillage', 'shipchandler', 'chantier naval',
            'voilerie', 'sailmaker', 'marine service',
            'boat repair', 'yacht service', 'marina'
        ]
        nominatim_results = self.search_nominatim_by_keywords(location, keywords)

        # 4. Konvertiere zu einheitlichem Format
        providers = []
        seen = set()

        # Overpass-Ergebnisse
        for el in overpass_results:
            name = el.get('tags', {}).get('name', 'Unknown')
            key = f"{name}_{el.get('lat', 0)}_{el.get('lon', 0)}"

            if key in seen:
                continue
            seen.add(key)

            provider = {
                'name': name,
                'category': self.detect_category(el.get('tags', {}), name),
                'coordinates': [el.get('lat', lat), el.get('lon', lon)],
                'address': el.get('tags', {}).get('addr:street', ''),
                'postal_code': el.get('tags', {}).get('addr:postcode', ''),
                'city': el.get('tags', {}).get('addr:city', location.split(',')[0]),
                'country': el.get('tags', {}).get('addr:country', ''),
                'phone': el.get('tags', {}).get('phone', ''),
                'website': el.get('tags', {}).get('website', ''),
                'source': 'overpass'
            }
            providers.append(provider)

        # Nominatim-Ergebnisse
        for item in nominatim_results:
            key = f"{item['name']}_{item['lat']}_{item['lon']}"

            if key in seen:
                continue
            seen.add(key)

            addr = item.get('address', {})
            provider = {
                'name': item['name'],
                'category': self.detect_category({}, item['name'], item.get('keyword', '')),
                'coordinates': [item['lat'], item['lon']],
                'address': addr.get('road', ''),
                'postal_code': addr.get('postcode', ''),
                'city': addr.get('city', addr.get('town', addr.get('village', location.split(',')[0]))),
                'country': addr.get('country', ''),
                'phone': '',
                'website': '',
                'source': 'nominatim'
            }
            providers.append(provider)

        print(f"\n{'='*70}")
        print(f"✅ {len(providers)} Betriebe gefunden")
        print(f"   Overpass: {len(overpass_results)}")
        print(f"   Nominatim: {len(nominatim_results)}")
        print(f"{'='*70}\n")

        return providers

    def scrape_multiple_locations(self, locations: List[str], radius_km: int = 10) -> Dict:
        """Scraped mehrere Orte nacheinander"""
        all_providers = []

        for location in locations:
            providers = self.scrape_location(location, radius_km)
            all_providers.extend(providers)
            time.sleep(5)  # Pause zwischen Orten

        return {'providers': all_providers}


def main():
    """CLI Interface"""
    import sys

    scraper = GlobalMarineScraper()

    if len(sys.argv) < 2:
        print("""
╔══════════════════════════════════════════════════════════╗
║  Global Marine Business Scraper                         ║
║  Automatisches Finden von maritimen Betrieben weltweit  ║
╚══════════════════════════════════════════════════════════╝

Usage:
  python3 global_marine_scraper.py "Cap d'Agde, France"
  python3 global_marine_scraper.py "Hamburg, Germany" 20

  Argument 1: Ort (erforderlich)
  Argument 2: Radius in km (optional, Standard: 10)
        """)
        return

    location = sys.argv[1]
    radius = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    providers = scraper.scrape_location(location, radius)

    # Speichere Ergebnis
    output_file = 'global-providers.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({'providers': providers}, f, indent=2, ensure_ascii=False)

    print(f"\n💾 Gespeichert in: {output_file}")
    print(f"📊 Kategorien:")

    categories = {}
    for p in providers:
        cat = p['category']
        categories[cat] = categories.get(cat, 0) + 1

    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"   {cat}: {count}")


if __name__ == '__main__':
    main()
