#!/usr/bin/env python3
"""
Analysiert die "Unbekannt" Provider genauer
"""

import os
import sys
from supabase import create_client, Client
from typing import List, Dict
import re

# Supabase Config laden
def load_config():
    config_path = 'config.js'
    with open(config_path, 'r') as f:
        content = f.read()

    import re
    url_match = re.search(r"url:\s*['\"]([^'\"]+)['\"]", content)
    key_match = re.search(r"anonKey:\s*['\"]([^'\"]+)['\"]", content)

    if not url_match or not key_match:
        raise ValueError("Could not parse config.js")

    return url_match.group(1), key_match.group(1)

def main():
    print("🔍 Analyse der 'Unbekannt' Provider")
    print("=" * 60)

    # Verbinde mit Supabase
    url, key = load_config()
    supabase: Client = create_client(url, key)

    # Lade "Unbekannt" Provider
    response = supabase.table('service_providers')\
        .select('*')\
        .eq('name', 'Unbekannt')\
        .execute()

    unknown = response.data
    print(f"\n📊 {len(unknown)} Provider mit Name 'Unbekannt'")

    # Gruppiere nach Koordinaten-Region
    regions = {}

    for p in unknown:
        lat = p.get('latitude')
        lon = p.get('longitude')

        if lat and lon:
            # Runde auf 1 Dezimalstelle um Region zu identifizieren
            region_key = (round(lat, 1), round(lon, 1))

            if region_key not in regions:
                regions[region_key] = []
            regions[region_key].append(p)

    print(f"\n📍 Verteilt auf {len(regions)} geografische Regionen:\n")

    # Cap d'Agde Region: ~43.3°N, 3.5°E
    cap_agde_lat = 43.3
    cap_agde_lon = 3.5

    for region_key, providers in sorted(regions.items(), key=lambda x: len(x[1]), reverse=True):
        lat, lon = region_key
        count = len(providers)

        # Prüfe ob in Cap d'Agde Nähe
        is_cap_agde = (abs(lat - cap_agde_lat) < 0.5 and abs(lon - cap_agde_lon) < 0.5)
        marker = "⭐ CAP D'AGDE?" if is_cap_agde else "  "

        print(f"{marker} Region {lat:.1f}°N, {lon:.1f}°E: {count} Provider")

        if is_cap_agde:
            # Zeige Details für Cap d'Agde
            print(f"   🔍 Details:")
            categories = {}
            for p in providers:
                cat = p.get('category', 'Ohne')
                categories[cat] = categories.get(cat, 0) + 1

            for cat, cnt in sorted(categories.items(), key=lambda x: x[1], reverse=True):
                print(f"      {cat}: {cnt}")

            # Zeige ein paar Beispiele
            print(f"   📋 Beispiele:")
            for p in providers[:3]:
                print(f"      - ID: {p['id']}")
                print(f"        Kategorie: {p.get('category')}")
                print(f"        Koordinaten: {p.get('latitude')}, {p.get('longitude')}")
                print(f"        Stadt: {p.get('city')}")
                print(f"        Land: {p.get('country')}")
                print()

if __name__ == '__main__':
    main()
