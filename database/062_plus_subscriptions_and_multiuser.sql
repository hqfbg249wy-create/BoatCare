-- Migration 062: Skipily-Plus-Strukturen (Individual / Family / Fleet) +
--                Provider-Multi-User für Enterprise-Abos
--
-- ─── Skipily-Plus-Plans (Endkunden, via Apple IAP) ───
--   plus_individual   4,99 €/M   1 User, alle eigenen Boote
--   plus_family       9,99 €/M   bis 5 User, 1 Boot (Eignergemeinschaft)
--   plus_fleet       29,99 €/M   1 User, bis 4 Boote (Charter < 5)
--   (>= 10 Boote → Custom-Vertrag, manuell vom Admin freigeschaltet)
--
-- ─── Provider-Multi-User ───
--   Enterprise-Provider können Mitarbeiter zu ihrem Provider-Konto einladen
--   → mehrere Logins, EIN Provider-Eintrag (= shared inbox, shared shop)

-- ─── user_subscriptions umbauen ──────────────────────────────────────────
-- Erstmal die alte Struktur kompatibel erweitern.
DROP INDEX IF EXISTS idx_user_subscriptions_active;

ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_pkey CASCADE;

-- Neue ID-Spalte, owner als Foreign Key
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS plan TEXT
    CHECK (plan IS NULL OR plan IN ('plus_individual', 'plus_family', 'plus_fleet', 'plus_enterprise')),
  ADD COLUMN IF NOT EXISTS family_boat_id UUID REFERENCES boats(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_members INT DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_boats   INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS grant_by_admin_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- user_id wird zu owner_user_id umbenannt (für Klarheit), bleibt aber kompatibel
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'user_subscriptions' AND column_name = 'owner_user_id') THEN
    ALTER TABLE user_subscriptions RENAME COLUMN user_id TO owner_user_id;
  END IF;
END $$;

-- Neue PK auf id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE table_name = 'user_subscriptions' AND constraint_type = 'PRIMARY KEY') THEN
    ALTER TABLE user_subscriptions ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Ein Account kann nur ein aktives Abo haben
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_owner_active
  ON user_subscriptions (owner_user_id)
  WHERE status IN ('active', 'in_billing_retry', 'grace_period');

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active
  ON user_subscriptions (status, expires_at)
  WHERE status = 'active';

-- ─── Family-Mitglieder ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plus_family_members (
  subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  member_user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  member_email    TEXT NOT NULL,
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by      UUID REFERENCES auth.users(id),
  accepted_at     TIMESTAMPTZ,
  PRIMARY KEY (subscription_id, member_email)
);

CREATE INDEX IF NOT EXISTS idx_plus_family_member_user
  ON plus_family_members (member_user_id) WHERE member_user_id IS NOT NULL;

-- ─── Fleet-Boote ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plus_fleet_boats (
  subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  boat_id         UUID NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subscription_id, boat_id)
);

CREATE INDEX IF NOT EXISTS idx_plus_fleet_boat_id
  ON plus_fleet_boats (boat_id);

-- ─── Provider-Multi-User (Enterprise) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_members (
  provider_id UUID NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by  UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (provider_id, email)
);

CREATE INDEX IF NOT EXISTS idx_provider_members_user
  ON provider_members (user_id) WHERE user_id IS NOT NULL;

-- ─── Helper: hat User Plus-Zugang? (optional für ein spezifisches Boot) ─
CREATE OR REPLACE FUNCTION user_has_plus(p_user_id UUID, p_boat_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  found BOOLEAN := FALSE;
BEGIN
  -- 1) Eigene Individual-/Enterprise-Subscription → alle Boote
  SELECT EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE owner_user_id = p_user_id
      AND plan IN ('plus_individual', 'plus_enterprise')
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  ) INTO found;
  IF found THEN RETURN TRUE; END IF;

  -- 2) Eigene Family-Subscription → für das hinterlegte Boot (oder allgemein, wenn p_boat_id NULL)
  SELECT EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE owner_user_id = p_user_id
      AND plan = 'plus_family'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (p_boat_id IS NULL OR family_boat_id = p_boat_id)
  ) INTO found;
  IF found THEN RETURN TRUE; END IF;

  -- 3) Family-Mitglied bei jemandem
  SELECT EXISTS (
    SELECT 1 FROM plus_family_members fm
    JOIN user_subscriptions us ON us.id = fm.subscription_id
    WHERE fm.member_user_id = p_user_id
      AND fm.accepted_at IS NOT NULL
      AND us.plan = 'plus_family'
      AND us.status = 'active'
      AND (us.expires_at IS NULL OR us.expires_at > NOW())
      AND (p_boat_id IS NULL OR us.family_boat_id = p_boat_id)
  ) INTO found;
  IF found THEN RETURN TRUE; END IF;

  -- 4) Eigene Fleet-Subscription
  IF p_boat_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_subscriptions
      WHERE owner_user_id = p_user_id
        AND plan = 'plus_fleet'
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
    ) INTO found;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM plus_fleet_boats fb
      JOIN user_subscriptions us ON us.id = fb.subscription_id
      WHERE fb.boat_id = p_boat_id
        AND us.owner_user_id = p_user_id
        AND us.plan = 'plus_fleet'
        AND us.status = 'active'
        AND (us.expires_at IS NULL OR us.expires_at > NOW())
    ) INTO found;
  END IF;

  RETURN found;
END $$;

GRANT EXECUTE ON FUNCTION user_has_plus(UUID, UUID) TO authenticated, service_role;

-- ─── Helper: Darf User auf Provider zugreifen? (für Multi-User) ─────────
CREATE OR REPLACE FUNCTION user_can_access_provider(p_user_id UUID, p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM service_providers
    WHERE id = p_provider_id AND user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM provider_members
    WHERE provider_id = p_provider_id
      AND user_id = p_user_id
      AND accepted_at IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION user_can_access_provider(UUID, UUID) TO authenticated, service_role;

-- ─── Admin-RPC: Plus-Subscription manuell freischalten (Testing/Custom) ─
-- Vor allem für die ≥10-Boote-Custom-Verträge und für interne Tests, bevor
-- Apple-IAP komplett integriert ist.
CREATE OR REPLACE FUNCTION admin_grant_plus_subscription(
  p_user_id      UUID,
  p_plan         TEXT,            -- 'plus_individual' | 'plus_family' | 'plus_fleet' | 'plus_enterprise'
  p_months       INT  DEFAULT NULL,    -- NULL = unbegrenzt
  p_family_boat  UUID DEFAULT NULL,    -- für plus_family
  p_max_boats    INT  DEFAULT NULL,    -- für plus_fleet/enterprise (>4 = custom)
  p_note         TEXT DEFAULT NULL
)
RETURNS user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  exp_ts  TIMESTAMPTZ;
  result  user_subscriptions;
BEGIN
  IF p_plan NOT IN ('plus_individual', 'plus_family', 'plus_fleet', 'plus_enterprise') THEN
    RAISE EXCEPTION 'Ungültiger Plan: %', p_plan;
  END IF;

  IF p_months IS NULL THEN
    exp_ts := NULL;
  ELSE
    exp_ts := NOW() + (p_months || ' months')::INTERVAL;
  END IF;

  -- Upsert: ein User hat genau ein Abo
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

-- ─── RLS für die neuen Tabellen ─────────────────────────────────────────
ALTER TABLE plus_family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE plus_fleet_boats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_members    ENABLE ROW LEVEL SECURITY;

-- Family: Owner sieht alles, Mitglied sieht nur eigene Zeile
DROP POLICY IF EXISTS "Family: own subscription" ON plus_family_members;
CREATE POLICY "Family: own subscription" ON plus_family_members
  FOR SELECT TO authenticated
  USING (
    member_user_id = auth.uid()
    OR subscription_id IN (
      SELECT id FROM user_subscriptions WHERE owner_user_id = auth.uid()
    )
  );

-- Fleet: nur eigene
DROP POLICY IF EXISTS "Fleet: own boats" ON plus_fleet_boats;
CREATE POLICY "Fleet: own boats" ON plus_fleet_boats
  FOR SELECT TO authenticated
  USING (
    subscription_id IN (
      SELECT id FROM user_subscriptions WHERE owner_user_id = auth.uid()
    )
  );

-- Provider-Members: sichtbar für Provider-Owner und für das Mitglied selbst
DROP POLICY IF EXISTS "Provider members visibility" ON provider_members;
CREATE POLICY "Provider members visibility" ON provider_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR provider_id IN (
      SELECT id FROM service_providers WHERE service_providers.user_id = auth.uid()
    )
  );

-- Sanity
SELECT 'user_subscriptions' AS tbl, count(*) FROM user_subscriptions
UNION ALL SELECT 'plus_family_members', count(*) FROM plus_family_members
UNION ALL SELECT 'plus_fleet_boats',    count(*) FROM plus_fleet_boats
UNION ALL SELECT 'provider_members',    count(*) FROM provider_members;
