-- ============================================================
-- MIGRATION: Kategorien auf englische Standardwerte normalisieren
-- Ausführen in: Supabase Dashboard → SQL Editor
-- Zweck: Alte deutsche/französische Kategorien → englische Keys
--        damit der LanguageManager korrekt lokalisieren kann
-- ============================================================

-- Aktuellen Stand anzeigen (vor Migration)
SELECT category, COUNT(*) as count
FROM service_providers
GROUP BY category
ORDER BY count DESC;

-- ============================================================
-- SCHRITT 1: Deutsche Kategorien → Englisch
-- ============================================================

-- Werkstatt / Werft / Reparatur → motor service
UPDATE service_providers
SET category = 'motor service'
WHERE LOWER(category) IN ('werkstatt', 'werft', 'reparatur', 'repair', 'motorservice', 'motor-service');

-- Zubehör / Ausrüstung → marine supplies
UPDATE service_providers
SET category = 'marine supplies'
WHERE LOWER(category) IN ('zubehör', 'ausrüstung', 'supplies', 'nautik', 'yacht supplies', 'boat supplies');

-- Segelmacher → sailmaker
UPDATE service_providers
SET category = 'sailmaker'
WHERE LOWER(category) IN ('segelmacher', 'segel & persenning', 'segel');

-- Instrumente / Elektronik → instruments
UPDATE service_providers
SET category = 'instruments'
WHERE LOWER(category) IN ('instrumente', 'elektronik', 'elektrik', 'marine electronics',
                           'nautische instrumente', 'yacht & bootsinstrumente');

-- Tankstelle → fuel
UPDATE service_providers
SET category = 'fuel'
WHERE LOWER(category) IN ('tankstelle', 'kraftstoff', 'diesel');

-- Marina / Hafen → marina
UPDATE service_providers
SET category = 'marina'
WHERE LOWER(category) IN ('hafen', 'yachthafen', 'bootsliegeplatz');

-- Gutachter → surveyor
UPDATE service_providers
SET category = 'surveyor'
WHERE LOWER(category) IN ('gutachter', 'sachverständiger');

-- Kran → crane
UPDATE service_providers
SET category = 'crane'
WHERE LOWER(category) IN ('kran', 'krane', 'krananlage', 'travel lift');

-- Lackierung / Antifouling → painting
UPDATE service_providers
SET category = 'painting'
WHERE LOWER(category) IN ('lackierung', 'antifouling', 'lack', 'beschichtung');

-- Rigg / Takelung → rigging
UPDATE service_providers
SET category = 'rigging'
WHERE LOWER(category) IN ('rigg', 'rigg service', 'tauwerk', 'takelung');

-- ============================================================
-- SCHRITT 2: Französische Kategorien → Englisch
-- ============================================================

UPDATE service_providers SET category = 'motor service'
WHERE LOWER(category) IN ('atelier', 'chantier naval', 'réparation');

UPDATE service_providers SET category = 'marine supplies'
WHERE LOWER(category) IN ('accastillage', 'shipchandler', 'ship chandler');

UPDATE service_providers SET category = 'sailmaker'
WHERE LOWER(category) IN ('voilerie');

UPDATE service_providers SET category = 'instruments'
WHERE LOWER(category) IN ('électronique marine', 'electronique marine');

UPDATE service_providers SET category = 'fuel'
WHERE LOWER(category) IN ('carburant', 'station carburant', 'distributeur carburant');

UPDATE service_providers SET category = 'marina'
WHERE LOWER(category) IN ('port', 'port de plaisance');

UPDATE service_providers SET category = 'rigging'
WHERE LOWER(category) IN ('gréement', 'greement');

UPDATE service_providers SET category = 'surveyor'
WHERE LOWER(category) IN ('expert maritime');

UPDATE service_providers SET category = 'crane'
WHERE LOWER(category) IN ('grue');

UPDATE service_providers SET category = 'painting'
WHERE LOWER(category) IN ('peinture', 'peinture / antifouling');

-- ============================================================
-- SCHRITT 3: Spanische Kategorien → Englisch
-- ============================================================

UPDATE service_providers SET category = 'motor service'
WHERE LOWER(category) IN ('taller', 'taller náutico', 'astillero');

UPDATE service_providers SET category = 'marine supplies'
WHERE LOWER(category) IN ('accesorios náuticos', 'accesorios nauticos', 'náutica');

UPDATE service_providers SET category = 'sailmaker'
WHERE LOWER(category) IN ('velería', 'veleria');

UPDATE service_providers SET category = 'instruments'
WHERE LOWER(category) IN ('electrónica marina', 'electronica marina');

UPDATE service_providers SET category = 'fuel'
WHERE LOWER(category) IN ('combustible', 'gasolinera', 'estación de combustible');

UPDATE service_providers SET category = 'marina'
WHERE LOWER(category) IN ('puerto', 'puerto deportivo', 'puerto náutico');

UPDATE service_providers SET category = 'rigging'
WHERE LOWER(category) IN ('aparejo', 'jarcia');

UPDATE service_providers SET category = 'surveyor'
WHERE LOWER(category) IN ('perito naval');

UPDATE service_providers SET category = 'crane'
WHERE LOWER(category) IN ('grúa', 'grua');

-- ============================================================
-- SCHRITT 4: Italienische Kategorien → Englisch
-- ============================================================

UPDATE service_providers SET category = 'motor service'
WHERE LOWER(category) IN ('cantiere', 'cantiere navale', 'officina');

UPDATE service_providers SET category = 'marine supplies'
WHERE LOWER(category) IN ('accessori nautici', 'nautica');

UPDATE service_providers SET category = 'sailmaker'
WHERE LOWER(category) IN ('veleria');

UPDATE service_providers SET category = 'instruments'
WHERE LOWER(category) IN ('elettronica marina');

UPDATE service_providers SET category = 'fuel'
WHERE LOWER(category) IN ('carburante', 'distributore carburante');

UPDATE service_providers SET category = 'marina'
WHERE LOWER(category) IN ('porto', 'porto turistico', 'porto nautico');

UPDATE service_providers SET category = 'rigging'
WHERE LOWER(category) IN ('attrezzatura', 'sartiame');

UPDATE service_providers SET category = 'surveyor'
WHERE LOWER(category) IN ('perito navale');

UPDATE service_providers SET category = 'crane'
WHERE LOWER(category) IN ('gru');

-- ============================================================
-- SCHRITT 5: Niederländische Kategorien → Englisch
-- ============================================================

UPDATE service_providers SET category = 'motor service'
WHERE LOWER(category) IN ('werkplaats', 'scheepswerf', 'reparatie');

UPDATE service_providers SET category = 'marine supplies'
WHERE LOWER(category) IN ('nautische benodigdheden', 'jachtbenodigdheden');

UPDATE service_providers SET category = 'sailmaker'
WHERE LOWER(category) IN ('zeilmakerij');

UPDATE service_providers SET category = 'instruments'
WHERE LOWER(category) IN ('maritieme elektronica');

UPDATE service_providers SET category = 'fuel'
WHERE LOWER(category) IN ('brandstofstation', 'tankstation');

UPDATE service_providers SET category = 'marina'
WHERE LOWER(category) IN ('jachthaven', 'haven');

UPDATE service_providers SET category = 'rigging'
WHERE LOWER(category) IN ('tuigage', 'touwwerk');

UPDATE service_providers SET category = 'surveyor'
WHERE LOWER(category) IN ('scheepsexpert');

UPDATE service_providers SET category = 'crane'
WHERE LOWER(category) IN ('kraan');

UPDATE service_providers SET category = 'painting'
WHERE LOWER(category) IN ('schilderwerk / antifouling', 'schilderwerk');

-- ============================================================
-- ERGEBNIS ANZEIGEN (nach Migration)
-- ============================================================

SELECT category, COUNT(*) as count
FROM service_providers
GROUP BY category
ORDER BY count DESC;
