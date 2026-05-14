-- Migration 061: KI-Nutzungs-Tracking und Quoten
--
-- Tracking welcher User welches KI-Feature wie oft nutzt + welche Quelle
-- die Kosten trägt (Provider-Quota, Skipily-Plus-Abo, Free-Tier).
--
-- Quoten:
--   Free-Tier         → 5 Calls/Monat pro User (Loss-Leader)
--   Provider Pro      → 100 Calls/Monat (gesamthaft)
--   Provider Enterprise / Admin-Grant → 1000 Calls/Monat
--   User Skipily Plus → unbegrenzt (kostet nur Apple-Provision)
--
-- Phase 1 (Web): Provider-Quota + Free-Tier
-- Phase 2 (iOS): user_subscriptions mit Apple-Receipt-Verifikation

-- ─── Audit-Log ───────────────────────────────────────────────────────────
-- Eine Zeile pro KI-Call. Hilft Kosten zu attribuieren und Missbrauch zu erkennen.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feature     TEXT NOT NULL CHECK (feature IN (
                'chat', 'photo_analysis', 'suggest_equipment',
                'translate_text', 'translate_product', 'translate_provider'
              )),
  source      TEXT NOT NULL CHECK (source IN ('free', 'plus', 'provider_quota')),
  provider_id UUID REFERENCES service_providers(id) ON DELETE SET NULL,
  cost_tokens INT  DEFAULT 0,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month
  ON ai_usage (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_month
  ON ai_usage (provider_id, created_at DESC)
  WHERE provider_id IS NOT NULL;

-- ─── Monats-Counter (denormalisiert für schnellen Quota-Check) ───────────
-- Eine Zeile pro (user_id OR provider_id) × Monat. user_id ist NULL wenn
-- die Zeile zum Provider-Pool gehört, provider_id NULL bei persönlicher
-- Free-Tier-Nutzung.
CREATE TABLE IF NOT EXISTS public.ai_monthly_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID,
  provider_id  UUID,
  year_month   TEXT NOT NULL,         -- '2026-05'
  call_count   INT  NOT NULL DEFAULT 0,
  last_call_at TIMESTAMPTZ,
  CHECK (user_id IS NOT NULL OR provider_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aim_user_month
  ON ai_monthly_usage (user_id, year_month)
  WHERE provider_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_aim_provider_month
  ON ai_monthly_usage (provider_id, year_month)
  WHERE user_id IS NULL;

-- ─── Skipily Plus (iOS-Abos via Apple IAP, ab Phase 2 aktiv) ─────────────
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id           TEXT NOT NULL,                -- z.B. "skipily_plus_monthly"
  apple_original_tx_id TEXT,                         -- für Renewal-Tracking
  apple_latest_tx_id   TEXT,
  status               TEXT NOT NULL DEFAULT 'inactive'
                       CHECK (status IN ('active', 'expired', 'grace_period', 'in_billing_retry', 'revoked', 'inactive')),
  expires_at           TIMESTAMPTZ,
  started_at           TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at     TIMESTAMPTZ DEFAULT NOW(),
  raw_apple_payload    JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active
  ON user_subscriptions (status, expires_at)
  WHERE status = 'active';

-- ─── Helfer: aktueller Year-Month-String ────────────────────────────────
CREATE OR REPLACE FUNCTION current_year_month()
RETURNS TEXT LANGUAGE sql IMMUTABLE
AS $$ SELECT to_char(NOW(), 'YYYY-MM') $$;

-- ─── Helfer: Quota-Limit für Provider basierend auf Tier ────────────────
CREATE OR REPLACE FUNCTION provider_ai_quota(p_provider_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  tier   TEXT;
  plan   TEXT;
  status TEXT;
  free_until_val TIMESTAMPTZ;
BEGIN
  SELECT subscription_tier, subscription_plan, subscription_status, free_until
    INTO tier, plan, status, free_until_val
    FROM service_providers
   WHERE id = p_provider_id;

  -- Admin-Grant: Enterprise-Niveau bis free_until (oder unbegrenzt wenn NULL)
  IF tier = 'admin_grant' AND (free_until_val IS NULL OR free_until_val > NOW()) THEN
    RETURN 1000;
  END IF;

  -- Bezahltes Pro
  IF tier = 'professional' AND status = 'active' THEN
    IF plan IN ('ent_monthly', 'ent_yearly') THEN
      RETURN 1000;
    ELSE
      RETURN 100;
    END IF;
  END IF;

  -- Standard hat 0 Quota
  RETURN 0;
END $$;

-- ─── Atomares Increment für Monats-Counter ──────────────────────────────
-- Wird von der Edge Function nach erfolgreichem AI-Call aufgerufen.
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id      UUID,
  p_provider_id  UUID,
  p_feature      TEXT,
  p_source       TEXT,
  p_cost_tokens  INT  DEFAULT 0,
  p_metadata     JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ym TEXT := current_year_month();
BEGIN
  -- 1) Log-Eintrag
  INSERT INTO ai_usage (user_id, feature, source, provider_id, cost_tokens, metadata)
  VALUES (p_user_id, p_feature, p_source, p_provider_id, p_cost_tokens, p_metadata);

  -- 2) Monats-Counter inkrementieren (je nach Quelle)
  IF p_source = 'provider_quota' AND p_provider_id IS NOT NULL THEN
    INSERT INTO ai_monthly_usage (provider_id, year_month, call_count, last_call_at)
    VALUES (p_provider_id, ym, 1, NOW())
    ON CONFLICT (provider_id, year_month) WHERE user_id IS NULL
    DO UPDATE SET call_count = ai_monthly_usage.call_count + 1,
                  last_call_at = NOW();
  ELSE
    -- Free-Tier oder Plus: persönlicher Counter
    INSERT INTO ai_monthly_usage (user_id, year_month, call_count, last_call_at)
    VALUES (p_user_id, ym, 1, NOW())
    ON CONFLICT (user_id, year_month) WHERE provider_id IS NULL
    DO UPDATE SET call_count = ai_monthly_usage.call_count + 1,
                  last_call_at = NOW();
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION increment_ai_usage(UUID, UUID, TEXT, TEXT, INT, JSONB)
  TO authenticated, service_role;

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE ai_usage           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_monthly_usage   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- User darf seinen eigenen AI-Usage sehen
DROP POLICY IF EXISTS "Users see own ai_usage" ON ai_usage;
CREATE POLICY "Users see own ai_usage" ON ai_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Provider darf den AI-Usage seines Providers sehen
DROP POLICY IF EXISTS "Provider sees own ai_usage" ON ai_usage;
CREATE POLICY "Provider sees own ai_usage" ON ai_usage
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM service_providers WHERE user_id = auth.uid()
    )
  );

-- Monthly-Counter: User sieht eigene, Provider sieht eigene
DROP POLICY IF EXISTS "Users see own monthly" ON ai_monthly_usage;
CREATE POLICY "Users see own monthly" ON ai_monthly_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Subscriptions: nur eigener Eintrag
DROP POLICY IF EXISTS "Users see own subscription" ON user_subscriptions;
CREATE POLICY "Users see own subscription" ON user_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Sanity
SELECT 'ai_usage'           AS tbl, count(*) FROM ai_usage
UNION ALL SELECT 'ai_monthly_usage', count(*) FROM ai_monthly_usage
UNION ALL SELECT 'user_subscriptions', count(*) FROM user_subscriptions;
