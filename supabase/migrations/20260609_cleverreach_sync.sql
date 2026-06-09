-- CleverReach Newsletter-Sync
--
-- Erlaubt es Provider mit verifizierten E-Mail-Adressen in CleverReach-
-- Listen zu pushen, aufgeteilt nach Land. Wir tracken wann ein Provider
-- zuletzt synchronisiert wurde, damit wir Duplikat-Pushes vermeiden.

alter table public.service_providers
  add column if not exists cleverreach_synced_at timestamptz,
  add column if not exists cleverreach_group_id  text,
  add column if not exists cleverreach_status    text;

-- cleverreach_status:
--   'subscribed'      — erfolgreich in Liste aufgenommen
--   'unsubscribed'    — User hat sich ausgetragen (nicht erneut pushen)
--   'bounced'         — Hard-Bounce (Adresse ungueltig)
--   'pending'         — Double-Opt-In Bestaetigung steht aus
--   'error'           — Letzter Sync hat fehlgeschlagen
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'service_providers_cleverreach_status_check'
    ) then
        alter table public.service_providers
          add constraint service_providers_cleverreach_status_check
          check (cleverreach_status is null or cleverreach_status in (
              'subscribed', 'unsubscribed', 'bounced', 'pending', 'error'
          ));
    end if;
end$$;

create index if not exists idx_service_providers_cleverreach_sync
    on public.service_providers (cleverreach_synced_at nulls first)
    where email is not null;

comment on column public.service_providers.cleverreach_synced_at is
    'Zeitpunkt des letzten erfolgreichen Push nach CleverReach. NULL = noch nie synchronisiert.';
comment on column public.service_providers.cleverreach_group_id is
    'CleverReach Group/List-ID in der dieser Provider gelistet ist (typisch pro Land).';
comment on column public.service_providers.cleverreach_status is
    'Subscription-Status bei CleverReach: subscribed / unsubscribed / bounced / pending / error.';
