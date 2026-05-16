-- Migration 065: Plus-Subscription per Admin widerrufen (Test-Reset)
--
-- Setzt user_subscriptions zurück, sodass der Test-User wieder als "Free"
-- gilt. Löscht NICHT bei Stripe/Apple — das muss manuell im jeweiligen
-- Portal erfolgen (siehe Doku docs/SUBSCRIPTION_TEST_RESET.md).
--
-- Verwendung im Admin-Modal: Button "🗑 Plus widerrufen"

CREATE OR REPLACE FUNCTION admin_revoke_plus_subscription(
  p_user_id UUID
)
RETURNS user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result user_subscriptions;
BEGIN
  -- Setzt das Abo auf "expired" + entfernt Plan-Code.
  -- Wir LÖSCHEN nicht, damit man im Audit nachvollziehen kann was passiert ist.
  UPDATE user_subscriptions
     SET status         = 'revoked',
         expires_at     = NOW(),
         plan           = NULL,
         last_verified_at = NOW(),
         notes          = COALESCE(notes || E'\n', '') ||
                          'Test-Reset durch Admin ' || COALESCE(auth.uid()::TEXT, 'unknown') ||
                          ' am ' || NOW()::TEXT
   WHERE owner_user_id = p_user_id
     AND status IN ('active', 'in_billing_retry', 'grace_period', 'trial')
   RETURNING * INTO result;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION admin_revoke_plus_subscription(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_revoke_plus_subscription(UUID) TO authenticated;

-- Provider-Subscription (Stripe Pro/Enterprise) zurücksetzen
-- Löscht NICHT bei Stripe! Setzt nur den DB-Status zurück damit der Provider
-- wieder als "Standard" gilt — Stripe-seitig muss separat gekündigt werden
-- (Stripe-Dashboard → Customer → Subscription → Cancel).
CREATE OR REPLACE FUNCTION admin_reset_provider_subscription(
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
     SET subscription_tier        = 'standard',
         subscription_status      = 'active',
         subscription_plan        = NULL,
         free_until               = NULL,
         subscription_period_end  = NULL,
         stripe_subscription_id   = NULL,
         stripe_price_id          = NULL,
         subscription_notes       = COALESCE(subscription_notes || E'\n', '') ||
                                    'Test-Reset durch Admin ' || COALESCE(auth.uid()::TEXT, 'unknown') ||
                                    ' am ' || NOW()::TEXT
   WHERE id = p_provider_id
   RETURNING * INTO result;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION admin_reset_provider_subscription(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_reset_provider_subscription(UUID) TO authenticated;
