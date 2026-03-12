-- Migration 031: Market Insights Views für Provider Portal
-- Anonymisierte, aggregierte Statistiken über die BoatCare-Nutzerflotte
-- Ermöglicht Providern gezielte Produktangebote basierend auf der Nachfrage

-- ============================================================
-- 1. Boots-Typen Verteilung (anonymisiert)
-- ============================================================
CREATE OR REPLACE VIEW boat_type_stats AS
SELECT
    COALESCE(NULLIF(TRIM(type), ''), 'Unbekannt') AS boat_type,
    COUNT(*) AS count
FROM boats
WHERE type IS NOT NULL AND TRIM(type) != ''
GROUP BY COALESCE(NULLIF(TRIM(type), ''), 'Unbekannt')
ORDER BY count DESC;

-- ============================================================
-- 2. Boots-Hersteller Verteilung (anonymisiert)
-- ============================================================
CREATE OR REPLACE VIEW boat_manufacturer_stats AS
SELECT
    COALESCE(NULLIF(TRIM(manufacturer), ''), 'Unbekannt') AS manufacturer,
    COUNT(*) AS count
FROM boats
WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != ''
GROUP BY COALESCE(NULLIF(TRIM(manufacturer), ''), 'Unbekannt')
ORDER BY count DESC;

-- ============================================================
-- 3. Ausrüstungs-Kategorien Verteilung (anonymisiert)
-- ============================================================
CREATE OR REPLACE VIEW equipment_category_stats AS
SELECT
    COALESCE(NULLIF(TRIM(category), ''), 'other') AS category,
    COUNT(*) AS count
FROM equipment
WHERE category IS NOT NULL AND TRIM(category) != ''
GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'other')
ORDER BY count DESC;

-- ============================================================
-- 4. Ausrüstungs-Hersteller Verteilung (anonymisiert)
-- ============================================================
CREATE OR REPLACE VIEW equipment_manufacturer_stats AS
SELECT
    COALESCE(NULLIF(TRIM(manufacturer), ''), 'Unbekannt') AS manufacturer,
    COUNT(*) AS count
FROM equipment
WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != ''
GROUP BY COALESCE(NULLIF(TRIM(manufacturer), ''), 'Unbekannt')
ORDER BY count DESC;

-- ============================================================
-- 5. Gesamtstatistiken
-- ============================================================
CREATE OR REPLACE VIEW fleet_overview_stats AS
SELECT
    (SELECT COUNT(*) FROM boats) AS total_boats,
    (SELECT COUNT(DISTINCT type) FROM boats WHERE type IS NOT NULL AND TRIM(type) != '') AS unique_boat_types,
    (SELECT COUNT(DISTINCT manufacturer) FROM boats WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != '') AS unique_boat_manufacturers,
    (SELECT COUNT(*) FROM equipment) AS total_equipment,
    (SELECT COUNT(DISTINCT category) FROM equipment WHERE category IS NOT NULL AND TRIM(category) != '') AS unique_equipment_categories,
    (SELECT COUNT(DISTINCT manufacturer) FROM equipment WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != '') AS unique_equipment_manufacturers;

-- ============================================================
-- 6. RLS: Leserechte für authentifizierte User auf Views
-- Views erben normalerweise keine RLS, aber wir sichern die
-- Basistabellen ab. Die Views zeigen nur aggregierte Daten.
-- ============================================================

-- Sicherstellen dass die Views für authentifizierte User lesbar sind
-- (Views in PostgreSQL umgehen RLS standardmäßig, da sie als
-- definer-Rechte laufen - das ist hier gewollt, da nur Aggregate gezeigt werden)

-- Optional: Function für Provider um alle Insights auf einmal zu laden
CREATE OR REPLACE FUNCTION get_market_insights()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'fleet_overview', (SELECT row_to_json(f) FROM fleet_overview_stats f),
        'boat_types', (SELECT json_agg(row_to_json(bt)) FROM (SELECT * FROM boat_type_stats LIMIT 20) bt),
        'boat_manufacturers', (SELECT json_agg(row_to_json(bm)) FROM (SELECT * FROM boat_manufacturer_stats LIMIT 20) bm),
        'equipment_categories', (SELECT json_agg(row_to_json(ec)) FROM (SELECT * FROM equipment_category_stats LIMIT 20) ec),
        'equipment_manufacturers', (SELECT json_agg(row_to_json(em)) FROM (SELECT * FROM equipment_manufacturer_stats LIMIT 20) em)
    ) INTO result;

    RETURN result;
END;
$$;
