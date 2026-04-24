-- Lösche ALLE Provider mit Name 'Unbekannt' ODER ohne Stadt

-- Schritt 1: Zeige wie viele gelöscht werden
SELECT
    COUNT(*) as to_delete,
    SUM(CASE WHEN name = 'Unbekannt' THEN 1 ELSE 0 END) as unknown_name,
    SUM(CASE WHEN city IS NULL THEN 1 ELSE 0 END) as no_city
FROM service_providers
WHERE name = 'Unbekannt' OR city IS NULL;

-- Schritt 2: Lösche sie (auskommentiert - zum Aktivieren Kommentar entfernen)
DELETE FROM service_providers
WHERE name = 'Unbekannt' OR city IS NULL;

-- Schritt 3: Zeige verbleibende Provider
SELECT COUNT(*) as remaining FROM service_providers;
