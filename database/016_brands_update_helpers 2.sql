-- ============================================================
-- Migration 016: Brands-Update-Helfer und Index-Optimierungen
-- ============================================================
-- Zweck:
--   1. Erstellt eine SQL-Funktion upsert_provider_brands() damit
--      das Admin-UI Brands sicher aktualisieren kann
--   2. Sicherstellt, dass GIN-Indizes auf brands, services und
--      products vorhanden sind (für schnelle Suche)
--   3. Stellt sicher, dass Brands und Services klar getrennt sind
--
-- Ausführen in Supabase SQL-Editor (Reihenfolge beachten)
-- ============================================================


-- ============================================================
-- SCHRITT 1: GIN-Indizes sicherstellen
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_providers_brands_gin
    ON service_providers USING GIN (brands);

CREATE INDEX IF NOT EXISTS idx_providers_services_gin
    ON service_providers USING GIN (services);

CREATE INDEX IF NOT EXISTS idx_providers_products_gin
    ON service_providers USING GIN (products);


-- ============================================================
-- SCHRITT 2: Hilfsfunktion für sicheres Brands-Update
-- ============================================================
-- Diese Funktion nimmt eine UUID und ein Text-Array entgegen
-- und schreibt AUSSCHLIESSLICH die brands-Spalte.
-- Die services-Spalte wird nie angefasst.
--
-- Rückgabe: Anzahl betroffener Zeilen (0 oder 1)
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_provider_brands(
    p_id      UUID,
    p_brands  TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER   -- läuft mit Rechten des Funktionsbesitzers (wichtig für RLS)
AS $$
DECLARE
    rows_affected INTEGER;
BEGIN
    UPDATE service_providers
    SET
        brands     = p_brands,
        updated_at = NOW()
    WHERE id = p_id;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected;
END;
$$;

-- Kommentar
COMMENT ON FUNCTION upsert_provider_brands(UUID, TEXT[]) IS
    'Setzt die brands-Spalte eines ServiceProviders. '
    'Berührt NICHT services, products oder andere Spalten. '
    'Wird vom Admin-Web-Interface aufgerufen.';


-- ============================================================
-- SCHRITT 3: Äquivalente Funktion für services-Update
-- ============================================================
-- Analog zu brands – damit nicht versehentlich Brands in
-- services landen, wenn admin manuell editiert.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_provider_services(
    p_id       UUID,
    p_services TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rows_affected INTEGER;
BEGIN
    UPDATE service_providers
    SET
        services   = p_services,
        updated_at = NOW()
    WHERE id = p_id;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected;
END;
$$;

COMMENT ON FUNCTION upsert_provider_services(UUID, TEXT[]) IS
    'Setzt die services-Spalte eines ServiceProviders. '
    'Berührt NICHT brands, products oder andere Spalten.';


-- ============================================================
-- SCHRITT 4: Kontroll-View – zeigt alle Provider mit
--            fehlenden oder leeren Brands
-- ============================================================

CREATE OR REPLACE VIEW providers_missing_brands AS
SELECT
    id,
    name,
    category,
    city,
    country,
    brands,
    services,
    updated_at
FROM service_providers
WHERE brands IS NULL
   OR array_length(brands, 1) IS NULL
   OR array_length(brands, 1) = 0
ORDER BY name;

COMMENT ON VIEW providers_missing_brands IS
    'Zeigt alle ServiceProvider bei denen die brands-Spalte '
    'leer oder NULL ist – zur schnellen Identifikation im Admin-UI.';


-- ============================================================
-- SCHRITT 5: Verifikation
-- ============================================================

-- Wie viele Provider haben Brands? Wie viele nicht?
SELECT
    category,
    COUNT(*)                                               AS total,
    COUNT(CASE WHEN array_length(brands,1) > 0 THEN 1 END) AS has_brands,
    COUNT(CASE WHEN array_length(brands,1) IS NULL THEN 1 END) AS no_brands
FROM service_providers
GROUP BY category
ORDER BY no_brands DESC, category;

-- Tabellenstruktur der drei Array-Spalten
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'service_providers'
  AND column_name IN ('brands', 'services', 'products')
ORDER BY column_name;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 016 abgeschlossen!';
    RAISE NOTICE '   - GIN-Indizes für brands, services, products vorhanden';
    RAISE NOTICE '   - Funktion upsert_provider_brands() erstellt';
    RAISE NOTICE '   - Funktion upsert_provider_services() erstellt';
    RAISE NOTICE '   - View providers_missing_brands erstellt';
END $$;
