-- ============================================================
-- Migration 123: Admin-Freischaltung absichern (Autorisierung)
-- ============================================================
-- Kontext: admin_grant_plus_subscription / admin_revoke_plus_subscription
-- waren zwar SECURITY DEFINER und nur an `authenticated` vergeben, hatten
-- aber KEINEN Rollen-Check. Dadurch:
--   * Sicherheitsloch: jeder eingeloggte User hätte sich selbst Plus geben
--     können.
--   * Diagnose-Blindflug: bei einem versehentlichen Aufruf ohne Admin-Rolle
--     gab es keinen aussagekräftigen Fehler.
--
-- Diese Migration definiert beide Funktionen mit IDENTISCHER Signatur neu
-- (CREATE OR REPLACE) und ergänzt einen expliziten Admin-Gate. Nicht-Admins
-- erhalten jetzt eine klare Fehlermeldung ("forbidden: admin only"), die im
-- Admin-Panel als Alert sichtbar wird.
--
-- Zusätzlich: `admin_grant_plus_subscription` erlaubt jetzt auch den Plan
-- 'basic' (Basic-Tarif gratis freischalten). max_boats/max_members fallen für
-- 'basic' auf 1/1 (ELSE-Zweig der CASE-Ausdrücke).
--
-- Idempotent, mehrfach ausführbar.
-- ============================================================

-- ─── Grant (Plus freischalten) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_grant_plus_subscription(
  p_user_id      UUID,
  p_plan         TEXT,
  p_months       INT  DEFAULT NULL,
  p_family_boat  UUID DEFAULT NULL,
  p_max_boats    INT  DEFAULT NULL,
  p_note         TEXT DEFAULT NULL
)
RETURNS user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exp_ts  TIMESTAMPTZ;
  result  user_subscriptions;
BEGIN
  -- Nur echte Admins dürfen freischalten.
  IF NOT EXISTS (SELECT 1 FROM profiles
                  WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  IF p_plan NOT IN ('basic', 'plus_individual', 'plus_family', 'plus_fleet', 'plus_enterprise') THEN
    RAISE EXCEPTION 'Ungültiger Plan: %', p_plan;
  END IF;

  IF p_months IS NULL THEN
    exp_ts := NULL;
  ELSE
    exp_ts := NOW() + (p_months || ' months')::INTERVAL;
  END IF;

  INSERT INTO user_subscriptions (
    owner_user_id, product_id, plan, status,
    expires_at, started_at, last_verified_at,
    family_boat_id, max_boats, max_members,
    grant_by_admin_id, notes
  )
  VALUES (
    p_user_id,
    'admin_grant_' || p_plan,
    p_plan,
    'active',
    exp_ts,
    NOW(), NOW(),
    p_family_boat,
    COALESCE(p_max_boats, CASE p_plan
      WHEN 'plus_fleet' THEN 4
      WHEN 'plus_enterprise' THEN 999
      ELSE 1
    END),
    CASE p_plan
      WHEN 'plus_family' THEN 5
      WHEN 'plus_enterprise' THEN 50
      ELSE 1
    END,
    auth.uid(),
    p_note
  )
  ON CONFLICT (owner_user_id) WHERE status IN ('active', 'in_billing_retry', 'grace_period')
  DO UPDATE SET
    plan = EXCLUDED.plan,
    status = 'active',
    expires_at = EXCLUDED.expires_at,
    family_boat_id = EXCLUDED.family_boat_id,
    max_boats = EXCLUDED.max_boats,
    max_members = EXCLUDED.max_members,
    notes = COALESCE(EXCLUDED.notes, user_subscriptions.notes),
    last_verified_at = NOW()
  RETURNING * INTO result;

  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION admin_grant_plus_subscription(UUID, TEXT, INT, UUID, INT, TEXT)
  TO authenticated, service_role;

-- ─── Revoke (Plus zurücksetzen) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_revoke_plus_subscription(
  p_user_id UUID
)
RETURNS user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result user_subscriptions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles
                  WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

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
