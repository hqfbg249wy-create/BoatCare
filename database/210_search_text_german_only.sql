-- 210_search_text_german_only.sql
-- Behebt "falsche Freunde" der Shop-Suche (z. B. deutsche "Hose" matchte ueber
-- die ENGLISCHE Uebersetzung "hose" = Schlauch die TUBO-/Schlauch-Produkte).
--
-- Ursache: Migration 208 hat ALLE Sprach-Uebersetzungen in search_text gepackt.
-- Bei sprachuebergreifenden Homographen (de Hose = en hose) fuehrt das zu
-- Fehltreffern.
--
-- Fix: In search_text nur noch Original + DEUTSCHE Produktuebersetzung
-- aufnehmen (Zielmarkt deutschsprachig). Die uebrigen Sprachen (en/it/nl/fr/es)
-- bleiben in der translations-Spalte fuer die ANZEIGE erhalten, verschmutzen
-- aber nicht mehr den Suchindex. Kategorie-Uebersetzungen bleiben wie bisher
-- (kurz, kuratiert, geringe Kollisionsgefahr).
--
-- Hinweis: Mehrsprachige Suche (jede UI-Sprache sucht in ihrer eigenen
-- Uebersetzung) waere der saubere Ausbau spaeter; dafuer muesste die RPC die
-- Sprache als Parameter erhalten und die Clients sie mitsenden.

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

  -- Nur die DEUTSCHE Produktuebersetzung (name + description) anhaengen.
  IF NEW.translations ? 'de' THEN
    v_tr := coalesce(NEW.translations->'de'->>'name','') || ' ' ||
            coalesce(NEW.translations->'de'->>'description','');
    IF length(btrim(v_tr)) > 0 THEN
      NEW.search_text := NEW.search_text || ' ' || extensions.unaccent(lower(v_tr));
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- Rebuild aller Zeilen (feuert den Trigger).
UPDATE public.metashop_products SET translations = translations;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 210: search_text nur Original + deutsche Uebersetzung (keine sprachuebergreifenden Fehltreffer mehr).';
END $$;
