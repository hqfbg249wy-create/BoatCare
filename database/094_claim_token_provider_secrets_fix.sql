-- Migration 094: Claim-Token-RPCs auf provider_secrets umstellen
-- ============================================================================
-- PROBLEM (live: "column sp.claim_token does not exist"):
--   Migration 088b hat service_providers.claim_token gedroppt und das Token
--   nach provider_secrets.claim_token verlagert. Die beiden Claim-RPCs aus
--   20260609_provider_claim_token.sql wurden dabei NICHT mitgezogen — sie
--   lesen weiterhin sp.claim_token. Dadurch schlägt /claim/<token> komplett
--   fehl ("Link invalid"), egal ob der Link aus einem CleverReach-Mailing
--   oder einer Admin-Einladung stammt.
--
-- LÖSUNG: Beide SECURITY-DEFINER-Funktionen joinen jetzt provider_secrets
--   und matchen auf ps.claim_token. SECURITY DEFINER umgeht die RLS auf
--   provider_secrets, sodass die öffentliche /claim-Seite (anon) das Profil
--   weiterhin vorab laden kann — ohne dass das Token jemals selektierbar wird.
--
-- HINWEIS CleverReach: Die Mailing-Templates verwenden nur den Platzhalter
--   {$claim_url}. Dieser wird im Admin-Export bereits aus
--   provider_secrets(claim_token) gebaut (admin-web/app.js) — also korrekt.
--   Mit diesem Fix funktioniert der Link-Aufruf auf der /claim-Seite wieder.
-- ============================================================================

-- 1) Provider per Token nachschlagen (öffentlich, nur Public-Felder).
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
        -- E-Mail maskieren (Datenschutz): nur Domain zeigen.
        case when sp.email is not null and position('@' in sp.email) > 0
             then '••••@' || split_part(sp.email, '@', 2)
             else null end as email,
        sp.phone,
        (sp.user_id is not null or sp.claimed_at is not null) as is_claimed
    from public.service_providers sp
    join public.provider_secrets ps on ps.provider_id = sp.id
    where ps.claim_token = p_token
    limit 1;
$$;

grant execute on function public.get_claimable_provider(uuid) to anon, authenticated;

-- 2) Profil per Token an den eingeloggten User binden.
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

    select sp.* into v_provider
    from public.service_providers sp
    join public.provider_secrets ps on ps.provider_id = sp.id
    where ps.claim_token = p_token
    for update of sp;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'token_not_found');
    end if;

    -- Schon von JEMAND ANDEREM beansprucht?
    if v_provider.user_id is not null and v_provider.user_id <> v_uid then
        return jsonb_build_object('ok', false, 'error', 'already_claimed');
    end if;

    -- Verknüpfen
    update public.service_providers
       set user_id    = v_uid,
           claimed_at = coalesce(claimed_at, now())
     where id = v_provider.id;

    return jsonb_build_object('ok', true, 'provider_id', v_provider.id, 'name', v_provider.name);
end;
$$;

grant execute on function public.claim_provider_by_token(uuid) to authenticated;

notify pgrst, 'reload schema';
