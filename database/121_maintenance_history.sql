-- ============================================================
-- Migration 121: Wartungshistorie
-- ============================================================
-- Protokolliert jede durchgeführte Wartung pro Ausrüstungsgegenstand
-- (bisher wurde nur last_/next_maintenance_date überschrieben — kein Verlauf).
-- Grundlage für den Wartungsreport-PDF (alle Geräte + Verlauf).
--
-- Ownership über equipment.boat_id -> boats.owner_id = auth.uid().
-- Idempotenter Backfill: bestehende "letzte Wartung" wird als erster Eintrag
-- übernommen (nur wenn noch keine Historie existiert).
-- ============================================================

create table if not exists public.maintenance_history (
  id            uuid primary key default gen_random_uuid(),
  equipment_id  uuid not null references public.equipment(id) on delete cascade,
  performed_on  date not null default current_date,
  note          text,
  cycle_years   int,          -- Intervall-Snapshot zum Zeitpunkt der Wartung
  next_due      date,         -- gesetztes nächstes Fälligkeitsdatum (Snapshot)
  created_at    timestamptz not null default now()
);

create index if not exists idx_maintenance_history_equipment
  on public.maintenance_history(equipment_id, performed_on desc);

alter table public.maintenance_history enable row level security;

-- Eigner (über equipment -> boats.owner_id) darf lesen & schreiben.
drop policy if exists maintenance_history_select on public.maintenance_history;
create policy maintenance_history_select on public.maintenance_history
  for select using (
    equipment_id in (
      select e.id from public.equipment e
      join public.boats b on b.id = e.boat_id
      where b.owner_id = auth.uid()
    )
  );

drop policy if exists maintenance_history_insert on public.maintenance_history;
create policy maintenance_history_insert on public.maintenance_history
  for insert with check (
    equipment_id in (
      select e.id from public.equipment e
      join public.boats b on b.id = e.boat_id
      where b.owner_id = auth.uid()
    )
  );

drop policy if exists maintenance_history_update on public.maintenance_history;
create policy maintenance_history_update on public.maintenance_history
  for update using (
    equipment_id in (
      select e.id from public.equipment e
      join public.boats b on b.id = e.boat_id
      where b.owner_id = auth.uid()
    )
  );

drop policy if exists maintenance_history_delete on public.maintenance_history;
create policy maintenance_history_delete on public.maintenance_history
  for delete using (
    equipment_id in (
      select e.id from public.equipment e
      join public.boats b on b.id = e.boat_id
      where b.owner_id = auth.uid()
    )
  );

-- Backfill: pro Gerät mit last_maintenance_date einen ersten Historien-Eintrag,
-- nur wenn noch keine Historie existiert (idempotent).
insert into public.maintenance_history (equipment_id, performed_on, note, cycle_years, next_due)
select e.id, e.last_maintenance_date,
       'Übernommen aus letzter erfasster Wartung',
       e.maintenance_cycle_years, e.next_maintenance_date
from public.equipment e
where e.last_maintenance_date is not null
  and not exists (select 1 from public.maintenance_history mh where mh.equipment_id = e.id);

do $$ begin raise notice '✅ Migration 121: maintenance_history + RLS + Backfill.'; end $$;
