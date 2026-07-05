#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import csv
import time
import json
import argparse
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional

import requests

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]

USER_AGENT = "BoatCareOSMExport/1.0 (contact: you@example.com)"

EXPORT_DIR_DEFAULT = os.path.expanduser("~/Downloads/BoatCareExport")

# -------------------------
# Helpers
# -------------------------
def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)

def norm(s: Optional[str]) -> str:
    if not s:
        return ""
    s = str(s).strip()
    s = re.sub(r"\s+", " ", s)
    return s

def pick(tags: Dict[str, Any], keys: List[str]) -> str:
    for k in keys:
        v = tags.get(k)
        if v:
            return norm(v)
    return ""

def build_address(tags: Dict[str, Any]) -> Tuple[str, str, str, str, str]:
    street = pick(tags, ["addr:street"])
    housenumber = pick(tags, ["addr:housenumber"])
    postcode = pick(tags, ["addr:postcode"])
    city = pick(tags, ["addr:city", "addr:place"])
    country = pick(tags, ["addr:country"])
    return street, housenumber, postcode, city, country

def derive_categories(tags: Dict[str, Any]) -> str:
    """
    BoatCare categories derived from OSM tags.
    Output as semicolon-separated string.
    """
    cats = set()

    shop = tags.get("shop")
    craft = tags.get("craft")
    leisure = tags.get("leisure")
    man_made = tags.get("man_made")

    if tags.get("craft") == "sailmaker":
        cats.add("Segelmacher")
    if tags.get("craft") in ("boatbuilder",):
        cats.add("Werften")
    if tags.get("waterway") == "boatyard" or tags.get("industrial") == "shipyard":
        cats.add("Werften")
        cats.add("Kran")  # häufig vorhanden – Heuristik
    if tags.get("craft") == "rigger":
        cats.add("Beschläge")
        cats.add("Tauwerk")
    if tags.get("craft") == "electronics":
        cats.add("Elekronik")
        cats.add("Elektrik")
    if tags.get("craft") == "motor":
        cats.add("Motortechnik")
        cats.add("Motorservice")

    if tags.get("shop") in ("boat","marine","yacht"):
        cats.add("Bootszubehör")
        cats.add("Beschläge")
        cats.add("Tauwerk")

    # Heuristics
    text = " ".join([tags.get("name",""), tags.get("description",""), tags.get("operator",""), tags.get("shop",""), tags.get("craft","")]).lower()
    kw = [
        ("Motor", ["engine","motor","yanmar","volvo","perkins","lombardini","mercury","yamaha","suzuki","honda"]),
        ("Klimaanlage", ["aircon","air con","klimaanlage","hvac","dometic","marine air"]),
        ("Heizung", ["heizung","heater","webasto","eberspächer","diesel heater"]),
        ("Persenning", ["canvas","persenning","sprayhood","bimini","cover","capote"]),
        ("Rettungsmittel", ["liferaft","life raft","lifejacket","life jacket","rettungs","safety","lalizas","plastimo"]),
        ("Tauwerk", ["ropes","rigging","tauwerk","dyneema","marlow","climble","fender line"]),
        ("Beschläge", ["hardware","beschläge","winch","harken","lewmar","selden","furler","block"]),
        ("Elektronik", ["MFD","AIS","VHF","Instrumente","Radar","NMEA2000","NMEA183","Windgeber","Raymarine","B&G","Simrad","NKE","Airmar","Navico",]),
        ("Electrik", ["Landstrom","Verkabelung","Solar","Batterien","LifPO","AGM","Bleiaccu","Victron","Cristec","Philippi","Ladegerät",]),
    ]
    EXCLUDE_TAGS = [
    ('amenity','boat_rental'),
    ('tourism','boat_rental'),
    ('service','boat_rental'),
    ('service','boat_rent'),
    ('service','port'),
]

EXCLUDE_NAME_PATTERNS = [
    r'\bcharter\b',
    r'\bboat\s*rental\b',
    r'\byacht\s*charter\b',
]

    if tags.get("service:vehicle") == "boat":
        cats.add("Service")
    if "engine" in (tags.get("name","") + " " + tags.get("description","")).lower():
        cats.add("Motor")

    # You can extend here:
    # cats.add("Heizung") / cats.add("Klimaanlage") when tags hint at it

    return ";".join(sorted(cats))

def is_excluded(tags: Dict[str, Any]) -> bool:
    """
    Best-effort exclusions:
    - Charter / rental focused
    - Used boat brokerage / sales focused
    """
    name = (tags.get("name") or "").lower()
    desc = (tags.get("description") or "").lower()
    website = (tags.get("website") or "").lower()

    # Charter / rental hints
    charter_hints = ["charter", "boat rental", "rental", "rent a boat", "bootverleih", "location bateau"]
    if any(h in name or h in desc or h in website for h in charter_hints):
        # But keep marinas/boatyards even if "charter" appears sometimes
        if tags.get("leisure") not in ("marina",) and tags.get("craft") not in ("boatbuilder","boat_repair","sailmaker"):
            return True

    # Used boat / brokerage hints
    used_hints = ["used boat", "used boats", "broker", "brokers", "gebrauchtboot", "occasion", "pre-owned", "second hand"]
    if any(h in name or h in desc for h in used_hints):
        # If it's clearly sales/brokerage, exclude
        return True

    return False

def overpass_query_for_country(country_code: str) -> str:
    """
    Query using administrative area by ISO3166-1.
    Pull nodes/ways/relations matching marine-service tags.
    """
    cc = country_code.upper()

    # NOTE: area["ISO3166-1"="DE"] -> admin area of Germany
    # We search for various tags within that area.
    # We request center for ways/relations so we can output lat/lon if needed (you can keep them internal).
    q = f"""
    [out:json][timeout:180];
    area["ISO3166-1"="{cc}"]->.a;

    (
      nwr["shop"="boat"](area.a);
      nwr["craft"="motor"](area.a);
      nwr["craft"="instruments"](area.a);
      nwr["craft"="electric"](area.a);
      nwr["craft"="electronic"](area.a);
      nwr["craft"="boatbuilder"](area.a);
      nwr["craft"="sailmaker"](area.a);
      nwr["craft"="boat_repair"](area.a);
      nwr["leisure"="marina"](area.a);
      nwr["service:vehicle"="boat"](area.a);
      nwr["man_made"="crane"]["industrial"!="yes"](area.a);
    )->.all;

    .all out tags center;
    """
    return q

def run_overpass(query: str, url: str, retries: int = 3, backoff: float = 2.0) -> Dict[str, Any]:
    headers = {"User-Agent": USER_AGENT}
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.post(url, data=query.encode("utf-8"), headers=headers, timeout=240)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last_err = e
            time.sleep(backoff * attempt)
    raise RuntimeError(f"Overpass failed at {url}: {last_err}")

def extract_lat_lon(el: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    # node: has lat/lon; way/relation: has center.lat/center.lon if requested
    if "lat" in el and "lon" in el:
        return el.get("lat"), el.get("lon")
    c = el.get("center") or {}
    return c.get("lat"), c.get("lon")

def export_country(country_code: str, export_dir: str, include_latlon: bool = False) -> str:
    ensure_dir(export_dir)
    today = datetime.now().strftime("%Y-%m-%d")
    out_path = os.path.join(export_dir, f"BoatCare_{country_code.upper()}_{today}.csv")

    query = overpass_query_for_country(country_code)

    data = None
    # Try multiple Overpass endpoints
    for url in OVERPASS_URLS:
        try:
            data = run_overpass(query, url=url, retries=3)
            break
        except Exception as e:
            print(f"⚠️ Overpass endpoint failed: {url} ({e})")
            continue

    if data is None:
        raise RuntimeError("All Overpass endpoints failed.")

    elements = data.get("elements", [])
    rows = []

    for el in elements:
        tags = el.get("tags") or {}
        if is_excluded(tags):
            continue

        name = pick(tags, ["name", "operator", "brand"])
        if not name:
            continue

        street, housenumber, postcode, city, addr_country = build_address(tags)

        # Use ISO country code as Land; if addr:country exists, keep it too (but app expects Land field)
        land = country_code.upper()

        email = pick(tags, ["email", "contact:email"])
        phone = pick(tags, ["phone", "contact:phone", "telephone", "contact:telephone"])
        website = pick(tags, ["website", "contact:website", "url", "contact:url"])

        # Normalize website
        if website and not website.startswith(("http://", "https://")):
            website = "https://" + website

        categories = derive_categories(tags)

        lat, lon = extract_lat_lon(el)

        row = {
            "Name": name,
            "Straße": street,
            "Hausnummer": housenumber,
            "PLZ": postcode,
            "Ort": city,
            "Land": land,
            "Email": email,
            "Telefonnummer": phone,
            "Website": website,
            "Produktkategorien": categories,
        }

        if include_latlon:
            # optional, only if you want it for geocoding/map — can be removed from UI later
            row["Latitude"] = lat or ""
            row["Longitude"] = lon or ""

        rows.append(row)

    # Write CSV
    fieldnames = list(rows[0].keys()) if rows else [
        "Name","Straße","Hausnummer","PLZ","Ort","Land","Email","Telefonnummer","Website","Produktkategorien"
    ]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    print(f"✅ Export {country_code.upper()}: {len(rows)} rows -> {out_path}")
    return out_path

def main():
    ap = argparse.ArgumentParser(description="BoatCare OSM Export - country by country")
    ap.add_argument("--countries", nargs="+", required=True, help="ISO3166-1 alpha-2 country codes, e.g. DE FR IT")
    ap.add_argument("--export-dir", default=EXPORT_DIR_DEFAULT, help="Export directory (default: ~/Downloads/BoatCareExport)")
    ap.add_argument("--include-latlon", action="store_true", help="Include Latitude/Longitude columns in CSV")
    ap.add_argument("--sleep", type=float, default=1.0, help="Sleep seconds between country queries")
    args = ap.parse_args()

    ensure_dir(args.export_dir)

    for cc in args.countries:
        export_country(cc, args.export_dir, include_latlon=args.include_latlon)
        time.sleep(max(0.0, args.sleep))

if __name__ == "__main__":
    main()
