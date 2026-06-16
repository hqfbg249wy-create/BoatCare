-- Migration 082: admin_grant_subscription mit explizitem Level (Pro/Enterprise)
--
-- Problem: Bisher setzte der Grant nur subscription_tier='admin_grant', NICHT
-- subscription_plan. Ein alter Pro-Code (pro_monthly/pro_yearly) blockierte
-- dann Enterprise (useFeatureAccess wertet admin_grant + Pro-Code als nur Pro).
-- → Enterprise-Grant wurde nicht durchgereicht (z.B. Busse Yachtshop).
--
-- Neu: Parameter p_level ('pro' | 'enterprise', Default 'enterprise') setzt
-- subscription_plan eindeutig:
--   pro        → 'pro_yearly'   (Hook: nur Pro)
--   enterprise → 'ent_yearly'   (Hook: Enterprise)
-- Bestehende 3-Argument-Aufrufe funktionieren weiter (Default enterprise).

CREATE OR REPLACE FUNCTION admin_grant_subscription(
  p_provider_id UUID,
  p_months      INTEGER,
  p_note        TEXT DEFAULT NULL,
  p_level       TEXT DEFAULT 'enterprise'
)
RETURNS service_providers
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_until TIMESTAMPTZ;
  new_plan  TEXT;
  result    service_providers;
BEGIN
  IF p_months IS NULL THEN
    new_until := NULL;                         -- dauerhaft
  ELSE
    IF p_months < 1 OR p_months > 60 THEN
      RAISE EXCEPTION 'p_months muss zwischen 1 und 60 liegen (oder NULL für dauerhaft)';
    END IF;
    new_until := NOW() + (p_months || ' months')::INTERVAL;
  END IF;

  new_plan := CASE WHEN lower(coalesce(p_level, 'enterprise')) = 'pro'
                   THEN 'pro_yearly' ELSE 'ent_yearly' END;

  UPDATE service_providers
     SET subscription_tier   = 'admin_grant',
         subscription_status = 'active',
         subscription_plan   = new_plan,
         free_until          = new_until,
         subscription_notes  = COALESCE(p_note, subscription_notes),
         subscription_started_at = COALESCE(subscription_started_at, NOW())
   WHERE id = p_provider_id
   RETURNING * INTO result;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION admin_grant_subscription(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_grant_subscription(UUID, INTEGER, TEXT, TEXT) TO authenticated;
