-- KOMPLETTE DATENBANK-BEREINIGUNG
-- Führen Sie dieses SQL direkt in der Supabase SQL-Konsole aus

-- 1. Zeige aktuelle Situation
SELECT
    'Vor Bereinigung' as status,
    COUNT(*) as total_providers,
    COUNT(DISTINCT name || ',' || ROUND(latitude::numeric, 3) || ',' || ROUND(longitude::numeric, 3)) as unique_providers,
    COUNT(*) - COUNT(DISTINCT name || ',' || ROUND(latitude::numeric, 3) || ',' || ROUND(longitude::numeric, 3)) as duplicates
FROM service_providers;

-- 2. Zeige Kategorien vor Bereinigung
SELECT 'Kategorien vor Normalisierung' as info, category, COUNT(*) as count
FROM service_providers
GROUP BY category
ORDER BY count DESC;

-- 3. LÖSCHE DUPLIKATE (behalte nur den ältesten Eintrag pro Name+Koordinaten)
DELETE FROM service_providers
WHERE id NOT IN (
    SELECT DISTINCT ON (name, ROUND(latitude::numeric, 3), ROUND(longitude::numeric, 3))
        id
    FROM service_providers
    ORDER BY name, ROUND(latitude::numeric, 3), ROUND(longitude::numeric, 3), created_at ASC NULLS LAST
);

-- 4. NORMALISIERE KATEGORIEN auf Ihre 8 definierten Kategorien
UPDATE service_providers SET category = 'Zubehör' WHERE category IN ('supplies', 'boat supplies', 'Versorgung');
UPDATE service_providers SET category = 'Werkstatt' WHERE category = 'repair';
UPDATE service_providers SET category = 'Marina' WHERE category = 'marina';
UPDATE service_providers SET category = 'Segelmacher' WHERE category = 'sailmaker';
UPDATE service_providers SET category = 'Rigg' WHERE category IN ('rigging', 'Tauwerk');
UPDATE service_providers SET category = 'Instrumente' WHERE category = 'Elektronik';
UPDATE service_providers SET category = 'Sonstige' WHERE category NOT IN ('Werkstatt', 'Zubehör', 'Tankstelle', 'Segelmacher', 'Rigg', 'Instrumente', 'Marina');

-- 5. Zeige Ergebnis
SELECT
    'Nach Bereinigung' as status,
    COUNT(*) as total_providers,
    COUNT(DISTINCT name || ',' || ROUND(latitude::numeric, 3) || ',' || ROUND(longitude::numeric, 3)) as unique_providers,
    COUNT(*) - COUNT(DISTINCT name || ',' || ROUND(latitude::numeric, 3) || ',' || ROUND(longitude::numeric, 3)) as duplicates
FROM service_providers;

-- 6. Zeige finale Kategorien
SELECT 'Finale Kategorien' as info, category, COUNT(*) as count
FROM service_providers
GROUP BY category
ORDER BY
    CASE category
        WHEN 'Werkstatt' THEN 1
        WHEN 'Zubehör' THEN 2
        WHEN 'Segelmacher' THEN 3
        WHEN 'Rigg' THEN 4
        WHEN 'Instrumente' THEN 5
        WHEN 'Tankstelle' THEN 6
        WHEN 'Marina' THEN 7
        ELSE 8
    END;

-- 7. Zeige alle verbleibenden Provider zur Kontrolle
SELECT
    name,
    category,
    city,
    country,
    ROUND(latitude::numeric, 5) as lat,
    ROUND(longitude::numeric, 5) as lon
FROM service_providers
ORDER BY category, name;
