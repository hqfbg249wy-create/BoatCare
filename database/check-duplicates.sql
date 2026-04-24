-- Prüfe auf Duplikate nach Name und Koordinaten
SELECT 
    name,
    latitude,
    longitude,
    COUNT(*) as duplicate_count,
    array_agg(id) as ids
FROM service_providers
GROUP BY name, latitude, longitude
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
