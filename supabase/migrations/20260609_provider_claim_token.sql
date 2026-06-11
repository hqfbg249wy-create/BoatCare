-- ════════════════════════════════════════════════════════════════════
-- Provider Claim-Token
--
-- Einheitlicher Mechanismus, mit dem ein noch nicht beanspruchter
-- (verwaister) Provider sein Profil "uebernehmen" kann — egal ob der
-- Link aus einem CleverReach-Massen-Mailing oder einer gezielten
-- Admin-Einladung stammt.
--
-- Anders als Supabase inviteUserByEmail legt das NICHT sofort einen
-- Auth-User an. Stattdessen bekommt jeder service_providers-Eintrag
-- ein langlebiges, nicht erratbares Token (UUID). Erst wenn der
-- Provider auf /claim/<token> sein Profil aktiv beansprucht und ein
-- Passwort setzt, wird der Auth-User angelegt und verknuepft.
--
-- Vorteile:
--   - Keine Karteileichen (2000 Cold-Outreach-Mails ohne 2000 Auth-User)
--   - Ein Link funktioniert unbegrenzt (Newsletter laeuft nicht in 1h ab)
--   - Token identifiziert den Provider EINDEUTIG (unabhaengig der Mail)
-- ════════════════════════════════════════════════════════════════════

-- 1) Spalten
alter table public.service_providers
  add column if not exists claim_token            uuid default gen_random_uuid(),
  add column if not exists claim_token_created_at timestamptz default now(),
  add column if not exists claimed_at             timestamptz;

-- Bestehende Provider ohne Token nachziehen
update public.service_providers
   set claim_token = gen_random_uuid()
 where claim_token is null;

-- Token muss eindeutig sein (verhindert Kollision + erlaubt schnellen Lookup)
create unique index if not exists idx_service_providers_claim_token
    on public.service_providers (claim_token);

comment on column public.service_providers.claim_token is
    'Langlebiges UUID-Token fuer den Selbst-Claim eines Profils via /claim/<token>. Wird in Outreach-Mails als Button-Link versendet.';
comment on column public.service_providers.claimed_at is
    'Zeitpunkt zu dem das Profil erfolgreich beansprucht wurde (user_id verknuepft). NULL = noch verwaist.';

-- 2) RPC: Provider per Token nachschlagen (oeffentlich lesbar, nur
--    nicht-sensible Felder, damit die /claim-Seite das Profil vorausfuellen
--    kann BEVOR ein Account existiert).
--    SECURITY DEFINER umgeht RLS, gibt aber bewusst nur Public-Felder.
create or replace function public.get_claimable_provider(p_token uuid)
returns table (
    id          uuid,
    name        text,
    category    text,
    city        text,
    street      text,
    postal_code text,
    country     text,
    website     text,
    email       text,
    phone       text,
    is_claimed  boolean
)
language sql
security definer
set search_path = public
as $$
    select
        sp.id, sp.name, sp.category, sp.city, sp.street, sp.postal_code,
        sp.country, sp.website,
        -- E-Mail maskieren (Datenschutz): nur Domain zeigen, damit der
        -- Provider erkennt "ja das ist meine Adresse" ohne sie offen zu legen
        case when sp.email is not null and position('@' in sp.email) > 0
             then '••••@' || split_part(sp.email, '@', 2)
             else null end as email,
        sp.phone,
        (sp.user_id is not null or sp.claimed_at is not null) as is_claimed
    from public.service_providers sp
    where sp.claim_token = p_token
    limit 1;
$$;

grant execute on function public.get_claimable_provider(uuid) to anon, authenticated;

-- 3) RPC: Profil per Token an einen frisch angelegten User binden.
--    Wird NACH der Account-Erstellung vom Provider-Portal aufgerufen
--    (authenticated). Verknuepft user_id, setzt claimed_at, und stellt
--    sicher dass das Token nicht doppelt eingeloest wird.
create or replace function public.claim_provider_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_provider public.service_providers%rowtype;
begin
    if v_uid is null then
        return jsonb_build_object('ok', false, 'error', 'not_authenticated');
    end if;

    select * into v_provider
    from public.service_providers
    where claim_token = p_token
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'token_not_found');
    end if;

    -- Schon von JEMAND ANDEREM beansprucht?
    if v_provider.user_id is not null and v_provider.user_id <> v_uid then
        return jsonb_build_object('ok', false, 'error', 'already_claimed');
    end if;

    -- Verknuepfen
    update public.service_providers
       set user_id    = v_uid,
           claimed_at = coalesce(claimed_at, now())
     where id = v_provider.id;

    return jsonb_build_object('ok', true, 'provider_id', v_provider.id, 'name', v_provider.name);
end;
$$;

grant execute on function public.claim_provider_by_token(uuid) to authenticated;
