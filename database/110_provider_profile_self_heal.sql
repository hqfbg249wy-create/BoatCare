-- ============================================================
-- Migration 110: Provider-Profil Self-Healing
-- ============================================================
-- Behebt "Kein Provider-Profil": Ein authentifizierter Provider MUSS
-- immer eine verknüpfte service_providers-Zeile erhalten.
--
-- Ursache vorher: Der Signup-Trigger (108) legt bei is_provider=true ein
-- Profil an. Lief er für einen User aber nie (Alt-User vor 042, Import,
-- Trigger-Ausnahme, Einladung ohne is_provider), gab es KEINEN Fallback —
-- claim_provider_by_email verknüpfte nur verwaiste Einträge per E-Mail,
-- erstellte aber nie ein Profil. Ergebnis: "Kein Provider-Profil".
--
-- Neue Architektur — drei Schutzschichten über EINE Helper-Funktion:
--   1) ensure_provider_profile(uid): verknüpft-oder-erstellt idempotent.
--   2) Signup-Trigger nutzt sie (konfliktsicher, keine Duplikate).
--   3) claim_provider_by_email nutzt sie → Self-Heal beim Login.
--   + Backfill für bereits betroffene Bestands-User.
--
-- Idempotent: mehrfach ausführbar.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Zentrale Helper-Funktion: verknüpft oder erstellt das Profil.
--    SECURITY DEFINER; NICHT an Rollen granten (nur intern aufgerufen),
--    damit niemand Profile für fremde user_ids anlegen kann.
-- ------------------------------------------------------------
create or replace function public.ensure_provider_profile(p_user_id uuid)
returns public.service_providers
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  u        auth.users;
  v_meta   jsonb;
  v_tax_id text;
  v_tax_no text;
  v_small  boolean;
  v_biz    boolean;
  v_locale text;
  v_row    public.service_providers;
begin
  select * into u from auth.users where id = p_user_id;
  if not found then
    return null;
  end if;
  v_meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);

  -- profiles-Zeile als FK-Voraussetzung sicherstellen. Rolle NUR beim
  -- Anlegen setzen (kein Downgrade eines Admins, kein Trip des
  -- prevent_role_escalation-Triggers bei Bestandszeilen).
  insert into public.profiles (id, email, role, company_name, created_at, updated_at)
  values (u.id, u.email, 'provider', v_meta->>'company_name', now(), now())
  on conflict (id) do update
    set company_name = coalesce(excluded.company_name, public.profiles.company_name);

  -- 1) Schon verknüpft? Zurückgeben.
  select * into v_row from public.service_providers where user_id = p_user_id limit 1;
  if found then
    return v_row;
  end if;

  -- 2) EINEN verwaisten Eintrag (Import/Scrape) mit passender E-Mail verknüpfen.
  --    Bei mehreren Dubletten derselben E-Mail deterministisch nur EINEN wählen —
  --    sonst würde RETURNING ... INTO bei >1 Treffer P0003 werfen.
  update public.service_providers sp
     set user_id = p_user_id, updated_at = now()
   where sp.id = (
           select id from public.service_providers
            where lower(email) = lower(u.email) and user_id is null
            order by id
            limit 1
         )
   returning sp.* into v_row;
  if found then
    return v_row;
  end if;

  -- 3) Nur für ECHTE Provider (laut Metadaten) ein neues Profil anlegen.
  if coalesce(v_meta->>'is_provider','false') <> 'true' then
    return null;
  end if;

  v_tax_id := nullif(btrim(v_meta->>'tax_id'), '');
  v_tax_no := nullif(btrim(v_meta->>'tax_number'), '');
  v_small  := coalesce((v_meta->>'is_small_business')::boolean, false);
  v_biz    := coalesce((v_meta->>'business_declared')::boolean, false);
  v_locale := nullif(btrim(v_meta->>'locale'), '');

  insert into public.service_providers (
    user_id, name, category, email, city, country,
    agb_accepted_at, agb_accepted_version,
    tax_id, tax_number, is_small_business, business_declared_at, vat_status,
    locale
  )
  values (
    u.id,
    coalesce(v_meta->>'company_name', 'Neuer Provider'),
    coalesce(v_meta->>'category', 'repair'),
    u.email,
    v_meta->>'city',
    coalesce(v_meta->>'country', 'Deutschland'),
    case when v_meta->>'agb_version' is not null then now() else null end,
    v_meta->>'agb_version',
    v_tax_id,
    v_tax_no,
    v_small,
    case when v_biz then now() else null end,
    case
      when v_small then 'review'
      when v_tax_id is not null then 'pending'
      else 'review'
    end,
    v_locale
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.ensure_provider_profile(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2) Signup-Trigger nutzt jetzt die Helper-Funktion (konfliktsicher,
--    verknüpft verwaiste Einträge statt zu duplizieren).
-- ------------------------------------------------------------
create or replace function public.handle_new_provider_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'is_provider','false') = 'true' then
    perform public.ensure_provider_profile(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_provider_signup on auth.users;
create trigger on_auth_provider_signup
after insert on auth.users
for each row execute function public.handle_new_provider_signup();

-- ------------------------------------------------------------
-- 3) claim_provider_by_email → Self-Heal beim Login (erstellt Profil,
--    falls der User laut Metadaten Provider ist).
-- ------------------------------------------------------------
create or replace function public.claim_provider_by_email()
returns public.service_providers
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  return public.ensure_provider_profile(uid);
end;
$$;

revoke all on function public.claim_provider_by_email() from public;
grant execute on function public.claim_provider_by_email() to authenticated;

-- ------------------------------------------------------------
-- 4) Backfill: bestehende is_provider-User ohne Profil nachträglich fixen.
-- ------------------------------------------------------------
do $$
declare
  r record;
  fixed  int := 0;
  failed int := 0;
begin
  for r in
    select u.id, u.email
      from auth.users u
     where coalesce(u.raw_user_meta_data->>'is_provider','false') = 'true'
       and not exists (
         select 1 from public.service_providers sp where sp.user_id = u.id
       )
  loop
    -- Pro Zeile eine Subtransaktion: eine problematische Zeile (z. B.
    -- Constraint-Konflikt) darf NICHT den ganzen Backfill zurückrollen.
    begin
      perform public.ensure_provider_profile(r.id);
      fixed := fixed + 1;
    exception when others then
      failed := failed + 1;
      raise warning 'Backfill fehlgeschlagen für % (user %): %', r.email, r.id, sqlerrm;
    end;
  end loop;
  raise notice '✅ Migration 110: % Profile verknüpft/erstellt, % fehlgeschlagen (siehe WARNINGs oben).', fixed, failed;
end $$;
