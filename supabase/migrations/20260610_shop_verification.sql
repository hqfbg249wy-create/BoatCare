-- ════════════════════════════════════════════════════════════════════
-- Online-Shop-Verifizierung fuer Service-Provider
--
-- Erkennt automatisch ob die hinterlegte Website ein echter Online-Shop
-- ist (Shopify, WooCommerce, Magento, JTL-Shop, etc.) oder nur ein
-- statisches Firmenprofil. Wird vor dem Versand des Shop-Onboarding-
-- Mailings genutzt, damit nur passende Adressaten angeschrieben werden.
-- ════════════════════════════════════════════════════════════════════

alter table public.service_providers
  add column if not exists shop_verified_at  timestamptz,
  add column if not exists shop_check_status text,
  add column if not exists shop_check_score  integer,
  add column if not exists shop_platform     text,
  add column if not exists shop_check_note   text;

-- shop_check_status:
--   'online_shop'    — Score >= 50, sicher ein Shop
--   'maybe_shop'     — Score 25-49, unklar, manuell pruefen
--   'website_only'   — Score < 25, nur Firmenwebsite
--   'unreachable'    — Website antwortet nicht
--   'unverified'     — noch nicht geprueft (default)
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'service_providers_shop_check_status_check'
    ) then
        alter table public.service_providers
          add constraint service_providers_shop_check_status_check
          check (shop_check_status is null or shop_check_status in (
              'online_shop', 'maybe_shop', 'website_only',
              'unreachable', 'unverified'
          ));
    end if;
end$$;

create index if not exists idx_service_providers_shop_status
    on public.service_providers (shop_check_status)
    where website is not null;

create index if not exists idx_service_providers_shop_verified
    on public.service_providers (shop_verified_at nulls first)
    where website is not null;

comment on column public.service_providers.shop_verified_at is
    'Zeitpunkt der letzten automatischen Shop-Verifizierung. NULL = nie geprueft.';
comment on column public.service_providers.shop_check_status is
    'Ergebnis: online_shop / maybe_shop / website_only / unreachable / unverified';
comment on column public.service_providers.shop_check_score is
    'Confidence-Score 0-100 — je hoeher, desto sicherer ein Online-Shop.';
comment on column public.service_providers.shop_platform is
    'Erkannte Shop-Plattform: shopify / woocommerce / magento / jtl / prestashop / shopware / oxid / plentymarkets / custom / null';
comment on column public.service_providers.shop_check_note is
    'Menschlich lesbare Begruendung (Debug/Audit).';
