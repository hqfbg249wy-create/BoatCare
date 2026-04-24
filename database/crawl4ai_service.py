#!/usr/bin/env python3
"""
BoatCare Crawl Service
Crawlt maritime Service-Provider Websites und extrahiert strukturierte Daten.
Läuft lokal auf Port 8765, wird von der Admin-UI direkt und von N8N aufgerufen.

Zwei Modi:
  - Crawl4AI (Python 3.10+): Browser-Rendering, JS-fähig
  - Fallback (Python 3.9+): urllib + BeautifulSoup, kein JS
"""

import json
import re
import urllib.robotparser
import urllib.request
import urllib.error
from urllib.parse import urlparse, urlencode
from http.server import HTTPServer, BaseHTTPRequestHandler
import time

# ── Crawl4AI optional laden ──────────────────────────────────────────────────
try:
    from crawl4ai import AsyncWebCrawler
    from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
    import asyncio
    CRAWL4AI_AVAILABLE = True
    print("✅ Crawl4AI verfügbar – Browser-Rendering aktiv")
except ImportError:
    CRAWL4AI_AVAILABLE = False
    print("ℹ️  Crawl4AI nicht installiert – nutze BeautifulSoup Fallback")

# ── BeautifulSoup laden ───────────────────────────────────────────────────────
try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False
    print("⚠️  BeautifulSoup nicht installiert: pip3 install beautifulsoup4 lxml")


# ─────────────────────────────────────────────────────────────────────────────
# robots.txt Prüfung
# ─────────────────────────────────────────────────────────────────────────────

_robots_cache = {}

def check_robots_txt(url: str) -> dict:
    """Prüft ob eine URL laut robots.txt gecrawlt werden darf."""
    try:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        robots_url = f"{origin}/robots.txt"
        now = time.time()

        if origin in _robots_cache and _robots_cache[origin]['expires'] > now:
            r = _robots_cache[origin]
            return {"allowed": r['allowed'], "reason": r['reason'] + " (gecacht)", "robotsUrl": robots_url}

        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(robots_url)
        try:
            rp.read()
        except Exception:
            _robots_cache[origin] = {"allowed": True, "reason": "robots.txt nicht erreichbar", "expires": now + 300}
            return {"allowed": True, "reason": "Kein robots.txt – Crawling erlaubt", "robotsUrl": robots_url}

        allowed = rp.can_fetch("*", url)
        reason = "Erlaubt laut robots.txt" if allowed else "Verboten (Disallow in robots.txt)"
        _robots_cache[origin] = {"allowed": allowed, "reason": reason, "expires": now + 300}
        return {"allowed": allowed, "reason": reason, "robotsUrl": robots_url}

    except Exception as e:
        return {"allowed": True, "reason": f"robots.txt Fehler ({e}) – Crawling erlaubt", "robotsUrl": ""}


# ─────────────────────────────────────────────────────────────────────────────
# Regex-basierte Datenextraktion
# ─────────────────────────────────────────────────────────────────────────────

RE_PHONE = re.compile(r'(?:(?:Tel\.?|Tél\.?|Phone|Téléphone|Telefon|Mob\.?)\s*[:\.]?\s*)(\+?[\d][\d\s\.\-\(\)]{6,18}\d)')
RE_EMAIL = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
RE_POSTAL_FR = re.compile(r'\b(\d{5})\b')
RE_TEL_HREF = re.compile(r'tel:([\+\d\s\-\.]+)')
RE_MAILTO = re.compile(r'mailto:([^\s"\'<>]+)')


def extract_with_bs4(html: str, url: str) -> dict:
    """Extrahiert Kontaktdaten aus HTML via BeautifulSoup."""
    soup = BeautifulSoup(html, 'lxml')

    # Name: title oder h1
    name = ""
    if soup.title:
        name = soup.title.string or ""
        name = name.split('|')[0].split('-')[0].strip()
    if not name and soup.find('h1'):
        name = soup.find('h1').get_text(strip=True)

    # Description: meta description
    desc_tag = soup.find('meta', attrs={'name': 'description'})
    description = desc_tag['content'].strip() if desc_tag and desc_tag.get('content') else ""

    # Telefon: tel: Links bevorzugen
    phone = ""
    tel_link = soup.find('a', href=RE_TEL_HREF)
    if tel_link:
        m = RE_TEL_HREF.search(tel_link['href'])
        if m:
            phone = m.group(1).strip()
    if not phone:
        text = soup.get_text(' ')
        m = RE_PHONE.search(text)
        if m:
            phone = m.group(1).strip()

    # E-Mail: mailto: Links bevorzugen
    email = ""
    mail_link = soup.find('a', href=RE_MAILTO)
    if mail_link:
        m = RE_MAILTO.search(mail_link['href'])
        if m:
            email = m.group(1).strip()
    if not email:
        text = soup.get_text(' ')
        m = RE_EMAIL.search(text)
        if m:
            email = m.group(0)

    # Adress-Hinweis: address-Tag oder Zeile mit PLZ
    address_hint = ""
    addr_tag = soup.find('address')
    if addr_tag:
        address_hint = addr_tag.get_text(' ', strip=True)[:150]
    if not address_hint:
        text = soup.get_text('\n')
        for line in text.split('\n'):
            line = line.strip()
            if RE_POSTAL_FR.search(line) and 5 < len(line) < 100:
                address_hint = line
                break

    postal_codes = RE_POSTAL_FR.findall(soup.get_text())
    postal_code = postal_codes[0] if postal_codes else ""

    return {
        "name": name,
        "phone": phone,
        "email": email,
        "description": description[:300] if description else "",
        "address_hint": address_hint,
        "postal_code": postal_code,
    }


def crawl_with_urllib(url: str) -> dict:
    """Einfacher HTTP-Crawl via urllib + BeautifulSoup (kein JS)."""
    if not BS4_AVAILABLE:
        return {"success": False, "error": "BeautifulSoup nicht installiert", "url": url}

    headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; BoatCareBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr,de,en',
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            charset = resp.headers.get_content_charset() or 'utf-8'
            html = resp.read().decode(charset, errors='replace')
        data = extract_with_bs4(html, url)
        return {"success": True, "mode": "beautifulsoup", **data, "url": url, "robots_blocked": False}
    except urllib.error.HTTPError as e:
        return {"success": False, "error": f"HTTP {e.code}", "url": url}
    except Exception as e:
        return {"success": False, "error": str(e), "url": url}


def crawl_with_crawl4ai(url: str) -> dict:
    """Browser-Crawl via Crawl4AI (benötigt Python 3.10+)."""
    import asyncio

    SCHEMA = {
        "name": "provider",
        "baseSelector": "body",
        "fields": [
            {"name": "company_name", "selector": "h1, .company-name, .site-title", "type": "text"},
            {"name": "phone", "selector": "a[href^='tel:']", "type": "attribute", "attribute": "href"},
            {"name": "email", "selector": "a[href^='mailto:']", "type": "attribute", "attribute": "href"},
            {"name": "address", "selector": "address, .address, .contact-address", "type": "text"},
            {"name": "description", "selector": "meta[name='description']", "type": "attribute", "attribute": "content"},
        ]
    }

    async def _run():
        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(
                url=url,
                extraction_strategy=JsonCssExtractionStrategy(SCHEMA),
                bypass_cache=True,
                timeout=30
            )
            extracted = {}
            if result.extracted_content:
                try:
                    raw = json.loads(result.extracted_content)
                    extracted = raw[0] if isinstance(raw, list) and raw else {}
                except Exception:
                    pass

            # Regex-Ergänzung aus Markdown
            text = result.markdown or ""
            phone = extracted.get("phone", "").replace("tel:", "").strip()
            email = extracted.get("email", "").replace("mailto:", "").strip()
            if not phone:
                m = RE_PHONE.search(text)
                if m:
                    phone = m.group(1).strip()
            if not email:
                m = RE_EMAIL.search(text)
                if m:
                    email = m.group(0)

            postal_codes = RE_POSTAL_FR.findall(text)
            return {
                "success": True,
                "mode": "crawl4ai",
                "url": url,
                "robots_blocked": False,
                "name": extracted.get("company_name", ""),
                "phone": phone,
                "email": email,
                "description": (extracted.get("description", "") or "")[:300],
                "address_hint": (extracted.get("address", "") or ""),
                "postal_code": postal_codes[0] if postal_codes else "",
            }

    return asyncio.run(_run())


def crawl_website(url: str) -> dict:
    """Crawlt eine Website – prüft robots.txt und wählt beste Methode."""
    robots = check_robots_txt(url)
    if not robots["allowed"]:
        return {"success": False, "robots_blocked": True, "reason": robots["reason"], "url": url}

    result = {}
    if CRAWL4AI_AVAILABLE:
        try:
            result = crawl_with_crawl4ai(url)
        except Exception as e:
            print(f"Crawl4AI Fehler, nutze Fallback: {e}")
            result = crawl_with_urllib(url)
    else:
        result = crawl_with_urllib(url)

    result["robots_reason"] = robots["reason"]
    return result


# ─────────────────────────────────────────────────────────────────────────────
# HTTP-Server für Admin-UI und N8N
# ─────────────────────────────────────────────────────────────────────────────

class CrawlHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[CrawlService] {format % args}")

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json({
                "status": "ok",
                "service": "BoatCare Crawl Service",
                "crawl4ai": CRAWL4AI_AVAILABLE,
                "beautifulsoup": BS4_AVAILABLE,
                "mode": "crawl4ai" if CRAWL4AI_AVAILABLE else "beautifulsoup"
            })
        else:
            self._send_json({"error": "Not found"}, 404)

    def do_POST(self):
        body = self._read_body()
        url = body.get("url", "")

        if self.path == "/robots-check":
            if not url:
                self._send_json({"error": "url fehlt"}, 400)
                return
            self._send_json(check_robots_txt(url))

        elif self.path == "/crawl":
            if not url:
                self._send_json({"error": "url fehlt"}, 400)
                return
            print(f"Crawle: {url}")
            result = crawl_website(url)
            self._send_json(result)

        else:
            self._send_json({"error": "Unbekannter Endpunkt"}, 404)


if __name__ == "__main__":
    PORT = 8765
    mode = "Crawl4AI + BeautifulSoup" if CRAWL4AI_AVAILABLE else "BeautifulSoup (Fallback)"
    print(f"\n🚀 BoatCare Crawl Service – Modus: {mode}")
    print(f"   http://localhost:{PORT}")
    print(f"   GET  /health         – Status")
    print(f"   POST /robots-check   – robots.txt prüfen  {{ \"url\": \"...\" }}")
    print(f"   POST /crawl          – Website crawlen     {{ \"url\": \"...\" }}\n")
    server = HTTPServer(("localhost", PORT), CrawlHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n⏹️  Service gestoppt")
