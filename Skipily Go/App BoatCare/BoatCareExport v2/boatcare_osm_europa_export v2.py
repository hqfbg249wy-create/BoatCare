#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BoatCare – Europa Servicebetriebe Export (OpenStreetMap / Overpass API)

Erzeugt eine CSV im Schema:
Name,Straße,Hausnummer,PLZ,Ort,Land,Email,Telefonnummer,Website,Produktkategorien

Hinweis:
- Datenquelle: OpenStreetMap über Overpass API.
- Vollständigkeit hängt von der Datenqualität in OSM ab.
- Charter und Gebrauchtboot-Handel werden heuristisch ausgeschlossen (OSM-Tags sind nicht immer konsistent).
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

import requests

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]

# Länder (Europa, pragmatische Auswahl inkl. Nicht-EU). Du kannst sie per CLI einschränken.
EUROPE_ISO_A2 = [
    "AL","AD","AT","BA","BE","BG","BY","CH","CY","CZ","DE","DK","EE","ES","FI","FO","FR","GB",
    "GE","GI","GR","HR","HU","IE","IS","IT","LI","LT","LU","LV","MC","MD","ME","MK","MT","NL",
    "NO","PL","PT","RO","RS","RU","SE","SI","SK","SM","TR","UA","VA","XK"
]

# Marine-relevante OSM-Filter (Tag-Set ist erweiterbar)
# nwr = node/way/relation
OSM_FILTERS = [
    ('craft','sailmaker'),         # Segelmacher
    ('craft','Canvas'),            # Persenningmacher
    ('craft','marine_instruments'),# Marine Electronic
    ('craft','marine_electric'),   # Marine Electric
    ('craft','saftey_equipment'),  # Marine Sicherheitstechnik
    ('craft','marine_motor'),      # Bootsmotoren
    ('craft','boatbuilder'),       # Bootsbauer
    ('craft','rigger'),            # Rigg/Standing rigging (wenn gepflegt)
    ('waterway','boatyard'),       # Werft/Boatyard
    ('industrial','shipyard'),     # Werft/Shipyard
    ('shop','boat'),               # Bootsladen
    ('shop','marine'),             # Marine/Bootszubehör
    ('shop','yacht'),              # teils genutzt
    ('service','boat_repair'),     # Bootsreparatur (selten konsistent)
    ('service','marine'),          # generisch
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

EMAIL_KEYS = ["contact:email","email"]
PHONE_KEYS = ["contact:phone","phone","contact:mobile","mobile"]
WEB_KEYS   = ["contact:website","website"]

def first_tag(tags: Dict[str,str], keys: List[str]) -> str:
    for k in keys:
        v = tags.get(k, "")
        if v:
            return v.strip()
    return ""

def normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())

def normalize_key(*parts: str) -> str:
    s = "|".join([normalize_ws(p).lower() for p in parts if p is not None])
    s = re.sub(r"[^a-z0-9äöüß| -]+", "", s)
    return s

def should_exclude(tags: Dict[str,str]) -> bool:
    # Tag-basierte Ausschlüsse
    for k,v in EXCLUDE_TAGS:
        if tags.get(k) == v:
            return True
    # Heuristik über Name/Brand/Description
    hay = " ".join([tags.get("name",""), tags.get("brand",""), tags.get("operator",""), tags.get("description","")]).lower()
    for pat in EXCLUDE_NAME_PATTERNS:
        if re.search(pat, hay, flags=re.IGNORECASE):
            return True
    # "second hand" explizit
    if tags.get("second_hand","").lower() in ("yes","only"):
        return True
    return False

def map_categories(tags: Dict[str,str]) -> str:
    cats = set()
    # Harte Regeln
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

    # Keyword-Heuristiken
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
    for c, words in kw:
        if any(w in text for w in words):
            cats.add(c)

    if not cats:
        cats.add("Etc.")
    # Reihenfolge stabil
    order = ["Motor","Segelmacher","Persenning","Werften","Kran","Klimaanlage","Heizung","Bootszubehör","Rettungsmittel","Tauwerk","Beschläge","Elektrik","Electronic","Etc."]
    out = [c for c in order if c in cats]
    extra = sorted(list(cats - set(order)))
    out.extend(extra)
    return ";".join(out)

def build_overpass_query(country_iso2: str) -> str:
    # area by ISO code (admin_level=2)
    filters = "\n".join([f'  nwr["{k}"="{v}"](area.a);' for k,v in OSM_FILTERS])
    query = f"""
[out:json][timeout:180];
area["ISO3166-1"="{country_iso2}"]["boundary"="administrative"]["admin_level"="2"]->.a;
(
{filters}
);
out center tags;
"""
    return query.strip()

def fetch_overpass(query: str, endpoint: str, max_tries: int = 3, backoff: float = 2.0) -> dict:
    for attempt in range(1, max_tries + 1):
        try:
            r = requests.post(endpoint, data=query.encode("utf-8"), headers={"Content-Type":"application/x-www-form-urlencoded"} , timeout=300)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt == max_tries:
                raise
            time.sleep(backoff * attempt)

def pick_endpoint() -> str:
    # Einfacher Failover: ersten erreichbaren nehmen
    for ep in OVERPASS_ENDPOINTS:
        try:
            r = requests.get(ep, timeout=10)
            if r.status_code in (200, 400, 405):  # interpreter kann GET/POST unterschiedlich behandeln
                return ep
        except Exception:
            continue
    return OVERPASS_ENDPOINTS[0]

def element_center(el: dict) -> Tuple[Optional[float], Optional[float]]:
    if "lat" in el and "lon" in el:
        return el.get("lat"), el.get("lon")
    c = el.get("center")
    if isinstance(c, dict):
        return c.get("lat"), c.get("lon")
    return None, None

def to_rows(country_iso2: str, data: dict) -> List[dict]:
    rows = []
    for el in data.get("elements", []):
        tags = el.get("tags", {}) or {}
        if not tags.get("name"):
            continue
        if should_exclude(tags):
            continue

        # Adresse (wenn in OSM gepflegt)
        street = tags.get("addr:street","")
        housenumber = tags.get("addr:housenumber","")
        postcode = tags.get("addr:postcode","")
        city = tags.get("addr:city","") or tags.get("addr:town","") or tags.get("addr:village","")
        country = tags.get("addr:country","") or country_iso2

        email = first_tag(tags, EMAIL_KEYS)
        phone = first_tag(tags, PHONE_KEYS)
        web = first_tag(tags, WEB_KEYS)

        cats = map_categories(tags)

        rows.append({
            "Name": normalize_ws(tags.get("name","")),
            "Straße": normalize_ws(street),
            "Hausnummer": normalize_ws(housenumber),
            "PLZ": normalize_ws(postcode),
            "Ort": normalize_ws(city),
            "Land": normalize_ws(country),
            "Email": normalize_ws(email),
            "Telefonnummer": normalize_ws(phone),
            "Website": normalize_ws(web),
            "Produktkategorien": cats,
        })
    return rows

def dedupe(rows: List[dict]) -> List[dict]:
    seen = set()
    out = []
    for r in rows:
        key = normalize_key(r["Name"], r["Ort"], r["Straße"], r["Hausnummer"], r["PLZ"], r["Land"])
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out

def write_csv(rows: List[dict], out_path: str, delimiter: str = ",") -> None:
    fieldnames = ["Name","Straße","Hausnummer","PLZ","Ort","Land","Email","Telefonnummer","Website","Produktkategorien"]
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, delimiter=delimiter, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        for r in rows:
            w.writerow(r)

def main():
    ap = argparse.ArgumentParser(description="BoatCare Europa Servicebetriebe Export (OSM/Overpass)")
    ap.add_argument("--countries", default="EUROPE", help='ISO2-Liste z.B. "DE,FR,NL" oder EUROPE (Default)')
    ap.add_argument("--out", default="boatcare_servicebetriebe_europa.csv", help="Ausgabe-CSV")
    ap.add_argument("--delimiter", default=",", choices=[",",";","\\t"], help="CSV-Trennzeichen")
    ap.add_argument("--sleep", type=float, default=1.0, help="Pause zwischen Länder-Requests (Sekunden)")
    ap.add_argument("--endpoint", default="", help="Overpass Endpoint (optional)")
    args = ap.parse_args()

    if args.countries.strip().upper() == "EUROPE":
        countries = EUROPE_ISO_A2
    else:
        countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]

    endpoint = args.endpoint.strip() or pick_endpoint()
    print(f"Using Overpass endpoint: {endpoint}", file=sys.stderr)
    all_rows: List[dict] = []

    for i, iso2 in enumerate(countries, start=1):
        q = build_overpass_query(iso2)
        print(f"[{i}/{len(countries)}] Fetch {iso2} ...", file=sys.stderr)
        try:
            data = fetch_overpass(q, endpoint)
            rows = to_rows(iso2, data)
            rows = dedupe(rows)
            all_rows.extend(rows)
            print(f"    -> {len(rows)} rows", file=sys.stderr)
        except Exception as e:
            print(f"    !! failed for {iso2}: {e}", file=sys.stderr)
        time.sleep(max(0.0, args.sleep))

    all_rows = dedupe(all_rows)
    write_csv(all_rows, args.out, delimiter=("\t" if args.delimiter == "\\t" else args.delimiter))
    print(f"Done. Wrote {len(all_rows)} rows to {args.out}", file=sys.stderr)

if __name__ == "__main__":
    main()
