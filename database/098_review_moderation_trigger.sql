-- ============================================================
-- Migration 098: Review-Moderation serverseitig (Trigger statt Client-Call)
-- ============================================================
-- SICHERHEITS-FIX. Vorher rief der Client (Owner-Portal) die Edge Function
-- `moderate-review` mit client-gelieferter review_id + comment + rating auf.
-- Da der Endpoint öffentlich (anon-Key) erreichbar war, konnte JEDER:
--   (a) beliebige fremde Reviews per fremder review_id + toxischem Text
--       verstecken lassen (Zensur), und
--   (b) die Moderation umgehen (toxischen Review speichern, dann mit sauberem
--       Text moderieren lassen).
--
-- LÖSUNG (Variante A):
--   * Moderation läuft AUTOMATISCH per AFTER-INSERT-Trigger auf `reviews`.
--   * Der Trigger ruft die Edge Function mit dem in der DB GESPEICHERTEN
--     Inhalt (nur review_id im Body; die Function liest comment/rating selbst).
--   * Die Edge Function ist jetzt nur noch mit Shared-Secret aufrufbar
--     (Header x-moderation-secret == env MODERATION_SECRET) — nicht von Clients.
--
-- SETUP (einmalig, siehe Hinweise am Ende):
--   1) diese Migration ausführen (aktiviert pg_net + Trigger)
--   2) Secret in der DB setzen:  ALTER DATABASE postgres SET app.moderation_secret = '<SECRET>';
--   3) Gleiches Secret als Edge-Function-Env setzen: MODERATION_SECRET=<SECRET>
--      (supabase secrets set MODERATION_SECRET=<SECRET>)
-- ============================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.moderate_review_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- URL + anon-Key sind NICHT geheim (anon-Key ist ohnehin öffentlich im Client);
  -- der eigentliche Schutz ist das Shared-Secret unten.
  fn_url   text := 'https://vcjwlyqkfkszumdrfvtm.supabase.co/functions/v1/moderate-review';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ';
  secret   text := current_setting('app.moderation_secret', true);
begin
  -- Reine Sternebewertungen ohne Text: keine Moderation nötig.
  if new.comment is null or btrim(new.comment) = '' then
    return new;
  end if;
  -- Ohne gesetztes Secret nicht aufrufen (Function würde 403 liefern) —
  -- Review bleibt sichtbar (fail-open, wie bisher), aber sauber geloggt.
  if secret is null or secret = '' then
    raise warning 'moderate_review: app.moderation_secret nicht gesetzt — Moderation uebersprungen';
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',        'application/json',
      'Authorization',       'Bearer ' || anon_key,
      'x-moderation-secret', secret
    ),
    body    := jsonb_build_object('review_id', new.id)
  );
  return new;
end $$;

drop trigger if exists trg_moderate_review on public.reviews;
create trigger trg_moderate_review
  after insert on public.reviews
  for each row execute function public.moderate_review_on_insert();

do $$
begin
  raise notice '✅ Migration 098: Review-Moderation läuft jetzt per Trigger. Nicht vergessen: app.moderation_secret (DB) UND MODERATION_SECRET (Edge Function) auf denselben Wert setzen.';
end $$;
