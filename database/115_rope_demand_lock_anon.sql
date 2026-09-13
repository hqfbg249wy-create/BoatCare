-- ============================================================
-- Migration 115: get_rope_demand strikt auf eingeloggte Provider begrenzen
-- ============================================================
-- Migration 114 hat nur FROM PUBLIC widerrufen. Supabase gewährt `anon`
-- jedoch häufig ein DIREKTES EXECUTE (Default-Privileg) — deshalb konnte
-- anon die Tauwerk-Nachfrage trotzdem abrufen. Hier explizit für anon
-- widerrufen; nur `authenticated` (eingeloggte Provider) darf sie ausführen.
-- ============================================================

REVOKE ALL ON FUNCTION public.get_rope_demand() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_rope_demand() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_rope_demand() TO authenticated;
