-- 130_customer_number.sql
-- Fortlaufende Kundennummer für jeden registrierten Account (profiles).
--
-- Jeder Account bekommt automatisch eine eindeutige, fortlaufende Nummer
-- (Sequenz ab 10001). Bestehende Accounts werden in Reihenfolge ihrer
-- Registrierung (created_at) nachnummeriert; neue Accounts erhalten die Nummer
-- automatisch per BEFORE-INSERT-Trigger.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.customer_number_seq START WITH 10001 INCREMENT BY 1;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS customer_number BIGINT UNIQUE;

-- Backfill: bestehende Profile in Registrierungs-Reihenfolge nummerieren.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.profiles
    WHERE customer_number IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.profiles
       SET customer_number = nextval('public.customer_number_seq')
     WHERE id = r.id;
  END LOOP;
END $$;

-- Neue Profile automatisch nummerieren.
CREATE OR REPLACE FUNCTION public.assign_customer_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.customer_number IS NULL THEN
    NEW.customer_number := nextval('public.customer_number_seq');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_customer_number ON public.profiles;
CREATE TRIGGER trg_assign_customer_number
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_customer_number();

-- Rechte auf die Sequenz (Insert-Pfade laufen als authenticated bzw. service_role).
GRANT USAGE, SELECT ON SEQUENCE public.customer_number_seq TO authenticated, service_role;

COMMIT;
