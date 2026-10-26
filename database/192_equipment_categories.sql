-- =====================================================================
-- 192_equipment_categories — Serverseitige Quelle der Ausrüstungs-Kategorien.
-- Bisher waren Kategorien, Labels (6 Sprachen), Farben und Icons in iOS- und
-- Web-Code hartkodiert; jede Änderung brauchte einen App-/Web-Build. Jetzt
-- liegen sie zentral in der DB. Clients laden sie (anon-Select) und nutzen die
-- fest eingebaute Liste nur als Fallback. Neue Kategorie / Umbenennung / Farbe /
-- Reihenfolge = nur noch ein DB-Update, kein Build.
--
-- labels: JSONB { de, en, es, fr, it, nl } (fehlende Sprache -> de -> key).
-- icon_ios: SF-Symbol-Name. icon_web: optionaler lucide-Name.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.equipment_categories (
    key         TEXT PRIMARY KEY,
    sort_order  INT  NOT NULL DEFAULT 100,
    color       TEXT NOT NULL DEFAULT '#94a3b8',
    icon_ios    TEXT NOT NULL DEFAULT 'shippingbox.fill',
    icon_web    TEXT,
    labels      JSONB NOT NULL DEFAULT '{}'::jsonb,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;

-- Lesen: alle (auch anon) — reine Stammdaten.
DROP POLICY IF EXISTS equipment_categories_select ON public.equipment_categories;
CREATE POLICY equipment_categories_select ON public.equipment_categories
    FOR SELECT USING (true);

-- Schreiben: nur Admin.
DROP POLICY IF EXISTS equipment_categories_write ON public.equipment_categories;
CREATE POLICY equipment_categories_write ON public.equipment_categories
    FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed / Upsert der aktuellen 16 Kategorien (idempotent).
INSERT INTO public.equipment_categories (key, sort_order, color, icon_ios, icon_web, labels) VALUES
('engine',        10, '#f97316', 'engine.combustion.fill',                 'cog',        '{"de":"Motor & Antrieb","en":"Engine & drive","es":"Motor y propulsión","fr":"Moteur et propulsion","it":"Motore e trasmissione","nl":"Motor & aandrijving"}'),
('electrical',    20, '#eab308', 'bolt.fill',                              'zap',        '{"de":"Elektrik & Batterie","en":"Electrical & battery","es":"Electricidad y batería","fr":"Électricité et batterie","it":"Elettrico e batteria","nl":"Elektrisch & accu"}'),
('electrical_12v',21, '#eab308', 'minus.plus.batteryblock.fill',           'battery-charging', '{"de":"Elektrik 12V","en":"Electrical 12V","es":"Eléctrico 12V","fr":"Électrique 12V","it":"Elettrico 12V","nl":"Elektrisch 12V"}'),
('electrical_230v',22,'#f59e0b', 'powerplug.fill',                         'plug',       '{"de":"Elektrik 230V","en":"Electrical 230V","es":"Eléctrico 230V","fr":"Électrique 230V","it":"Elettrico 230V","nl":"Elektrisch 230V"}'),
('navigation',    30, '#3b82f6', 'location.north.line.fill',               'compass',    '{"de":"Navigation & Elektronik","en":"Navigation & electronics","es":"Navegación y electrónica","fr":"Navigation et électronique","it":"Navigazione ed elettronica","nl":"Navigatie & elektronica"}'),
('communication', 40, '#14b8a6', 'antenna.radiowaves.left.and.right',      'radio',      '{"de":"Kommunikation","en":"Communication","es":"Comunicación","fr":"Communication","it":"Comunicazione","nl":"Communicatie"}'),
('safety',        50, '#ef4444', 'shield.fill',                            'shield',     '{"de":"Sicherheit","en":"Safety","es":"Seguridad","fr":"Sécurité","it":"Sicurezza","nl":"Veiligheid"}'),
('rigging',       60, '#a855f7', 'arrow.up.and.down',                      'move-vertical', '{"de":"Rigg & Takelage","en":"Rig & rigging","es":"Jarcia y aparejo","fr":"Gréement","it":"Attrezzatura e sartiame","nl":"Tuigage"}'),
('sails',         70, '#06b6d4', 'wind',                                   'wind',       '{"de":"Segel","en":"Sails","es":"Velas","fr":"Voiles","it":"Vele","nl":"Zeilen"}'),
('rope',          80, '#10b981', 'scribble.variable',                      'spline',     '{"de":"Tauwerk","en":"Rope","es":"Cabos","fr":"Cordage","it":"Cime","nl":"Touwwerk"}'),
('deck',          90, '#0ea5e9', 'square.grid.2x2.fill',                   'grid-2x2',   '{"de":"Deck & Beschläge","en":"Deck & fittings","es":"Cubierta y herrajes","fr":"Pont et accastillage","it":"Coperta e accessori","nl":"Dek & beslag"}'),
('hull',         100, '#64748b', 'sailboat.fill',                          'sailboat',   '{"de":"Rumpf & Unterwasser","en":"Hull & underwater","es":"Casco y obra viva","fr":"Coque et œuvres vives","it":"Scafo e opera viva","nl":"Romp & onderwaterschip"}'),
('anchor',       110, '#92400e', 'anchor.circle.fill',                     'anchor',     '{"de":"Anker & Kette","en":"Anchor & chain","es":"Ancla y cadena","fr":"Ancre et chaîne","it":"Ancora e catena","nl":"Anker & ketting"}'),
('hvac',         120, '#ec4899', 'thermometer.sun.fill',                   'thermometer','{"de":"Heizung & Klima","en":"Heating & AC","es":"Calefacción y clima","fr":"Chauffage et climatisation","it":"Riscaldamento e clima","nl":"Verwarming & klimaat"}'),
('plumbing',     130, '#0891b2', 'drop.fill',                              'droplet',    '{"de":"Sanitär & Wasser","en":"Plumbing & water","es":"Sanitario y agua","fr":"Plomberie et eau","it":"Idraulica e acqua","nl":"Sanitair & water"}'),
('galley',       140, '#d97706', 'fork.knife',                             'utensils',   '{"de":"Küche & Pantry","en":"Galley & kitchen","es":"Cocina","fr":"Cuisine","it":"Cucina","nl":"Kombuis"}'),
('paint',        150, '#8b5cf6', 'paintbrush.fill',                        'paintbrush', '{"de":"Farben & Pflege","en":"Paint & care","es":"Pinturas y cuidado","fr":"Peinture et entretien","it":"Vernici e cura","nl":"Verf & onderhoud"}'),
('other',        999, '#94a3b8', 'shippingbox.fill',                       'package',    '{"de":"Sonstiges","en":"Other","es":"Otros","fr":"Autre","it":"Altro","nl":"Overig"}')
ON CONFLICT (key) DO UPDATE SET
    sort_order = EXCLUDED.sort_order,
    color      = EXCLUDED.color,
    icon_ios   = EXCLUDED.icon_ios,
    icon_web   = EXCLUDED.icon_web,
    labels     = EXCLUDED.labels,
    updated_at = now();
