-- ════════════════════════════════════════════════════════════════════
-- Sales-Rep-Verwaltung
--
-- Vertriebler-Tabelle plus Verknuepfung an service_providers. Jeder
-- Provider kann genau einem Vertriebler zugewiesen werden. Der
-- Vertriebler bekommt einen prozentualen Anteil am Umsatz seiner
-- Shops (commission_pct, default 5 %).
--
-- Provisions-Berechnung erfolgt im Admin-UI on-the-fly:
--   provision = SUM(orders.commission_amount fuer alle shops des reps)
--               × sales_rep.commission_pct / 100
-- Wir speichern keine pre-aggregierten Werte, damit historische
-- Aenderungen am commission_pct die Vergangenheit nicht ueberschreiben.
-- (Falls das gewuenscht ist, koennen wir spaeter snapshot-Tabelle bauen.)
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.sales_reps (
    id              uuid primary key default gen_random_uuid(),
    full_name       text not null,
    email           text,
    phone           text,
    commission_pct  numeric(5,2) not null default 5.00,
    active          boolean not null default true,
    notes           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    created_by      uuid references auth.users(id) on delete set null
);

-- Sanity-Check: Commission zwischen 0 und 50 Prozent
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'sales_reps_commission_pct_check'
    ) then
        alter table public.sales_reps
          add constraint sales_reps_commission_pct_check
          check (commission_pct >= 0 and commission_pct <= 50);
    end if;
end$$;

create index if not exists idx_sales_reps_active on public.sales_reps(active) where active = true;
create index if not exists idx_sales_reps_name on public.sales_reps(full_name);

-- Zuweisung am Provider
alter table public.service_providers
  add column if not exists sales_rep_id           uuid references public.sales_reps(id) on delete set null,
  add column if not exists sales_rep_assigned_at  timestamptz;

create index if not exists idx_service_providers_sales_rep
    on public.service_providers(sales_rep_id)
    where sales_rep_id is not null;

-- RLS: Sales-Reps sind reine Admin-Daten — nur Admins lesen/schreiben
alter table public.sales_reps enable row level security;

drop policy if exists "Admins lesen sales_reps" on public.sales_reps;
create policy "Admins lesen sales_reps" on public.sales_reps for select
    using (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin'
        )
    );

drop policy if exists "Admins schreiben sales_reps" on public.sales_reps;
create policy "Admins schreiben sales_reps" on public.sales_reps for all
    using (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin'
        )
    );

comment on table public.sales_reps is
    'Vertriebler mit Provisions-Anteil. Verknuepft mit service_providers.sales_rep_id.';
comment on column public.sales_reps.commission_pct is
    'Anteil am Marketplace-Commission der zugewiesenen Shops (0-50 %).';
