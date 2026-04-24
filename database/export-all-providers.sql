-- Exportiere ALLE ServiceProvider mit ihren Adressen
-- Kopiere das Ergebnis in eine CSV-Datei

SELECT
    id,
    name,
    COALESCE(street, address) as full_address,
    street,
    postal_code,
    city,
    country
FROM service_providers
ORDER BY name;
