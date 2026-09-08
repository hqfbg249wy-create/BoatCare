-- 126_device_tokens.sql
-- Remote-Push (Plan B): Device-Tokens fuer APNs (spaeter auch FCM/Android).
--
-- Ein User kann mehrere Geraete haben. Der Token ist global eindeutig
-- (dasselbe Geraet gehoert zu genau einem Account) -> Token = Primary Key,
-- ON CONFLICT haengt ihn beim erneuten Registrieren an den aktuellen User um.
--
-- Schreiben laeuft ausschliesslich ueber die SECURITY-DEFINER-RPCs
-- register_device_token / unregister_device_token (kein direktes INSERT/UPDATE
-- durch Clients). Lesen/Loeschen der EIGENEN Tokens ist per RLS erlaubt.

BEGIN;

CREATE TABLE IF NOT EXISTS device_tokens (
  token       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL DEFAULT 'ios'
              CHECK (platform IN ('ios', 'android')),
  environment TEXT NOT NULL DEFAULT 'production'
              CHECK (environment IN ('production', 'sandbox')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens(user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_tokens_select_own ON device_tokens;
CREATE POLICY device_tokens_select_own ON device_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS device_tokens_delete_own ON device_tokens;
CREATE POLICY device_tokens_delete_own ON device_tokens
  FOR DELETE USING (auth.uid() = user_id);
-- Kein INSERT/UPDATE-Policy: Schreiben nur via RPC (service-definer) oder
-- service_role (Edge Functions raeumen tote Tokens weg).

-- ── Registrieren/Aktualisieren des Tokens fuer den aktuellen User ──────────
CREATE OR REPLACE FUNCTION register_device_token(
  p_token       TEXT,
  p_platform    TEXT DEFAULT 'ios',
  p_environment TEXT DEFAULT 'production'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'token required';
  END IF;

  INSERT INTO device_tokens (token, user_id, platform, environment, updated_at)
  VALUES (p_token, auth.uid(),
          COALESCE(p_platform, 'ios'),
          COALESCE(p_environment, 'production'),
          NOW())
  ON CONFLICT (token) DO UPDATE
    SET user_id     = EXCLUDED.user_id,
        platform    = EXCLUDED.platform,
        environment = EXCLUDED.environment,
        updated_at  = NOW();
END $$;
GRANT EXECUTE ON FUNCTION register_device_token(TEXT, TEXT, TEXT) TO authenticated;

-- ── Abmelden (Logout / Push deaktiviert) ──────────────────────────────────
CREATE OR REPLACE FUNCTION unregister_device_token(p_token TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
AS $$
  DELETE FROM device_tokens WHERE token = p_token AND user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION unregister_device_token(TEXT) TO authenticated;

COMMIT;
