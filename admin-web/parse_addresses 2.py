#!/usr/bin/env python3
"""
Address Parser für BoatCare ServiceProvider Migration
Liest CSV mit Adressen, parst sie intelligent und generiert SQL-Updates
"""

import csv
import re
from typing import Dict, Optional, Tuple

def parse_address(address: str, name: str) -> Dict[str, Optional[str]]:
    """
    Parst eine Adresse in ihre Bestandteile.

    Format-Beispiele:
    - "Bavariastraße 1, 97232 Giebelstadt"
    - "Zone technique du port, 34110 Frontignan, Deutschland"
    - "Flevoweg 1, 8325 PA Vollenhove"
    - "Via Pacinotti 12, 20054 Segrate (MI)"
    """

    if not address or address == 'null':
        return {'street': None, 'postal_code': None, 'city': None, 'country': None}

    # Entferne Leerzeichen am Anfang/Ende
    address = address.strip()

    # Erkenne Land am Ende (Deutschland, Frankreich, etc.)
    country = None
    country_patterns = [
        (r',\s*(Deutschland)\s*$', 'Deutschland'),
        (r',\s*(Frankreich|France)\s*$', 'Frankreich'),
        (r',\s*(Niederlande|Netherlands)\s*$', 'Niederlande'),
        (r',\s*(Polen|Poland)\s*$', 'Polen'),
        (r',\s*(Italien|Italy)\s*$', 'Italien'),
        (r',\s*(Spanien|Spain)\s*$', 'Spanien'),
    ]

    for pattern, country_name in country_patterns:
        match = re.search(pattern, address, re.IGNORECASE)
        if match:
            country = country_name
            # Entferne Land aus der Adresse
            address = re.sub(pattern, '', address, flags=re.IGNORECASE).strip()
            break

    # Wenn kein Land gefunden, versuche aus dem Namen/Kontext zu schließen
    if not country:
        # Niederländische PLZ (4 Ziffern + 2 Buchstaben)
        if re.search(r'\b\d{4}\s*[A-Z]{2}\b', address):
            country = 'Niederlande'
        # Polnische PLZ (XX-XXX)
        elif re.search(r'\b\d{2}-\d{3}\b', address):
            country = 'Polen'
        # Italienische PLZ (5 Ziffern) + (MI), (TO), (RM), etc.
        elif re.search(r'\b\d{5}\s*\([A-Z]{2}\)', address):
            country = 'Italien'
        # Italienische Straßennamen (Via, Viale, Corso, Piazza)
        elif re.search(r'\b(Via|Viale|Corso|Piazza)\b', address, re.IGNORECASE):
            country = 'Italien'
        # Französische PLZ (5 Ziffern) mit französischen Hinweisen
        elif re.search(r'\b\d{5}\b', address) and any(word in address.lower() for word in ['rue', 'avenue', 'boulevard', 'port', 'zone']):
            country = 'Frankreich'
        # Deutsche Postleitzahlen (5 Ziffern)
        elif re.search(r'\b\d{5}\b', address):
            country = 'Deutschland'
        else:
            country = 'Deutschland'  # Default

    # Splitte an Kommas
    parts = [p.strip() for p in address.split(',')]

    street = None
    postal_code = None
    city = None

    if len(parts) == 1:
        # Nur eine Komponente - wahrscheinlich Straße
        street = parts[0]

    elif len(parts) == 2:
        # Zwei Komponenten: "Straße, PLZ Stadt"
        street = parts[0]

        # Parse "PLZ Stadt"
        plz_stadt = parts[1].strip()

        # Versuche PLZ zu extrahieren
        # Deutsche PLZ (5 Ziffern)
        match = re.match(r'(\d{5})\s+(.+)', plz_stadt)
        if match:
            postal_code = match.group(1)
            city = match.group(2).strip()
        else:
            # Niederländische PLZ (XXXX YY)
            match = re.match(r'(\d{4}\s*[A-Z]{2})\s+(.+)', plz_stadt)
            if match:
                postal_code = match.group(1)
                city = match.group(2).strip()
            else:
                # Polnische PLZ (XX-XXX)
                match = re.match(r'(\d{2}-\d{3})\s+(.+)', plz_stadt)
                if match:
                    postal_code = match.group(1)
                    city = match.group(2).strip()
                else:
                    # Italienische PLZ mit (MI), etc.
                    match = re.match(r'(\d{5})\s+(.+)', plz_stadt)
                    if match:
                        postal_code = match.group(1)
                        city = match.group(2).strip()
                    else:
                        # Fallback: Alles als Stadt
                        city = plz_stadt

    elif len(parts) >= 3:
        # Drei+ Komponenten: "Straße, PLZ Stadt, Land" oder "Straße, Stadt, Land"
        street = parts[0]

        # Parse "PLZ Stadt" (mittlerer Teil)
        plz_stadt = parts[1].strip()

        match = re.match(r'(\d{2,5}[-\s]*[A-Z]*)\s+(.+)', plz_stadt)
        if match:
            postal_code = match.group(1).strip()
            city = match.group(2).strip()
        else:
            city = plz_stadt

    return {
        'street': street,
        'postal_code': postal_code,
        'city': city,
        'country': country
    }


def generate_sql_update(provider_id: str, name: str, parsed: Dict[str, Optional[str]]) -> str:
    """Generiert ein SQL UPDATE Statement."""

    def escape_sql(value: Optional[str]) -> str:
        if value is None:
            return 'NULL'
        # Escape single quotes
        value = value.replace("'", "''")
        return f"'{value}'"

    sql = f"""-- {name}
UPDATE service_providers
SET
    street = {escape_sql(parsed['street'])},
    postal_code = {escape_sql(parsed['postal_code'])},
    city = {escape_sql(parsed['city'])},
    country = {escape_sql(parsed['country'])}
WHERE id = '{provider_id}';
"""
    return sql


def main():
    """Hauptfunktion"""
    input_file = '/Users/ekkehart/Downloads/Supabase Snippet Adressspalten aufteilen.csv'
    output_file = '/Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/admin-web/migration-parsed-addresses.sql'

    print("🔍 Starte Address-Parsing...")
    print(f"📄 Lese: {input_file}")

    updates = []

    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)

        for row in reader:
            provider_id = row['id']
            name = row['name']
            address = row['street']  # Die street-Spalte enthält die vollständige Adresse

            print(f"\n📍 {name}")
            print(f"   Original: {address}")

            parsed = parse_address(address, name)

            print(f"   → Straße: {parsed['street']}")
            print(f"   → PLZ: {parsed['postal_code']}")
            print(f"   → Stadt: {parsed['city']}")
            print(f"   → Land: {parsed['country']}")

            sql = generate_sql_update(provider_id, name, parsed)
            updates.append(sql)

    # Schreibe SQL-Datei
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("-- AUTOMATISCH GENERIERTE MIGRATION\n")
        f.write("-- Parsed Addresses für BoatCare ServiceProvider\n")
        f.write("-- Generiert mit parse_addresses.py\n\n")
        f.write("BEGIN;\n\n")

        for update in updates:
            f.write(update)
            f.write("\n")

        f.write("\nCOMMIT;\n\n")

        # Validierung
        f.write("-- Validierung\n")
        f.write("SELECT\n")
        f.write("    COUNT(*) as total,\n")
        f.write("    COUNT(street) as has_street,\n")
        f.write("    COUNT(postal_code) as has_postal_code,\n")
        f.write("    COUNT(city) as has_city,\n")
        f.write("    COUNT(country) as has_country\n")
        f.write("FROM service_providers;\n\n")

        f.write("-- Zeige Ergebnis\n")
        f.write("SELECT id, name, street, postal_code, city, country\n")
        f.write("FROM service_providers\n")
        f.write("ORDER BY name\n")
        f.write("LIMIT 20;\n")

    print(f"\n✅ SQL-Datei erstellt: {output_file}")
    print(f"📊 {len(updates)} Provider geparst")
    print("\n🚀 Nächste Schritte:")
    print("1. Öffne die SQL-Datei und prüfe die Updates")
    print("2. Führe die SQL-Datei in Supabase aus")
    print("3. Teste das Admin-Panel")


if __name__ == '__main__':
    main()
