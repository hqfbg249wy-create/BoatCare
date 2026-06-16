-- Migration 078: Versandkosten-Regeln pro Provider
--
-- Ersetzt die simple "höchster Produkt-Versand"-Logik durch eine
-- konfigurierbare Engine: Freigrenze pro Zone + gewichtsbasierte Staffel.
-- Zonen: domestic (Heimatland des Providers), eu, world.

CREATE TABLE IF NOT EXISTS provider_shipping_rules (
    provider_id           UUID PRIMARY KEY REFERENCES service_providers(id) ON DELETE CASCADE,

    -- Engine an/aus. Wenn false → alter Fallback (höchster Produkt-shipping_cost).
    enabled               BOOLEAN NOT NULL DEFAULT false,

    -- Heimatland (ISO-2) für die "domestic"-Zone
    domestic_country      TEXT NOT NULL DEFAULT 'DE',

    -- Freigrenzen (Bestell-Zwischensumme ≥ Wert → Versand kostenlos). NULL = keine.
    free_threshold_domestic  NUMERIC(10,2),     -- z.B. 85.00 für "frei ab 85€ DE"
    free_threshold_eu        NUMERIC(10,2),

    -- Gewichtsbasierte Tarife je Zone: base + per_kg * Gesamtgewicht
    rate_domestic_base    NUMERIC(10,2) NOT NULL DEFAULT 5.90,
    rate_domestic_per_kg  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    rate_eu_base          NUMERIC(10,2) NOT NULL DEFAULT 14.90,
    rate_eu_per_kg        NUMERIC(10,2) NOT NULL DEFAULT 1.50,
    rate_world_base       NUMERIC(10,2) NOT NULL DEFAULT 29.90,
    rate_world_per_kg     NUMERIC(10,2) NOT NULL DEFAULT 3.00,

    -- Deckelung (optional): Versand nie teurer als …
    max_shipping          NUMERIC(10,2),

    -- Fallback-Annahme falls ein Produkt kein weight_kg hat (kg)
    default_item_weight   NUMERIC(10,2) NOT NULL DEFAULT 0.50,

    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: Provider darf nur seine eigene Regel lesen/schreiben; Admin alles.
ALTER TABLE provider_shipping_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipping_rules_owner ON provider_shipping_rules;
CREATE POLICY shipping_rules_owner ON provider_shipping_rules
    FOR ALL
    USING (
        provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Öffentlicher Lesezugriff für die Berechnung beim Checkout läuft über die
-- Edge Function calculate-shipping (Service-Role), nicht über RLS.

COMMENT ON TABLE provider_shipping_rules IS
    'Versandkosten-Engine pro Provider: Freigrenzen + gewichtsbasierte Zonen-Tarife.';
