-- Migration 057: Subscription-Tiers für ServiceProvider
--
-- Drei Tiers:
--   standard      → kostenlos, Basis-Features
--   professional  → kostenpflichtig (Stripe), erweiterte Features (API, Webhook,
--                   Analytics, Werbeplätze)
--   admin_grant   → vom Admin manuell freigeschaltet, befristet via free_until
--
-- Status hilft, abgelaufene/gekündigte Abos zu erkennen:
--   active        → läuft (sei es bezahlt oder admin_grant)
--   trial         → Test-Phase, läuft via free_until aus
--   cancelled     → gekündigt — Zugriff endet zum period_end
--   past_due      → Stripe meldet fehlgeschlagene Zahlung
--   expired       → frei_until oder period_end ist verstrichen
--
-- free_until: Admin gewährt kostenlose Professional-Tier-Nutzung bis zu diesem
--             Datum (max. 1 Jahr ab heute). NULL = kein Admin-Grant.
--
-- stripe_subscription_id: vorhanden, sobald der Provider Professional via
--                         Stripe abonniert hat. Funktioniert unabhängig vom
--                         bereits existierenden stripe_account_id (Connect).

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS subscription_tier     TEXT
    DEFAULT 'standard'
    CHECK (subscription_tier IN ('standard', 'professional', 'admin_grant')),
  ADD COLUMN IF NOT EXISTS subscription_status   TEXT
    DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'trial', 'cancelled', 'past_due', 'expired')),
  ADD COLUMN IF NOT EXISTS free_until            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_notes    TEXT;

-- Index für schnelles Filtern nach Tier (z.B. "alle Professional anzeigen")
CREATE INDEX IF NOT EXISTS idx_providers_subscription_tier
  ON service_providers (subscription_tier);

CREATE INDEX IF NOT EXISTS idx_providers_free_until
  ON service_providers (free_until)
  WHERE free_until IS NOT NULL;

-- Computed View: liefert effektiven Tier-Status (berücksichtigt free_until-Ablauf)
CREATE OR REPLACE VIEW provider_subscription_status AS
SELECT
  id,
  name,
  subscription_tier,
  subscription_status,
  free_until,
  subscription_period_end,
  stripe_subscription_id,
  CASE
    WHEN subscription_tier = 'admin_grant' AND free_until IS NOT NULL
         AND free_until < NOW()                      THEN 'expired'
    WHEN subscription_tier = 'professional'
         AND subscription_period_end IS NOT NULL
         AND subscription_period_end < NOW()         THEN 'expired'
    ELSE subscription_status
  END AS effective_status,
  CASE
    WHEN subscription_tier IN ('professional', 'admin_grant')
         AND (
           (subscription_tier = 'admin_grant'  AND (free_until IS NULL OR free_until > NOW()))
        OR (subscription_tier = 'professional' AND subscription_status = 'active')
         )                                           THEN 'professional'
    ELSE 'standard'
  END AS effective_tier
FROM service_providers;

GRANT SELECT ON provider_subscription_status TO authenticated, anon, service_role;

-- RPC zum Setzen eines Admin-Grants (kostenlose Professional-Nutzung bis X Monate)
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
  IF p_months IS NULL OR p_months < 1 OR p_months > 12 THEN
    RAISE EXCEPTION 'p_months muss zwischen 1 und 12 liegen';
  END IF;

  new_until := NOW() + (p_months || ' months')::INTERVAL;

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

-- RPC um einen Admin-Grant zu widerrufen → zurück auf "standard"
CREATE OR REPLACE FUNCTION admin_revoke_subscription(
  p_provider_id UUID
)
RETURNS service_providers
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result service_providers;
BEGIN
  UPDATE service_providers
     SET subscription_tier   = 'standard',
         subscription_status = 'active',
         free_until          = NULL
   WHERE id = p_provider_id
     AND subscription_tier  = 'admin_grant'
   RETURNING * INTO result;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION admin_grant_subscription(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_revoke_subscription(UUID)              FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_grant_subscription(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_revoke_subscription(UUID)              TO authenticated;

-- Sanity check
SELECT id, name, subscription_tier, subscription_status, free_until
FROM service_providers
LIMIT 5;
