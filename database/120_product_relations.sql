-- ============================================================
-- Migration 120: Produkt-Verknüpfungen (provider-kuratiert)
-- ============================================================
-- Verifizierte Empfehlungen ohne KI-Erfindung: Ein Provider verknüpft von
-- SEINEM Quell-Produkt (z. B. LiFePO4-Batterie) gezielt andere Produkte —
-- Alternativen, erforderliches/optionales Zubehör (DC-DC-Charger,
-- LiFePO4-Ladegerät), oder Bundle ("zusammen bestellen").
--
-- Ziel-Produkte dürfen beliebig sein (auch fremde) — die Verknüpfung "gehört"
-- dem Provider des Quell-Produkts. Öffentlich lesbar (Eigner sehen die Hinweise).
-- ============================================================

create table if not exists public.product_relations (
  id                uuid primary key default gen_random_uuid(),
  provider_id       uuid not null references public.service_providers(id) on delete cascade,
  source_product_id uuid not null references public.metashop_products(id)  on delete cascade,
  target_product_id uuid not null references public.metashop_products(id)  on delete cascade,
  relation_type     text not null check (relation_type in
                      ('alternative','zubehoer_erforderlich','zubehoer_optional','bundle')),
  note              text,
  sort_order        int  not null default 0,
  created_at        timestamptz not null default now(),
  constraint product_relations_no_self  check (source_product_id <> target_product_id),
  constraint product_relations_unique   unique (source_product_id, target_product_id, relation_type)
);

create index if not exists idx_product_relations_source on public.product_relations(source_product_id);
create index if not exists idx_product_relations_target on public.product_relations(target_product_id);

alter table public.product_relations enable row level security;

-- Öffentlich lesbar (Eigner sehen die Empfehlungen)
drop policy if exists product_relations_select on public.product_relations;
create policy product_relations_select on public.product_relations
  for select using (true);

-- Schreiben nur für den Provider, dem das QUELL-Produkt gehört.
drop policy if exists product_relations_insert on public.product_relations;
create policy product_relations_insert on public.product_relations
  for insert with check (
    source_product_id in (
      select id from public.metashop_products where public.provider_is_member(provider_id)
    )
    and public.provider_is_member(provider_id)
  );

drop policy if exists product_relations_update on public.product_relations;
create policy product_relations_update on public.product_relations
  for update using (
    source_product_id in (
      select id from public.metashop_products where public.provider_is_member(provider_id)
    )
  );

drop policy if exists product_relations_delete on public.product_relations;
create policy product_relations_delete on public.product_relations
  for delete using (
    source_product_id in (
      select id from public.metashop_products where public.provider_is_member(provider_id)
    )
  );

do $$ begin raise notice '✅ Migration 120: Tabelle product_relations + RLS angelegt.'; end $$;
