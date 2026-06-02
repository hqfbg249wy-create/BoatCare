# -*- coding: utf-8 -*-
"""
Skipily marketing asset generator
=================================
Generates print-ready A6 PDFs with 3 mm bleed, brand colors from the
Skipily app icon, and QR codes for App Store + Google Play.

Output: marketing/flyer-endkunden/{lang}.pdf, flyer-provider/{lang}.pdf
        marketing/sticker/sticker-multilang.pdf

Run from project root:  python3 marketing/_src/generate.py
"""

from pathlib import Path
import qrcode
from reportlab.lib.pagesizes import A6
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

# Add the _src directory to path for i18n import when run from project root
import sys
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from i18n import ENDKUNDEN, PROVIDER, STICKER_TEXT

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ROOT = HERE.parent.parent
ICON_PATH = ROOT / "Skipily/Assets.xcassets/AppIcon.appiconset/Icon-1024.png"

# Brand colors extracted from app icon
BLUE_PRIMARY = HexColor("#155EA4")   # deep maritime
BLUE_DARK    = HexColor("#0F4378")
BLUE_LIGHT   = HexColor("#45B1EF")
ORANGE       = HexColor("#F77C27")
ORANGE_LIGHT = HexColor("#FE983D")
CREAM        = HexColor("#FFF5EC")
GREY_TEXT    = HexColor("#2A2A2A")
GREY_MUTE    = HexColor("#6B6B6B")

# Page geometry — A6 with 3 mm bleed
BLEED = 3 * mm
W, H = A6  # 105 x 148 mm in points
PAGE_W = W + 2 * BLEED
PAGE_H = H + 2 * BLEED
TRIM_OFFSET_X = BLEED
TRIM_OFFSET_Y = BLEED

# QR target URLs
URL_APPLE  = "https://skipily.app/ios"      # smart link → App Store
URL_GOOGLE = "https://skipily.app/android"  # smart link → Play Store
URL_PROV   = "https://skipily.app/provider"

OUT_END  = ROOT / "marketing/flyer-endkunden"
OUT_PROV = ROOT / "marketing/flyer-provider"
OUT_STK  = ROOT / "marketing/sticker"

# ---------------------------------------------------------------------------
# QR code generation
# ---------------------------------------------------------------------------
def make_qr(data: str, size_mm: float = 22) -> ImageReader:
    """Return a transparent-friendly QR ImageReader."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    return ImageReader(img)


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------
def trim_x(x_mm):
    return TRIM_OFFSET_X + x_mm * mm

def trim_y(y_mm):
    return TRIM_OFFSET_Y + y_mm * mm

def draw_bleed_background(c: canvas.Canvas, color):
    """Fill entire page incl. bleed."""
    c.setFillColor(color)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

def draw_text_centered(c, text, x_mm, y_mm, font, size, color):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawCentredString(trim_x(x_mm), trim_y(y_mm), text)

def draw_text_left(c, text, x_mm, y_mm, font, size, color):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(trim_x(x_mm), trim_y(y_mm), text)

def wrap_text(text, font, size, max_width_mm):
    """Naive word wrap returning list of lines."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    words = text.split()
    lines, current = [], ""
    max_w = max_width_mm * mm
    for w in words:
        test = (current + " " + w).strip()
        if stringWidth(test, font, size) <= max_w:
            current = test
        else:
            if current:
                lines.append(current)
            current = w
    if current:
        lines.append(current)
    return lines


# ---------------------------------------------------------------------------
# Endkunden Flyer
# ---------------------------------------------------------------------------
def build_endkunden_flyer(lang: str, content: dict, out_path: Path):
    c = canvas.Canvas(str(out_path), pagesize=(PAGE_W, PAGE_H))

    # Background — blue top, cream bottom. Wave is high (~92mm) so all
    # body content (features, plus banner, CTA) sits on the cream area.
    draw_bleed_background(c, BLUE_PRIMARY)
    c.setFillColor(CREAM)
    p = c.beginPath()
    p.moveTo(0, trim_y(0))
    p.lineTo(0, trim_y(92))
    p.curveTo(trim_x(30), trim_y(86), trim_x(75), trim_y(98), PAGE_W, trim_y(90))
    p.lineTo(PAGE_W, 0)
    p.close()
    c.drawPath(p, fill=1, stroke=0)

    # Logo top-left
    if ICON_PATH.exists():
        c.drawImage(str(ICON_PATH), trim_x(8), trim_y(125), 18*mm, 18*mm,
                    mask='auto', preserveAspectRatio=True)

    # Brand wordmark
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(trim_x(30), trim_y(135), "SKIPILY")
    c.setFont("Helvetica", 8)
    c.setFillColor(BLUE_LIGHT)
    c.drawString(trim_x(30), trim_y(129), content["footer"])

    # Headline (on blue)
    headline_lines = wrap_text(content["headline"], "Helvetica-Bold", 15, 90)
    y = 118
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 15)
    for line in headline_lines:
        c.drawString(trim_x(8), trim_y(y), line)
        y -= 6.5

    # Subheadline (on blue)
    c.setFillColor(ORANGE_LIGHT)
    c.setFont("Helvetica-Oblique", 9.5)
    c.drawString(trim_x(8), trim_y(y - 1), content["subheadline"])

    # Feature title (on cream)
    c.setFillColor(BLUE_PRIMARY)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(trim_x(8), trim_y(82), content["feature_title"])

    # Features (on cream)
    y = 75
    for icon_label, body in content["features"]:
        # Orange dot
        c.setFillColor(ORANGE)
        c.circle(trim_x(10), trim_y(y + 1), 1.5, stroke=0, fill=1)
        # Title
        c.setFillColor(GREY_TEXT)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(trim_x(14), trim_y(y), icon_label)
        # Body
        c.setFillColor(GREY_MUTE)
        c.setFont("Helvetica", 7.5)
        body_lines = wrap_text(body, "Helvetica", 7.5, 80)
        sub_y = y - 3
        for bl in body_lines[:2]:
            c.drawString(trim_x(14), trim_y(sub_y), bl)
            sub_y -= 3
        y -= 9 if len(body_lines) > 1 else 7

    # Plus banner (orange strip)
    c.setFillColor(ORANGE)
    c.rect(trim_x(0), trim_y(28), W, 9 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(trim_x(6), trim_y(32.5), content["plus_title"])
    c.setFont("Helvetica", 7)
    c.drawString(trim_x(6), trim_y(29.5), content["plus_subtitle"])

    # CTA + QR codes
    c.setFillColor(BLUE_DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(trim_x(6), trim_y(22), content["cta"])

    # QR Apple (left)
    qr_apple = make_qr(URL_APPLE)
    c.drawImage(qr_apple, trim_x(6), trim_y(4), 16*mm, 16*mm)
    c.setFont("Helvetica", 6.5)
    c.setFillColor(GREY_MUTE)
    c.drawCentredString(trim_x(14), trim_y(1.5), content["qr_apple"])

    # QR Google (right of apple)
    qr_google = make_qr(URL_GOOGLE)
    c.drawImage(qr_google, trim_x(25), trim_y(4), 16*mm, 16*mm)
    c.drawCentredString(trim_x(33), trim_y(1.5), content["qr_google"])

    # Footer URL right side
    c.setFillColor(BLUE_DARK)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(trim_x(99), trim_y(7), content["footer"])

    # Tiny lang code bottom-right (helpful when stacking)
    c.setFillColor(GREY_MUTE)
    c.setFont("Helvetica", 5)
    c.drawRightString(trim_x(99), trim_y(2), f"[{lang.upper()}]")

    c.showPage()
    c.save()


# ---------------------------------------------------------------------------
# Provider Flyer
# ---------------------------------------------------------------------------
def build_provider_flyer(lang: str, content: dict, out_path: Path):
    c = canvas.Canvas(str(out_path), pagesize=(PAGE_W, PAGE_H))

    # Orange top, white bottom — visually different from end-user flyer.
    # Wave high (~92mm) so feature list sits on white.
    draw_bleed_background(c, ORANGE)
    c.setFillColor(white)
    p = c.beginPath()
    p.moveTo(0, trim_y(0))
    p.lineTo(0, trim_y(92))
    p.curveTo(trim_x(40), trim_y(100), trim_x(70), trim_y(84), PAGE_W, trim_y(90))
    p.lineTo(PAGE_W, 0)
    p.close()
    c.drawPath(p, fill=1, stroke=0)

    # Logo + brand top
    if ICON_PATH.exists():
        c.drawImage(str(ICON_PATH), trim_x(8), trim_y(125), 18*mm, 18*mm,
                    mask='auto', preserveAspectRatio=True)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(trim_x(30), trim_y(135), "SKIPILY")
    c.setFont("Helvetica", 8)
    c.setFillColor(CREAM)
    c.drawString(trim_x(30), trim_y(129), "for providers")

    # Headline (on orange)
    headline_lines = wrap_text(content["headline"], "Helvetica-Bold", 14, 88)
    y = 118
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 14)
    for line in headline_lines:
        c.drawString(trim_x(8), trim_y(y), line)
        y -= 6

    # Subheadline (on orange)
    c.setFillColor(BLUE_DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(trim_x(8), trim_y(y - 1), content["subheadline"])

    # Feature title (on white)
    c.setFillColor(BLUE_PRIMARY)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(trim_x(8), trim_y(82), content["feature_title"])

    # Features (on white)
    y = 75
    for icon_label, body in content["features"]:
        c.setFillColor(BLUE_PRIMARY)
        c.circle(trim_x(10), trim_y(y + 1), 1.5, stroke=0, fill=1)
        c.setFillColor(GREY_TEXT)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(trim_x(14), trim_y(y), icon_label)
        c.setFillColor(GREY_MUTE)
        c.setFont("Helvetica", 7.5)
        body_lines = wrap_text(body, "Helvetica", 7.5, 80)
        sub_y = y - 3
        for bl in body_lines[:2]:
            c.drawString(trim_x(14), trim_y(sub_y), bl)
            sub_y -= 3
        y -= 9 if len(body_lines) > 1 else 7

    # Plus banner — blue strip
    c.setFillColor(BLUE_PRIMARY)
    c.rect(trim_x(0), trim_y(28), W, 9 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(trim_x(6), trim_y(32.5), content["plus_title"])
    c.setFont("Helvetica", 7)
    c.drawString(trim_x(6), trim_y(29.5), content["plus_subtitle"])

    # CTA + single big QR for provider signup
    c.setFillColor(BLUE_DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(trim_x(6), trim_y(22), content["cta"])

    qr_prov = make_qr(URL_PROV)
    c.drawImage(qr_prov, trim_x(6), trim_y(3), 18*mm, 18*mm)
    c.setFont("Helvetica", 6.5)
    c.setFillColor(GREY_MUTE)
    c.drawCentredString(trim_x(15), trim_y(0.5), content["footer"])

    # Right side — bigger value highlight
    c.setFillColor(ORANGE)
    c.setFont("Helvetica-Bold", 28)
    c.drawRightString(trim_x(99), trim_y(18), "10%")
    c.setFillColor(GREY_TEXT)
    c.setFont("Helvetica", 7)
    c.drawRightString(trim_x(99), trim_y(13), "marketplace fee")
    c.setFillColor(BLUE_DARK)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(trim_x(99), trim_y(7), content["footer"])
    c.setFillColor(GREY_MUTE)
    c.setFont("Helvetica", 5)
    c.drawRightString(trim_x(99), trim_y(2), f"[{lang.upper()}]")

    c.showPage()
    c.save()


# ---------------------------------------------------------------------------
# Sticker — round-ish, A6 page, design 80mm circle centered for die-cut
# ---------------------------------------------------------------------------
def build_sticker(out_path: Path):
    c = canvas.Canvas(str(out_path), pagesize=(PAGE_W, PAGE_H))

    # White background (will be cut around)
    draw_bleed_background(c, white)

    # Outer circle — die-cut reference (80mm Ø)
    cx, cy = PAGE_W / 2, PAGE_H / 2
    R = 40 * mm

    # Blue ring
    c.setFillColor(BLUE_PRIMARY)
    c.circle(cx, cy, R, stroke=0, fill=1)
    # Inner cream area
    c.setFillColor(CREAM)
    c.circle(cx, cy, R - 4 * mm, stroke=0, fill=1)

    # Logo at top of circle
    if ICON_PATH.exists():
        c.drawImage(str(ICON_PATH), cx - 9*mm, cy + 13*mm, 18*mm, 18*mm,
                    mask='auto', preserveAspectRatio=True)

    # "Wir sind bei" (DE) on top
    c.setFillColor(BLUE_DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(cx, cy + 6*mm, STICKER_TEXT["main_top"])

    # SKIPILY big
    c.setFillColor(ORANGE)
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(cx, cy - 2*mm, STICKER_TEXT["main_brand"])

    # Subtitle multilang
    c.setFillColor(GREY_TEXT)
    c.setFont("Helvetica", 5)
    c.drawCentredString(cx, cy - 7*mm, STICKER_TEXT["sub"])

    # QR small at bottom inside circle
    qr = make_qr(URL_APPLE)
    qr_size = 16 * mm
    c.drawImage(qr, cx - qr_size/2, cy - 28*mm, qr_size, qr_size)
    c.setFillColor(GREY_MUTE)
    c.setFont("Helvetica", 5)
    c.drawCentredString(cx, cy - 31*mm, STICKER_TEXT["scan"])

    # Die-cut indicator (dashed) — outside trim, helps printer
    c.setStrokeColor(HexColor("#FF00FF"))
    c.setDash([2, 2])
    c.setLineWidth(0.3)
    c.circle(cx, cy, R, stroke=1, fill=0)
    c.setDash([])

    # Crop marks at corners
    c.setStrokeColor(black)
    c.setLineWidth(0.3)
    m = 3 * mm
    for (x, y) in [(TRIM_OFFSET_X, TRIM_OFFSET_Y),
                   (TRIM_OFFSET_X + W, TRIM_OFFSET_Y),
                   (TRIM_OFFSET_X, TRIM_OFFSET_Y + H),
                   (TRIM_OFFSET_X + W, TRIM_OFFSET_Y + H)]:
        c.line(x - m, y, x - 0.5*mm, y)
        c.line(x, y - m, x, y - 0.5*mm)

    c.showPage()
    c.save()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    OUT_END.mkdir(parents=True, exist_ok=True)
    OUT_PROV.mkdir(parents=True, exist_ok=True)
    OUT_STK.mkdir(parents=True, exist_ok=True)

    langs = ["de", "en", "fr", "it", "es", "nl"]

    for lang in langs:
        end_path = OUT_END / f"endkunden-{lang}.pdf"
        prov_path = OUT_PROV / f"provider-{lang}.pdf"
        build_endkunden_flyer(lang, ENDKUNDEN[lang], end_path)
        build_provider_flyer(lang, PROVIDER[lang], prov_path)
        print(f"  ✓ {lang}: endkunden + provider")

    sticker_path = OUT_STK / "sticker-multilang.pdf"
    build_sticker(sticker_path)
    print(f"  ✓ sticker")

    print(f"\nDone. Files written to:\n  {OUT_END}\n  {OUT_PROV}\n  {OUT_STK}")


if __name__ == "__main__":
    main()
