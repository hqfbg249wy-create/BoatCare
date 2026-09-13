-- ============================================================
-- Migration 118: Tauwerk-Maße ins Equipment.dimensions übernehmen
-- ============================================================
-- Die Kopfzeile der Ersatzteilsuche zeigt equipment.dimensions.
-- Für Tauwerk soll dort "Länge in m · Ø Stärke in mm" stehen
-- (früher landete die Länge fälschlich in mm bzw. gar nicht).
-- Diese einmalige Backfill baut den String aus der jeweils
-- neuesten rope_configurations-Zeile je Equipment.
-- Neue/aktualisierte Konfigurationen schreiben den String selbst
-- (App + Web).
-- ============================================================

UPDATE equipment e
SET dimensions = sub.dims
FROM (
    SELECT DISTINCT ON (rc.equipment_id)
        rc.equipment_id,
        trim(both ' · ' FROM concat_ws(' · ',
            CASE WHEN rc.length_m IS NOT NULL THEN
                (CASE WHEN rc.length_m = trunc(rc.length_m)
                      THEN trunc(rc.length_m)::text
                      ELSE rc.length_m::text END) || ' m'
            END,
            CASE WHEN rc.diameter_mm IS NOT NULL THEN
                'Ø ' || (CASE WHEN rc.diameter_mm = trunc(rc.diameter_mm)
                              THEN trunc(rc.diameter_mm)::text
                              ELSE rc.diameter_mm::text END) || ' mm'
            END
        )) AS dims
    FROM rope_configurations rc
    ORDER BY rc.equipment_id, rc.created_at DESC
) sub
WHERE e.id = sub.equipment_id
  AND sub.dims <> '';
