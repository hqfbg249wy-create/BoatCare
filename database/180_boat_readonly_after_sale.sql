-- =====================================================================
-- 180_boat_readonly_after_sale.sql
-- Beim Verkauf (Einloesen eines Uebergabe-Keys, siehe 179) erhaelt der Kaeufer
-- eine vollstaendige Kopie. Das ORIGINAL beim Verkaeufer wird auf den Stand des
-- Verkaufs eingefroren: read_only = true. Ein schreibgeschuetztes Boot sowie
-- seine Ausruestung und deren Kind-Daten koennen nicht mehr veraendert oder
-- ergaenzt werden (harte Durchsetzung per Trigger, unabhaengig vom Client).
--
-- Loeschen bleibt erlaubt (der Verkaeufer darf das archivierte Boot entfernen);
-- INSERT/UPDATE sind gesperrt, damit der "Stand des Verkaufs" nicht faelschbar
-- ist. Das Setzen von read_only selbst (false -> true) ist erlaubt.
-- =====================================================================

ALTER TABLE public.boats
    ADD COLUMN IF NOT EXISTS read_only      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;

-- ── Boot selbst: UPDATE auf einem bereits read_only-Boot sperren.
CREATE OR REPLACE FUNCTION public.block_readonly_boat_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.read_only THEN
        RAISE EXCEPTION 'Dieses Boot wurde verkauft und ist schreibgeschuetzt (Stand des Verkaufs).'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_block_readonly_boat ON public.boats;
CREATE TRIGGER trg_block_readonly_boat
    BEFORE UPDATE ON public.boats
    FOR EACH ROW EXECUTE FUNCTION public.block_readonly_boat_update();

-- ── Ausruestung: INSERT/UPDATE sperren, wenn das Boot read_only ist.
CREATE OR REPLACE FUNCTION public.block_readonly_equipment_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE ro BOOLEAN;
BEGIN
    SELECT b.read_only INTO ro FROM public.boats b
        WHERE b.id = COALESCE(NEW.boat_id, OLD.boat_id);
    IF ro THEN
        RAISE EXCEPTION 'Ausruestung eines verkauften (schreibgeschuetzten) Bootes kann nicht geaendert werden.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_block_readonly_equipment ON public.equipment;
CREATE TRIGGER trg_block_readonly_equipment
    BEFORE INSERT OR UPDATE ON public.equipment
    FOR EACH ROW EXECUTE FUNCTION public.block_readonly_equipment_write();

-- ── Kind-Tabellen (equipment_id): INSERT/UPDATE sperren, wenn das Boot
--    hinter der Ausruestung read_only ist.
CREATE OR REPLACE FUNCTION public.block_readonly_child_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE ro BOOLEAN;
BEGIN
    SELECT b.read_only INTO ro
        FROM public.equipment e
        JOIN public.boats b ON b.id = e.boat_id
        WHERE e.id = COALESCE(NEW.equipment_id, OLD.equipment_id);
    IF ro THEN
        RAISE EXCEPTION 'Daten eines verkauften (schreibgeschuetzten) Bootes koennen nicht geaendert werden.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END; $$;

DO $$
DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['equipment_photos','sail_measurements','rope_configurations','maintenance_history']
    LOOP
        IF to_regclass('public.' || tbl) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_block_readonly_child ON public.%I', tbl);
            EXECUTE format(
                'CREATE TRIGGER trg_block_readonly_child BEFORE INSERT OR UPDATE ON public.%I
                 FOR EACH ROW EXECUTE FUNCTION public.block_readonly_child_write()', tbl);
        END IF;
    END LOOP;
END $$;
