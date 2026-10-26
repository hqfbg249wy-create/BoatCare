#!/usr/bin/env python3
# Erzeugt den kleinschrittigen Leitfaden "marinedustrie.de -> Skipily via Make.com (mit KI)".
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, Preformatted, HRFlowable)
from reportlab.lib.styles import ParagraphStyle

OUT = os.path.dirname(os.path.abspath(__file__))
BLUE = colors.HexColor("#0a3d62")
ORANGE = colors.HexColor("#f97316")

st_title = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=17, leading=21, spaceAfter=3, textColor=BLUE)
st_sub   = ParagraphStyle("s", fontName="Helvetica", fontSize=9.5, leading=13, spaceAfter=8, textColor=colors.HexColor("#555555"))
st_h2    = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, spaceBefore=12, spaceAfter=5, textColor=BLUE)
st_step  = ParagraphStyle("step", fontName="Helvetica-Bold", fontSize=11, leading=15, spaceBefore=9, spaceAfter=3, textColor=ORANGE)
st_body  = ParagraphStyle("b", fontName="Helvetica", fontSize=10, leading=14, spaceAfter=4)
st_li    = ParagraphStyle("li", fontName="Helvetica", fontSize=10, leading=14, spaceAfter=2, leftIndent=10, bulletIndent=0)
st_note  = ParagraphStyle("n", fontName="Helvetica", fontSize=9, leading=12.5, spaceAfter=4, textColor=colors.HexColor("#334155"),
                          backColor=colors.HexColor("#eef6ff"), borderPadding=7, borderColor=colors.HexColor("#bfdbfe"), borderWidth=0.5)
st_ai    = ParagraphStyle("ai", fontName="Helvetica", fontSize=9, leading=12.5, spaceAfter=4, textColor=colors.HexColor("#3b0764"),
                          backColor=colors.HexColor("#f5f3ff"), borderPadding=7, borderColor=colors.HexColor("#ddd6fe"), borderWidth=0.5)
st_cell  = ParagraphStyle("c", fontName="Helvetica", fontSize=8.5, leading=11)
st_cellh = ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.white)
st_code  = ParagraphStyle("code", fontName="Courier", fontSize=8, leading=10.5, textColor=colors.HexColor("#1e293b"),
                          backColor=colors.HexColor("#f1f5f9"), borderPadding=6, spaceAfter=8, leftIndent=2)

def P(t): return Paragraph(t, st_body)
def H(t): return Paragraph(t, st_h2)
def STEP(t): return Paragraph(t, st_step)
def LI(t): return Paragraph("&bull;&nbsp; " + t, st_li)
def NOTE(t): return Paragraph("<b>Hinweis:</b> " + t, st_note)
def AI(t): return Paragraph("<b>KI (Make):</b> " + t, st_ai)
def CODE(t): return Preformatted(t, st_code)

API = ("POST https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api\n"
       "Header:  Content-Type: application/json\n"
       "         x-api-key: <DEIN_SKIPILY_PROVIDER_KEY>")

BODY = """{
  "sku":          "{{1.variants[1].sku}}",
  "name":         "{{ bereinigter_name }}",
  "manufacturer": "{{1.vendor}}",
  "description":  "{{ bereinigte_beschreibung }}",
  "price":        {{1.variants[1].price}},
  "currency":     "EUR",
  "ean":          "{{1.variants[1].barcode}}",
  "stock_quantity": {{1.variants[1].inventory_quantity}},
  "in_stock":     {{1.variants[1].inventory_quantity > 0}},
  "weight_kg":    {{1.variants[1].grams / 1000}},
  "images":       ["{{1.image.src}}"],
  "category_id":  {{ skipily_category_id_oder_null }},
  "is_active":    true
}"""

AI_SCENARIO_PROMPT = (
"Baue ein Make-Szenario: Trigger = Custom Webhook (empfaengt Shopify "
"products/create und products/update). Danach ein KI-Textmodul, das aus dem "
"Shopify-Produkt den Namen kuerzt, die Beschreibung von HTML befreit und eine "
"Oberkategorie vorschlaegt. Zum Schluss ein HTTP-Modul: POST JSON an eine "
"Skipily-API mit Header x-api-key.")

AI_CLEAN_PROMPT = (
"Du bekommst ein Shopify-Produkt (Titel, vendor, body_html, product_type, tags). "
"Gib NUR JSON zurueck: {\"name\": kurzer klarer Produktname ohne Werbefloskeln, "
"\"description\": Beschreibung als Klartext ohne HTML (max 400 Zeichen), "
"\"category\": eine der Skipily-Kategorien, die am besten passt}. "
"Waehle die Kategorie aus dieser Liste: <hier die Skipily-Kategorienamen einfuegen>.")

MAPPING = [
 ("Shopify-Feld", "Skipily-Feld (products-api)"),
 ("title", "name (ueber KI gekuerzt)"),
 ("vendor", "manufacturer"),
 ("body_html", "description (ueber KI, HTML entfernt)"),
 ("variants[].price", "price bzw. variants[].price"),
 ("variants[].sku", "sku bzw. variants[].sku"),
 ("variants[].barcode", "ean"),
 ("variants[].inventory_quantity", "stock_quantity / in_stock"),
 ("variants[].grams", "weight_kg (grams/1000)"),
 ("options + variants", "variant_options + variants (1 Zeile je Variante)"),
 ("image.src / images", "images[] (erstes Bild = Titelbild)"),
 ("product_type / tags", "category_id (ueber KI-Vorschlag + Zuordnung)"),
]

def mapping_table(rows):
    data = [[Paragraph(rows[0][0], st_cellh), Paragraph(rows[0][1], st_cellh)]]
    for a,b in rows[1:]:
        data.append([Paragraph(a, st_cell), Paragraph(b, st_cell)])
    t = Table(data, colWidths=[82*mm, 83*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),BLUE),
        ("GRID",(0,0),(-1,-1),0.4,colors.HexColor("#cbd5e1")),
        ("VALIGN",(0,0),(-1,-1),"TOP"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#f8fafc")]),
        ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),
        ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
    ]))
    return t

def build():
    doc = SimpleDocTemplate(os.path.join(OUT, "Anleitung-marinedustrie-Shopify-Skipily-KI.pdf"),
                            pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm,
                            title="marinedustrie.de -> Skipily via Make.com (mit KI)")
    e = []
    e.append(Paragraph("marinedustrie.de &rarr; Skipily: Shopify-Anbindung ueber Make.com", st_title))
    e.append(Paragraph("Kleinschrittige Anleitung. Mit Make-KI: der KI-Szenario-Assistent baut das Geruest, "
                       "ein KI-Textmodul bereitet jedes Produkt auf (Name kuerzen, HTML entfernen, Kategorie vorschlagen). "
                       "Stand: Produkt-Sync via x-api-key, lastfest mit Rate-Limit.", st_sub))
    e.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#cbd5e1"), spaceAfter=6))

    e.append(H("1. Ueberblick (zwei Richtungen)"))
    e.append(LI("<b>Produkte:</b> Shopify (marinedustrie.de) &rarr; Make &rarr; Skipily-Shop (automatisch bei Anlage/Aenderung)."))
    e.append(LI("<b>Bestellungen:</b> Skipily &rarr; Make &rarr; Shopify (Bestellung/Notiz anlegen). Optional, am Ende beschrieben."))

    e.append(H("2. Was du brauchst"))
    e.append(LI("Skipily-<b>Provider-Key</b> (Provider-Portal, Pro-Tarif) fuer den Header x-api-key."))
    e.append(LI("Shopify-Admin von marinedustrie.de (fuer Webhooks)."))
    e.append(LI("Ein Make.com-Konto. Fuer das KI-Textmodul ein KI-Zugang in Make (Make AI oder ein verbundenes OpenAI/Claude-Konto)."))

    e.append(H("3. Flow A: Produkte nach Skipily (Schritt fuer Schritt)"))

    e.append(STEP("Schritt 1: Szenario per Make-KI anlegen"))
    e.append(P("In Make: <b>Create a new scenario</b> &rarr; oben den KI-Assistenten nutzen (&bdquo;<i>Create with AI</i>&ldquo; / Prompt-Feld) "
               "und folgenden Text einfuegen. Die KI legt Trigger, KI-Modul und HTTP-Modul als Geruest an:"))
    e.append(AI(AI_SCENARIO_PROMPT))
    e.append(P("Die KI erstellt einen Entwurf. Die Feinheiten (URL, Header, Mapping) stellst du in den naechsten Schritten ein."))

    e.append(STEP("Schritt 2: Trigger = Custom Webhook"))
    e.append(LI("Erstes Modul <b>Webhooks &gt; Custom webhook</b> &rarr; <b>Add</b> &rarr; die erzeugte <b>URL kopieren</b>."))

    e.append(STEP("Schritt 3: Shopify-Webhooks auf die Make-URL"))
    e.append(LI("Shopify-Admin: <b>Einstellungen &rarr; Benachrichtigungen &rarr; Webhooks</b>."))
    e.append(LI("Zwei Webhooks (Format <b>JSON</b>) auf die Make-URL anlegen: <b>Produkterstellung</b> (products/create) und <b>Produktaktualisierung</b> (products/update)."))
    e.append(NOTE("Zum Testen in Shopify ein Produkt speichern. In Make unten &bdquo;Run once&ldquo; aktivieren, damit der Webhook die Datenstruktur lernt."))

    e.append(STEP("Schritt 4: KI-Modul - Produktdaten aufbereiten"))
    e.append(P("Modul <b>KI-Text</b> (Make AI / OpenAI / Claude). Es bekommt das Shopify-Produkt und liefert sauberes JSON "
               "(kurzer Name, Beschreibung ohne HTML, passende Kategorie). So wird aus den oft langen marinedustrie-Titeln ein klarer Shop-Eintrag."))
    e.append(AI(AI_CLEAN_PROMPT))
    e.append(NOTE("Die Skipily-Kategorienamen holst du einmalig: GET .../rest/v1/product_categories?select=name_de,slug "
                  "(Header apikey: anon). Die Liste in den Prompt einsetzen. Ohne Zuordnung bleibt category_id = null (Produkt funktioniert, nur unkategorisiert)."))

    e.append(STEP("Schritt 5: HTTP-Modul - an Skipily senden"))
    e.append(P("Modul <b>HTTP &gt; Make a request</b>. Methode POST. In die Felder die Webhook- und KI-Ausgaben mappen "
               "(Make schlaegt Zuordnungen mit <i>&bdquo;Map&ldquo;</i> teils per KI vor):"))
    e.append(CODE(API))
    e.append(CODE(BODY))
    e.append(P("Feld-Zuordnung Shopify &rarr; Skipily:"))
    e.append(mapping_table(MAPPING))

    e.append(STEP("Schritt 6: Testen"))
    e.append(LI("In Shopify ein Produkt anlegen/aendern &rarr; in Make laeuft das Szenario &rarr; im Skipily-Shop pruefen."))
    e.append(LI("Erscheint das Produkt mit sauberem Namen/Preis/Bestand, passt es."))

    e.append(STEP("Schritt 7: Scharf schalten"))
    e.append(LI("In Make unten <b>Scheduling</b> auf <b>ON</b>. Ab jetzt laeuft der Sync automatisch bei jeder Shopify-Aenderung."))

    e.append(H("4. Varianten (Durchmesser, Laenge, Farbe)"))
    e.append(LI("variant_options = Shopify-Optionen (Name + Werte). variants = eine Zeile je Shopify-Variante mit eigenem Preis/Bestand/SKU."))
    e.append(LI("variants ersetzt beim POST/PUT ALLE vorhandenen Varianten eines Produkts."))

    e.append(H("5. Flow B: Bestellungen Skipily -> Shopify (optional)"))
    e.append(LI("Zweites Szenario mit Custom-Webhook. Im Skipily-Provider-Profil die Make-URL als Bestell-Webhook hinterlegen."))
    e.append(LI("Skipily sendet bei Bestellungen signiert dorthin. In Make daraus eine Shopify-Bestellung (Admin-API) oder Notiz/Mail erzeugen."))

    e.append(H("6. Gut zu wissen"))
    e.append(LI("<b>Neu vs. Update:</b> POST legt an, PUT ?id=&lt;uuid&gt; aktualisiert. Fuer sauberes Update die Skipily-uuid je Shopify-Produkt in einem Make <b>Data Store</b> merken."))
    e.append(LI("<b>Bestaende:</b> products/update und die Shopify-Admin-API liefern inventory_quantity; optional zusaetzlich inventory_levels/update."))
    e.append(LI("<b>Rate-Limit:</b> die Skipily-products-api ist lastfest (Schreib-/Leselimit je Provider/IP). Bei Massenimport in Blöcken senden."))
    e.append(LI("<b>KI-Kosten im Griff:</b> das KI-Modul nur im Produkt-Flow nutzen (nicht in Schleifen), kurze Prompts, Ergebnis im Data Store cachen, damit unveraenderte Produkte die KI nicht erneut aufrufen."))
    e.append(LI("<b>Uebersetzung:</b> Skipily uebersetzt Name/Beschreibung on-demand in 6 Sprachen. Die KI in Make muss NICHT uebersetzen, nur bereinigen/kuerzen."))

    doc.build(e)
    print("PDF erstellt:", os.path.join(OUT, "Anleitung-marinedustrie-Shopify-Skipily-KI.pdf"))

if __name__ == "__main__":
    build()
