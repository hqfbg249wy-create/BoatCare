#!/usr/bin/env python3
"""
Normalisiert alle Kategorien auf die definierten Kategorien
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

# Mapping von falschen zu richtigen Kategorien
CATEGORY_MAPPING = {
    # Englisch -> Deutsch
    'supplies': 'Zubehör',
    'boat supplies': 'Zubehör',
    'repair': 'Werkstatt',
    'marina': 'Marina',
    'sailmaker': 'Segelmacher',
    'rigging': 'Rigg',

    # Falsche deutsche Begriffe -> Richtig
    'Versorgung': 'Zubehör',
    'Tauwerk': 'Rigg',
    'Elektronik': 'Instrumente',

    # Korrekte Kategorien (unverändert)
    'Werkstatt': 'Werkstatt',
    'Zubehör': 'Zubehör',
    'Tankstelle': 'Tankstelle',
    'Segelmacher': 'Segelmacher',
    'Rigg': 'Rigg',
    'Instrumente': 'Instrumente',
    'Marina': 'Marina',
    'Sonstige': 'Sonstige',
}

def main():
    print("🔧 Kategorien-Normalisierung")
    print("=" * 60)

    # Verbinde mit Supabase
    url, key = load_config()
    supabase: Client = create_client(url, key)

    # Lade alle Provider
    response = supabase.table('service_providers').select('id, name, category').execute()
    providers = response.data

    print(f"\n✅ {len(providers)} Provider geladen")

    # Zähle Kategorien
    categories = {}
    for p in providers:
        cat = p.get('category', 'Sonstige')
        categories[cat] = categories.get(cat, 0) + 1

    print(f"\n📊 Aktuelle Kategorien:")
    for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
        mapped_to = CATEGORY_MAPPING.get(cat, 'Sonstige')
        arrow = '' if cat == mapped_to else f' → {mapped_to}'
        print(f"   {cat}: {count}{arrow}")

    # Zähle Änderungen
    changes = {}
    for p in providers:
        old_cat = p.get('category', 'Sonstige')
        new_cat = CATEGORY_MAPPING.get(old_cat, 'Sonstige')

        if old_cat != new_cat:
            key = f"{old_cat} → {new_cat}"
            if key not in changes:
                changes[key] = []
            changes[key].append(p)

    if len(changes) == 0:
        print("\n✨ Alle Kategorien sind bereits korrekt!")
        return

    print(f"\n📝 Geplante Änderungen:")
    total_changes = 0
    for change_type, provs in changes.items():
        print(f"   {change_type}: {len(provs)} Provider")
        total_changes += len(provs)

    print(f"\n⚠️  {total_changes} Provider werden aktualisiert!")
    response = input("Fortfahren? (ja/nein): ")

    if response.lower() not in ['ja', 'j', 'yes', 'y']:
        print("❌ Abgebrochen")
        return

    # Aktualisiere Kategorien
    print(f"\n🔄 Aktualisiere Kategorien...")
    updated = 0
    errors = 0

    for change_type, provs in changes.items():
        old_cat, new_cat = change_type.split(' → ')

        for p in provs:
            try:
                supabase.table('service_providers')\
                    .update({'category': new_cat})\
                    .eq('id', p['id'])\
                    .execute()
                updated += 1
                if updated % 10 == 0:
                    print(f"   {updated}/{total_changes} aktualisiert...")
            except Exception as e:
                print(f"   ❌ Fehler bei {p['name']}: {e}")
                errors += 1

    print(f"\n✅ {updated} Kategorien erfolgreich aktualisiert!")
    if errors > 0:
        print(f"❌ {errors} Fehler")

    # Zeige finale Kategorien
    response = supabase.table('service_providers').select('category').execute()
    final_categories = {}
    for p in response.data:
        cat = p.get('category', 'Sonstige')
        final_categories[cat] = final_categories.get(cat, 0) + 1

    print(f"\n📊 Finale Kategorien:")
    for cat, count in sorted(final_categories.items(), key=lambda x: x[1], reverse=True):
        print(f"   {cat}: {count}")

if __name__ == '__main__':
    main()
