-- Zähle alle Provider und gruppiere nach Stadt/Land
SELECT 
    country,
    city,
    category,
    COUNT(*) as count
FROM service_providers
WHERE city ILIKE '%agde%' OR city ILIKE '%cap%'
GROUP BY country, city, category
ORDER BY count DESC;

-- Gesamtzahl
SELECT COUNT(*) as total FROM service_providers;
