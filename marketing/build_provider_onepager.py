#!/usr/bin/env python3
"""Skipily Provider-API Onepager — 6 Sprachen, je 1 Seite, Logo oben."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Image,
                                Table, TableStyle, PageBreak, HRFlowable)

LOGO = "Logo/Skipily_Logo_Slogan_Dark_2000x1200.png"
OUT = "marketing/Skipily_Provider_API_Onepager.pdf"
NAVY = colors.HexColor("#0B1D3A")
ORANGE = colors.HexColor("#f97316")
GREY = colors.HexColor("#475569")

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Title"], fontName="Helvetica-Bold",
                    fontSize=18, textColor=NAVY, spaceAfter=2, alignment=1)
SUB = ParagraphStyle("SUB", parent=styles["Normal"], fontSize=9.5, textColor=ORANGE,
                     alignment=1, spaceAfter=10, fontName="Helvetica-Bold")
SEC = ParagraphStyle("SEC", parent=styles["Normal"], fontName="Helvetica-Bold",
                     fontSize=11, textColor=NAVY, spaceBefore=8, spaceAfter=3)
BODY = ParagraphStyle("BODY", parent=styles["Normal"], fontSize=9.2, leading=13,
                      textColor=colors.HexColor("#1e293b"))
FOOT = ParagraphStyle("FOOT", parent=styles["Normal"], fontSize=8, textColor=GREY, alignment=1)

# ── Inhalte je Sprache ──
# Struktur: title, sub, sections [(heading, [bullets])], flow (list), footer
DATA = {
"de": {
 "title": "Shop-Anbindung per API",
 "sub": "Für Betriebe mit eigenem Shop- oder Warenwirtschaftssystem",
 "sections": [
  ("1. Voraussetzungen & Zugang", [
    "Tarif Pro/Enterprise, Shop aktiv (is_shop_active)",
    "API-Schlüssel selbst erzeugen: Portal &rarr; Stammdaten &rarr; API & Integration",
    "Auth-Header bei jedem Aufruf: <b>x-api-key: &lt;key&gt;</b>",
    "Jeder Schlüssel sieht nur die eigenen Daten"]),
  ("2. Produkte", [
    "GET/POST/PUT <b>products-api</b> &mdash; Katalog abrufen, anlegen, aktualisieren",
    "Alternativ CSV-Import im Portal (DE/EN-Header, dt. Zahlen, GTIN&rarr;ean)"]),
  ("3. Bestellungen (Shopify / Odoo)", [
    "GET <b>orders-api?updated_since=</b> &mdash; Inkrement-Sync, nur Geändertes",
    "Webhook (Push) bei bezahlter Bestellung an deine webhook_url (Echtzeit)",
    "PUT <b>orders-api?id=</b> &mdash; Status + Tracking zurückschreiben, Käufer wird informiert"]),
  ("4. Versandkosten", [
    "Frei ab Betrag (z.B. 85&euro; DE) + gewichtsbasiert je Zone (Heimat/EU/Welt)",
    "Automatisch im Checkout berechnet"]),
  ("5. Zahlung & Provision", [
    "Stripe; Auszahlung über Stripe Connect (einmaliges Onboarding)",
    "Provision wird automatisch einbehalten"]),
 ],
 "flowh": "Integrations-Flow",
 "flow": ["Pro werden + Shop aktiv + Stripe Connect", "API-Key erzeugen, webhook_url setzen",
          "Produkte via API/CSV einspielen", "Versandregeln im Portal setzen",
          "Bestellung: Webhook empfangen &rarr; in Odoo/Shopify anlegen",
          "Versand &rarr; PUT status=shipped + Tracking"],
 "foot": "Vollständige Doku mit Beispielen: docs/orders-api.md &nbsp;&bull;&nbsp; skipily.app",
},
"en": {
 "title": "Shop integration via API",
 "sub": "For businesses with their own shop or ERP system",
 "sections": [
  ("1. Requirements & access", [
    "Pro/Enterprise plan, shop active (is_shop_active)",
    "Generate API key yourself: Portal &rarr; Company data &rarr; API & Integration",
    "Auth header on every call: <b>x-api-key: &lt;key&gt;</b>",
    "Each key only sees its own data"]),
  ("2. Products", [
    "GET/POST/PUT <b>products-api</b> &mdash; query, create, update catalog",
    "Or CSV import in the portal (DE/EN headers, EU numbers, GTIN&rarr;ean)"]),
  ("3. Orders (Shopify / Odoo)", [
    "GET <b>orders-api?updated_since=</b> &mdash; incremental sync, changed only",
    "Webhook (push) on paid order to your webhook_url (real time)",
    "PUT <b>orders-api?id=</b> &mdash; write back status + tracking, buyer is notified"]),
  ("4. Shipping", [
    "Free above a threshold (e.g. 85&euro; DE) + weight-based per zone (home/EU/world)",
    "Calculated automatically at checkout"]),
  ("5. Payment & commission", [
    "Stripe; payout via Stripe Connect (one-time onboarding)",
    "Commission is withheld automatically"]),
 ],
 "flowh": "Integration flow",
 "flow": ["Go Pro + shop active + Stripe Connect", "Generate API key, set webhook_url",
          "Upload products via API/CSV", "Set shipping rules in the portal",
          "Order: receive webhook &rarr; create in Odoo/Shopify",
          "Shipment &rarr; PUT status=shipped + tracking"],
 "foot": "Full docs with examples: docs/orders-api.md &nbsp;&bull;&nbsp; skipily.app",
},
"fr": {
 "title": "Intégration boutique via API",
 "sub": "Pour les entreprises avec leur propre boutique ou ERP",
 "sections": [
  ("1. Conditions & accès", [
    "Forfait Pro/Enterprise, boutique active (is_shop_active)",
    "Générez votre clé API : Portail &rarr; Données &rarr; API & Integration",
    "En-tête à chaque appel : <b>x-api-key: &lt;clé&gt;</b>",
    "Chaque clé ne voit que ses propres données"]),
  ("2. Produits", [
    "GET/POST/PUT <b>products-api</b> &mdash; consulter, créer, mettre à jour",
    "Ou import CSV dans le portail (en-têtes DE/EN, nombres EU, GTIN&rarr;ean)"]),
  ("3. Commandes (Shopify / Odoo)", [
    "GET <b>orders-api?updated_since=</b> &mdash; sync incrémentale",
    "Webhook (push) à la commande payée vers votre webhook_url (temps réel)",
    "PUT <b>orders-api?id=</b> &mdash; renvoyer statut + suivi, l'acheteur est notifié"]),
  ("4. Frais de port", [
    "Gratuit au-delà d'un montant (ex. 85&euro; DE) + au poids par zone",
    "Calculé automatiquement au paiement"]),
  ("5. Paiement & commission", [
    "Stripe ; versement via Stripe Connect (onboarding unique)",
    "La commission est prélevée automatiquement"]),
 ],
 "flowh": "Flux d'intégration",
 "flow": ["Passer Pro + boutique active + Stripe Connect", "Générer la clé API, définir webhook_url",
          "Importer les produits via API/CSV", "Définir les règles de port",
          "Commande : recevoir le webhook &rarr; créer dans Odoo/Shopify",
          "Expédition &rarr; PUT status=shipped + suivi"],
 "foot": "Documentation complète : docs/orders-api.md &nbsp;&bull;&nbsp; skipily.app",
},
"it": {
 "title": "Integrazione shop via API",
 "sub": "Per aziende con un proprio shop o gestionale (ERP)",
 "sections": [
  ("1. Requisiti & accesso", [
    "Piano Pro/Enterprise, shop attivo (is_shop_active)",
    "Genera la tua chiave API: Portale &rarr; Dati &rarr; API & Integrazione",
    "Header ad ogni chiamata: <b>x-api-key: &lt;chiave&gt;</b>",
    "Ogni chiave vede solo i propri dati"]),
  ("2. Prodotti", [
    "GET/POST/PUT <b>products-api</b> &mdash; consultare, creare, aggiornare",
    "Oppure import CSV nel portale (intestazioni DE/EN, numeri EU, GTIN&rarr;ean)"]),
  ("3. Ordini (Shopify / Odoo)", [
    "GET <b>orders-api?updated_since=</b> &mdash; sync incrémentale",
    "Webhook (push) all'ordine pagato verso webhook_url (tempo reale)",
    "PUT <b>orders-api?id=</b> &mdash; riscrivere stato + tracking, l'acquirente è avvisato"]),
  ("4. Spese di spedizione", [
    "Gratis oltre un importo (es. 85&euro; DE) + a peso per zona",
    "Calcolate automaticamente al checkout"]),
  ("5. Pagamento & commissione", [
    "Stripe; pagamento tramite Stripe Connect (onboarding unico)",
    "La commissione viene trattenuta automaticamente"]),
 ],
 "flowh": "Flusso di integrazione",
 "flow": ["Passa a Pro + shop attivo + Stripe Connect", "Genera chiave API, imposta webhook_url",
          "Carica i prodotti via API/CSV", "Imposta le regole di spedizione",
          "Ordine: ricevi il webhook &rarr; crea in Odoo/Shopify",
          "Spedizione &rarr; PUT status=shipped + tracking"],
 "foot": "Documentazione completa: docs/orders-api.md &nbsp;&bull;&nbsp; skipily.app",
},
"es": {
 "title": "Integración de tienda vía API",
 "sub": "Para empresas con su propia tienda o ERP",
 "sections": [
  ("1. Requisitos & acceso", [
    "Plan Pro/Enterprise, tienda activa (is_shop_active)",
    "Genera tu clave API: Portal &rarr; Datos &rarr; API & Integración",
    "Cabecera en cada llamada: <b>x-api-key: &lt;clave&gt;</b>",
    "Cada clave solo ve sus propios datos"]),
  ("2. Productos", [
    "GET/POST/PUT <b>products-api</b> &mdash; consultar, crear, actualizar",
    "O importación CSV en el portal (cabeceras DE/EN, números EU, GTIN&rarr;ean)"]),
  ("3. Pedidos (Shopify / Odoo)", [
    "GET <b>orders-api?updated_since=</b> &mdash; sincronización incremental",
    "Webhook (push) al pedido pagado hacia webhook_url (tiempo real)",
    "PUT <b>orders-api?id=</b> &mdash; devolver estado + seguimiento, se avisa al comprador"]),
  ("4. Gastos de envío", [
    "Gratis a partir de un importe (p.ej. 85&euro; DE) + por peso por zona",
    "Calculado automáticamente en el checkout"]),
  ("5. Pago & comisión", [
    "Stripe; pago vía Stripe Connect (alta única)",
    "La comisión se retiene automáticamente"]),
 ],
 "flowh": "Flujo de integración",
 "flow": ["Pasar a Pro + tienda activa + Stripe Connect", "Generar clave API, definir webhook_url",
          "Subir productos vía API/CSV", "Definir reglas de envío",
          "Pedido: recibir webhook &rarr; crear en Odoo/Shopify",
          "Envío &rarr; PUT status=shipped + seguimiento"],
 "foot": "Documentación completa: docs/orders-api.md &nbsp;&bull;&nbsp; skipily.app",
},
"nl": {
 "title": "Shop-koppeling via API",
 "sub": "Voor bedrijven met een eigen shop- of ERP-systeem",
 "sections": [
  ("1. Voorwaarden & toegang", [
    "Pro/Enterprise-abonnement, shop actief (is_shop_active)",
    "Genereer zelf een API-sleutel: Portaal &rarr; Gegevens &rarr; API & Integratie",
    "Auth-header bij elke aanroep: <b>x-api-key: &lt;sleutel&gt;</b>",
    "Elke sleutel ziet alleen de eigen gegevens"]),
  ("2. Producten", [
    "GET/POST/PUT <b>products-api</b> &mdash; opvragen, aanmaken, bijwerken",
    "Of CSV-import in het portaal (DE/EN-koppen, EU-getallen, GTIN&rarr;ean)"]),
  ("3. Bestellingen (Shopify / Odoo)", [
    "GET <b>orders-api?updated_since=</b> &mdash; incrementele sync",
    "Webhook (push) bij betaalde bestelling naar webhook_url (realtime)",
    "PUT <b>orders-api?id=</b> &mdash; status + tracking terugschrijven, koper wordt geïnformeerd"]),
  ("4. Verzendkosten", [
    "Gratis boven een bedrag (bijv. 85&euro; DE) + op gewicht per zone",
    "Automatisch berekend bij de checkout"]),
  ("5. Betaling & commissie", [
    "Stripe; uitbetaling via Stripe Connect (eenmalige onboarding)",
    "Commissie wordt automatisch ingehouden"]),
 ],
 "flowh": "Integratie-flow",
 "flow": ["Pro worden + shop actief + Stripe Connect", "API-sleutel genereren, webhook_url instellen",
          "Producten via API/CSV uploaden", "Verzendregels in het portaal instellen",
          "Bestelling: webhook ontvangen &rarr; aanmaken in Odoo/Shopify",
          "Verzending &rarr; PUT status=shipped + tracking"],
 "foot": "Volledige documentatie: docs/orders-api.md &nbsp;&bull;&nbsp; skipily.app",
},
}

ORDER = ["de", "en", "fr", "it", "es", "nl"]
FLAG = {"de": "DE", "en": "EN", "fr": "FR", "it": "IT", "es": "ES", "nl": "NL"}

story = []
for li, lang in enumerate(ORDER):
    d = DATA[lang]
    # Logo oben (Seitenverhaeltnis 2000x1200 = 5:3)
    logo = Image(LOGO, width=55*mm, height=33*mm)
    logo.hAlign = "CENTER"
    story.append(logo)
    story.append(Spacer(1, 4))
    story.append(Paragraph(d["title"], H1))
    story.append(Paragraph(d["sub"].upper(), SUB))
    story.append(HRFlowable(width="100%", thickness=1, color=ORANGE, spaceAfter=8))

    for heading, bullets in d["sections"]:
        story.append(Paragraph(heading, SEC))
        for b in bullets:
            story.append(Paragraph("&bull;&nbsp; " + b, BODY))

    # Flow als nummerierte Zeile
    story.append(Paragraph(d["flowh"], SEC))
    flow = "&nbsp;&rarr;&nbsp; ".join(f"<b>{i+1}.</b> {s}" for i, s in enumerate(d["flow"]))
    story.append(Paragraph(flow, ParagraphStyle("flow", parent=BODY, fontSize=8, leading=12)))

    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY, spaceAfter=4))
    story.append(Paragraph(d["foot"], FOOT))

    if li < len(ORDER) - 1:
        story.append(PageBreak())

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        topMargin=14*mm, bottomMargin=12*mm,
                        leftMargin=18*mm, rightMargin=18*mm,
                        title="Skipily Provider API Onepager")
doc.build(story)
print("OK ->", OUT)
