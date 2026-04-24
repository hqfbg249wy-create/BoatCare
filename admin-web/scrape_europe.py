#!/usr/bin/env python3
"""
Europa-weites Scraping von maritimen Betrieben
Scraped systematisch alle wichtigen Häfen in Europa
"""

from global_marine_scraper import GlobalMarineScraper
import json
import time

# Wichtige maritime Regionen in Europa
EUROPEAN_PORTS = {
    "France - Mediterranean": [
        "Cap d'Agde, France",
        "Le Grau du Roi, France",
        "Port Camargue, France",
        "Sète, France",
        "Marseillan, France",
        "Palavas-les-Flots, France",
        "La Grande-Motte, France",
        "Marseille, France",
        "Toulon, France",
        "Nice, France",
        "Antibes, France",
        "Cannes, France",
        "Saint-Tropez, France"
    ],
    "France - Atlantic": [
        "La Rochelle, France",
        "Les Sables-d'Olonne, France",
        "Lorient, France",
        "Brest, France",
        "Saint-Malo, France",
        "Pornic, France",
        "Arcachon, France"
    ],
    "Spain - Mediterranean": [
        "Barcelona, Spain",
        "Valencia, Spain",
        "Alicante, Spain",
        "Málaga, Spain",
        "Palma de Mallorca, Spain",
        "Ibiza, Spain"
    ],
    "Italy": [
        "Genoa, Italy",
        "La Spezia, Italy",
        "Venice, Italy",
        "Trieste, Italy",
        "Naples, Italy",
        "Palermo, Italy"
    ],
    "Croatia": [
        "Split, Croatia",
        "Dubrovnik, Croatia",
        "Zadar, Croatia",
        "Pula, Croatia"
    ],
    "Greece": [
        "Athens Piraeus, Greece",
        "Corfu, Greece",
        "Rhodes, Greece",
        "Santorini, Greece"
    ],
    "Germany": [
        "Hamburg, Germany",
        "Kiel, Germany",
        "Rostock, Germany",
        "Flensburg, Germany"
    ],
    "Netherlands": [
        "Amsterdam, Netherlands",
        "Rotterdam, Netherlands",
        "Den Haag, Netherlands"
    ],
    "UK": [
        "Southampton, UK",
        "Portsmouth, UK",
        "Brighton, UK",
        "Plymouth, UK"
    ],
    "Scandinavia": [
        "Copenhagen, Denmark",
        "Gothenburg, Sweden",
        "Stockholm, Sweden",
        "Oslo, Norway",
        "Bergen, Norway"
    ]
}


def scrape_region(region_name: str, locations: list, scraper: GlobalMarineScraper):
    """Scraped eine komplette Region"""
    print(f"\n{'#'*80}")
    print(f"# {region_name}")
    print(f"# {len(locations)} Orte")
    print(f"{'#'*80}\n")

    all_providers = []

    for i, location in enumerate(locations, 1):
        print(f"\n[{i}/{len(locations)}] {location}")
        providers = scraper.scrape_location(location, radius_km=10)
        all_providers.extend(providers)

        # Speichere Zwischenstand
        with open(f'providers_{region_name.lower().replace(" ", "_")}.json', 'w', encoding='utf-8') as f:
            json.dump({'providers': all_providers}, f, indent=2, ensure_ascii=False)

        print(f"   💾 Zwischenstand: {len(all_providers)} Provider gesamt")

        # Pause zwischen Orten (Rate Limiting)
        time.sleep(3)

    return all_providers


def main():
    """Hauptfunktion - scraped ganz Europa"""
    print("""
╔══════════════════════════════════════════════════════════════╗
║  Europa-weites Maritime Business Scraping                   ║
║  Systematisches Erfassen aller Häfen und Services           ║
╚══════════════════════════════════════════════════════════════╝
    """)

    scraper = GlobalMarineScraper()
    all_providers = []

    # Scrape jede Region
    for region_name, locations in EUROPEAN_PORTS.items():
        providers = scrape_region(region_name, locations, scraper)
        all_providers.extend(providers)

        print(f"\n✅ {region_name}: {len(providers)} Provider gefunden")

        # Große Pause zwischen Regionen
        time.sleep(10)

    # Finale Speicherung
    final_data = {'providers': all_providers}

    with open('europe_all_providers.json', 'w', encoding='utf-8') as f:
        json.dump(final_data, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*80}")
    print(f"🎉 FERTIG!")
    print(f"   Gesamt: {len(all_providers)} Provider")
    print(f"   Gespeichert in: europe_all_providers.json")
    print(f"{'='*80}\n")

    # Statistik
    categories = {}
    countries = {}

    for p in all_providers:
        cat = p.get('category', 'Unknown')
        categories[cat] = categories.get(cat, 0) + 1

        country = p.get('country', p.get('city', 'Unknown').split(',')[-1].strip())
        countries[country] = countries.get(country, 0) + 1

    print("📊 Kategorien:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1])[:10]:
        print(f"   {cat}: {count}")

    print("\n🌍 Länder:")
    for country, count in sorted(countries.items(), key=lambda x: -x[1])[:10]:
        print(f"   {country}: {count}")


if __name__ == '__main__':
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        # Test-Modus: Nur ein paar Orte
        print("🧪 TEST-MODUS: Nur 3 Orte\n")
        scraper = GlobalMarineScraper()
        test_locations = [
            "Cap d'Agde, France",
            "Hamburg, Germany",
            "Barcelona, Spain"
        ]
        providers = []
        for loc in test_locations:
            providers.extend(scraper.scrape_location(loc, 10))
            time.sleep(3)

        with open('test_providers.json', 'w', encoding='utf-8') as f:
            json.dump({'providers': providers}, f, indent=2, ensure_ascii=False)

        print(f"\n✅ Test abgeschlossen: {len(providers)} Provider")
    else:
        main()
