-- 135_new_order_notification_trigger.sql
-- Automatische Benachrichtigung bei NEUER Bestellung (Shopify/WooCommerce-Standard).
--
-- Beim Anlegen einer Bestellung ruft ein AFTER-INSERT-Trigger per pg_net die
-- Edge Function `notify-new-order` auf, die dem Anbieter eine Detail-Mail und
-- dem Kaeufer eine Bestellbestaetigung schickt. Wichtig fuer Betriebe, deren
-- Shop-System nicht angebunden ist (z.B. CSV/Excel-Upload) und die sonst nur im
-- Portal von der Bestellung erfahren.
--
-- Muster wie Migration 105 (pg_net + Vault-Secret).
--
-- SETUP (einmalig, sonst wird die Mail still uebersprungen):
--   1) Vault-Secret anlegen (SQL-Editor):
--        select vault.create_secret('<GEHEIM>', 'order_notify_secret');
--   2) Edge-Function-Env setzen: ORDER_NOTIFY_SECRET = <derselbe Wert>
--   3) Function deployen: supabase functions deploy notify-new-order --no-verify-jwt

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url   text := 'https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/notify-new-order';
  -- URL + anon-Key sind nicht geheim; der Schutz ist das Shared-Secret.
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ';
  secret   text;
begin
  -- Nur echte Bestellungen mit Anbieter.
  if new.provider_id is null then
    return new;
  end if;

  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'order_notify_secret'
   limit 1;

  if secret is null or secret = '' then
    raise warning 'notify_new_order: Vault-Secret "order_notify_secret" fehlt — Benachrichtigung uebersprungen';
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'Authorization',     'Bearer ' || anon_key,
      'x-internal-secret', secret
    ),
    body    := jsonb_build_object('order_id', new.id)
  );
  return new;
end $$;

drop trigger if exists trg_notify_new_order on public.orders;
create trigger trg_notify_new_order
  after insert on public.orders
  for each row execute function public.notify_new_order();

do $$
begin
  raise notice '✅ Migration 135: Neue-Bestellung-Benachrichtigung aktiv. Nicht vergessen: Vault-Secret "order_notify_secret" + Edge-Env ORDER_NOTIFY_SECRET (gleicher Wert) setzen und Function notify-new-order deployen (--no-verify-jwt).';
end $$;
