-- =====================================================================
-- 181_boat_transfer_kept_equipment.sql
-- Beim Bootsverkauf kann der Verkaeufer einzelne Ausruestungsgegenstaende
-- BEHALTEN (z. B. Elektronik, die aufs neue Boot uebernommen wird). Diese
-- Teile werden NICHT an den Kaeufer uebertragen und wandern beim Einloesen
-- auf ein neues, editierbares Boot des Verkaeufers; das Original wird mit dem
-- Rest eingefroren (siehe 180).
--
-- Hier nur die Speicherung der Auswahl; die Logik macht redeem-boat-transfer.
-- =====================================================================

ALTER TABLE public.boat_transfers
    ADD COLUMN IF NOT EXISTS kept_equipment_ids UUID[] NOT NULL DEFAULT '{}';
