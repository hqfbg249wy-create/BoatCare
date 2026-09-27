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
    ('craft','sailmaker'),     # Segelmacher
    ('craft','boatbuilder'),   # Bootsbauer
    ('craft','rigger'),        # Rigg/Standing rigging (wenn gepflegt)
    ('waterway','boatyard'),   # Werft/Boatyard
    ('industrial','shipyard'), # Werft/Shipyard
    ('shop','boat'),           # Bootsladen
    ('shop','marine'),         # Marine/Bootszubehör
    ('shop','yacht'),          # teils genutzt
    ('service','boat_repair'), # Bootsreparatur (selten konsistent)
    ('service','marine'),      # generisch
]

EXCLUDE_TAGS = [
    ('amenity','boat_rental'),
    ('tourism','boat_rental'),
    ('service','boat_rental'),
    ('service','boat_rent'),
]

EXCLUDE_NAME_PATTERNS = [
    r'\bcharter\b',
    r'\bboat\s*rental\b',
    r'\byacht\s*charter\b',
    r'\bgebraucht\b',
    r'\bused\s*boats?\b',
    r'\boccasion\b',
    r'\bsecond\s*hand\b',
    r'\bbroker(age)?\b',
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
    """
    Liefert eine standardisierte, BoatCare-kompatible Kategorienliste (Semikolon-separiert).
    Ziel: stabile Auswertung/Filter in der App (kontrolliertes Vokabular) – trotzdem breit genug für "etc.".
    """
    cats = set()

    # --- 1) Tag-basierte harte Regeln (OSM) ---
    craft = tags.get("craft","")
    shop = tags.get("shop","")
    waterway = tags.get("waterway","")
    industrial = tags.get("industrial","")
    service = tags.get("service","")

    if craft == "sailmaker":
        cats.add("Segelmacher")
    if craft == "boatbuilder":
        cats.add("Werften")
    if craft == "rigger":
        cats.add("Rigg")
        cats.add("Tauwerk")
        cats.add("Beschläge")

    if waterway == "boatyard" or industrial == "shipyard":
        cats.add("Werften")
        cats.add("Service/Repair")
        # Kran/Travelift ist oft Bestandteil von Werft/Boatyard – Heuristik
        cats.add("Kran")

    if shop in ("boat","marine","yacht"):
        cats.add("Bootszubehör")
        cats.add("Beschläge")
        cats.add("Tauwerk")

    if service in ("boat_repair","marine","engine_repair"):
        cats.add("Service/Repair")

    # --- 2) Keyword-Heuristiken (Name/Beschreibung/Operator/Brand) ---
    text = " ".join([
        tags.get("name",""),
        tags.get("brand",""),
        tags.get("operator",""),
        tags.get("description",""),
        tags.get("website",""),
        tags.get("contact:website",""),
    ]).lower()

    def has_any(words):
        return any(w in text for w in words)

    # Motor/Antrieb
    if has_any(["engine","motor","diesel","outboard","inboard","gearbox","propeller","stern drive",
               "yanmar","volvo","perkins","lombardini","lombardi","mercury","yamaha","suzuki","honda",
               "selva","tohatsu","nanni","man","mtu","caterpillar","cummins","kohler","vetus","beta marine","zf"]):
        cats.add("Motor")

    # Persenning/Canvas/Polster/Sattlerei
    if has_any(["persenning","sprayhood","bimini","dodger","cockpit cover","cover","canvas","hood",
               "sattlerei","polster","upholstery","cushion","tapiceria","sellerie","tappezzeria"]):
        # Canvas + Persenning zusammen, Polster als Zusatz
        cats.add("Persenning")
        if has_any(["polster","upholstery","cushion","sellerie","tappezzeria","tapiceria","sattlerei"]):
            cats.add("Polster/Sattlerei")

    # Heizung/Klima/Kühlung
    if has_any(["webasto","eberspächer","eberspaecher","diesel heater","heater","heizung"]):
        cats.add("Heizung")
    if has_any(["aircon","air con","klimaanlage","hvac","marine air","dometic","climatisation","climatización","climatizzazione"]):
        cats.add("Klimaanlage")
    if has_any(["refrigeration","fridge","kühl","cooling","cold room","dometic","isotherm","waeco"]):
        cats.add("Kühlung")

    # Elektrik/Elektronik/Navigation/Instrumente
    if has_any(["victron","mastervolt","sterling","battery","batterie","inverter","charger","ladegerät","shore power","12v","24v","230v",
               "electrical","electricien","électricité","elettrico","elektrik","elektro"]):
        cats.add("Elektrik/Elektronik")
    if has_any(["raymarine","garmin","furuno","b&g","bandg","simrad","navico","navionics","ais","radar","plotter","chartplotter",
               "autopilot","wind sensor","depth","sounder","vHF","vhf","instrument","navigation","navigazione","navegación"]):
        cats.add("Navigation/Instrumente")

    # Rettungsmittel/Sicherheit
    if has_any(["liferaft","life raft","lifejacket","life jacket","rettung","safety","sicher","epirb","plb","flare",
               "lalizas","plastimo","seago","spinlock","crewsaver"]):
        cats.add("Rettungsmittel")

    # Tauwerk / Beschläge / Deck / Rigg
    if has_any(["rope","ropes","tauwerk","cordage","drisse","sheet","halyard","dyneema","marlow","gottifredi","lanex","cousin"]):
        cats.add("Tauwerk")
    if has_any(["hardware","beschläge","block","blocks","winch","winde","clutch","cleat","stoper","stopper",
               "harken","lewmar","selden","facnor","karver","antal","arken?","rutgerson","spinlock"]):
        cats.add("Beschläge")
    if has_any(["anchor","anker","windlass","chain","kette","deck gear","deck"]):
        cats.add("Anker/Deck")
    if has_any(["rigging","standing rigging","rigger","mast","spar","boom"]):
        cats.add("Rigg")

    # Sanitär / Hydraulik
    if has_any(["toilet","head","wc","sanitary","sanitär","pump","pumpe","seacock","seewasser","plumbing","hose","schlauch"]):
        cats.add("Sanitär")
    if has_any(["hydraulic","hydraulik","ram","steering","lenkung","jefa","furlex","traveller"]):
        cats.add("Hydraulik")

    # Farben/Pflege/Antifouling / GFK/Composite / Metallbau
    if has_any(["antifouling","paint","farbe","coating","gelcoat","polish","pflege","wax","epoxy","teak care","teak"]):
        cats.add("Farben/Pflege")
    if has_any(["fiberglass","gfk","grp","composite","lamination","laminierung","carbon","kevlar","resin","harz"]):
        cats.add("GFK/Composite")
    if has_any(["welding","schwei","inox","stainless","edelstahl","metalwork","metallbau","alu","aluminium"]):
        cats.add("Metallbau")

    # Transport/Trailer/Crane/Travelift
    if has_any(["crane","travel lift","travellift","hoist","kran","grue","lift"]):
        cats.add("Kran")
    if has_any(["trailer","transport","haulage","logistics","spedition"]):
        cats.add("Trailer/Transport")

    # Wenn trotz allem leer, als Sammelkategorie
    if not cats:
        cats.add("Etc.")

    # --- 3) stabile Reihenfolge (kontrolliertes Vokabular) ---
    order = [
        "Motor",
        "Segelmacher",
        "Persenning",
        "Polster/Sattlerei",
        "Werften",
        "Service/Repair",
        "Kran",
        "Klimaanlage",
        "Heizung",
        "Kühlung",
        "Elektrik/Elektronik",
        "Navigation/Instrumente",
        "Rigg",
        "Tauwerk",
        "Beschläge",
        "Anker/Deck",
        "Sanitär",
        "Hydraulik",
        "Farben/Pflege",
        "GFK/Composite",
        "Metallbau",
        "Trailer/Transport",
        "Bootszubehör",
        "Rettungsmittel",
        "Etc.",
    ]

    out = [c for c in order if c in cats]
    # Falls externe/unerwartete Kategorien doch mal entstehen:
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
