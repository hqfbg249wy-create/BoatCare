#!/usr/bin/env python3
"""
Bereinigt Duplikate in der service_providers Tabelle.
Duplikate werden identifiziert durch:
- Gleicher Name
- Gleiche Koordinaten (mit Toleranz von ~10 Metern)
"""

import os
import sys
from supabase import create_client, Client
from typing import List, Dict, Tuple
import math

# Supabase Config laden
def load_config():
    config_path = 'config.js'
    with open(config_path, 'r') as f:
        content = f.read()

    # Extrahiere URL und Key
    import re
    url_match = re.search(r"url:\s*['\"]([^'\"]+)['\"]", content)
    key_match = re.search(r"anonKey:\s*['\"]([^'\"]+)['\"]", content)

    if not url_match or not key_match:
        raise ValueError("Could not parse config.js")

    return url_match.group(1), key_match.group(1)

# Berechne Distanz zwischen zwei Koordinaten in Metern
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000  # Erdradius in Metern

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c

# Finde Duplikate
def find_duplicates(providers: List[Dict]) -> List[List[Dict]]:
    """Findet Duplikate basierend auf Name und Koordinaten"""
    duplicate_groups = []
    processed = set()

    for i, provider in enumerate(providers):
        if i in processed:
            continue

        group = [provider]
        processed.add(i)

        # Finde ähnliche Provider
        for j, other in enumerate(providers[i+1:], start=i+1):
            if j in processed:
                continue

            # Prüfe ob Name ähnlich ist (Case-insensitive)
            name_match = provider['name'].lower().strip() == other['name'].lower().strip()

            # Prüfe ob Koordinaten nah beieinander (< 50 Meter)
            if provider['latitude'] and provider['longitude'] and other['latitude'] and other['longitude']:
                distance = haversine_distance(
                    provider['latitude'], provider['longitude'],
                    other['latitude'], other['longitude']
                )
                coords_match = distance < 50  # 50 Meter Toleranz
            else:
                coords_match = False

            if name_match and coords_match:
                group.append(other)
                processed.add(j)

        if len(group) > 1:
            duplicate_groups.append(group)

    return duplicate_groups

# Wähle besten Provider aus einer Duplikate-Gruppe
def choose_best_provider(group: List[Dict]) -> Tuple[Dict, List[Dict]]:
    """Wählt den besten Provider und gibt die zu löschenden zurück"""

    # Bewertungskriterien (höher = besser)
    def score_provider(p: Dict) -> int:
        score = 0

        # Bevorzuge Provider mit mehr Informationen
        if p.get('phone'): score += 10
        if p.get('email'): score += 10
        if p.get('website'): score += 10
        if p.get('street'): score += 5
        if p.get('postal_code'): score += 5
        if p.get('city'): score += 5
        if p.get('country'): score += 5
        if p.get('description'): score += 15
        if p.get('services') and len(p['services']) > 0: score += 20
        if p.get('brands') and len(p['brands']) > 0: score += 10

        # Bevorzuge ältere Einträge (wahrscheinlich manuell hinzugefügt)
        if p.get('created_at'):
            score += 5

        return score

    # Sortiere nach Score (höchster zuerst)
    sorted_group = sorted(group, key=score_provider, reverse=True)

    best = sorted_group[0]
    to_delete = sorted_group[1:]

    return best, to_delete

def main():
    print("🔧 Duplikate-Bereinigung")
    print("=" * 60)

    # Verbinde mit Supabase
    url, key = load_config()
    supabase: Client = create_client(url, key)

    # Lade alle Provider
    print("\n📥 Lade alle Provider aus Datenbank...")
    response = supabase.table('service_providers').select('*').execute()
    providers = response.data

    print(f"✅ {len(providers)} Provider geladen")

    # Zähle Provider nach Stadt
    cities = {}
    for p in providers:
        city = p.get('city', 'Unbekannt')
        cities[city] = cities.get(city, 0) + 1

    print("\n📊 Provider nach Stadt:")
    for city, count in sorted(cities.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"   {city}: {count}")

    # Finde Duplikate
    print("\n🔍 Suche nach Duplikaten...")
    duplicate_groups = find_duplicates(providers)

    print(f"✅ {len(duplicate_groups)} Duplikate-Gruppen gefunden")

    if len(duplicate_groups) == 0:
        print("\n✨ Keine Duplikate gefunden! Datenbank ist sauber.")
        return

    # Zeige Duplikate
    total_to_delete = 0
    ids_to_delete = []

    print("\n📋 Duplikate-Gruppen:")
    print("-" * 60)

    for i, group in enumerate(duplicate_groups, 1):
        best, to_delete = choose_best_provider(group)
        total_to_delete += len(to_delete)

        print(f"\nGruppe {i}: {group[0]['name']}")
        print(f"   Anzahl Duplikate: {len(group)}")
        print(f"   🏆 BEHALTEN: {best['id']} ({best.get('city', 'n/a')}) - Score: am vollständigsten")

        for p in to_delete:
            print(f"   ❌ LÖSCHEN:  {p['id']} ({p.get('city', 'n/a')})")
            ids_to_delete.append(p['id'])

    print("\n" + "=" * 60)
    print(f"📊 Zusammenfassung:")
    print(f"   Gesamt Provider:     {len(providers)}")
    print(f"   Duplikate gefunden:  {total_to_delete}")
    print(f"   Nach Bereinigung:    {len(providers) - total_to_delete}")
    print("=" * 60)

    # Frage nach Bestätigung
    print(f"\n⚠️  Es werden {total_to_delete} Duplikate gelöscht!")
    response = input("Fortfahren? (ja/nein): ")

    if response.lower() not in ['ja', 'j', 'yes', 'y']:
        print("❌ Abgebrochen")
        return

    # Lösche Duplikate
    print(f"\n🗑️  Lösche {total_to_delete} Duplikate...")

    deleted_count = 0
    for provider_id in ids_to_delete:
        try:
            supabase.table('service_providers').delete().eq('id', provider_id).execute()
            deleted_count += 1
            if deleted_count % 10 == 0:
                print(f"   {deleted_count}/{total_to_delete} gelöscht...")
        except Exception as e:
            print(f"   ❌ Fehler beim Löschen von {provider_id}: {e}")

    print(f"\n✅ {deleted_count} Duplikate erfolgreich gelöscht!")

    # Prüfe Cap d'Agde speziell
    print("\n🔍 Prüfe Cap d'Agde Provider...")
    response = supabase.table('service_providers')\
        .select('*')\
        .or_('city.ilike.%agde%,city.ilike.%cap%')\
        .execute()

    cap_providers = response.data
    print(f"   Gefunden: {len(cap_providers)} Provider in Cap d'Agde Region")

    # Gruppiere nach Kategorie
    categories = {}
    for p in cap_providers:
        cat = p.get('category', 'Ohne Kategorie')
        categories[cat] = categories.get(cat, 0) + 1

    print("\n   Nach Kategorie:")
    for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
        print(f"      {cat}: {count}")

if __name__ == '__main__':
    main()
