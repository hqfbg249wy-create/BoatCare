# Restoring service_providers.logo_url / cover_image_url

Migration `database/037_clear_google_places_urls.sql` ran
`UPDATE service_providers SET logo_url = NULL / cover_image_url = NULL`
for every row whose URL matched `places.googleapis.com` or
`maps.googleapis.com/maps/api/place/photo`. That was a mistake — the
Google API key is restricted to the Skipily iOS bundle, so those URLs
still work inside the app and shouldn't have been touched.

This folder contains two ways to bring the URLs back:

- **`restore_provider_images.py`** — Python (recommended, safe, dry-run)
- **`restore_provider_images.sql`** — pure SQL fallback

Both scripts are **surgical**: they only touch `logo_url` and
`cover_image_url`, and they never overwrite a live value that is
already set (so running them twice is a no-op).

---

## Step 1 — Get a backup from before migration 037 ran

### 1a. Supabase Pro (or Team) plan — Point-in-Time Recovery

1. Dashboard → your project → **Database → Backups**
2. Tab **Point-in-Time Recovery**
3. Pick a timestamp *before* you ran `037_clear_google_places_urls.sql`
4. Click **Restore to new project** — Supabase spins up a **clone** of
   the project at that moment. It gets its own URL + password.
5. Note the new project's connection string:
   `postgresql://postgres:PASSWORD@db.NEW_REF.supabase.co:5432/postgres`

Then jump to **Step 2, Option A**.

### 1b. Supabase Free plan — Daily Backup download

1. Dashboard → your project → **Database → Backups**
2. Find the most recent backup from **before** today (before 037 ran)
3. Click **Restore** — on Free plan this will rewind the **entire**
   database. That's destructive if you have other changes since.
   ⚠️ If you have newer data (reviews, orders, messages, equipment
   uploaded after the backup), **do NOT** use this — skip to 1c.

### 1c. Free plan, data loss unacceptable — pg_dump via CLI

If your plan doesn't let you clone and you can't afford a full
rewind, you can still dump the live DB into a plain SQL file from
your local machine **now** (so we at least have today's state as a
safety net), and ask Supabase support to hand you a snapshot from
before 037:

```bash
# Full dump of the live DB (belt-and-suspenders)
pg_dump \
  --no-owner --no-privileges \
  --file=skipily_live_$(date +%Y%m%d).sql \
  "postgresql://postgres:PASSWORD@db.vcjwlyqkfkszumdrfvtm.supabase.co:5432/postgres"
```

Then open a ticket with Supabase support and request the most recent
daily backup as a downloadable file.

---

## Step 2 — Run the surgical restore

### Option A — Python (recommended)

```bash
# 0) install driver once
pip3 install psycopg2-binary

# 1) Dry-run — shows what WOULD change, writes nothing
python3 scripts/restore/restore_provider_images.py \
  --from-db "postgresql://postgres:OLD_PASS@db.NEW_REF.supabase.co:5432/postgres" \
  --live-db "postgresql://postgres:LIVE_PASS@db.vcjwlyqkfkszumdrfvtm.supabase.co:5432/postgres" \
  --dry-run

# 2) Real run — drop --dry-run
python3 scripts/restore/restore_provider_images.py \
  --from-db "postgresql://postgres:OLD_PASS@db.NEW_REF.supabase.co:5432/postgres" \
  --live-db "postgresql://postgres:LIVE_PASS@db.vcjwlyqkfkszumdrfvtm.supabase.co:5432/postgres"
```

If your backup is a **plain-text SQL file** (not another DB), use:

```bash
python3 scripts/restore/restore_provider_images.py \
  --from-sql-file ~/Downloads/supabase_backup.sql \
  --live-db "postgresql://postgres:LIVE_PASS@db.vcjwlyqkfkszumdrfvtm.supabase.co:5432/postgres" \
  --dry-run
```

If you have a JSON export:

```bash
python3 scripts/restore/restore_provider_images.py \
  --from-json service_providers_backup.json \
  --live-db "postgresql://..." \
  --dry-run
```

Expected output on the real run:

```
Parsed 412 rows from backup source.
  → 389 have a non-null image URL.
Would update 312 logo_url and 298 cover_image_url values across 389 rows.
✅ Restored image URLs on 389 rows.
```

### Option B — Pure SQL

See `restore_provider_images.sql` for the exact psql steps. Summary:

1. Connect to the live DB as `postgres`
2. Create staging schema `_restore_037`
3. Load the backup's `service_providers` data into that schema
4. Run the surgical `UPDATE ... FROM _restore_037.service_providers`
   with `COALESCE` so good live values are never overwritten
5. `DROP SCHEMA _restore_037 CASCADE`

---

## Step 3 — Verify in the app

1. Reopen the Service-Provider detail screen
2. Logos and cover photos should reappear instantly
3. For any provider that still shows a placeholder, you can now
   upload a replacement via the new "Bilder bearbeiten" button
   (see `ProviderImageEditView` — writes to the `provider-images`
   Supabase Storage bucket)

---

## Where is the DB password?

Dashboard → **Settings → Database → Connection string** → **URI**
tab. That's the full DSN you pass to `--live-db`.

For the PITR clone project, the password is shown only once when
the clone is created. Save it in your password manager.
