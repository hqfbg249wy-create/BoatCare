-- ============================================================
-- Migration 114: Aggregierte Tauwerk-Nachfrage für die Marktanalyse
-- ============================================================
-- Provider sollen in der Marktanalyse sehen, welches Tauwerk in welcher
-- Konfiguration nachgefragt wird → gezielte Angebote. rope_configurations
-- ist Kundendaten (RLS: nur Eigner). Diese SECURITY-DEFINER-Funktion liefert
-- ausschließlich ANONYME Aggregate (Konfiguration + Anzahl), KEINE
-- Kundenbezüge (kein equipment_id, keine notes, keine article_number).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_rope_demand()
RETURNS TABLE (
  material        text,
  diameter_mm     numeric,
  end1            text,
  end2            text,
  req_count       bigint,
  avg_length_m    numeric,
  total_length_m  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(NULLIF(trim(material), ''), 'unbekannt') AS material,
    diameter_mm,
    end1,
    end2,
    count(*)                       AS req_count,
    round(avg(length_m), 1)        AS avg_length_m,
    round(sum(length_m), 1)        AS total_length_m
  FROM public.rope_configurations
  GROUP BY 1, diameter_mm, end1, end2
  ORDER BY req_count DESC, total_length_m DESC NULLS LAST
  LIMIT 200;
$$;

-- Nur eingeloggte Provider (authenticated). Aggregat ist anonym.
-- WICHTIG: anon EXPLIZIT widerrufen — Supabase gewährt anon oft ein direktes
-- EXECUTE per Default-Privileg, das ein reines "FROM PUBLIC" nicht entfernt.
REVOKE ALL ON FUNCTION public.get_rope_demand() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_rope_demand() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_rope_demand() TO authenticated;
