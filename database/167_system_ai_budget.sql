-- 167_system_ai_budget.sql
-- Harter Tages-Deckel fuer SYSTEM-getriggerte KI-Calls (Uebersetzungen,
-- Admin-Marktbericht u. a.). Diese laufen ohne Nutzer-Kontingent und koennten
-- sonst bei Massenvorgaengen (Katalog-Import, Cron) unkontrolliert Kosten
-- verursachen. bump_system_ai() zaehlt atomar hoch und liefert false, sobald
-- das Tageslimit erreicht ist -> die Funktion bricht den teuren API-Call ab.

CREATE TABLE IF NOT EXISTS public.ai_system_usage (
  day   date PRIMARY KEY,
  calls integer NOT NULL DEFAULT 0
);

-- Atomar: wenn heute noch unter dem Limit -> +1 und true, sonst false.
CREATE OR REPLACE FUNCTION public.bump_system_ai(p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calls integer;
BEGIN
  INSERT INTO public.ai_system_usage (day, calls)
    VALUES (CURRENT_DATE, 1)
  ON CONFLICT (day) DO UPDATE
    SET calls = public.ai_system_usage.calls + 1
    WHERE public.ai_system_usage.calls < p_max
  RETURNING calls INTO v_calls;

  -- v_calls ist NULL, wenn das ON CONFLICT-UPDATE wegen der WHERE-Bedingung
  -- (Limit erreicht) NICHT ausgefuehrt wurde.
  RETURN v_calls IS NOT NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.bump_system_ai(integer) TO anon, authenticated, service_role;
