#!/usr/bin/env python3
"""
Einfacher Address Parser - nutzt KOMMA-Trennung
"""

import csv
import re

def parse_address_simple(full_address: str, name: str, current_street: str, current_postal: str, current_city: str, current_country: str) -> dict:
    """
    Nutzt die Komma-Trennung:
    Format: "Straße Hausnummer, PLZ Stadt" oder "Straße, PLZ Stadt, Land"
    """

    # Wenn bereits vollständig geparst, überspringe
    # CSV hat "null" als String, nicht als None
    if (current_postal and current_postal != 'null' and
        current_city and current_city != 'null' and
        current_country and current_country != 'null'):
        return None  # Skip

    if not full_address or full_address == 'null':
        return None

    # Splitte an Kommas
    parts = [p.strip() for p in full_address.split(',')]

    street = None
    postal_code = None
    city = None
    country = None

    if len(parts) == 2:
        # Format: "Straße, PLZ Stadt"
        street = parts[0].strip()
        plz_stadt = parts[1].strip()

        # Parse PLZ Stadt
        # Verschiedene PLZ-Formate:
        # - Deutschland: 5 Ziffern (12345)
        # - Niederlande: 4 Ziffern + 2 Buchstaben (1234 AB)
        # - Polen: XX-XXX (12-345)
        # - Schweden: 3 Ziffern + 2 Ziffern (123 45)

        # Versuche verschiedene Muster
        patterns = [
            r'^(\d{5})\s+(.+)$',           # Deutschland: 12345 Stadt
            r'^(\d{4}\s*[A-Z]{2})\s+(.+)$', # Niederlande: 1234 AB Stadt
            r'^(\d{2}-\d{3})\s+(.+)$',     # Polen: 12-345 Stadt
            r'^(\d{3}\s*\d{2})\s+(.+)$',   # Schweden: 123 45 Stadt
        ]

        matched = False
        for pattern in patterns:
            match = re.match(pattern, plz_stadt)
            if match:
                postal_code = match.group(1).strip()
                city = match.group(2).strip()
                matched = True
                break

        if not matched:
            # Fallback: Alles als Stadt interpretieren
            city = plz_stadt

    elif len(parts) == 3:
        # Format: "Straße, PLZ Stadt, Land"
        street = parts[0].strip()
        plz_stadt = parts[1].strip()
        country_raw = parts[2].strip()

        # Parse Land
        country = normalize_country(country_raw)

        # Parse PLZ Stadt (wie oben)
        patterns = [
            r'^(\d{5})\s+(.+)$',
            r'^(\d{4}\s*[A-Z]{2})\s+(.+)$',
            r'^(\d{2}-\d{3})\s+(.+)$',
            r'^(\d{3}\s*\d{2})\s+(.+)$',
        ]

        matched = False
        for pattern in patterns:
            match = re.match(pattern, plz_stadt)
            if match:
                postal_code = match.group(1).strip()
                city = match.group(2).strip()
                matched = True
                break

        if not matched:
            city = plz_stadt

    elif len(parts) == 1:
        # Nur Straße, kein Komma
        street = parts[0].strip()

    # Erkenne Land aus PLZ-Format, falls nicht gesetzt
    if not country and postal_code:
        country = detect_country_from_plz(postal_code, street)

    if not country:
        country = 'Deutschland'  # Default

    return {
        'street': street,
        'postal_code': postal_code,
        'city': city,
        'country': country
    }


def normalize_country(country_str: str) -> str:
    """Normalisiert Ländernamen"""
    country_map = {
        'deutschland': 'Deutschland',
        'germany': 'Deutschland',
        'frankreich': 'Frankreich',
        'france': 'Frankreich',
        'niederlande': 'Niederlande',
        'netherlands': 'Niederlande',
        'holland': 'Niederlande',
        'polen': 'Polen',
        'poland': 'Polen',
        'italien': 'Italien',
        'italy': 'Italien',
        'spanien': 'Spanien',
        'spain': 'Spanien',
        'schweden': 'Schweden',
        'sweden': 'Schweden',
        'griechenland': 'Griechenland',
        'greece': 'Griechenland',
    }

    key = country_str.lower().strip()
    return country_map.get(key, country_str)


def detect_country_from_plz(postal_code: str, street: str) -> str:
    """Erkenne Land aus PLZ-Format"""

    # Niederländische PLZ: 4 Ziffern + 2 Buchstaben
    if re.match(r'^\d{4}\s*[A-Z]{2}$', postal_code):
        return 'Niederlande'

    # Polnische PLZ: XX-XXX
    if re.match(r'^\d{2}-\d{3}$', postal_code):
        return 'Polen'

    # Schwedische PLZ: XXX XX
    if re.match(r'^\d{3}\s+\d{2}$', postal_code):
        return 'Schweden'

    # Italienische Straßennamen
    if re.search(r'\b(Via|Viale|Corso|Piazza)\b', street or '', re.IGNORECASE):
        return 'Italien'

    # Französische Straßennamen
    if re.search(r'\b(Rue|Avenue|Boulevard)\b', street or '', re.IGNORECASE):
        return 'Frankreich'

    # Deutsche PLZ (5 Ziffern) - Default
    return 'Deutschland'


def generate_sql_update(provider_id: str, name: str, parsed: dict) -> str:
    """Generiert SQL UPDATE"""

    def escape(value):
        if value is None:
            return 'NULL'
        value = value.replace("'", "''")
        return f"'{value}'"

    sql = f"""-- {name}
UPDATE service_providers
SET
    street = {escape(parsed['street'])},
    postal_code = {escape(parsed['postal_code'])},
    city = {escape(parsed['city'])},
    country = {escape(parsed['country'])}
WHERE id = '{provider_id}';
"""
    return sql


def main():
    input_file = '/Users/ekkehart/Downloads/Supabase Snippet Untitled query.csv'
    output_file = '/Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/admin-web/migration-all-addresses.sql'

    print("🔍 Parse ALLE Adressen...\n")

    updates = []
    skipped = 0

    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)

        for row in reader:
            provider_id = row['id']
            name = row['name']
            full_address = row['full_address']
            current_street = row['street']
            current_postal = row['postal_code']
            current_city = row['city']
            current_country = row['country']

            parsed = parse_address_simple(
                full_address, name,
                current_street, current_postal, current_city, current_country
            )

            if parsed is None:
                skipped += 1
                continue

            print(f"📍 {name}")
            print(f"   {full_address}")
            print(f"   → {parsed['street']} | {parsed['postal_code']} | {parsed['city']} | {parsed['country']}")

            sql = generate_sql_update(provider_id, name, parsed)
            updates.append(sql)

    # Schreibe SQL
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("-- VOLLSTÄNDIGE MIGRATION ALLER ADRESSEN\n")
        f.write("-- Generiert mit parse_addresses_simple.py\n\n")
        f.write("BEGIN;\n\n")

        for update in updates:
            f.write(update)
            f.write("\n")

        f.write("COMMIT;\n\n")

        # Validierung
        f.write("-- Validierung\n")
        f.write("SELECT\n")
        f.write("    COUNT(*) as total,\n")
        f.write("    COUNT(street) as has_street,\n")
        f.write("    COUNT(postal_code) as has_postal_code,\n")
        f.write("    COUNT(city) as has_city,\n")
        f.write("    COUNT(country) as has_country,\n")
        f.write("    COUNT(CASE WHEN street IS NOT NULL AND postal_code IS NOT NULL AND city IS NOT NULL AND country IS NOT NULL THEN 1 END) as vollstaendig\n")
        f.write("FROM service_providers;\n\n")

        f.write("-- Zeige Ergebnis\n")
        f.write("SELECT id, name, street, postal_code, city, country\n")
        f.write("FROM service_providers\n")
        f.write("ORDER BY name;\n")

    print(f"\n✅ SQL erstellt: {output_file}")
    print(f"📊 {len(updates)} Provider geparst")
    print(f"⏭️  {skipped} bereits vollständig (übersprungen)")


if __name__ == '__main__':
    main()
