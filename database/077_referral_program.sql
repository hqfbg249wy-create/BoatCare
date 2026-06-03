-- 077_referral_program.sql
--
-- Empfehlungs-Marketing: jeder User hat einen eigenen Empfehlungs-Code.
-- Tippt ein neu registrierter User den Code eines bestehenden Users beim
-- Sign-Up ein, bekommen BEIDE +1 Monat Plus, sobald der Geworbene
-- 7 Tage existiert UND mindestens einmal eingeloggt war.
--
-- Cap: max. 12 erfolgreiche Empfehlungen pro Empfehler pro Kalenderjahr
-- (verhindert Mass-Spam, gleichzeitig "ein Jahr Plus gratis" als Top-Anreiz).
--
-- Reuses admin_grant_plus_subscription (Migration 062) für den eigentlichen
-- Plus-Eintrag — wird hier als "plus_individual / 1 Monat" gewährt.

-- ─── 1) profiles.referral_code ───────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

COMMENT ON COLUMN public.profiles.referral_code IS
    'Eindeutiger 8-stelliger Empfehlungs-Code des Users (Format BOAT-XXXX). '
    'Wird beim Profil-Insert automatisch generiert. Eigentlich case-insensitive — '
    'vor Vergleich immer upper().';

-- Generator-Funktion: 4 zufällige Zeichen aus base32-artigem Alphabet ohne
-- mehrdeutige Zeichen (kein 0/O, 1/I).
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code     TEXT;
    tries    INT := 0;
BEGIN
    LOOP
        code := 'BOAT-';
        FOR i IN 1..4 LOOP
            code := code || substr(alphabet, (floor(random() * length(alphabet))::INT + 1), 1);
        END LOOP;
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.profiles WHERE upper(referral_code) = upper(code)
        );
        tries := tries + 1;
        IF tries > 50 THEN
            RAISE EXCEPTION 'Konnte keinen eindeutigen Referral-Code generieren';
        END IF;
    END LOOP;
    RETURN code;
END;
$$;

-- Bestehende Profile bekommen rückwirkend einen Code.
UPDATE public.profiles
   SET referral_code = generate_referral_code()
 WHERE referral_code IS NULL;

-- Neue Profile bekommen den Code automatisch beim Insert.
CREATE OR REPLACE FUNCTION assign_referral_code_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := generate_referral_code();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_referral_code ON public.profiles;
CREATE TRIGGER trg_assign_referral_code
    BEFORE INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION assign_referral_code_trigger();


-- ─── 2) referrals Tabelle ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referrals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    referred_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code_used       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
                    -- 'pending'   : Code akzeptiert, wartet auf 7-Tage-Aktivität
                    -- 'granted'   : beide Seiten haben den Bonus erhalten
                    -- 'declined'  : Cap erreicht oder Eingeladener inaktiv
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    qualified_at    TIMESTAMPTZ,   -- Zeitpunkt, an dem die 7d+1Login-Bedingung erfüllt war
    granted_at      TIMESTAMPTZ,   -- Zeitpunkt der Gutschrift
    decline_reason  TEXT,
    UNIQUE (referred_id)            -- ein User kann nur 1 mal geworben werden
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer    ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status      ON public.referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_pending     ON public.referrals(created_at)
    WHERE status = 'pending';

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Nutzer sieht eigene Empfehlungen (als Werber ODER als Geworbener).
DROP POLICY IF EXISTS "Users see own referrals" ON public.referrals;
CREATE POLICY "Users see own referrals"
    ON public.referrals FOR SELECT
    USING (auth.uid() = referrer_id OR auth.uid() = referred_id);


-- ─── 3) RPC: apply_referral_code ─────────────────────────────────────────
-- Wird vom neu registrierten User aufgerufen (typisch direkt nach signUp).
-- Validiert den Code und legt die pending-Zeile an. Rejects:
--   - Code unbekannt
--   - Code ist der eigene Code (Self-Referral)
--   - User wurde schon einmal geworben
CREATE OR REPLACE FUNCTION apply_referral_code(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id      UUID := auth.uid();
    v_referrer_id  UUID;
    v_referrer_own_code TEXT;
    v_normalized   TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Nicht eingeloggt';
    END IF;

    v_normalized := upper(trim(p_code));
    IF v_normalized = '' OR v_normalized IS NULL THEN
        RAISE EXCEPTION 'Empfehlungs-Code fehlt';
    END IF;

    SELECT id INTO v_referrer_id
      FROM public.profiles
     WHERE upper(referral_code) = v_normalized
     LIMIT 1;

    IF v_referrer_id IS NULL THEN
        RAISE EXCEPTION 'Empfehlungs-Code ist ungültig';
    END IF;

    IF v_referrer_id = v_user_id THEN
        RAISE EXCEPTION 'Du kannst deinen eigenen Code nicht einlösen';
    END IF;

    IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = v_user_id) THEN
        RAISE EXCEPTION 'Du wurdest schon einmal geworben';
    END IF;

    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (v_referrer_id, v_user_id, v_normalized);

    RETURN json_build_object(
        'status', 'pending',
        'message', 'Empfehlung registriert. Sobald du 7 Tage dabei bist, bekommt dein Werber 1 Monat Plus geschenkt.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_referral_code(TEXT) TO authenticated;


-- ─── 4) Verarbeitung pendierender Empfehlungen ───────────────────────────
-- Wird täglich per pg_cron aufgerufen. Findet Empfehlungen, die:
--   - älter als 7 Tage sind
--   - status = 'pending'
--   - der Geworbene war mind. 1x eingeloggt (last_sign_in_at IS NOT NULL)
-- Prüft Cap (12 erfolgreiche Empfehlungen pro Empfehler in laufendem Jahr).
-- Bei OK: ruft admin_grant_plus_subscription für BEIDE Seiten und setzt
-- status='granted'. Bei Cap-Verstoß: status='declined'.

CREATE OR REPLACE FUNCTION process_pending_referrals()
RETURNS TABLE (
    referral_id UUID,
    outcome     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    rec        RECORD;
    v_count    INT;
BEGIN
    FOR rec IN
        SELECT r.id, r.referrer_id, r.referred_id
          FROM public.referrals r
          JOIN auth.users u ON u.id = r.referred_id
         WHERE r.status = 'pending'
           AND r.created_at < NOW() - INTERVAL '7 days'
           AND u.last_sign_in_at IS NOT NULL
    LOOP
        -- Cap: laufendes Kalenderjahr, max 12 erfolgreiche Empfehlungen pro Empfehler
        SELECT COUNT(*) INTO v_count
          FROM public.referrals
         WHERE referrer_id = rec.referrer_id
           AND status = 'granted'
           AND granted_at >= date_trunc('year', NOW());

        IF v_count >= 12 THEN
            UPDATE public.referrals
               SET status = 'declined',
                   decline_reason = 'Cap erreicht (12 Empfehlungen pro Jahr)'
             WHERE id = rec.id;
            referral_id := rec.id;
            outcome := 'declined_cap';
            RETURN NEXT;
            CONTINUE;
        END IF;

        -- Beiden Seiten +1 Monat plus_individual
        PERFORM admin_grant_plus_subscription(
            p_user_id   := rec.referrer_id,
            p_plan      := 'plus_individual',
            p_months    := 1,
            p_family_boat := NULL,
            p_max_boats := NULL,
            p_note      := 'Referral-Bonus (Werber): referral=' || rec.id::TEXT
        );
        PERFORM admin_grant_plus_subscription(
            p_user_id   := rec.referred_id,
            p_plan      := 'plus_individual',
            p_months    := 1,
            p_family_boat := NULL,
            p_max_boats := NULL,
            p_note      := 'Referral-Bonus (Eingeladener): referral=' || rec.id::TEXT
        );

        UPDATE public.referrals
           SET status = 'granted',
               qualified_at = NOW(),
               granted_at = NOW()
         WHERE id = rec.id;

        referral_id := rec.id;
        outcome := 'granted';
        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$$;

-- Cron-Job: läuft täglich um 04:00 UTC. Benötigt pg_cron-Extension.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('process_pending_referrals_daily')
        WHERE EXISTS (
            SELECT 1 FROM cron.job
             WHERE jobname = 'process_pending_referrals_daily'
        );
        PERFORM cron.schedule(
            'process_pending_referrals_daily',
            '0 4 * * *',
            'SELECT process_pending_referrals();'
        );
    ELSE
        RAISE NOTICE 'pg_cron-Extension nicht aktiviert — bitte process_pending_referrals() manuell oder via Edge-Function/Scheduler aufrufen.';
    END IF;
END $$;


-- ─── 5) Hilfs-View für die App: eigene Referral-Stats ────────────────────
CREATE OR REPLACE VIEW public.my_referral_stats AS
SELECT
    p.id                                              AS user_id,
    p.referral_code                                   AS my_code,
    COUNT(r.id)                                       AS total_referrals,
    COUNT(*) FILTER (WHERE r.status = 'pending')      AS pending_count,
    COUNT(*) FILTER (WHERE r.status = 'granted')      AS granted_count,
    COUNT(*) FILTER (WHERE r.status = 'declined')     AS declined_count,
    COUNT(*) FILTER (
        WHERE r.status = 'granted'
          AND r.granted_at >= date_trunc('year', NOW())
    )                                                 AS granted_this_year
  FROM public.profiles p
  LEFT JOIN public.referrals r ON r.referrer_id = p.id
 GROUP BY p.id, p.referral_code;

GRANT SELECT ON public.my_referral_stats TO authenticated;
