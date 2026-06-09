-- E-Mail-Verifizierung fuer Service-Provider
--
-- Erlaubt es, regelmaessig zu pruefen ob die hinterlegten E-Mail-Adressen
-- noch real sind: Domain hat noch MX-Records, E-Mail erscheint noch auf
-- der Website etc. Der Admin sieht dann auf einen Blick welche Provider
-- veraltete Kontaktdaten haben.

alter table public.service_providers
  add column if not exists last_email_check_at timestamptz,
  add column if not exists email_check_status  text,
  add column if not exists email_check_note    text;

-- Valid Werte fuer email_check_status:
--   'valid'         — Domain hat MX UND E-Mail wurde auf Website gefunden
--   'mx_only'       — Domain hat MX, E-Mail aber nicht (mehr) auf Website
--                     (kann gueltig sein, schwer zu sagen)
--   'not_on_site'   — Domain hat MX, E-Mail nicht mehr auf Website
--                     (verdaechtig — moeglicherweise alte Adresse)
--   'domain_dead'   — Domain hat keinen MX-Record (sicher invalid)
--   'website_dead'  — Website nicht erreichbar (Domain-Status unklar)
--   'unverified'    — Initial / noch nicht geprueft
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'service_providers_email_check_status_check'
    ) then
        alter table public.service_providers
          add constraint service_providers_email_check_status_check
          check (email_check_status is null or email_check_status in (
              'valid', 'mx_only', 'not_on_site', 'domain_dead',
              'website_dead', 'unverified'
          ));
    end if;
end$$;

-- Index fuer "wer wurde am laengsten nicht geprueft?"
create index if not exists idx_service_providers_last_email_check
    on public.service_providers (last_email_check_at nulls first);

-- Index fuer "alle mit Problem-Status"
create index if not exists idx_service_providers_email_status
    on public.service_providers (email_check_status)
    where email_check_status in ('domain_dead', 'not_on_site', 'website_dead');

comment on column public.service_providers.last_email_check_at is
    'Zeitpunkt der letzten automatischen E-Mail-Verifizierung. NULL = nie geprueft.';
comment on column public.service_providers.email_check_status is
    'Ergebnis der letzten Verifizierung: valid / mx_only / not_on_site / domain_dead / website_dead / unverified';
comment on column public.service_providers.email_check_note is
    'Menschlich lesbare Begruendung fuer den Status (Debug/Audit).';
