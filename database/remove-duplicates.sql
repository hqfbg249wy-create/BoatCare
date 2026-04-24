-- Duplikate-Bereinigung für service_providers
-- Behält nur den ältesten Eintrag (created_at) pro Duplikat-Gruppe

-- 1. Erstelle temporäre Tabelle mit IDs der zu behaltenden Provider
CREATE TEMP TABLE providers_to_keep AS
SELECT DISTINCT ON (name, latitude, longitude)
    id
FROM service_providers
ORDER BY name, latitude, longitude, created_at ASC NULLS LAST;

-- 2. Zeige welche Duplikate gelöscht werden
SELECT
    sp.id,
    sp.name,
    sp.city,
    sp.category,
    sp.latitude,
    sp.longitude,
    sp.created_at
FROM service_providers sp
WHERE sp.id NOT IN (SELECT id FROM providers_to_keep)
ORDER BY sp.name;

-- 3. Lösche Duplikate (auskommentiert - zum Aktivieren Kommentar entfernen)
-- DELETE FROM service_providers
-- WHERE id NOT IN (SELECT id FROM providers_to_keep);

-- 4. Zeige Statistik
SELECT
    (SELECT COUNT(*) FROM service_providers) as total_before,
    (SELECT COUNT(*) FROM providers_to_keep) as total_after,
    (SELECT COUNT(*) FROM service_providers) - (SELECT COUNT(*) FROM providers_to_keep) as duplicates_to_remove;
