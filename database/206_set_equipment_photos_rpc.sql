-- 206_set_equipment_photos_rpc.sql
-- Atomares Ersetzen der Foto-Verknuepfungen eines Ausruestungs-Items in
-- equipment_photos. Von iOS genutzt, damit beide Frontends (Web + iOS) in
-- DIESELBE Tabelle schreiben (Angleichung). Der Trigger aus Migration 205
-- haelt equipment.photo_url daraus synchron.
--
-- Warum eine RPC statt delete+insert aus dem Client:
--   In EINER Transaktion (Funktionskoerper) ist das Ersetzen atomar. Schluegt
--   etwas fehl, wird zurueckgerollt -> equipment.photo_url wird nie kurzzeitig
--   geleert (kein "Fotos weg"-Flackern).
--
-- SECURITY INVOKER (Standard): die bestehenden RLS-Policies von
-- equipment_photos (insert/delete nur fuer den Eigner) gelten weiter.
-- Der Trigger sync_equipment_photo_url (SECURITY DEFINER) aktualisiert
-- equipment.photo_url anschliessend.

CREATE OR REPLACE FUNCTION public.set_equipment_photos(
  p_equipment_id uuid,
  p_urls text[]
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.equipment_photos WHERE equipment_id = p_equipment_id;

  IF p_urls IS NOT NULL AND array_length(p_urls, 1) IS NOT NULL THEN
    INSERT INTO public.equipment_photos (equipment_id, photo_url, sort_order)
    SELECT p_equipment_id, trim(u), (ord - 1)
    FROM unnest(p_urls) WITH ORDINALITY AS t(u, ord)
    WHERE coalesce(trim(u), '') <> '';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.set_equipment_photos(uuid, text[]) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 206: RPC set_equipment_photos (atomar, RLS-konform). iOS schreibt Fotos jetzt in equipment_photos.';
END $$;
