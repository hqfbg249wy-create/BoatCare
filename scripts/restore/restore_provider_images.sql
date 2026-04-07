-- ============================================================
-- Surgical restore: service_providers.logo_url / cover_image_url
-- ============================================================
-- Use this file if you prefer NOT to run the Python script and
-- instead want to do everything in psql / the Supabase SQL Editor.
--
-- Prerequisites
-- -------------
-- 1. You have a plain-text pg_dump of the old database (pre-037).
--    Supabase Dashboard → Database → Backups → any backup from before
--    you executed migration 037. On Pro plan you can download it; on
--    Free plan you either restore the backup into a clone project or
--    let Supabase restore it into a new branch, then pg_dump from that.
--
-- 2. You can run psql against BOTH databases. On macOS:
--      brew install libpq
--      export PATH="$(brew --prefix libpq)/bin:$PATH"
--
-- Steps
-- -----
-- A) On your local machine, import ONLY the service_providers table
--    from the old backup into a staging schema on the LIVE database.
--    Do NOT run \i old_backup.sql on the live DB — that would
--    overwrite everything.
--
--    Instead, extract just the table:
--      pg_restore --table=service_providers --data-only \
--                 --no-owner --no-privileges \
--                 --file=service_providers_old.sql \
--                 old_backup.dump
--    Or if you already have a plain-text .sql backup, grep out the
--    service_providers INSERTs/COPY block into a separate file.
--
-- B) Connect to the LIVE database as postgres:
--      psql "postgresql://postgres:PASSWORD@db.vcjwlyqkfkszumdrfvtm.supabase.co:5432/postgres"
--
-- C) Paste the commands below.
-- ============================================================

BEGIN;

-- 1. Staging schema — isolated from the live one.
CREATE SCHEMA IF NOT EXISTS _restore_037;

-- 2. Empty table with the same shape as the live one.
--    Copies the schema, not the data.
CREATE TABLE IF NOT EXISTS _restore_037.service_providers
    (LIKE public.service_providers INCLUDING ALL);

-- 3. Now load the backup data into _restore_037.service_providers.
--    From psql, you can do this via \COPY after first \i'ing the
--    extracted file (see README.md). Stop here, load the data, then
--    come back to run step 4.

-- Verify before merging:
SELECT COUNT(*)
  FROM _restore_037.service_providers
 WHERE logo_url IS NOT NULL OR cover_image_url IS NOT NULL;

-- 4. Surgical merge: only update rows that are NULL on the live side
--    AND have a value on the backup side. Never overwrite good data.
UPDATE public.service_providers AS live
   SET logo_url       = COALESCE(live.logo_url,        bak.logo_url),
       cover_image_url = COALESCE(live.cover_image_url, bak.cover_image_url),
       updated_at     = NOW()
  FROM _restore_037.service_providers AS bak
 WHERE live.id = bak.id
   AND (
         (live.logo_url IS NULL AND bak.logo_url IS NOT NULL)
      OR (live.cover_image_url IS NULL AND bak.cover_image_url IS NOT NULL)
       );

-- 5. Report
SELECT
    (SELECT COUNT(*) FROM public.service_providers WHERE logo_url IS NOT NULL)        AS live_with_logo,
    (SELECT COUNT(*) FROM public.service_providers WHERE cover_image_url IS NOT NULL) AS live_with_cover;

-- 6. Drop the staging schema when happy.
-- DROP SCHEMA _restore_037 CASCADE;

-- If something looks wrong, ROLLBACK instead of COMMIT.
COMMIT;
