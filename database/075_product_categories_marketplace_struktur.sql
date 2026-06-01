-- ============================================================================
-- Migration 075: Produkt-Kategorien nach Marine-Shop-Vorbild
-- ============================================================================
-- Orientiert sich an der Menu-Struktur der etablierten DACH-Marine-Shops:
-- SVB, 12seemeilen.de, Busse-Yachtshop.de.
--
-- 12 Hauptkategorien × je 3-6 Unterkategorien = ~60 Sub-Kategorien
--
-- Strategie:
-- 1. Bestehende Kategorien als '_legacy_*' archivieren (nicht löschen —
--    metashop_products.category_id-Referenzen bleiben intakt)
-- 2. Neue 12 Parents + Subs anlegen mit klaren slugs
-- 3. Sort-Order so dass legacy hinten landet (sort_order >= 9000)
-- ============================================================================

-- ─── Schritt 1: alte Kategorien archivieren ─────────────────────────────────
UPDATE public.product_categories
   SET slug       = '_legacy_' || slug,
       sort_order = 9000 + COALESCE(sort_order, 0)
 WHERE slug NOT LIKE '\_legacy\_%' ESCAPE '\';

-- ─── Schritt 2: 12 Hauptkategorien anlegen ──────────────────────────────────
INSERT INTO public.product_categories (slug, name_de, name_en, icon, sort_order)
VALUES
  ('motor-antrieb',        'Motor & Antrieb',          'Engine & Drive',              'engine.combustion.fill', 10),
  ('elektrik-bordnetz',    'Elektrik & Bordnetz',      'Electrical & Onboard Power',  'bolt.fill',              20),
  ('navigation-elektronik','Navigation & Elektronik',  'Navigation & Electronics',    'location.north.line.fill',30),
  ('anker-vertaeuung',     'Anker & Vertäuung',        'Anchor & Mooring',            'anchor.circle.fill',     40),
  ('rigg-decksbeschlaege', 'Rigg & Decksbeschläge',    'Rigging & Deck Hardware',     'scribble.variable',      50),
  ('segel-tuch',           'Segel & Tuch',             'Sails & Canvas',              'wind',                   60),
  ('sicherheit-rettung',   'Sicherheit & Rettung',     'Safety & Rescue',             'shield.fill',            70),
  ('pflege-antifouling',   'Pflege & Antifouling',     'Care & Antifouling',          'paintbrush.fill',        80),
  ('innenausbau-komfort',  'Innenausbau & Komfort',    'Interior & Comfort',          'thermometer.sun.fill',   90),
  ('bekleidung',           'Bekleidung',               'Clothing',                    'tshirt.fill',           100),
  ('dinghy-wassersport',   'Dinghy & Wassersport',     'Dinghy & Watersports',        'figure.sailing',        110),
  ('buecher-karten-geschenke','Bücher, Karten & Geschenke','Books, Charts & Gifts',   'book.fill',             120)
ON CONFLICT (slug) DO UPDATE
  SET name_de = EXCLUDED.name_de, name_en = EXCLUDED.name_en,
      icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;


-- ─── Schritt 3: Unterkategorien anlegen ─────────────────────────────────────
-- Pro Eltern-Slug wird parent_id über SELECT aufgelöst.
WITH parents AS (
  SELECT id, slug FROM public.product_categories
)
INSERT INTO public.product_categories (slug, name_de, name_en, parent_id, sort_order)
SELECT v.child_slug, v.name_de, v.name_en, p.id, v.sort_order
FROM (
  VALUES
    -- Motor & Antrieb
    ('motor-antrieb', 'aussenborder',        'Aussenborder',          'Outboards',                 1),
    ('motor-antrieb', 'innenborder-diesel',  'Innenborder Diesel',    'Inboard Diesel',            2),
    ('motor-antrieb', 'wellen-propeller',    'Wellen & Propeller',    'Shafts & Propellers',       3),
    ('motor-antrieb', 'treibstoff-tanks',    'Treibstoff & Tanks',    'Fuel & Tanks',              4),
    ('motor-antrieb', 'filter-impeller-riemen','Filter, Impeller & Riemen','Filters, Impellers & Belts',5),

    -- Elektrik & Bordnetz
    ('elektrik-bordnetz', 'batterien-ladegeraete', 'Batterien & Ladegeräte', 'Batteries & Chargers',    1),
    ('elektrik-bordnetz', 'solar-wind',            'Solar & Wind',            'Solar & Wind',           2),
    ('elektrik-bordnetz', 'wechselrichter',        'Wechselrichter',          'Inverters',              3),
    ('elektrik-bordnetz', 'schalter-verteiler',    'Schalter & Verteiler',    'Switches & Distribution',4),
    ('elektrik-bordnetz', 'kabel-sicherungen',     'Kabel & Sicherungen',     'Cables & Fuses',         5),

    -- Navigation & Elektronik
    ('navigation-elektronik', 'chartplotter',  'Chartplotter & Multifunktion','Chartplotters & MFD', 1),
    ('navigation-elektronik', 'gps-kompass',   'GPS & Kompass',               'GPS & Compass',       2),
    ('navigation-elektronik', 'radar-ais',     'Radar & AIS',                 'Radar & AIS',         3),
    ('navigation-elektronik', 'funk-vhf',      'Funkgeräte (VHF)',            'VHF Radios',          4),
    ('navigation-elektronik', 'echolot',       'Echolot',                     'Echo Sounders',       5),

    -- Anker & Vertäuung
    ('anker-vertaeuung', 'anker',            'Anker',                 'Anchors',                1),
    ('anker-vertaeuung', 'ankerketten',      'Ankerketten',           'Anchor Chains',          2),
    ('anker-vertaeuung', 'schaekel-wirbel',  'Schäkel & Wirbel',      'Shackles & Swivels',     3),
    ('anker-vertaeuung', 'festmacher-leinen','Festmacher & Leinen',   'Mooring Lines',          4),
    ('anker-vertaeuung', 'fender',           'Fender',                'Fenders',                5),

    -- Rigg & Decksbeschläge
    ('rigg-decksbeschlaege', 'bloecke-klemmen','Blöcke & Klemmen',     'Blocks & Clutches',     1),
    ('rigg-decksbeschlaege', 'winschen',       'Winschen',             'Winches',               2),
    ('rigg-decksbeschlaege', 'tauwerk',        'Tauwerk',              'Ropes',                 3),
    ('rigg-decksbeschlaege', 'schienen-wagen', 'Schienen & Wagen',     'Tracks & Cars',         4),
    ('rigg-decksbeschlaege', 'schaekel-rigg',  'Schäkel & Rigg-Hardware','Rigging Shackles',    5),

    -- Segel & Tuch
    ('segel-tuch', 'grosssegel',          'Großsegel',                'Mainsails',             1),
    ('segel-tuch', 'vorsegel-genua',      'Vorsegel & Genua',         'Headsails & Genoa',     2),
    ('segel-tuch', 'gennaker-spinnaker',  'Gennaker & Spinnaker',     'Gennaker & Spinnaker',  3),
    ('segel-tuch', 'persenninge',         'Persenninge',              'Covers',                4),
    ('segel-tuch', 'sprayhood-bimini',    'Sprayhood & Bimini',       'Sprayhood & Bimini',    5),

    -- Sicherheit & Rettung
    ('sicherheit-rettung', 'rettungswesten',   'Rettungswesten',        'Life Jackets',         1),
    ('sicherheit-rettung', 'rettungsinseln',   'Rettungsinseln',        'Liferafts',            2),
    ('sicherheit-rettung', 'signalmittel',     'Signalmittel',          'Signal Devices',       3),
    ('sicherheit-rettung', 'feuerloescher',    'Feuerlöscher',          'Fire Extinguishers',   4),
    ('sicherheit-rettung', 'epirb-mob',        'EPIRB & MOB-Sender',    'EPIRB & MOB',          5),

    -- Pflege & Antifouling
    ('pflege-antifouling', 'antifouling',  'Antifouling',          'Antifouling',           1),
    ('pflege-antifouling', 'polituren',    'Polituren & Wachse',   'Polishes & Waxes',      2),
    ('pflege-antifouling', 'reiniger',     'Reiniger',             'Cleaners',              3),
    ('pflege-antifouling', 'lacke',        'Lacke',                'Paints',                4),
    ('pflege-antifouling', 'werkzeuge',    'Werkzeuge',            'Tools',                 5),

    -- Innenausbau & Komfort
    ('innenausbau-komfort', 'heizung-klima',  'Heizung & Klima',       'Heating & AC',        1),
    ('innenausbau-komfort', 'sanitaer',       'Sanitär',               'Sanitary',            2),
    ('innenausbau-komfort', 'wassersystem',   'Wassersystem',          'Water Systems',       3),
    ('innenausbau-komfort', 'kuehlung-kombuese','Kühlung & Kombüse',   'Refrigeration & Galley',4),
    ('innenausbau-komfort', 'beleuchtung-innen','Beleuchtung Innen',   'Interior Lighting',   5),

    -- Bekleidung
    ('bekleidung', 'oelzeug',          'Ölzeug',                  'Foul Weather Gear',     1),
    ('bekleidung', 'schuhe',           'Schuhe',                  'Footwear',              2),
    ('bekleidung', 'sonnenschutz',     'Sonnenschutz',            'Sun Protection',        3),
    ('bekleidung', 'funktionsbekleidung','Funktionsbekleidung',   'Technical Clothing',    4),

    -- Dinghy & Wassersport
    ('dinghy-wassersport', 'beiboot-tender',     'Beiboot & Tender',     'Tenders & Dinghies', 1),
    ('dinghy-wassersport', 'dinghy-aussenborder','Dinghy-Außenborder',   'Dinghy Outboards',   2),
    ('dinghy-wassersport', 'sup-kayak',          'SUP & Kayak',          'SUP & Kayak',        3),
    ('dinghy-wassersport', 'schwimmwesten',      'Schwimmwesten',        'Swim Vests',         4),

    -- Bücher, Karten & Geschenke
    ('buecher-karten-geschenke', 'seekarten',     'Seekarten',          'Nautical Charts',    1),
    ('buecher-karten-geschenke', 'reisebuecher',  'Reisebücher',        'Cruising Guides',    2),
    ('buecher-karten-geschenke', 'geschenkartikel','Geschenkartikel',   'Gifts',              3)
) AS v(parent_slug, child_slug, name_de, name_en, sort_order)
JOIN parents p ON p.slug = v.parent_slug
ON CONFLICT (slug) DO UPDATE
  SET name_de = EXCLUDED.name_de, name_en = EXCLUDED.name_en,
      parent_id = EXCLUDED.parent_id, sort_order = EXCLUDED.sort_order;


-- ─── Schritt 4: Statistik ───────────────────────────────────────────────────
DO $$
DECLARE
  v_total    INT;
  v_parents  INT;
  v_children INT;
  v_legacy   INT;
BEGIN
  SELECT COUNT(*) INTO v_total    FROM public.product_categories;
  SELECT COUNT(*) INTO v_parents  FROM public.product_categories WHERE parent_id IS NULL AND slug NOT LIKE '\_legacy\_%' ESCAPE '\';
  SELECT COUNT(*) INTO v_children FROM public.product_categories WHERE parent_id IS NOT NULL;
  SELECT COUNT(*) INTO v_legacy   FROM public.product_categories WHERE slug LIKE '\_legacy\_%' ESCAPE '\';

  RAISE NOTICE '─────────────────────────────────────────────────';
  RAISE NOTICE 'Migration 075 abgeschlossen.';
  RAISE NOTICE '  Hauptkategorien neu:      %', v_parents;
  RAISE NOTICE '  Unterkategorien:          %', v_children;
  RAISE NOTICE '  Legacy archiviert:        %', v_legacy;
  RAISE NOTICE '  Gesamt:                   %', v_total;
  RAISE NOTICE '─────────────────────────────────────────────────';
  RAISE NOTICE 'Hinweis: bestehende Produkte mit category_id auf Legacy';
  RAISE NOTICE 'bleiben verknüpft. Im Provider-Portal müssen sie ggf.';
  RAISE NOTICE 'manuell auf die neuen Kategorien umgesetzt werden.';
  RAISE NOTICE '─────────────────────────────────────────────────';
END $$;
