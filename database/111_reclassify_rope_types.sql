-- ============================================================
-- Migration 111 (VORSCHLAG — bitte prüfen, DANN einspielen)
-- Reklassifizierung bestehender Tauwerk-Ausrüstung → rope_type
-- ============================================================
-- Ordnet vorhandene Equipment-Einträge der Kategorie Tauwerk "soweit möglich"
-- den 5 Tauwerk-Arten zu, anhand von Stichwörtern in Name/Modell/Hersteller.
-- Nur bisher NICHT klassifizierte Einträge (rope_type IS NULL) werden gesetzt;
-- was nicht eindeutig ist, bleibt NULL (manuell nachpflegbar).
--
-- Setzt Migration 110 voraus (Spalte equipment.rope_type).
--
-- TIPP: Zuerst die SELECT-Vorschau unten laufen lassen und die Treffer
-- kontrollieren, erst danach das UPDATE ausführen.
-- ============================================================

-- 1) VORSCHAU (ändert nichts) — zeigt, was zugeordnet WÜRDE:
--
-- SELECT id, name, model, manufacturer,
--   CASE
--     WHEN h ILIKE '%hohlgeflecht%' OR h ILIKE '%brummel%'          THEN 'dyneema_hohlgeflecht'
--     WHEN h ILIKE '%squareline%'   OR h ILIKE '%square line%'      THEN 'squareline'
--     WHEN (h ILIKE '%dyneema%' OR h ILIKE '%kern-in-kern%')
--          AND (h ILIKE '%geflocht%' OR h ILIKE '%geflecht%')       THEN 'pes_dyneema'
--     WHEN h ILIKE '%dyneema%'                                      THEN 'pes_dyneema'
--     WHEN h ILIKE '%kern-mantel%' OR h ILIKE '%kernmantel%'
--          OR h ILIKE '%geflocht%'  OR h ILIKE '%geflecht%'         THEN 'kern_mantel'
--     WHEN h ILIKE '%geschlagen%' OR h ILIKE '%gedreht%'
--          OR h ILIKE '%litzig%'    OR h ILIKE '%laid%'             THEN 'geschlagen'
--     ELSE NULL
--   END AS vorschlag
-- FROM (
--   SELECT *, coalesce(name,'')||' '||coalesce(model,'')||' '||coalesce(manufacturer,'') AS h
--   FROM equipment
--   WHERE lower(category) IN ('rope','tauwerk') AND rope_type IS NULL
-- ) q;

-- 2) UPDATE (schreibt die Zuordnung):
UPDATE equipment AS e
SET rope_type = CASE
    WHEN h ILIKE '%hohlgeflecht%' OR h ILIKE '%brummel%'          THEN 'dyneema_hohlgeflecht'
    WHEN h ILIKE '%squareline%'   OR h ILIKE '%square line%'      THEN 'squareline'
    WHEN (h ILIKE '%dyneema%' OR h ILIKE '%kern-in-kern%')
         AND (h ILIKE '%geflocht%' OR h ILIKE '%geflecht%')       THEN 'pes_dyneema'
    WHEN h ILIKE '%dyneema%'                                      THEN 'pes_dyneema'
    WHEN h ILIKE '%kern-mantel%' OR h ILIKE '%kernmantel%'
         OR h ILIKE '%geflocht%'  OR h ILIKE '%geflecht%'         THEN 'kern_mantel'
    WHEN h ILIKE '%geschlagen%' OR h ILIKE '%gedreht%'
         OR h ILIKE '%litzig%'    OR h ILIKE '%laid%'             THEN 'geschlagen'
    ELSE NULL
  END
FROM (
    SELECT id, coalesce(name,'')||' '||coalesce(model,'')||' '||coalesce(manufacturer,'') AS h
    FROM equipment
    WHERE lower(category) IN ('rope','tauwerk') AND rope_type IS NULL
) src
WHERE e.id = src.id
  AND CASE
    WHEN src.h ILIKE '%hohlgeflecht%' OR src.h ILIKE '%brummel%'          THEN 'dyneema_hohlgeflecht'
    WHEN src.h ILIKE '%squareline%'   OR src.h ILIKE '%square line%'      THEN 'squareline'
    WHEN (src.h ILIKE '%dyneema%' OR src.h ILIKE '%kern-in-kern%')
         AND (src.h ILIKE '%geflocht%' OR src.h ILIKE '%geflecht%')       THEN 'pes_dyneema'
    WHEN src.h ILIKE '%dyneema%'                                          THEN 'pes_dyneema'
    WHEN src.h ILIKE '%kern-mantel%' OR src.h ILIKE '%kernmantel%'
         OR src.h ILIKE '%geflocht%'  OR src.h ILIKE '%geflecht%'         THEN 'kern_mantel'
    WHEN src.h ILIKE '%geschlagen%' OR src.h ILIKE '%gedreht%'
         OR src.h ILIKE '%litzig%'    OR src.h ILIKE '%laid%'             THEN 'geschlagen'
    ELSE NULL
  END IS NOT NULL;
