-- 208_search_text_with_translations.sql
-- GENERISCHE Mehrsprachigkeit der Shop-Suche: die bereits vorhandenen
-- Produkt-Uebersetzungen (Spalte translations: {lang:{name,description}})
-- fliessen in search_text ein. Damit findet z. B. eine deutsche Suche "Hose"
-- das Produkt "PANTALONE ..." ueber seine deutsche Uebersetzung "HOSE ..."
-- OHNE einzelne Synonyme. Gilt automatisch fuer jedes uebersetzte Produkt in
-- jeder Sprache.
--
-- Umsetzung: Die Trigger-Funktion haengt nach dem Basis-search_text die
-- Uebersetzungen (alle Sprachen, name + description) unakzentuiert/klein an.
-- Der Trigger feuert zusaetzlich bei Aenderung der Spalte translations.
-- Einmaliger Rebuild aller Produkte am Ende.

-- ── Trigger-Funktion: Basis-search_text + Uebersetzungen ──
CREATE OR REPLACE FUNCTION public.trg_metashop_search_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_tr text;
BEGIN
  NEW.search_text := public.metashop_search_text(
    NEW.name, NEW.manufacturer, NEW.description, NEW.part_number,
    NEW.ean, NEW.tags, NEW.category, NEW.category_id);

  -- Produkt-Uebersetzungen (alle Sprachen: name + description) anhaengen.
  IF NEW.translations IS NOT NULL THEN
    SELECT string_agg(
             coalesce(t.value->>'name','') || ' ' || coalesce(t.value->>'description',''),
             ' ')
      INTO v_tr
    FROM jsonb_each(NEW.translations) AS t;

    IF v_tr IS NOT NULL AND length(btrim(v_tr)) > 0 THEN
      NEW.search_text := NEW.search_text || ' ' || extensions.unaccent(lower(v_tr));
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ── Trigger neu anlegen, jetzt auch bei Aenderung von translations ──
DROP TRIGGER IF EXISTS metashop_search_text_upd ON public.metashop_products;
CREATE TRIGGER metashop_search_text_upd
BEFORE INSERT OR UPDATE OF
  name, manufacturer, description, part_number, ean, tags, category, category_id, translations
ON public.metashop_products
FOR EACH ROW EXECUTE FUNCTION public.trg_metashop_search_text();

-- ── Einmaliger Rebuild: feuert den Trigger fuer alle Zeilen ──
UPDATE public.metashop_products SET translations = translations;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 208: search_text enthaelt jetzt die Produkt-Uebersetzungen (generische Mehrsprachigkeit). "Hose" findet uebersetzte "Pantalone"-Produkte.';
END $$;
