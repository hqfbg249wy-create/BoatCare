#!/usr/bin/env python3
# English guide "marinedustrie.de -> Skipily via Make.com (with AI)".
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Table,
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
st_li    = ParagraphStyle("li", fontName="Helvetica", fontSize=10, leading=14, spaceAfter=2, leftIndent=10)
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
def NOTE(t): return Paragraph("<b>Note:</b> " + t, st_note)
def AI(t): return Paragraph("<b>AI (Make):</b> " + t, st_ai)
def CODE(t): return Preformatted(t, st_code)

API = ("POST https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/products-api\n"
       "Header:  Content-Type: application/json\n"
       "         x-api-key: <YOUR_SKIPILY_PROVIDER_KEY>")

BODY = """{
  "sku":          "{{1.variants[1].sku}}",
  "name":         "{{ cleaned_name }}",
  "manufacturer": "{{1.vendor}}",
  "description":  "{{ cleaned_description }}",
  "price":        {{1.variants[1].price}},
  "currency":     "EUR",
  "ean":          "{{1.variants[1].barcode}}",
  "stock_quantity": {{1.variants[1].inventory_quantity}},
  "in_stock":     {{1.variants[1].inventory_quantity > 0}},
  "weight_kg":    {{1.variants[1].grams / 1000}},
  "images":       ["{{1.image.src}}"],
  "category_id":  {{ skipily_category_id_or_null }},
  "is_active":    true
}"""

AI_SCENARIO_PROMPT = (
"Build a Make scenario: Trigger = Custom Webhook (receives Shopify "
"products/create and products/update). Then an AI text module that shortens the "
"product name, strips HTML from the description and suggests a top category. "
"Finally an HTTP module: POST JSON to a Skipily API with header x-api-key.")

AI_CLEAN_PROMPT = (
"You receive a Shopify product (title, vendor, body_html, product_type, tags). "
"Return ONLY JSON: {\"name\": short clear product name without marketing fluff, "
"\"description\": description as plain text without HTML (max 400 chars), "
"\"category\": one of the Skipily categories that fits best}. "
"Choose the category from this list: <insert the Skipily category names here>.")

MAPPING = [
 ("Shopify field", "Skipily field (products-api)"),
 ("title", "name (shortened via AI)"),
 ("vendor", "manufacturer"),
 ("body_html", "description (via AI, HTML removed)"),
 ("variants[].price", "price or variants[].price"),
 ("variants[].sku", "sku or variants[].sku"),
 ("variants[].barcode", "ean"),
 ("variants[].inventory_quantity", "stock_quantity / in_stock"),
 ("variants[].grams", "weight_kg (grams/1000)"),
 ("options + variants", "variant_options + variants (1 row per variant)"),
 ("image.src / images", "images[] (first image = main image)"),
 ("product_type / tags", "category_id (via AI suggestion + mapping)"),
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
    doc = SimpleDocTemplate(os.path.join(OUT, "Guide-marinedustrie-Shopify-Skipily-AI.pdf"),
                            pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm,
                            title="marinedustrie.de -> Skipily via Make.com (with AI)")
    e = []
    e.append(Paragraph("marinedustrie.de &rarr; Skipily: Shopify integration via Make.com", st_title))
    e.append(Paragraph("Step-by-step guide. With Make AI: the AI scenario assistant builds the skeleton, "
                       "an AI text module processes each product (shorten name, remove HTML, suggest category). "
                       "Status: product sync via x-api-key, load-hardened with rate limit.", st_sub))
    e.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#cbd5e1"), spaceAfter=6))

    e.append(H("1. Overview (two directions)"))
    e.append(LI("<b>Products:</b> Shopify (marinedustrie.de) &rarr; Make &rarr; Skipily shop (automatic on create/update)."))
    e.append(LI("<b>Orders:</b> Skipily &rarr; Make &rarr; Shopify (create order/note). Optional, described at the end."))

    e.append(H("2. What you need"))
    e.append(LI("Skipily <b>provider key</b> (provider portal, Pro plan) for the x-api-key header."))
    e.append(LI("Shopify admin of marinedustrie.de (for webhooks)."))
    e.append(LI("A Make.com account. For the AI text module, AI access in Make (Make AI or a connected OpenAI/Claude account)."))

    e.append(H("3. Flow A: products to Skipily (step by step)"))

    e.append(STEP("Step 1: Create the scenario with Make AI"))
    e.append(P("In Make: <b>Create a new scenario</b> &rarr; use the AI assistant at the top (&bdquo;<i>Create with AI</i>&ldquo; / prompt field) "
               "and paste the following text. The AI creates trigger, AI module and HTTP module as a skeleton:"))
    e.append(AI(AI_SCENARIO_PROMPT))
    e.append(P("The AI creates a draft. You set the details (URL, header, mapping) in the next steps."))

    e.append(STEP("Step 2: Trigger = Custom Webhook"))
    e.append(LI("First module <b>Webhooks &gt; Custom webhook</b> &rarr; <b>Add</b> &rarr; <b>copy the URL</b> it generates."))

    e.append(STEP("Step 3: Shopify webhooks to the Make URL"))
    e.append(LI("Shopify admin: <b>Settings &rarr; Notifications &rarr; Webhooks</b>."))
    e.append(LI("Create two webhooks (format <b>JSON</b>) to the Make URL: <b>Product creation</b> (products/create) and <b>Product update</b> (products/update)."))
    e.append(NOTE("To test, save a product in Shopify. In Make, enable &bdquo;Run once&ldquo; so the webhook learns the data structure."))

    e.append(STEP("Step 4: AI module - process product data"))
    e.append(P("Module <b>AI text</b> (Make AI / OpenAI / Claude). It receives the Shopify product and returns clean JSON "
               "(short name, description without HTML, matching category). This turns the often long marinedustrie titles into a clean shop entry."))
    e.append(AI(AI_CLEAN_PROMPT))
    e.append(NOTE("Fetch the Skipily category names once: GET .../rest/v1/product_categories?select=name_de,slug "
                  "(header apikey: anon). Paste that list into the prompt. Without mapping, category_id stays null (product works, just uncategorized)."))

    e.append(STEP("Step 5: HTTP module - send to Skipily"))
    e.append(P("Module <b>HTTP &gt; Make a request</b>. Method POST. Map the webhook and AI outputs into the fields "
               "(Make suggests mappings with <i>&bdquo;Map&ldquo;</i>, partly via AI):"))
    e.append(CODE(API))
    e.append(CODE(BODY))
    e.append(P("Field mapping Shopify &rarr; Skipily:"))
    e.append(mapping_table(MAPPING))

    e.append(STEP("Step 6: Test"))
    e.append(LI("Create/update a product in Shopify &rarr; the scenario runs in Make &rarr; check the Skipily shop."))
    e.append(LI("If the product shows up with a clean name/price/stock, it works."))

    e.append(STEP("Step 7: Go live"))
    e.append(LI("In Make set <b>Scheduling</b> to <b>ON</b>. From now on the sync runs automatically on every Shopify change."))

    e.append(H("4. Variants (diameter, length, colour)"))
    e.append(LI("variant_options = Shopify options (name + values). variants = one row per Shopify variant with its own price/stock/SKU."))
    e.append(LI("variants replaces ALL existing variants of a product on POST/PUT."))

    e.append(H("5. Flow B: orders Skipily -> Shopify (optional)"))
    e.append(LI("Second scenario with a Custom webhook. In the Skipily provider profile, set the Make URL as the order webhook."))
    e.append(LI("Skipily posts signed to that URL on order events. In Make, create a Shopify order (Admin API) or a note/email from it."))

    e.append(H("6. Good to know"))
    e.append(LI("<b>New vs. update:</b> POST creates, PUT ?id=&lt;uuid&gt; updates. For clean updates, store the Skipily uuid per Shopify product in a Make <b>Data Store</b>."))
    e.append(LI("<b>Stock:</b> products/update and the Shopify Admin API provide inventory_quantity; optionally add inventory_levels/update."))
    e.append(LI("<b>Rate limit:</b> the Skipily products-api is load-hardened (write/read limit per provider/IP). For bulk import, send in batches."))
    e.append(LI("<b>Keep AI costs in check:</b> use the AI module only in the product flow (not in loops), keep prompts short, cache the result in the Data Store so unchanged products do not call the AI again."))
    e.append(LI("<b>Translation:</b> Skipily translates name/description on demand into 6 languages. The AI in Make does NOT need to translate, only clean up/shorten."))

    doc.build(e)
    print("PDF created:", os.path.join(OUT, "Guide-marinedustrie-Shopify-Skipily-AI.pdf"))

if __name__ == "__main__":
    build()
