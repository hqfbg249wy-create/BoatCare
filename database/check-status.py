#!/usr/bin/env python3
"""
Prüft den aktuellen Status der Datenbank
"""

import os
import sys
from supabase import create_client, Client
import re

# Supabase Config laden
def load_config():
    config_path = 'config.js'
    with open(config_path, 'r') as f:
        content = f.read()

    url_match = re.search(r"url:\s*['\"]([^'\"]+)['\"]", content)
    key_match = re.search(r"anonKey:\s*['\"]([^'\"]+)['\"]", content)

    if not url_match or not key_match:
        raise ValueError("Could not parse config.js")

    return url_match.group(1), key_match.group(1)

def main():
    print("📊 Datenbank Status")
    print("=" * 60)

    # Verbinde mit Supabase
    url, key = load_config()
    supabase: Client = create_client(url, key)

    # Gesamtzahl
    response = supabase.table('service_providers').select('*').execute()
    all_providers = response.data
    print(f"\n✅ Gesamt Provider: {len(all_providers)}")

    # Nach Stadt
    cities = {}
    for p in all_providers:
        city = p.get('city') or 'None'
        cities[city] = cities.get(city, 0) + 1

    print(f"\n📍 Top 10 Städte:")
    for city, count in sorted(cities.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"   {city}: {count}")

    # Nach Kategorie
    categories = {}
    for p in all_providers:
        cat = p.get('category') or 'Ohne'
        categories[cat] = categories.get(cat, 0) + 1

    print(f"\n📂 Nach Kategorie:")
    for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
        print(f"   {cat}: {count}")

    # Prüfe auf "Unbekannt"
    unknown_count = sum(1 for p in all_providers if p.get('name') == 'Unbekannt')
    print(f"\n❓ Provider mit Name 'Unbekannt': {unknown_count}")

    # Prüfe auf city=None
    no_city_count = sum(1 for p in all_providers if not p.get('city'))
    print(f"📍 Provider ohne Stadt: {no_city_count}")

if __name__ == '__main__':
    main()
