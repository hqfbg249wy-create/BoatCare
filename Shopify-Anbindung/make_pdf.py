#!/usr/bin/env python3
# Erzeugt die Integrations-Anleitung (Shopify <-> Skipily via Make.com) als PDF
# in Deutsch und Niederlaendisch.
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, Preformatted)
from reportlab.lib.styles import ParagraphStyle

OUT = os.path.dirname(os.path.abspath(__file__))
BLUE = colors.HexColor("#0a3d62")

st_title = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=16, leading=20, spaceAfter=4, textColor=BLUE)
st_sub   = ParagraphStyle("s", fontName="Helvetica", fontSize=9.5, leading=13, spaceAfter=10, textColor=colors.HexColor("#555555"))
st_h2    = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, spaceBefore=10, spaceAfter=5, textColor=BLUE)
st_body  = ParagraphStyle("b", fontName="Helvetica", fontSize=10, leading=14, spaceAfter=5)
st_cell  = ParagraphStyle("c", fontName="Helvetica", fontSize=8.5, leading=11)
st_cellh = ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.white)
st_code  = ParagraphStyle("code", fontName="Courier", fontSize=8, leading=10.5, textColor=colors.HexColor("#1e293b"),
                          backColor=colors.HexColor("#f1f5f9"), borderPadding=6, spaceAfter=8, leftIndent=2)

def P(t): return Paragraph(t, st_body)
def H(t): return Paragraph(t, st_h2)

BODY_SIMPLE = """POST https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api
Header:  Content-Type: application/json
         x-api-key: <DEIN_SKIPILY_PROVIDER_KEY>

{
  "sku": "{{1.variants[1].sku}}",
  "name": "{{1.title}}",
  "manufacturer": "{{1.vendor}}",
  "description": "{{ HTML entfernt aus 1.body_html }}",
  "price": {{1.variants[1].price}},
  "currency": "EUR",
  "ean": "{{1.variants[1].barcode}}",
  "stock_quantity": {{1.variants[1].inventory_quantity}},
  "in_stock": {{ inventory_quantity > 0 }},
  "weight_kg": {{1.variants[1].grams / 1000}},
  "images": ["{{1.image.src}}"],
  "category_id": null,
  "is_active": true
}"""

BODY_VAR = """{
  "name": "Liros Race SK78", "manufacturer": "Liros",
  "currency": "EUR", "price": 100.0, "sku": "LIROS-SK78",
  "variant_options": [{"name":"Durchmesser","values":["6mm","8mm","10mm"]}],
  "variants": [
    {"attributes":{"Durchmesser":"6mm"},"price":100.0,"stock_quantity":20,"sku":"SK78-6"},
    {"attributes":{"Durchmesser":"8mm"},"price":120.0,"stock_quantity":15,"sku":"SK78-8"}
  ]
}"""

ORDER = """POST an service_providers.webhook_url (im Provider-Profil)
Header:  X-BoatCare-Event, X-BoatCare-Signature (HMAC)

{
  "event_type": "order_created",
  "order": {
    "order_number": "SK-2026-000123", "total": 129.9, "currency": "EUR",
    "buyer_name": "Max Mustermann", "shipping_city": "Bonn",
    "line_items": [
      {"product_name":"Liros Race SK78","product_sku":"LIROS-SK78",
       "variant_sku":"SK78-8","variant":{"Durchmesser":"8mm"},
       "quantity":2,"unit_price":120.0,"total":240.0}
    ]
  }
}"""

def mapping_table(rows, header):
    data = [[Paragraph(header[0], st_cellh), Paragraph(header[1], st_cellh)]]
    for a,b in rows:
        data.append([Paragraph(a, st_cell), Paragraph(b, st_cell)])
    t = Table(data, colWidths=[85*mm, 80*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),BLUE),
        ("GRID",(0,0),(-1,-1),0.4,colors.HexColor("#cbd5e1")),
        ("VALIGN",(0,0),(-1,-1),"TOP"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#f8fafc")]),
        ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),
        ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
    ]))
    return t

CONTENT = {
 "de": {
   "file": "Anleitung-Shopify-Skipily-Make.pdf",
   "title": "Shopify-Anbindung an Skipily ueber Make.com",
   "sub": "Praezise Anleitung fuer den Produkt- und Bestell-Sync (Shop: marinedustrie.de, ein Shopify-Store). Stand: einfache Auth nur per x-api-key, lastfest mit Rate-Limit.",
   "arch_h": "1. Architektur",
   "arch": "Zwei Datenfluesse ueber Make.com:<br/>"
           "<b>Flow A - Produkte:</b> Shopify -> Make -> Skipily Products-API (Produkte und Bestaende in den Skipily-Shop).<br/>"
           "<b>Flow B - Bestellungen:</b> Skipily Order-Webhook -> Make -> Shopify (Bestellung/Notiz anlegen).",
   "pre_h": "2. Voraussetzungen",
   "pre": "1) <b>Skipily-Provider-API-Key</b> (Provider-Portal, Pro-Tarif). "
          "2) <b>Endpoint:</b> POST/PUT https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api. "
          "3) Auth ausschliesslich per Header <b>x-api-key</b> (kein weiterer Schluessel noetig). "
          "4) <b>Rate-Limit:</b> 300 Schreib-Anfragen/min je Provider, 600 Lese-Anfragen/min je IP; bei Ueberlast antwortet die API mit HTTP 429.",
   "fa_h": "3. Flow A: Shopify -> Skipily",
   "fa": "1) In Make ein Szenario anlegen und den Blueprint importieren (Datei make-blueprint-shopify-to-skipily.json). Der Trigger ist ein Custom-Webhook; dessen URL kopieren.<br/>"
         "2) In Shopify unter Einstellungen -> Benachrichtigungen -> Webhooks zwei Webhooks (Format JSON) auf die Make-URL: 'Produkterstellung' (products/create) und 'Produktaktualisierung' (products/update).<br/>"
         "3) Im HTTP-Modul den Platzhalter x-api-key durch deinen Skipily-Provider-Key ersetzen.",
   "map_h": "4. Feld-Zuordnung (Shopify -> Skipily)",
   "map": [("title","name"),("vendor","manufacturer"),("body_html (HTML entfernt)","description"),
           ("variants[].price","price"),("variants[].sku","sku / part_number"),("variants[].barcode","ean"),
           ("variants[].inventory_quantity","stock_quantity / in_stock"),("variants[].grams / 1000","weight_kg"),
           ("images[].src","images[]"),("product_type / tags","category_id (Mapping) / tags"),("status = active","is_active")],
   "map_header": ("Shopify","Skipily"),
   "body_h": "5. Request-Body (einfaches Produkt)",
   "var_h": "6. Request-Body mit Varianten",
   "var_note": "variant_options = Shopify-Optionen (Name + Werte). variants = eine Zeile je Shopify-Variante. variants ersetzt beim POST/PUT ALLE vorhandenen Varianten.",
   "fb_h": "7. Flow B: Skipily -> Shopify (Bestellungen)",
   "fb": "1) In Make einen zweiten Custom-Webhook anlegen. 2) Dessen URL im Provider-Profil als webhook_url hinterlegen. "
         "3) Skipily POSTet bei Bestell-Ereignissen signiert dorthin (siehe unten). In Make daraus eine Shopify-Bestellung (Admin-API) oder Notiz/Mail erzeugen.",
   "notes_h": "8. Hinweise",
   "notes": "<b>Kategorien:</b> Skipily nutzt category_id (UUID). Liste per GET .../rest/v1/product_categories?select=id,name_de,slug (Header apikey: <anon>). Ohne Mapping bleibt category_id null (Produkt unkategorisiert, funktioniert).<br/>"
            "<b>Bestaende:</b> products.json enthaelt keine Lagermenge; der products/update-Webhook und die Shopify-Admin-API liefern inventory_quantity. Optional zusaetzlich Webhook inventory_levels/update.<br/>"
            "<b>Neu vs. Update:</b> POST legt an, PUT ?id=<uuid> aktualisiert. Fuer sauberes Update die Skipily-uuid je Shopify-Produkt in einem Make Data Store merken.",
 },
 "nl": {
   "file": "Handleiding-Shopify-Skipily-Make.pdf",
   "title": "Shopify koppelen aan Skipily via Make.com",
   "sub": "Nauwkeurige handleiding voor product- en bestelsynchronisatie (winkel: marinedustrie.de, een Shopify-store). Status: eenvoudige authenticatie alleen via x-api-key, belastbaar met rate-limit.",
   "arch_h": "1. Architectuur",
   "arch": "Twee gegevensstromen via Make.com:<br/>"
           "<b>Stroom A - Producten:</b> Shopify -> Make -> Skipily Products-API (producten en voorraden naar de Skipily-shop).<br/>"
           "<b>Stroom B - Bestellingen:</b> Skipily order-webhook -> Make -> Shopify (bestelling/notitie aanmaken).",
   "pre_h": "2. Vereisten",
   "pre": "1) <b>Skipily provider-API-sleutel</b> (Provider-portaal, Pro-abonnement). "
          "2) <b>Endpoint:</b> POST/PUT https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api. "
          "3) Authenticatie uitsluitend via header <b>x-api-key</b> (geen andere sleutel nodig). "
          "4) <b>Rate-limit:</b> 300 schrijfverzoeken/min per provider, 600 leesverzoeken/min per IP; bij overbelasting antwoordt de API met HTTP 429.",
   "fa_h": "3. Stroom A: Shopify -> Skipily",
   "fa": "1) Maak in Make een scenario en importeer de blueprint (bestand make-blueprint-shopify-to-skipily.json). De trigger is een Custom-webhook; kopieer de URL.<br/>"
         "2) In Shopify onder Instellingen -> Meldingen -> Webhooks twee webhooks (formaat JSON) naar de Make-URL: 'Product aangemaakt' (products/create) en 'Product bijgewerkt' (products/update).<br/>"
         "3) Vervang in de HTTP-module de placeholder x-api-key door jouw Skipily provider-sleutel.",
   "map_h": "4. Veldtoewijzing (Shopify -> Skipily)",
   "map": [("title","name"),("vendor","manufacturer"),("body_html (HTML verwijderd)","description"),
           ("variants[].price","price"),("variants[].sku","sku / part_number"),("variants[].barcode","ean"),
           ("variants[].inventory_quantity","stock_quantity / in_stock"),("variants[].grams / 1000","weight_kg"),
           ("images[].src","images[]"),("product_type / tags","category_id (mapping) / tags"),("status = active","is_active")],
   "map_header": ("Shopify","Skipily"),
   "body_h": "5. Request-body (eenvoudig product)",
   "var_h": "6. Request-body met varianten",
   "var_note": "variant_options = Shopify-opties (naam + waarden). variants = een regel per Shopify-variant. variants vervangt bij POST/PUT ALLE bestaande varianten.",
   "fb_h": "7. Stroom B: Skipily -> Shopify (bestellingen)",
   "fb": "1) Maak in Make een tweede Custom-webhook. 2) Zet die URL in het providerprofiel als webhook_url. "
         "3) Skipily POST bij bestelgebeurtenissen ondertekend naar die URL (zie onder). Maak in Make daaruit een Shopify-bestelling (Admin-API) of notitie/mail.",
   "notes_h": "8. Aandachtspunten",
   "notes": "<b>Categorieen:</b> Skipily gebruikt category_id (UUID). Lijst via GET .../rest/v1/product_categories?select=id,name_de,slug (header apikey: <anon>). Zonder mapping blijft category_id null (product zonder categorie, werkt wel).<br/>"
            "<b>Voorraden:</b> products.json bevat geen voorraadaantal; de products/update-webhook en de Shopify Admin-API leveren inventory_quantity. Optioneel extra webhook inventory_levels/update.<br/>"
            "<b>Nieuw vs. bijwerken:</b> POST maakt aan, PUT ?id=<uuid> werkt bij. Voor correct bijwerken de Skipily-uuid per Shopify-product bewaren in een Make Data Store.",
 },
}

def build(lang, c):
    story = [Paragraph(c["title"], st_title), Paragraph(c["sub"], st_sub)]
    story += [H(c["arch_h"]), P(c["arch"])]
    story += [H(c["pre_h"]), P(c["pre"])]
    story += [H(c["fa_h"]), P(c["fa"])]
    story += [H(c["map_h"]), mapping_table(c["map"], c["map_header"]), Spacer(1,6)]
    story += [H(c["body_h"]), Preformatted(BODY_SIMPLE, st_code)]
    story += [H(c["var_h"]), P(c["var_note"]), Preformatted(BODY_VAR, st_code)]
    story += [H(c["fb_h"]), P(c["fb"]), Preformatted(ORDER, st_code)]
    story += [H(c["notes_h"]), P(c["notes"])]
    path = os.path.join(OUT, c["file"])
    doc = SimpleDocTemplate(path, pagesize=A4, title=c["title"],
                            leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm)
    doc.build(story)
    print("OK", c["file"], os.path.getsize(path), "bytes")

for lang, c in CONTENT.items():
    build(lang, c)
print("fertig")
