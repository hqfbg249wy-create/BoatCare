#!/usr/bin/env python3
# Nederlandstalige handleiding "marinedustrie.de -> Skipily via Make.com (met AI)".
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
def NOTE(t): return Paragraph("<b>Let op:</b> " + t, st_note)
def AI(t): return Paragraph("<b>AI (Make):</b> " + t, st_ai)
def CODE(t): return Preformatted(t, st_code)

API = ("POST https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api\n"
       "Header:  Content-Type: application/json\n"
       "         x-api-key: <JOUW_SKIPILY_PROVIDER_KEY>")

BODY = """{
  "sku":          "{{1.variants[1].sku}}",
  "name":         "{{ opgeschoonde_naam }}",
  "manufacturer": "{{1.vendor}}",
  "description":  "{{ opgeschoonde_omschrijving }}",
  "price":        {{1.variants[1].price}},
  "currency":     "EUR",
  "ean":          "{{1.variants[1].barcode}}",
  "stock_quantity": {{1.variants[1].inventory_quantity}},
  "in_stock":     {{1.variants[1].inventory_quantity > 0}},
  "weight_kg":    {{1.variants[1].grams / 1000}},
  "images":       ["{{1.image.src}}"],
  "category_id":  {{ skipily_category_id_of_null }},
  "is_active":    true
}"""

AI_SCENARIO_PROMPT = (
"Bouw een Make-scenario: Trigger = Custom Webhook (ontvangt Shopify "
"products/create en products/update). Daarna een AI-tekstmodule die uit het "
"Shopify-product de naam inkort, de omschrijving van HTML ontdoet en een "
"hoofdcategorie voorstelt. Tot slot een HTTP-module: POST JSON naar een "
"Skipily-API met header x-api-key.")

AI_CLEAN_PROMPT = (
"Je krijgt een Shopify-product (title, vendor, body_html, product_type, tags). "
"Geef ALLEEN JSON terug: {\"name\": korte duidelijke productnaam zonder reclametaal, "
"\"description\": omschrijving als platte tekst zonder HTML (max 400 tekens), "
"\"category\": een van de Skipily-categorieen die het best past}. "
"Kies de categorie uit deze lijst: <hier de Skipily-categorienamen invoegen>.")

MAPPING = [
 ("Shopify-veld", "Skipily-veld (products-api)"),
 ("title", "name (via AI ingekort)"),
 ("vendor", "manufacturer"),
 ("body_html", "description (via AI, HTML verwijderd)"),
 ("variants[].price", "price resp. variants[].price"),
 ("variants[].sku", "sku resp. variants[].sku"),
 ("variants[].barcode", "ean"),
 ("variants[].inventory_quantity", "stock_quantity / in_stock"),
 ("variants[].grams", "weight_kg (grams/1000)"),
 ("options + variants", "variant_options + variants (1 regel per variant)"),
 ("image.src / images", "images[] (eerste afbeelding = hoofdafbeelding)"),
 ("product_type / tags", "category_id (via AI-voorstel + toewijzing)"),
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
    doc = SimpleDocTemplate(os.path.join(OUT, "Handleiding-marinedustrie-Shopify-Skipily-AI.pdf"),
                            pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm,
                            title="marinedustrie.de -> Skipily via Make.com (met AI)")
    e = []
    e.append(Paragraph("marinedustrie.de &rarr; Skipily: Shopify-koppeling via Make.com", st_title))
    e.append(Paragraph("Stapsgewijze handleiding. Met Make-AI: de AI-scenario-assistent bouwt het raamwerk, "
                       "een AI-tekstmodule verwerkt elk product (naam inkorten, HTML verwijderen, categorie voorstellen). "
                       "Status: productsync via x-api-key, belastbaar met rate-limit.", st_sub))
    e.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#cbd5e1"), spaceAfter=6))

    e.append(H("1. Overzicht (twee richtingen)"))
    e.append(LI("<b>Producten:</b> Shopify (marinedustrie.de) &rarr; Make &rarr; Skipily-shop (automatisch bij aanmaken/wijzigen)."))
    e.append(LI("<b>Bestellingen:</b> Skipily &rarr; Make &rarr; Shopify (bestelling/notitie aanmaken). Optioneel, achteraan beschreven."))

    e.append(H("2. Wat je nodig hebt"))
    e.append(LI("Skipily-<b>provider-sleutel</b> (provider-portaal, Pro-tarief) voor de header x-api-key."))
    e.append(LI("Shopify-beheer van marinedustrie.de (voor webhooks)."))
    e.append(LI("Een Make.com-account. Voor de AI-tekstmodule een AI-toegang in Make (Make AI of een gekoppeld OpenAI/Claude-account)."))

    e.append(H("3. Stroom A: producten naar Skipily (stap voor stap)"))

    e.append(STEP("Stap 1: Scenario via Make-AI aanmaken"))
    e.append(P("In Make: <b>Create a new scenario</b> &rarr; gebruik bovenaan de AI-assistent (&bdquo;<i>Create with AI</i>&ldquo; / promptveld) "
               "en plak de volgende tekst. De AI maakt trigger, AI-module en HTTP-module als raamwerk aan:"))
    e.append(AI(AI_SCENARIO_PROMPT))
    e.append(P("De AI maakt een concept. De details (URL, header, mapping) stel je in de volgende stappen in."))

    e.append(STEP("Stap 2: Trigger = Custom Webhook"))
    e.append(LI("Eerste module <b>Webhooks &gt; Custom webhook</b> &rarr; <b>Add</b> &rarr; de aangemaakte <b>URL kopieren</b>."))

    e.append(STEP("Stap 3: Shopify-webhooks naar de Make-URL"))
    e.append(LI("Shopify-beheer: <b>Instellingen &rarr; Meldingen &rarr; Webhooks</b>."))
    e.append(LI("Twee webhooks (formaat <b>JSON</b>) naar de Make-URL aanmaken: <b>Product aangemaakt</b> (products/create) en <b>Product bijgewerkt</b> (products/update)."))
    e.append(NOTE("Om te testen in Shopify een product opslaan. In Make onderaan &bdquo;Run once&ldquo; aanzetten, zodat de webhook de datastructuur leert."))

    e.append(STEP("Stap 4: AI-module - productdata verwerken"))
    e.append(P("Module <b>AI-tekst</b> (Make AI / OpenAI / Claude). Ze krijgt het Shopify-product en levert nette JSON "
               "(korte naam, omschrijving zonder HTML, passende categorie). Zo wordt uit de vaak lange marinedustrie-titels een duidelijke shopvermelding."))
    e.append(AI(AI_CLEAN_PROMPT))
    e.append(NOTE("De Skipily-categorienamen haal je eenmalig op: GET .../rest/v1/product_categories?select=name_de,slug "
                  "(header apikey: anon). Plak die lijst in de prompt. Zonder toewijzing blijft category_id = null (product werkt, alleen zonder categorie)."))

    e.append(STEP("Stap 5: HTTP-module - naar Skipily sturen"))
    e.append(P("Module <b>HTTP &gt; Make a request</b>. Methode POST. In de velden de webhook- en AI-uitvoer mappen "
               "(Make stelt toewijzingen met <i>&bdquo;Map&ldquo;</i> deels via AI voor):"))
    e.append(CODE(API))
    e.append(CODE(BODY))
    e.append(P("Veldtoewijzing Shopify &rarr; Skipily:"))
    e.append(mapping_table(MAPPING))

    e.append(STEP("Stap 6: Testen"))
    e.append(LI("In Shopify een product aanmaken/wijzigen &rarr; in Make draait het scenario &rarr; in de Skipily-shop controleren."))
    e.append(LI("Verschijnt het product met nette naam/prijs/voorraad, dan klopt het."))

    e.append(STEP("Stap 7: Live zetten"))
    e.append(LI("In Make onderaan <b>Scheduling</b> op <b>ON</b>. Vanaf nu loopt de sync automatisch bij elke Shopify-wijziging."))

    e.append(H("4. Varianten (diameter, lengte, kleur)"))
    e.append(LI("variant_options = Shopify-opties (naam + waarden). variants = een regel per Shopify-variant met eigen prijs/voorraad/SKU."))
    e.append(LI("variants vervangt bij POST/PUT ALLE bestaande varianten van een product."))

    e.append(H("5. Stroom B: bestellingen Skipily -> Shopify (optioneel)"))
    e.append(LI("Tweede scenario met Custom-webhook. In het Skipily-providerprofiel de Make-URL als bestel-webhook opgeven."))
    e.append(LI("Skipily stuurt bij bestellingen ondertekend daarheen. Maak in Make daaruit een Shopify-bestelling (Admin-API) of notitie/mail."))

    e.append(H("6. Goed om te weten"))
    e.append(LI("<b>Nieuw vs. bijwerken:</b> POST maakt aan, PUT ?id=&lt;uuid&gt; werkt bij. Voor correct bijwerken de Skipily-uuid per Shopify-product bewaren in een Make <b>Data Store</b>."))
    e.append(LI("<b>Voorraad:</b> products/update en de Shopify Admin-API leveren inventory_quantity; optioneel extra inventory_levels/update."))
    e.append(LI("<b>Rate-limit:</b> de Skipily-products-api is belastbaar (schrijf-/leeslimiet per provider/IP). Bij massale import in blokken sturen."))
    e.append(LI("<b>AI-kosten in de hand:</b> de AI-module alleen in de productstroom gebruiken (niet in lussen), korte prompts, resultaat in de Data Store cachen zodat onveranderde producten de AI niet opnieuw aanroepen."))
    e.append(LI("<b>Vertaling:</b> Skipily vertaalt naam/omschrijving on-demand in 6 talen. De AI in Make hoeft NIET te vertalen, alleen op te schonen/in te korten."))

    doc.build(e)
    print("PDF aangemaakt:", os.path.join(OUT, "Handleiding-marinedustrie-Shopify-Skipily-AI.pdf"))

if __name__ == "__main__":
    build()
