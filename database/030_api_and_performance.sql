-- Migration 030: API Infrastructure & Performance Indexes
-- Adds tables for API usage tracking, webhook events, notifications
-- Adds performance indexes for common query patterns

-- ============================================
-- API USAGE LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    provider_id UUID REFERENCES service_providers(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'create_product', 'update_product', 'list_products'
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    response_status INT
);

CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage_logs (provider_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_action ON api_usage_logs (action, timestamp DESC);

-- RLS: Admin only
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage api_usage_logs" ON api_usage_logs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- ============================================
-- WEBHOOK EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES service_providers(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'order_created', 'order_shipped', etc.
    payload JSONB,
    results JSONB, -- Array of { target, success, error }
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON webhook_events (order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events (event_type, created_at DESC);

-- RLS: Admin only
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage webhook_events" ON webhook_events
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_id UUID NOT NULL,
    recipient_type TEXT NOT NULL DEFAULT 'user', -- 'user' or 'provider'
    type TEXT NOT NULL, -- 'order_created', 'order_shipped', 'message', etc.
    title TEXT NOT NULL,
    body TEXT,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications (type, created_at DESC);

-- RLS: Users can read/update their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notifications" ON notifications
    FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "Users can mark own notifications read" ON notifications
    FOR UPDATE USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "Admin can manage notifications" ON notifications
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- ============================================
-- PROVIDER WEBHOOK URL COLUMN
-- ============================================

ALTER TABLE service_providers
    ADD COLUMN IF NOT EXISTS webhook_url TEXT;

-- ============================================
-- PERFORMANCE INDEXES
-- ============================================

-- Products: Full-text search
CREATE INDEX IF NOT EXISTS idx_products_name_search ON metashop_products
    USING gin (to_tsvector('german', name));

-- Products: Category + active (most common filter)
CREATE INDEX IF NOT EXISTS idx_products_category_active ON metashop_products (category_id, is_active)
    WHERE is_active = true;

-- Products: Provider + active
CREATE INDEX IF NOT EXISTS idx_products_provider_active ON metashop_products (provider_id, is_active)
    WHERE is_active = true;

-- Products: Boat type compatibility (GIN for array containment)
CREATE INDEX IF NOT EXISTS idx_products_boat_types ON metashop_products
    USING gin (fits_boat_types) WHERE fits_boat_types IS NOT NULL;

-- Products: Manufacturer compatibility
CREATE INDEX IF NOT EXISTS idx_products_manufacturers ON metashop_products
    USING gin (fits_manufacturers) WHERE fits_manufacturers IS NOT NULL;

-- Orders: Buyer + status (user order history)
CREATE INDEX IF NOT EXISTS idx_orders_buyer_status ON orders (buyer_id, status, created_at DESC);

-- Orders: Provider + status (provider dashboard)
CREATE INDEX IF NOT EXISTS idx_orders_provider_status ON orders (provider_id, status, created_at DESC);

-- Orders: Payment status (payment reconciliation)
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status, created_at DESC);

-- Conversations: Fast unread count
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (conversation_id, is_read)
    WHERE is_read = false;

-- Conversations: User lookup
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id, last_message_at DESC);

-- Conversations: Provider lookup
CREATE INDEX IF NOT EXISTS idx_conversations_provider ON conversations (provider_id, last_message_at DESC);

-- Promotions: Active promotions quick lookup
CREATE INDEX IF NOT EXISTS idx_promotions_active ON provider_promotions (is_active, provider_id)
    WHERE is_active = true;

-- API key lookup (unique for security)
CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_api_key ON service_providers (api_key)
    WHERE api_key IS NOT NULL;

-- ============================================
-- MATERIALIZED VIEW: Shop Dashboard Stats
-- ============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS shop_dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM service_providers WHERE is_shop_active = true) AS active_shops,
    (SELECT COUNT(*) FROM metashop_products WHERE is_active = true) AS active_products,
    (SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL '30 days') AS orders_30d,
    (SELECT COALESCE(SUM(total), 0) FROM orders WHERE payment_status = 'paid' AND created_at > NOW() - INTERVAL '30 days') AS revenue_30d,
    (SELECT COALESCE(SUM(commission_amount), 0) FROM orders WHERE payment_status = 'paid' AND created_at > NOW() - INTERVAL '30 days') AS commission_30d,
    (SELECT COUNT(*) FROM provider_promotions WHERE is_active = true) AS active_promotions,
    NOW() AS refreshed_at;

-- Refresh function (can be called periodically)
CREATE OR REPLACE FUNCTION refresh_shop_dashboard_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW shop_dashboard_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
