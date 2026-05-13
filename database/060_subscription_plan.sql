-- Migration 060: stripe_price_id + lesbarer Plan-Code auf service_providers
--
-- Damit wir auf Provider-Seite und Admin-Listen anzeigen können, WELCHES
-- Abo der Provider gebucht hat (Pro vs Enterprise, Monatlich vs Jährlich).

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS stripe_price_id   TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT
    CHECK (subscription_plan IN ('pro_monthly', 'pro_yearly', 'ent_monthly', 'ent_yearly') OR subscription_plan IS NULL);

CREATE INDEX IF NOT EXISTS idx_providers_subscription_plan
  ON service_providers (subscription_plan)
  WHERE subscription_plan IS NOT NULL;

-- Mapping price_id → plan-Code als Helper-Funktion. So muss der Code an
-- nur einer Stelle aktualisiert werden, wenn neue Preise dazu kommen.
CREATE OR REPLACE FUNCTION subscription_plan_from_price_id(p_price_id TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_price_id
    WHEN 'price_1TWIBKAKSxHR03mTLBHJkIvb' THEN 'pro_monthly'
    WHEN 'price_1TWI7bAKSxHR03mTLIBshinq' THEN 'pro_yearly'
    WHEN 'price_1TWIDLAKSxHR03mT7o48URgq' THEN 'ent_monthly'
    WHEN 'price_1TWIE6AKSxHR03mT2gFOvwdw' THEN 'ent_yearly'
    ELSE NULL
  END
$$;

GRANT EXECUTE ON FUNCTION subscription_plan_from_price_id(TEXT) TO authenticated, anon, service_role;

-- Sanity
SELECT id, name, subscription_tier, subscription_plan, stripe_price_id
FROM service_providers LIMIT 5;
