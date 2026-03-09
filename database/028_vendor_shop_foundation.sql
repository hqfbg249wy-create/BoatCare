-- Migration 028: Vendor-Shop Foundation
-- Erweitert service_providers, metashop_products und erstellt neue Tabellen
-- für das Vendor-Shop-System (Orders, Promotions, Messaging, Product Categories)

-- ============================================================
-- 1. service_providers erweitern
-- ============================================================

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS iban_last4 TEXT,
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(4,2) DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS is_shop_active BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_key TEXT,
  ADD COLUMN IF NOT EXISTS api_type TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS shop_description TEXT;

-- Index fuer Shop-Abfragen
CREATE INDEX IF NOT EXISTS idx_providers_shop_active
  ON service_providers (is_shop_active) WHERE is_shop_active = true;

-- ============================================================
-- 2. profiles erweitern (Kaeufer-Daten)
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS shipping_street TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'DE',
  ADD COLUMN IF NOT EXISTS preferred_boat_id UUID;

-- ============================================================
-- 3. product_categories (Hierarchische Produktkategorien)
-- ============================================================

CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name_de TEXT NOT NULL,
    name_en TEXT NOT NULL,
    parent_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_categories_read_all" ON product_categories
    FOR SELECT USING (true);

CREATE POLICY "product_categories_manage_admin" ON product_categories
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Basis-Kategorien einfuegen
INSERT INTO product_categories (slug, name_de, name_en, icon, sort_order) VALUES
    ('antifouling-paint', 'Antifouling & Farben', 'Antifouling & Paint', 'paintbrush.fill', 1),
    ('engine-drive', 'Motor & Antrieb', 'Engine & Drive', 'engine.combustion.fill', 2),
    ('sails-rigging', 'Segel & Rigg', 'Sails & Rigging', 'sail', 3),
    ('electronics', 'Elektrik & Elektronik', 'Electronics', 'antenna.radiowaves.left.and.right', 4),
    ('deck-fittings', 'Deck & Beschlaege', 'Deck & Fittings', 'wrench.and.screwdriver.fill', 5),
    ('safety', 'Sicherheit', 'Safety', 'shield.fill', 6),
    ('sanitary', 'Sanitaer & Komfort', 'Sanitary & Comfort', 'drop.fill', 7),
    ('care-cleaning', 'Pflege & Reinigung', 'Care & Cleaning', 'sparkles', 8),
    ('trailer-transport', 'Trailer & Transport', 'Trailer & Transport', 'car.fill', 9),
    ('clothing-gear', 'Bekleidung & Ausruestung', 'Clothing & Gear', 'tshirt.fill', 10)
ON CONFLICT (slug) DO NOTHING;

-- Sub-Kategorien
INSERT INTO product_categories (slug, name_de, name_en, parent_id, sort_order) VALUES
    ('antifouling', 'Antifouling', 'Antifouling', (SELECT id FROM product_categories WHERE slug = 'antifouling-paint'), 1),
    ('boat-paint', 'Bootslack', 'Boat Paint', (SELECT id FROM product_categories WHERE slug = 'antifouling-paint'), 2),
    ('primer', 'Grundierung', 'Primer', (SELECT id FROM product_categories WHERE slug = 'antifouling-paint'), 3),
    ('engine-oil', 'Motoroel', 'Engine Oil', (SELECT id FROM product_categories WHERE slug = 'engine-drive'), 1),
    ('filters', 'Filter', 'Filters', (SELECT id FROM product_categories WHERE slug = 'engine-drive'), 2),
    ('impellers', 'Impeller', 'Impellers', (SELECT id FROM product_categories WHERE slug = 'engine-drive'), 3),
    ('spark-plugs', 'Zuendkerzen', 'Spark Plugs', (SELECT id FROM product_categories WHERE slug = 'engine-drive'), 4),
    ('propellers', 'Propeller', 'Propellers', (SELECT id FROM product_categories WHERE slug = 'engine-drive'), 5),
    ('lines-sheets', 'Fallen & Schoten', 'Lines & Sheets', (SELECT id FROM product_categories WHERE slug = 'sails-rigging'), 1),
    ('blocks', 'Bloecke', 'Blocks', (SELECT id FROM product_categories WHERE slug = 'sails-rigging'), 2),
    ('batteries', 'Batterien', 'Batteries', (SELECT id FROM product_categories WHERE slug = 'electronics'), 1),
    ('chargers', 'Ladegeraete', 'Chargers', (SELECT id FROM product_categories WHERE slug = 'electronics'), 2),
    ('navigation', 'Navigation', 'Navigation', (SELECT id FROM product_categories WHERE slug = 'electronics'), 3),
    ('life-jackets', 'Rettungswesten', 'Life Jackets', (SELECT id FROM product_categories WHERE slug = 'safety'), 1),
    ('fire-extinguishers', 'Feuerloescher', 'Fire Extinguishers', (SELECT id FROM product_categories WHERE slug = 'safety'), 2),
    ('flares', 'Signalmittel', 'Flares', (SELECT id FROM product_categories WHERE slug = 'safety'), 3),
    ('cleaners', 'Reinigungsmittel', 'Cleaners', (SELECT id FROM product_categories WHERE slug = 'care-cleaning'), 1),
    ('polish', 'Poliermittel', 'Polish', (SELECT id FROM product_categories WHERE slug = 'care-cleaning'), 2),
    ('teak-care', 'Teakpflege', 'Teak Care', (SELECT id FROM product_categories WHERE slug = 'care-cleaning'), 3)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 4. metashop_products erweitern
-- ============================================================

ALTER TABLE metashop_products
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS ean TEXT,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_quantity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS fits_boat_types TEXT[],
  ADD COLUMN IF NOT EXISTS fits_manufacturers TEXT[],
  ADD COLUMN IF NOT EXISTS compatible_equipment TEXT[],
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS images TEXT[],
  ADD COLUMN IF NOT EXISTS external_product_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES product_categories(id);

-- Index fuer aktive Produkte
CREATE INDEX IF NOT EXISTS idx_metashop_active
  ON metashop_products (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_metashop_category_id
  ON metashop_products (category_id);
CREATE INDEX IF NOT EXISTS idx_metashop_sku
  ON metashop_products (sku);

-- RLS: Provider darf eigene Produkte verwalten
CREATE POLICY "metashop_products_provider_manage" ON metashop_products
    FOR ALL TO authenticated
    USING (
        provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
        )
    );

-- ============================================================
-- 5. orders Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    buyer_id UUID NOT NULL REFERENCES auth.users(id),
    provider_id UUID NOT NULL REFERENCES service_providers(id),
    boat_id UUID REFERENCES boats(id),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded')),

    subtotal NUMERIC(10,2) NOT NULL,
    shipping_cost NUMERIC(10,2) DEFAULT 0,
    discount_total NUMERIC(10,2) DEFAULT 0,
    commission_rate NUMERIC(4,2) NOT NULL,
    commission_amount NUMERIC(10,2) NOT NULL,
    total NUMERIC(10,2) NOT NULL,
    currency TEXT DEFAULT 'EUR',

    -- Lieferadresse (Snapshot)
    shipping_name TEXT NOT NULL,
    shipping_street TEXT NOT NULL,
    shipping_city TEXT NOT NULL,
    shipping_postal_code TEXT NOT NULL,
    shipping_country TEXT NOT NULL DEFAULT 'DE',

    -- Payment
    stripe_payment_intent_id TEXT,
    stripe_transfer_id TEXT,
    payment_status TEXT DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),

    -- Tracking
    tracking_number TEXT,
    tracking_url TEXT,
    estimated_delivery DATE,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,

    -- Notizen
    buyer_note TEXT,
    provider_note TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Kaeufer sieht eigene Bestellungen
CREATE POLICY "orders_buyer_read" ON orders
    FOR SELECT TO authenticated
    USING (buyer_id = auth.uid());

-- Provider sieht Bestellungen an ihn
CREATE POLICY "orders_provider_read" ON orders
    FOR SELECT TO authenticated
    USING (
        provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
        )
    );

-- Provider kann Status und Tracking aktualisieren
CREATE POLICY "orders_provider_update" ON orders
    FOR UPDATE TO authenticated
    USING (
        provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
        )
    );

-- Kaeufer kann Bestellung erstellen
CREATE POLICY "orders_buyer_insert" ON orders
    FOR INSERT TO authenticated
    WITH CHECK (buyer_id = auth.uid());

-- Admin sieht alle
CREATE POLICY "orders_admin_all" ON orders
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Indices
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders (buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_provider ON orders (provider_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);

-- Auto-Update Trigger
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_orders_updated_at();

-- Order-Number Sequenz
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number = 'BC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number ON orders;
CREATE TRIGGER set_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
    EXECUTE FUNCTION generate_order_number();

-- ============================================================
-- 6. order_items Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES metashop_products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    discount_percent NUMERIC(4,2) DEFAULT 0,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2) NOT NULL,

    -- Snapshot
    product_name TEXT NOT NULL,
    product_sku TEXT,
    product_manufacturer TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Kaeufer sieht Items seiner Bestellungen
CREATE POLICY "order_items_buyer_read" ON order_items
    FOR SELECT TO authenticated
    USING (
        order_id IN (SELECT id FROM orders WHERE buyer_id = auth.uid())
    );

-- Provider sieht Items seiner Bestellungen
CREATE POLICY "order_items_provider_read" ON order_items
    FOR SELECT TO authenticated
    USING (
        order_id IN (
            SELECT o.id FROM orders o
            JOIN service_providers sp ON o.provider_id = sp.id
            WHERE sp.user_id = auth.uid()
        )
    );

-- Kaeufer kann Items erstellen
CREATE POLICY "order_items_buyer_insert" ON order_items
    FOR INSERT TO authenticated
    WITH CHECK (
        order_id IN (SELECT id FROM orders WHERE buyer_id = auth.uid())
    );

-- Admin sieht alle
CREATE POLICY "order_items_admin_all" ON order_items
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

-- ============================================================
-- 7. provider_promotions (Filter-basierte Rabatte)
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL DEFAULT 'percent'
        CHECK (discount_type IN ('percent', 'fixed')),
    discount_value NUMERIC(10,2) NOT NULL,

    -- Filter-Kriterien
    filter_categories TEXT[],
    filter_boat_types TEXT[],
    filter_manufacturers TEXT[],
    filter_min_order NUMERIC(10,2),
    filter_equipment_categories TEXT[],

    -- Gueltigkeit
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT true,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE provider_promotions ENABLE ROW LEVEL SECURITY;

-- Alle koennen aktive Promotions lesen
CREATE POLICY "promotions_read_active" ON provider_promotions
    FOR SELECT TO authenticated
    USING (is_active = true);

-- Provider verwaltet eigene
CREATE POLICY "promotions_provider_manage" ON provider_promotions
    FOR ALL TO authenticated
    USING (
        provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
        )
    );

-- Admin sieht alle
CREATE POLICY "promotions_admin_all" ON provider_promotions
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE INDEX IF NOT EXISTS idx_promotions_provider ON provider_promotions (provider_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON provider_promotions (is_active) WHERE is_active = true;

-- ============================================================
-- 8. conversations Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    provider_id UUID NOT NULL REFERENCES service_providers(id),
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, provider_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_participant" ON conversations
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR provider_id IN (
            SELECT id FROM service_providers WHERE service_providers.user_id = auth.uid()
        )
    );

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_provider ON conversations (provider_id);

-- ============================================================
-- 9. messages Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'provider')),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    related_order_id UUID REFERENCES orders(id),
    related_product_id UUID REFERENCES metashop_products(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_participant" ON messages
    FOR SELECT TO authenticated
    USING (
        conversation_id IN (
            SELECT id FROM conversations
            WHERE user_id = auth.uid()
            OR provider_id IN (
                SELECT sp.id FROM service_providers sp WHERE sp.user_id = auth.uid()
            )
        )
    );

CREATE POLICY "messages_insert" ON messages
    FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND conversation_id IN (
            SELECT id FROM conversations
            WHERE user_id = auth.uid()
            OR provider_id IN (
                SELECT sp.id FROM service_providers sp WHERE sp.user_id = auth.uid()
            )
        )
    );

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (is_read) WHERE is_read = false;

-- ============================================================
-- 10. Provider RLS: Provider kann eigene Stammdaten bearbeiten
-- ============================================================

-- Provider darf seine eigenen Provider-Daten lesen und bearbeiten
CREATE POLICY "providers_self_read" ON service_providers
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "providers_self_update" ON service_providers
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================
-- Fertig
-- ============================================================
SELECT 'Migration 028 erfolgreich ausgefuehrt' AS status;
