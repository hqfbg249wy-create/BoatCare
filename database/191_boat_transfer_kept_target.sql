-- =====================================================================
-- 191_boat_transfer_kept_target — Ziel-Schiff für behaltene Ausrüstung.
-- Beim Übergeben wählt der Verkäufer, wohin die von ihm behaltene
-- Ausrüstung wandert: ein NEUES Schiff (benannt, wird beim Einlösen
-- angelegt) ODER ein VORHANDENES Schiff des Verkäufers.
--   - kept_target_boat_id: vorhandenes Schiff des Verkäufers (Vorrang)
--   - kept_new_boat_name:  Name für ein neu anzulegendes Schiff
-- Ist beides leer, legt redeem-boat-transfer wie bisher automatisch ein
-- "<Name> (behalten)"-Schiff an (Abwärtskompatibilität alter Keys).
-- =====================================================================

ALTER TABLE public.boat_transfers
    ADD COLUMN IF NOT EXISTS kept_target_boat_id UUID REFERENCES public.boats(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS kept_new_boat_name  TEXT;
