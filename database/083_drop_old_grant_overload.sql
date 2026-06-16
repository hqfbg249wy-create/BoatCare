-- Migration 083: alte 3-Argument-Version von admin_grant_subscription entfernen
--
-- 082 hat per CREATE OR REPLACE eine NEUE Signatur (mit p_level) angelegt —
-- die 3-Argument-Variante blieb aber bestehen. Dadurch existierten zwei
-- Overloads und PostgREST/Postgres meldete:
--   "Could not choose the best candidate function between ..."
--
-- Lösung: alte 3-arg-Funktion droppen. Die 4-arg-Version (p_level DEFAULT
-- 'enterprise') deckt auch Aufrufe ohne p_level ab.

DROP FUNCTION IF EXISTS admin_grant_subscription(uuid, integer, text);
