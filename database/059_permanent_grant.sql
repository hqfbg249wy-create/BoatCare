-- Migration 059: admin_grant_subscription unterstützt dauerhafte Freischaltung
--
-- Vorher: p_months 1..12, immer ein Ablaufdatum.
-- Neu:    p_months NULL → free_until bleibt NULL → kein Ablauf (dauerhaft).
--
-- Die View provider_subscription_status behandelt NULL-free_until bereits als
-- "läuft" (keine Ablauf-Prüfung).

CREATE OR REPLACE FUNCTION admin_grant_subscription(
  p_provider_id UUID,
  p_months      INTEGER,
  p_note        TEXT DEFAULT NULL
)
RETURNS service_providers
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_until TIMESTAMPTZ;
  result    service_providers;
BEGIN
  -- p_months NULL bedeutet "dauerhaft" → free_until bleibt NULL
  IF p_months IS NULL THEN
    new_until := NULL;
  ELSE
    IF p_months < 1 OR p_months > 60 THEN
      RAISE EXCEPTION 'p_months muss zwischen 1 und 60 liegen (oder NULL für dauerhaft)';
    END IF;
    new_until := NOW() + (p_months || ' months')::INTERVAL;
  END IF;

  UPDATE service_providers
     SET subscription_tier   = 'admin_grant',
         subscription_status = 'active',
         free_until          = new_until,
         subscription_notes  = COALESCE(p_note, subscription_notes),
         subscription_started_at = COALESCE(subscription_started_at, NOW())
   WHERE id = p_provider_id
   RETURNING * INTO result;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION admin_grant_subscription(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_grant_subscription(UUID, INTEGER, TEXT) TO authenticated;
