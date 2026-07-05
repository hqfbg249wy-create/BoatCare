#!/usr/bin/env python3
"""
Generiert das App-Clip-Kopfzeilenbild fuer App Store Connect.

Format: 1800 x 1200 px, sRGB, PNG.

Layout:
  - Hintergrund: dunkler Navy-Verlauf (oben) → kraeftiges Orange (unten)
    Spiegelt das Skipily-Icon-Motiv (Boot im Wasser bei Sonnenuntergang)
  - Welle als orange Form am unteren Bildrand
  - Subtile diagonale Lichtreflexe fuer Tiefe
  - Logo links (gross), Wortmarke + Tagline rechts
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

W, H = 1800, 1200
LOGO_PATH = '/Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/marketing/clip-aufsteller/skipily-icon.png'
OUT_PATH = '/Users/ekkehart/Documents/01-Projekte/Programmieren/BoatCare/marketing/clip-aufsteller/skipily-clip-header.png'

# Markenfarben (aus dem Icon abgeleitet)
NAVY_DARK   = (11, 29, 58)      # #0B1D3A  Himmel oben
NAVY_MID    = (27, 56, 102)     # #1B3866  Himmel unten
ORANGE      = (249, 115, 22)    # #f97316  Sonne / Wasser
ORANGE_DEEP = (234, 88, 12)     # #ea580c  tieferes Orange
WHITE       = (255, 255, 255)

def vgradient(img, top, bottom, h_stop=None):
    """Vertikaler Verlauf von oben (top) bis bottom; optional bis h_stop."""
    draw = ImageDraw.Draw(img)
    h = h_stop if h_stop else img.height
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (img.width, y)], fill=(r, g, b))

def draw_wave(img, base_y, amplitude, wavelength, color, alpha=255):
    """Zeichnet eine sinusfoermige Welle als gefuellte Form unter der Linie."""
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    pts = []
    for x in range(0, img.width + 2, 2):
        y = base_y + amplitude * math.sin(2 * math.pi * x / wavelength)
        pts.append((x, y))
    pts.append((img.width, img.height))
    pts.append((0, img.height))
    d.polygon(pts, fill=color + (alpha,))
    img.alpha_composite(overlay)

def add_glow(img, center, radius, color, alpha=80):
    """Diffuser Lichtschein an einer Position (z. B. Sonne hinter den Wolken)."""
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    cx, cy = center
    for r in range(radius, 0, -8):
        a = int(alpha * (1 - r / radius))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (a,))
    overlay = overlay.filter(ImageFilter.GaussianBlur(20))
    img.alpha_composite(overlay)

def load_font(size, weight='regular'):
    """Versucht SF Pro, dann Helvetica Neue, dann Default."""
    candidates = [
        '/System/Library/Fonts/SFNS.ttf',
        '/System/Library/Fonts/HelveticaNeue.ttc',
        '/System/Library/Fonts/Helvetica.ttc',
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()

def main():
    # Basis-Canvas in RGBA
    img = Image.new('RGBA', (W, H), NAVY_DARK + (255,))

    # 1) Himmel-Verlauf (Navy oben → mittlerer Navy unten)
    sky_h = int(H * 0.72)
    sky = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    vgradient(sky, NAVY_DARK, NAVY_MID, h_stop=sky_h)
    img.alpha_composite(sky)

    # 2) Diffuses Sonnenglow im rechten oberen Drittel — wie hinter Dunst
    add_glow(img, (W * 0.78, H * 0.32), 380, ORANGE, alpha=70)
    add_glow(img, (W * 0.78, H * 0.32), 200, (255, 200, 130), alpha=90)

    # 3) Wasser-Bereich unten (Orange-Verlauf)
    water = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(water)
    for y in range(sky_h, H):
        t = (y - sky_h) / max(H - sky_h - 1, 1)
        r = int(ORANGE[0] + (ORANGE_DEEP[0] - ORANGE[0]) * t)
        g = int(ORANGE[1] + (ORANGE_DEEP[1] - ORANGE[1]) * t)
        b = int(ORANGE[2] + (ORANGE_DEEP[2] - ORANGE[2]) * t)
        wd.line([(0, y), (W, y)], fill=(r, g, b, 255))
    img.alpha_composite(water)

    # 4) Sanfte Welle als Trennung Himmel/Wasser — wie im Icon
    draw_wave(img, base_y=sky_h, amplitude=18, wavelength=W * 0.45,
              color=ORANGE, alpha=255)
    # Zweite, hellere Welle daruber als Schaumkrone
    draw_wave(img, base_y=sky_h + 12, amplitude=22, wavelength=W * 0.55,
              color=(255, 165, 80), alpha=140)

    # 5) Glanzpunkt auf dem Wasser (Lichtreflex unter der Sonne)
    add_glow(img, (W * 0.78, sky_h + 80), 220, (255, 220, 160), alpha=110)

    # 6) Logo links — gross, mit feinem Schatten
    logo = Image.open(LOGO_PATH).convert('RGBA')
    logo_size = 560
    logo = logo.resize((logo_size, logo_size), Image.LANCZOS)
    # Schatten
    shadow = Image.new('RGBA', (logo_size + 80, logo_size + 80), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([40, 40, logo_size + 40, logo_size + 40],
                         radius=120, fill=(0, 0, 0, 100))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    logo_x = 140
    logo_y = (H - logo_size) // 2 - 20
    img.alpha_composite(shadow, (logo_x - 40, logo_y - 30))
    img.alpha_composite(logo, (logo_x, logo_y))

    # 7) Text rechts
    draw = ImageDraw.Draw(img)

    # Wortmarke "SKIPILY" — Groesse so gewaehlt, dass sie GENAU so breit
    # ist wie die Tagline darunter. Wir messen erst die Tagline, dann
    # skalieren wir die Brand-Font und das Letter-Spacing.
    font_tag = load_font(56)
    tag = 'ALWAYS · SAFE · READY TO SAIL'
    tag_width = font_tag.getlength(tag)

    word = 'SKIPILY'
    # Maximale SKIPILY-Groesse finden, sodass die Wortmarke (mit minimalem
    # Letter-Spacing) exakt die Tagline-Breite erreicht.
    # Wir verwenden getlength (Advance Width), das mit dem tatsaechlichen
    # Render uebereinstimmt — getbbox unterschaetzt bei manchen Glyphen.
    best_size = 180
    best_spacing = 8
    for size in range(180, 400, 2):
        f = load_font(size)
        widths = [f.getlength(ch) for ch in word]
        gaps = len(word) - 1
        needed_spacing = (tag_width - sum(widths)) / gaps
        # Akzeptiere Spacing >= 0 (auch leicht negativ haben wir zur Not)
        if needed_spacing >= 0:
            best_size = size
            best_spacing = needed_spacing
    font_brand = load_font(best_size)
    char_widths = [font_brand.getlength(ch) for ch in word]
    print(f'SKIPILY size={best_size}, spacing={best_spacing:.1f}, '
          f'tag_width={tag_width}')

    text_x = 820
    brand_y = 360
    # Zeichne mit Lichtschatten
    cur_x = text_x
    for i, ch in enumerate(word):
        draw.text((cur_x + 3, brand_y + 4), ch, fill=(0, 0, 0, 120),
                  font=font_brand)
        draw.text((cur_x, brand_y), ch, fill=WHITE, font=font_brand)
        cur_x += char_widths[i] + best_spacing

    # Tagline genau unter SKIPILY, bundig mit gleicher Breite
    tag_y = brand_y + best_size + 30
    draw.text((text_x + 4, tag_y + 2), tag, fill=(0, 0, 0, 100), font=font_tag)
    draw.text((text_x, tag_y), tag, fill=ORANGE, font=font_tag)

    # 8) Speichern als RGB (App Store Connect mag keine Alpha-Layer)
    final = Image.new('RGB', (W, H), NAVY_DARK)
    final.paste(img, mask=img.split()[3])
    final.save(OUT_PATH, 'PNG', optimize=True)
    print(f'Geschrieben: {OUT_PATH}')
    print(f'Format: {final.size}, RGB')

if __name__ == '__main__':
    main()
