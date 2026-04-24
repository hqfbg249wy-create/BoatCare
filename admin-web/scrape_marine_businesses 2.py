#!/usr/bin/env python3
"""
Web-Scraper für maritime Betriebe
Findet Betriebe über Google-Suche und extrahiert Kontaktdaten von deren Websites
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import re
from urllib.parse import quote_plus, urlparse

# Such-Begriffe für maritime Betriebe (Französisch)
SEARCH_TERMS = [
    "accastillage",
    "shipchandler",
    "chantier naval",
    "marine service",
    "voilerie",
    "électronique marine",
    "mécanique marine",
    "gréement",
    "réparation bateau",
    "entretien bateau"
]

def google_search(query, location, num_results=10):
    """
    Führt eine Google-Suche durch und gibt URLs zurück.
    WICHTIG: Nutzt DuckDuckGo statt Google (keine API nötig, keine Rate Limits)
    """
    print(f"🔍 Suche: {query} in {location}")

    # DuckDuckGo HTML Search (einfacher als Google, kein CAPTCHA)
    search_query = f"{query} {location}"
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(search_query)}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')

        results = []
        for result in soup.find_all('a', class_='result__a', limit=num_results):
            href = result.get('href')
            if href and href.startswith('http'):
                title = result.get_text(strip=True)
                results.append({'url': href, 'title': title})

        print(f"   ✅ {len(results)} Ergebnisse gefunden")
        return results

    except Exception as e:
        print(f"   ❌ Fehler: {e}")
        return []


def extract_contact_info(url):
    """
    Extrahiert Kontaktdaten von einer Website
    """
    print(f"   📄 Analysiere: {url}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        text = soup.get_text()

        # Extrahiere Name (aus Title oder H1)
        name = None
        if soup.title:
            name = soup.title.string.strip()
        elif soup.h1:
            name = soup.h1.get_text(strip=True)

        # Extrahiere Telefon (französisches Format)
        phone_patterns = [
            r'\+33\s*\d\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2}',
            r'0\d\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2}',
            r'\d{2}\.\d{2}\.\d{2}\.\d{2}\.\d{2}'
        ]
        phone = None
        for pattern in phone_patterns:
            match = re.search(pattern, text)
            if match:
                phone = match.group(0)
                break

        # Extrahiere Email
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        email_match = re.search(email_pattern, text)
        email = email_match.group(0) if email_match else None

        # Extrahiere Adresse (sehr einfache Heuristik)
        address_keywords = ['rue', 'avenue', 'boulevard', 'quai', 'port', 'chemin']
        address = None
        lines = text.split('\n')
        for line in lines:
            line_lower = line.lower()
            if any(keyword in line_lower for keyword in address_keywords):
                # Prüfe ob PLZ dabei ist (5 Ziffern)
                if re.search(r'\d{5}', line):
                    address = line.strip()
                    break

        return {
            'name': name,
            'phone': phone,
            'email': email,
            'address': address,
            'website': url
        }

    except Exception as e:
        print(f"      ❌ Fehler beim Scrapen: {e}")
        return None


def detect_category(business_name, search_term):
    """Kategorisiert Betrieb basierend auf Name und Suchbegriff"""
    name_lower = business_name.lower()
    term_lower = search_term.lower()

    if 'voile' in name_lower or 'voile' in term_lower:
        return 'Segelmacher'
    if 'gréement' in name_lower or 'gréement' in term_lower:
        return 'Rigg'
    if 'accastillage' in name_lower or 'shipchandler' in name_lower:
        return 'Zubehör'
    if 'électronique' in name_lower or 'électronique' in term_lower:
        return 'Instrumente'
    if 'chantier' in name_lower or 'réparation' in name_lower:
        return 'Werkstatt'

    return 'Werkstatt'  # Default


def geocode_address(address, city):
    """
    Geocodiert eine Adresse mit Nominatim
    """
    if not address:
        return None

    query = f"{address}, {city}, France"
    url = f"https://nominatim.openstreetmap.org/search?q={quote_plus(query)}&format=json&limit=1"

    headers = {'User-Agent': 'BoatCare-AdminTool/1.0'}

    try:
        response = requests.get(url, headers=headers, timeout=5)
        data = response.json()

        if data and len(data) > 0:
            return [float(data[0]['lat']), float(data[0]['lon'])]
    except:
        pass

    return None


def scrape_location(location, output_file='scraped-providers.json'):
    """
    Hauptfunktion: Scraped alle maritimen Betriebe an einem Ort
    """
    print(f"\n{'='*60}")
    print(f"🚀 Starte Scraping für: {location}")
    print(f"{'='*60}\n")

    all_businesses = []
    seen_urls = set()

    for search_term in SEARCH_TERMS:
        print(f"\n--- {search_term.upper()} ---")

        results = google_search(search_term, location, num_results=5)

        for result in results:
            url = result['url']

            # Überspringe Duplikate
            domain = urlparse(url).netloc
            if domain in seen_urls:
                continue
            seen_urls.add(domain)

            # Extrahiere Kontaktdaten
            contact_info = extract_contact_info(url)

            if contact_info and contact_info['name']:
                # Geocode Adresse
                coords = geocode_address(contact_info['address'], location) if contact_info['address'] else None

                business = {
                    'name': contact_info['name'][:100],  # Kürze lange Namen
                    'city': location,
                    'country': 'France',
                    'category': detect_category(contact_info['name'], search_term),
                    'description': f"{search_term.title()}",
                    'coordinates': coords or [0, 0],  # Placeholder wenn kein Geocoding
                    'address': contact_info['address'] or '',
                    'postal_code': '',
                    'website': contact_info['website'],
                    'phone': contact_info['phone'] or '',
                    'email': contact_info['email'] or '',
                    'services': [search_term.title()]
                }

                all_businesses.append(business)
                print(f"      ✅ Hinzugefügt: {business['name']}")

            # Rate Limiting
            time.sleep(2)

        # Pause zwischen Such-Begriffen
        time.sleep(3)

    # Speichere als JSON
    output_data = {'providers': all_businesses}

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"✅ Fertig! {len(all_businesses)} Betriebe gefunden")
    print(f"📄 Gespeichert in: {output_file}")
    print(f"{'='*60}\n")

    return all_businesses


if __name__ == '__main__':
    import sys

    location = sys.argv[1] if len(sys.argv) > 1 else "Cap d'Agde"
    output = sys.argv[2] if len(sys.argv) > 2 else 'scraped-providers.json'

    print("""
    ╔════════════════════════════════════════════════════════╗
    ║   Maritime Business Web Scraper                        ║
    ║   Findet Betriebe über Websites statt OSM              ║
    ╚════════════════════════════════════════════════════════╝
    """)

    businesses = scrape_location(location, output)

    print("\n💡 NÄCHSTE SCHRITTE:")
    print("1. Öffne scraped-providers.json")
    print("2. Überprüfe/korrigiere die Daten")
    print("3. Füge die Provider zu known-providers.json hinzu")
    print("4. Oder importiere sie direkt ins Admin-Panel")
