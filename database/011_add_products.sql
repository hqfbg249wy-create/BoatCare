-- Migration 011: Produkte-Feld hinzufügen
-- services = angebotene Dienstleistungen (z.B. "Motorrevision", "Rigg-Service")
-- products = verkaufte Produkte / vertretene Produktlinien (z.B. "Antifouling", "Bootsmotoren")

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS products TEXT[];

-- Index für schnellere Array-Suche
CREATE INDEX IF NOT EXISTS idx_providers_products ON service_providers USING GIN (products);
CREATE INDEX IF NOT EXISTS idx_providers_services ON service_providers USING GIN (services);

-- Verifizierung
SELECT
  id,
  name,
  services,
  products,
  brands
FROM service_providers
LIMIT 5;
