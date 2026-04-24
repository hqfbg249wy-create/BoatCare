-- RPC-Funktion zum Aktualisieren von ServiceProvidern
-- Diese Funktion umgeht den REST-API Schema-Cache

CREATE OR REPLACE FUNCTION update_service_provider(
    provider_id UUID,
    provider_name TEXT,
    provider_category TEXT,
    provider_description TEXT DEFAULT NULL,
    provider_address TEXT DEFAULT NULL,
    provider_postal_code TEXT DEFAULT NULL,
    provider_city TEXT DEFAULT NULL,
    provider_country TEXT DEFAULT NULL,
    provider_latitude DOUBLE PRECISION DEFAULT NULL,
    provider_longitude DOUBLE PRECISION DEFAULT NULL,
    provider_phone TEXT DEFAULT NULL,
    provider_email TEXT DEFAULT NULL,
    provider_website TEXT DEFAULT NULL,
    provider_services TEXT[] DEFAULT NULL,
    provider_brands TEXT[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE service_providers
    SET
        name = provider_name,
        category = provider_category,
        description = provider_description,
        address = provider_address,
        postal_code = provider_postal_code,
        city = provider_city,
        country = provider_country,
        latitude = provider_latitude,
        longitude = provider_longitude,
        phone = provider_phone,
        email = provider_email,
        website = provider_website,
        services = provider_services,
        brands = provider_brands,
        updated_at = NOW()
    WHERE id = provider_id;
END;
$$;

-- Schema-Cache neu laden
NOTIFY pgrst, 'reload schema';
