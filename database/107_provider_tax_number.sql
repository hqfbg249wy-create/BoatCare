-- ============================================================
-- Migration 107: Steuernummer (Kleinunternehmer-Härtung)
-- ============================================================
-- Kleinunternehmer (§19 UStG) haben meist KEINE USt-IdNr, aber eine
-- Steuernummer. Damit "Kleinunternehmer" nicht als einfache Umgehung der
-- USt-Prüfung dient, wird die Steuernummer zur Pflichtangabe (Frontend) und
-- hier gespeichert. Freigabe erfolgt weiterhin manuell (vat_status='review').
-- ============================================================

alter table public.service_providers
  add column if not exists tax_number text;

comment on column public.service_providers.tax_number is
  'Steuernummer (v. a. Kleinunternehmer ohne USt-IdNr). Für manuelle Prüfung/DAC7.';

-- Signup-Trigger: Steuernummer aus metadata mitschreiben.
create or replace function public.handle_new_provider_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tax_id   text := nullif(btrim(new.raw_user_meta_data->>'tax_id'), '');
  v_tax_no   text := nullif(btrim(new.raw_user_meta_data->>'tax_number'), '');
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
      tax_id, tax_number, is_small_business, business_declared_at, vat_status
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
      v_tax_no,
      v_small,
      case when v_biz then now() else null end,
      case
        when v_small then 'review'
        when v_tax_id is not null then 'pending'
        else 'review'
      end
    );
  end if;
  return new;
end;
$$;

do $$
begin
  raise notice '✅ Migration 107: Spalte tax_number + Signup-Trigger erweitert.';
end $$;
