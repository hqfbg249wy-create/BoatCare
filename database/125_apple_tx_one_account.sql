-- ============================================================
-- Migration 125: Ein Apple-Abo darf nur EINEM Skipily-Konto gehören
-- ============================================================
-- Bug: verify-apple-receipt band eine Apple-Transaktion an JEDES gerade
-- eingeloggte Konto. Auf einem Gerät mit einer Apple-ID und zwei Skipily-
-- Konten entstanden so ZWEI aktive user_subscriptions-Zeilen mit derselben
-- apple_original_tx_id → dasselbe Abo erschien in beiden Konten.
--
-- Der Code-Fix (Edge-Function `intent`-Logik + Client-Gating aufs Backend)
-- verhindert NEUE Dubletten. Diese Migration:
--   1) macht bestehende Dubletten konsistent (nur EINE aktive Zeile je
--      Apple-Transaktion; die übrigen → status 'revoked'),
--   2) legt einen partiellen UNIQUE-Index an, der Dubletten künftig auch auf
--      DB-Ebene verhindert.
--
-- WICHTIG: Aus den Daten allein ist NICHT ableitbar, welches Konto das Abo
-- tatsächlich gebucht hat (started_at = Apple-Kaufdatum ist bei beiden gleich).
-- Die Dedup behält deterministisch EINE Zeile. Prüfe danach im Admin-Panel,
-- ob das RICHTIGE Konto das Abo hat — falls nicht: falsches Konto per
-- „🗑 Plus" widerrufen und im richtigen Konto in der App „Käufe wiederher-
-- stellen" tippen (bindet es dann sauber ans richtige Konto).
--
-- Diagnose VORHER (zeigt betroffene Dubletten mit E-Mail):
--   SELECT us.apple_original_tx_id, us.owner_user_id, p.email, us.status,
--          us.started_at, us.last_verified_at
--     FROM user_subscriptions us
--     JOIN profiles p ON p.id = us.owner_user_id
--    WHERE us.apple_original_tx_id IN (
--       SELECT apple_original_tx_id FROM user_subscriptions
--        WHERE apple_original_tx_id IS NOT NULL
--          AND status IN ('active','in_billing_retry','grace_period','trial')
--        GROUP BY apple_original_tx_id HAVING COUNT(*) > 1)
--    ORDER BY us.apple_original_tx_id, us.last_verified_at;
-- ============================================================

-- 1) Dubletten konsistent machen: pro Apple-Transaktion nur EINE aktive Zeile
--    behalten (früheste Verifizierung), Rest auf 'revoked'.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY apple_original_tx_id
           ORDER BY last_verified_at ASC NULLS LAST, owner_user_id ASC
         ) AS rn
    FROM user_subscriptions
   WHERE apple_original_tx_id IS NOT NULL
     AND status IN ('active','in_billing_retry','grace_period','trial')
)
UPDATE user_subscriptions us
   SET status           = 'revoked',
       last_verified_at = NOW(),
       notes            = COALESCE(us.notes || E'\n', '') ||
                          'Auto-Dedup 125: doppelte Apple-Bindung entfernt (Abo bleibt am Erst-Konto).'
  FROM ranked r
 WHERE us.id = r.id
   AND r.rn > 1;

-- 2) Schutz-Index: eine Apple-Transaktion nur einmal AKTIV.
--    Admin-Grants (apple_original_tx_id IS NULL) sind ausgenommen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subs_apple_tx_active
  ON user_subscriptions (apple_original_tx_id)
  WHERE apple_original_tx_id IS NOT NULL
    AND status IN ('active','in_billing_retry','grace_period','trial');

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 125: Apple-Abo↔Konto eindeutig; Dubletten bereinigt + Schutz-Index gesetzt.';
END $$;
