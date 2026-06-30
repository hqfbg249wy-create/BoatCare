-- ============================================================
-- Migration 097: pg_cron aktivieren + täglichen Marktanalyse-Snapshot
--                automatisch einhängen (Ein-Datei-Setup)
-- ============================================================
-- Aktiviert die pg_cron-Extension, legt den täglichen Snapshot-Job
-- idempotent an und erzeugt sofort einen Basis-Snapshot, damit der
-- Nachfrage-Trend ab dem nächsten Tag eine Zeitreihe hat.
--
-- Hinweis: Falls "CREATE EXTENSION pg_cron" mit Rechte-Fehler abbricht,
-- die Extension einmalig im Supabase-Dashboard aktivieren
-- (Database → Extensions → pg_cron → Enable) und diese Datei erneut
-- ausführen. Alle Schritte sind wiederholbar.
-- ============================================================

-- 1. Extension aktivieren (in Supabase i. d. R. erlaubt)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Täglichen Snapshot-Job idempotent einhängen
DO $do$
DECLARE
    job_id        bigint;
    job_schedule  text := '0 3 * * *';   -- 03:00 UTC täglich
    job_name      text := 'market-snapshot-daily';
    job_command   text := 'SELECT public.generate_market_snapshot(CURRENT_DATE);';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE NOTICE '⚠️  pg_cron nicht aktiv — bitte im Dashboard (Database → Extensions → pg_cron) aktivieren und Datei erneut ausführen.';
        RETURN;
    END IF;

    SELECT jobid INTO job_id FROM cron.job WHERE jobname = job_name LIMIT 1;

    IF job_id IS NULL THEN
        PERFORM cron.schedule(job_name, job_schedule, job_command);
        RAISE NOTICE '✅ Cron-Job "%" angelegt — täglich 03:00 UTC.', job_name;
    ELSE
        BEGIN
            PERFORM cron.alter_job(job_id := job_id, schedule := job_schedule, command := job_command);
            RAISE NOTICE 'ℹ️  Cron-Job "%" aktualisiert.', job_name;
        EXCEPTION WHEN undefined_function THEN
            PERFORM cron.unschedule(job_id);
            PERFORM cron.schedule(job_name, job_schedule, job_command);
            RAISE NOTICE 'ℹ️  Cron-Job "%" neu eingehängt (alte pg_cron-Version).', job_name;
        END;
    END IF;
END $do$;

-- 3. Sofort einen Basis-Snapshot erzeugen (idempotent für heute)
SELECT public.generate_market_snapshot(CURRENT_DATE);

-- 4. Status anzeigen
SELECT jobname, schedule, command
  FROM cron.job
 WHERE jobname LIKE 'market-snapshot-%';
