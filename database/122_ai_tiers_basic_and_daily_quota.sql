-- 122_ai_tiers_basic_and_daily_quota.sql
-- Phase-1-Preismodell (Bootseigner):
--   Free  → 10 KI-Fragen EINMALIG (lifetime), Sonnet
--   Basic → 1,99 €/M · 19,99 €/J → 5 Fragen/Tag, Sonnet, + Foto-Analyse + Rabatte
--   Plus  → 4,99 €/M · 49,00 €/J → 15 Fragen/Tag, OPUS, + Family/Excel/Report
--
-- Enthält:
--   1) 'basic' als gültigen Plan-Code
--   2) user_ai_tier()      → 'plus' | 'basic' | 'free'
--   3) user_has_paid_tier() → TRUE ab Basic (für Foto-Analyse + Rabatte)
--   4) ai_daily_usage       → Tageszähler für die Fair-Use-Deckel (Basic/Plus)

BEGIN;

-- ── 1) 'basic' im Plan-CHECK zulassen ────────────────────────────────────
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'user_subscriptions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%plan%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_subscriptions DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_plan_check
  CHECK (plan IS NULL OR plan IN
         ('basic', 'plus_individual', 'plus_family', 'plus_fleet', 'plus_enterprise'));

-- ── 2) KI-Tier eines Users: plus > basic > free ─────────────────────────
CREATE OR REPLACE FUNCTION user_ai_tier(p_user_id UUID, p_boat_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  -- Plus (Individual/Family/Fleet/Enterprise) hat Vorrang → volle Features + Opus
  IF user_has_plus(p_user_id, p_boat_id) THEN
    RETURN 'plus';
  END IF;
  -- Eigene aktive Basic-Subscription?
  IF EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE owner_user_id = p_user_id
      AND plan = 'basic'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RETURN 'basic';
  END IF;
  RETURN 'free';
END $$;
GRANT EXECUTE ON FUNCTION user_ai_tier(UUID, UUID) TO authenticated, service_role;

-- ── 3) Bezahlter Tarif (ab Basic)? → für Foto-Analyse + SKIPILY-Rabatte ──
CREATE OR REPLACE FUNCTION user_has_paid_tier(p_user_id UUID, p_boat_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT user_ai_tier(p_user_id, p_boat_id) <> 'free';
$$;
GRANT EXECUTE ON FUNCTION user_has_paid_tier(UUID, UUID) TO authenticated, service_role;

-- ── 4) Tages-Nutzung (Fair-Use-Deckel Basic 5/Tag, Plus 15/Tag) ─────────
CREATE TABLE IF NOT EXISTS ai_daily_usage (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day        DATE NOT NULL DEFAULT CURRENT_DATE,
  call_count INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE ai_daily_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_daily_usage_select_own ON ai_daily_usage;
CREATE POLICY ai_daily_usage_select_own ON ai_daily_usage
  FOR SELECT USING (auth.uid() = user_id);
-- Schreiben ausschließlich via service_role (Edge Functions) → keine Write-Policy.

CREATE OR REPLACE FUNCTION increment_ai_daily_usage(p_user_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
AS $$
  INSERT INTO ai_daily_usage (user_id, day, call_count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, day)
  DO UPDATE SET call_count = ai_daily_usage.call_count + 1;
$$;
GRANT EXECUTE ON FUNCTION increment_ai_daily_usage(UUID) TO service_role;

-- ── 5) 'basic' auch als gültige Quelle im KI-Audit-Log zulassen ─────────
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'ai_usage'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%source%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_usage DROP CONSTRAINT %I', c);
  END IF;
END $$;
ALTER TABLE ai_usage
  ADD CONSTRAINT ai_usage_source_check
  CHECK (source IN ('free', 'basic', 'plus', 'provider_quota'));

COMMIT;
