-- 205_equipment_photos_sync.sql
-- Fotos von Ausruestung synchron zwischen Web und iOS.
--
-- Problem (Nutzer-Feedback): Auf dem Desktop (owner-portal) angelegte
-- Ausruestung samt Fotos synchronisiert zu iOS, die FOTOS aber nicht.
-- Ursache: zwei verschiedene Foto-Quellen pro Frontend:
--   * owner-portal (Web) schreibt Fotos NUR in die Tabelle equipment_photos.
--   * iOS liest Fotos NUR aus der Spalte equipment.photo_url (komma-separiert).
-- -> Web-Fotos erreichen iOS nie. (Umgekehrt klappt es: Web liest photo_url
--    als Legacy-Fallback, wenn equipment_photos leer ist.)
--
-- Fix ohne App-Update: Ein Trigger haelt equipment.photo_url automatisch als
-- komma-separierte Liste aus equipment_photos (sortiert) aktuell. Damit liest
-- iOS die auf dem Web hinzugefuegten Fotos sofort. Zusaetzlich einmaliges
-- Backfill fuer bereits angelegte Items (nur wo photo_url leer ist, damit
-- vorhandene iOS-Fotos nicht ueberschrieben werden).

-- ── Trigger-Funktion: photo_url aus equipment_photos neu aufbauen ──
CREATE OR REPLACE FUNCTION public.sync_equipment_photo_url()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eq   uuid := COALESCE(NEW.equipment_id, OLD.equipment_id);
  v_list text;
BEGIN
  SELECT string_agg(photo_url, ',' ORDER BY sort_order, created_at)
    INTO v_list
  FROM public.equipment_photos
  WHERE equipment_id = v_eq;

  UPDATE public.equipment
     SET photo_url = v_list           -- NULL, wenn keine Fotos mehr vorhanden
   WHERE id = v_eq
     AND photo_url IS DISTINCT FROM v_list;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS equipment_photos_sync_url ON public.equipment_photos;
CREATE TRIGGER equipment_photos_sync_url
AFTER INSERT OR UPDATE OR DELETE ON public.equipment_photos
FOR EACH ROW EXECUTE FUNCTION public.sync_equipment_photo_url();

-- ── Einmaliges Backfill: nur Items OHNE bestehende photo_url ──
UPDATE public.equipment e
SET photo_url = sub.list
FROM (
  SELECT equipment_id, string_agg(photo_url, ',' ORDER BY sort_order, created_at) AS list
  FROM public.equipment_photos
  GROUP BY equipment_id
) sub
WHERE e.id = sub.equipment_id
  AND COALESCE(e.photo_url, '') = '';

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 205: equipment.photo_url wird aus equipment_photos synchronisiert (Web-Fotos erscheinen jetzt auf iOS).';
END $$;
