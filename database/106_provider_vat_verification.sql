-- ============================================================
-- Migration 106: USt-IdNr-Erfassung + VIES-Verifizierung (Provider)
-- ============================================================
-- Ziel: Verhindern, dass sich Privatpersonen als Provider anmelden.
-- Provider müssen sich als GEWERBLICH deklarieren und entweder
--   (a) eine gültige USt-IdNr angeben (offiziell über EU-VIES geprüft), oder
--   (b) sich als Kleinunternehmer (§19 UStG) melden → Status "review"
--       (manuelle Freigabe im Admin-Panel).
--
-- Relevanz: Als vermittelnde Plattform unterliegt ihr sehr wahrscheinlich
-- DAC7 (EU-Plattform-Meldepflicht) → Erhebung + Verifizierung der
-- Verkäufer-/Steuerdaten ist Pflicht. (Rechtliche Details mit Steuerberater
-- abstimmen — diese Migration liefert nur die Technik.)
--
-- Spalte tax_id existiert bereits (Migration 028). Hier kommen Status +
-- Verifizierungs-Ergebnis + Selbstauskunft dazu.
--
-- SETUP (einmalig, analog Migration 105):
--   1) Vault-Secret: select vault.create_secret('<GEHEIM>', 'vat_verify_secret');
--   2) Diese Migration im SQL-Editor ausführen.
--   3) Edge-Env: supabase secrets set VAT_VERIFY_SECRET=<GEHEIM>
--   4) supabase functions deploy validate-vat
-- ============================================================

create extension if not exists pg_net with schema extensions;

-- ─── Spalten ────────────────────────────────────────────────────────────────
alter table public.service_providers
  add column if not exists vat_status           text default 'pending',
  add column if not exists vat_verified         boolean,
  add column if not exists vat_checked_at       timestamptz,
  add column if not exists vat_verified_name    text,
  add column if not exists is_small_business    boolean default false,
  add column if not exists business_declared_at timestamptz;

comment on column public.service_providers.vat_status is
  'USt-Status: pending | verified | invalid | review (Kleinunternehmer/Nicht-EU/VIES-Fehler) | not_required.';
comment on column public.service_providers.vat_verified is
  'TRUE wenn USt-IdNr per VIES bestätigt. NULL = noch nicht geprüft.';
comment on column public.service_providers.vat_verified_name is
  'Von VIES zurückgegebener Firmenname (zum Abgleich mit dem Anmeldenamen).';
comment on column public.service_providers.is_small_business is
  'Kleinunternehmer (§19 UStG) — meist ohne USt-IdNr, daher manuelle Prüfung.';
comment on column public.service_providers.business_declared_at is
  'Zeitpunkt der Selbstauskunft "gewerblicher Anbieter" (Nachweis).';

-- ─── Signup-Trigger erweitern: tax_id + Flags + Startstatus aus metadata ─────
create or replace function public.handle_new_provider_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tax_id   text := nullif(btrim(new.raw_user_meta_data->>'tax_id'), '');
  v_small    boolean := coalesce((new.raw_user_meta_data->>'is_small_business')::boolean, false);
  v_biz      boolean := coalesce((new.raw_user_meta_data->>'business_declared')::boolean, false);
begin
  if coalesce(new.raw_user_meta_data->>'is_provider','false') = 'true' then

    insert into public.profiles (id, email, role, company_name)
    values (new.id, new.email, 'provider', new.raw_user_meta_data->>'company_name')
    on conflict (id) do update
      set role = 'provider',
          company_name = coalesce(excluded.company_name, public.profiles.company_name);

    insert into public.service_providers (
      user_id, name, category, email, city, country,
      agb_accepted_at, agb_accepted_version,
      tax_id, is_small_business, business_declared_at, vat_status
    )
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'company_name', 'Neuer Provider'),
      coalesce(new.raw_user_meta_data->>'category', 'repair'),
      new.email,
      new.raw_user_meta_data->>'city',
      coalesce(new.raw_user_meta_data->>'country', 'Deutschland'),
      case when new.raw_user_meta_data->>'agb_version' is not null then now() else null end,
      new.raw_user_meta_data->>'agb_version',
      v_tax_id,
      v_small,
      case when v_biz then now() else null end,
      case
        when v_small then 'review'          -- Kleinunternehmer → manuelle Prüfung
        when v_tax_id is not null then 'pending'  -- USt-IdNr → VIES-Prüfung folgt (Trigger)
        else 'review'                       -- weder noch → manuell prüfen
      end
    );
  end if;
  return new;
end;
$$;

-- ─── Verifizierungs-Trigger: ruft validate-vat via pg_net (VIES) ─────────────
create or replace function public.verify_provider_vat()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url   text := 'https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/validate-vat';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ';
  secret   text;
begin
  -- Nur prüfen, wenn eine USt-IdNr vorhanden ist.
  if new.tax_id is null or btrim(new.tax_id) = '' then
    return new;
  end if;

  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'vat_verify_secret' limit 1;
  if secret is null or secret = '' then
    raise warning 'verify_provider_vat: Vault-Secret "vat_verify_secret" fehlt — VIES-Prüfung übersprungen';
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'x-vat-secret',  secret
    ),
    body    := jsonb_build_object('provider_id', new.id)
  );
  return new;
end $$;

drop trigger if exists trg_verify_provider_vat on public.service_providers;
create trigger trg_verify_provider_vat
  after insert or update of tax_id on public.service_providers
  for each row execute function public.verify_provider_vat();

do $$
begin
  raise notice '✅ Migration 106: USt-Verifizierung aktiv. Vault-Secret "vat_verify_secret" + Edge-Env VAT_VERIFY_SECRET setzen und Function validate-vat deployen.';
end $$;
