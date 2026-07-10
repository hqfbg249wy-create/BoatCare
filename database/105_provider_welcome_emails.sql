-- ============================================================
-- Migration 105: Provider-Willkommens-/AGB-Mail + Pro-Abo-Mail
-- ============================================================
-- (a) Willkommens-/Bestätigungsmail, sobald ein Provider die AGB akzeptiert
--     (Signup ODER späterer AGB-Annahme). Enthält AGB-Link + akzeptierte
--     Version + Zeitstempel (Nachweis). Versand via Edge Function
--     `provider-welcome-email` (Resend), ausgelöst per AFTER-Trigger + pg_net.
--
-- (b) Idempotenz-Flag für die Pro-Abo-Willkommensmail. Diese wird NICHT hier,
--     sondern serverseitig vom `stripe-webhook` verschickt (er hat die
--     Stripe-Event-Daten). Das Flag verhindert Doppelversand.
--
-- Muster wie Migration 098 (Review-Moderation): pg_net + Vault-Secret,
-- Function nur mit Shared-Secret aufrufbar (kein Client-Zugriff).
--
-- SETUP (einmalig):
--   1) Vault-Secret anlegen (im SQL-Editor):
--        select vault.create_secret('<GEHEIM>', 'welcome_email_secret');
--   2) Diese Migration im Supabase SQL-Editor ausführen.
--   3) Edge-Function-Env setzen (gleicher Wert):
--        supabase secrets set WELCOME_EMAIL_SECRET=<GEHEIM>
--      (RESEND_API_KEY ist bereits gesetzt — wird wiederverwendet.)
--   4) Edge Function deployen:
--        supabase functions deploy provider-welcome-email
-- ============================================================

create extension if not exists pg_net with schema extensions;

-- ─── Idempotenz-Flags ───────────────────────────────────────────────────────
alter table public.service_providers
  add column if not exists welcome_email_sent_at     timestamptz,
  add column if not exists pro_welcome_email_sent_at timestamptz;

comment on column public.service_providers.welcome_email_sent_at is
  'Zeitpunkt der Willkommens-/AGB-Bestätigungsmail (Idempotenz, gesetzt von provider-welcome-email).';
comment on column public.service_providers.pro_welcome_email_sent_at is
  'Zeitpunkt der Pro-Abo-Willkommensmail (Idempotenz, gesetzt vom stripe-webhook).';

-- ─── Trigger-Funktion: ruft Edge Function via pg_net ────────────────────────
create or replace function public.send_provider_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- URL + anon-Key sind nicht geheim; der Schutz ist das Shared-Secret.
  fn_url   text := 'https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/provider-welcome-email';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ';
  secret   text;
begin
  -- Nur bei akzeptierter AGB, vorhandener E-Mail und noch nicht versandter Mail.
  if new.agb_accepted_at is null
     or new.email is null or btrim(new.email) = ''
     or new.welcome_email_sent_at is not null then
    return new;
  end if;

  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'welcome_email_secret'
   limit 1;

  -- Ohne Secret nicht aufrufen (Function würde 403 liefern) — sauber loggen.
  if secret is null or secret = '' then
    raise warning 'send_provider_welcome_email: Vault-Secret "welcome_email_secret" fehlt — Willkommensmail uebersprungen';
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'Authorization',    'Bearer ' || anon_key,
      'x-welcome-secret', secret
    ),
    body    := jsonb_build_object('provider_id', new.id)
  );
  return new;
end $$;

-- Feuert beim Signup (INSERT mit gesetztem agb_accepted_at) UND wenn ein
-- eingeladener Provider die AGB später akzeptiert (UPDATE OF agb_accepted_at).
drop trigger if exists trg_provider_welcome_email on public.service_providers;
create trigger trg_provider_welcome_email
  after insert or update of agb_accepted_at on public.service_providers
  for each row execute function public.send_provider_welcome_email();

do $$
begin
  raise notice '✅ Migration 105: Provider-Willkommensmail-Trigger aktiv. Nicht vergessen: Vault-Secret "welcome_email_secret" + Edge-Env WELCOME_EMAIL_SECRET (gleicher Wert) setzen und Function provider-welcome-email deployen.';
end $$;
