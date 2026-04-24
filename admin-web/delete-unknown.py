#!/usr/bin/env python3
"""
Löscht alle Provider mit Name 'Unbekannt'
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
    print("🗑️  Lösche 'Unbekannt' Provider")
    print("=" * 60)

    # Verbinde mit Supabase
    url, key = load_config()
    supabase: Client = create_client(url, key)

    # Finde alle "Unbekannt" Provider
    response = supabase.table('service_providers')\
        .select('id, name, city, category')\
        .eq('name', 'Unbekannt')\
        .execute()

    unknown = response.data
    print(f"\n📊 {len(unknown)} Provider mit Name 'Unbekannt' gefunden")

    if len(unknown) == 0:
        print("\n✨ Keine 'Unbekannt' Provider vorhanden!")
        return

    print(f"\n⚠️  Diese {len(unknown)} Provider werden gelöscht!")
    response = input("Fortfahren? (ja/nein): ")

    if response.lower() not in ['ja', 'j', 'yes', 'y']:
        print("❌ Abgebrochen")
        return

    # Lösche alle
    print(f"\n🗑️  Lösche {len(unknown)} Provider...")
    for i, p in enumerate(unknown, 1):
        try:
            supabase.table('service_providers').delete().eq('id', p['id']).execute()
            if i % 10 == 0:
                print(f"   {i}/{len(unknown)} gelöscht...")
        except Exception as e:
            print(f"   ❌ Fehler bei {p['id']}: {e}")

    print(f"\n✅ Alle 'Unbekannt' Provider gelöscht!")

    # Zeige finale Statistik
    response = supabase.table('service_providers').select('id', count='exact', head=True).execute()
    total = response.count

    print(f"\n📊 Verbleibende Provider: {total}")

if __name__ == '__main__':
    main()
