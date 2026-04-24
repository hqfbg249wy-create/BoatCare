-- Migration 025: Metashop-Produkte Tabelle
-- Speichert Produkte/Ersatzteile von Service-Providern mit Shop

CREATE TABLE IF NOT EXISTS metashop_products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id     UUID REFERENCES service_providers(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    manufacturer    TEXT DEFAULT '',
    part_number     TEXT DEFAULT '',
    price           NUMERIC(10,2),
    currency        TEXT DEFAULT 'EUR',
    shop_name       TEXT DEFAULT '',
    shop_url        TEXT DEFAULT '',
    image_url       TEXT,
    in_stock        BOOLEAN DEFAULT true,
    shipping_cost   NUMERIC(10,2),
    delivery_days   INTEGER,
    rating          NUMERIC(3,1),
    review_count    INTEGER DEFAULT 0,
    description     TEXT DEFAULT '',
    category        TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indices fuer schnelle Suche
CREATE INDEX IF NOT EXISTS idx_metashop_products_name
    ON metashop_products USING GIN (to_tsvector('german', name));
CREATE INDEX IF NOT EXISTS idx_metashop_products_manufacturer
    ON metashop_products (manufacturer);
CREATE INDEX IF NOT EXISTS idx_metashop_products_part_number
    ON metashop_products (part_number);
CREATE INDEX IF NOT EXISTS idx_metashop_products_category
    ON metashop_products (category);
CREATE INDEX IF NOT EXISTS idx_metashop_products_provider_id
    ON metashop_products (provider_id);

-- RLS aktivieren
ALTER TABLE metashop_products ENABLE ROW LEVEL SECURITY;

-- Leserechte fuer alle authentifizierten Benutzer
CREATE POLICY "metashop_products_read" ON metashop_products
    FOR SELECT TO authenticated USING (true);

-- Schreibrechte fuer Service-Account (Scraper)
CREATE POLICY "metashop_products_insert_service" ON metashop_products
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "metashop_products_update_service" ON metashop_products
    FOR UPDATE TO service_role USING (true);

CREATE POLICY "metashop_products_delete_service" ON metashop_products
    FOR DELETE TO service_role USING (true);

-- Oeffentlicher Lesezugriff (fuer anon-Key in der App)
CREATE POLICY "metashop_products_read_anon" ON metashop_products
    FOR SELECT TO anon USING (true);
