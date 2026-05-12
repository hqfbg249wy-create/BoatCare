-- Migration 058: stripe_customer_id auf service_providers
--
-- Wird benötigt für das Professional-Abo: jeder Provider wird vor dem
-- ersten Checkout als Stripe-Customer angelegt, damit Folgezahlungen,
-- Rechnungen und das Billing-Portal funktionieren.

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_stripe_customer_id
  ON service_providers (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Sanity
SELECT id, name, stripe_customer_id, stripe_subscription_id, subscription_tier
FROM service_providers
LIMIT 5;
