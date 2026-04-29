-- ============================================================
-- Migration 051: täglicher Cron-Job für Marktanalyse-Snapshots
-- ============================================================
-- Voraussetzung: pg_cron-Extension aktiv. In Supabase einmalig aktivieren:
--   Dashboard → Database → Extensions → pg_cron → Enable
--
-- Diese Migration legt den Job idempotent an:
--   - existiert er nicht, wird er angelegt
--   - existiert er schon, wird sein Schedule auf den aktuellen Wert
--     aktualisiert (statt einen Doppelten zu erzeugen)
-- ============================================================

DO $$
DECLARE
    has_cron      boolean;
    job_id        bigint;
    job_schedule  text := '0 3 * * *';   -- 03:00 UTC täglich
    job_name      text := 'market-snapshot-daily';
    job_command   text := 'SELECT public.generate_market_snapshot(CURRENT_DATE);';
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) INTO has_cron;

    IF NOT has_cron THEN
        RAISE NOTICE '⚠️  pg_cron-Extension nicht aktiv — bitte erst im Supabase-Dashboard aktivieren (Database → Extensions → pg_cron).';
        RETURN;
    END IF;

    -- Existiert der Job schon? Dann nur Schedule/Command updaten.
    SELECT jobid INTO job_id FROM cron.job WHERE jobname = job_name LIMIT 1;

    IF job_id IS NULL THEN
        PERFORM cron.schedule(job_name, job_schedule, job_command);
        RAISE NOTICE '✅ Cron-Job "%" angelegt — täglich um 03:00 UTC.', job_name;
    ELSE
        -- cron.alter_job nur in pg_cron 1.4+; sonst erst löschen, dann neu anlegen.
        BEGIN
            PERFORM cron.alter_job(job_id := job_id, schedule := job_schedule, command := job_command);
            RAISE NOTICE 'ℹ️  Cron-Job "%" aktualisiert (Schedule: %).', job_name, job_schedule;
        EXCEPTION WHEN undefined_function THEN
            PERFORM cron.unschedule(job_id);
            PERFORM cron.schedule(job_name, job_schedule, job_command);
            RAISE NOTICE 'ℹ️  Cron-Job "%" neu eingehängt (alte pg_cron-Version).', job_name;
        END;
    END IF;
END $$;

-- Optional: vorherige Snapshots aufräumen, die älter als 2 Jahre sind.
-- Das hält die Tabelle schlank, ohne Trends zu verlieren.
DO $$
DECLARE
    has_cron boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO has_cron;
    IF NOT has_cron THEN RETURN; END IF;

    -- Cleanup-Job (idempotent)
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'market-snapshot-cleanup';
    PERFORM cron.schedule(
        'market-snapshot-cleanup',
        '0 4 * * 0',  -- Sonntags 04:00 UTC
        $$ DELETE FROM public.market_snapshots WHERE snapshot_date < CURRENT_DATE - INTERVAL '2 years'; $$
    );
    RAISE NOTICE '✅ Wöchentlicher Cleanup-Job angelegt.';
END $$;

-- Status zeigen
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'market-snapshot-%';
