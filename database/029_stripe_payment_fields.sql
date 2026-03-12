-- Migration 029: Stripe Payment Fields
-- Adds stripe_customer_id to profiles for buyer payment tracking
-- Adds stripe_onboarding_status to service_providers for onboarding state

-- ============================================================
-- 1. profiles: Stripe Customer ID for buyers
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON profiles (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ============================================================
-- 2. service_providers: Stripe onboarding status tracking
-- ============================================================

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN DEFAULT false;

-- ============================================================
-- Fertig
-- ============================================================
SELECT 'Migration 029 erfolgreich ausgefuehrt' AS status;
