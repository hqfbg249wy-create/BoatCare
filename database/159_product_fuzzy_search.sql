-- 159_product_fuzzy_search.sql
-- Unscharfe Produktsuche (Amazon-artig), zentral in der DB, damit iOS und Web
-- identisch profitieren. Kernursachen der bisherigen Nulltreffer:
--   * Suche lief nur ueber name (iOS) bzw. name/manufacturer/description (Web).
--   * Die KATEGORIE war gar nicht im Suchraum -> "Kleidung" fand kein Produkt
--     namens "Jacke" in der Kategorie "Funktionskleidung".
-- Loesung:
--   1) Wartungsfreies, indexiertes search_text-Feld (inkl. Kategorienamen).
--   2) Synonym-Tabelle (Kleidung=Bekleidung=clothing ...), datengetrieben.
--   3) RPC search_products(): Token-UND-Suche ueber search_text + Synonyme,
--      Trigramm-Fallback fuer Tippfehler, Relevanz-Ranking. Gibt SETOF
--      metashop_products zurueck -> Clients koennen wie gewohnt joinen/embedden.

-- ── Extensions ──
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ── 1) search_text-Spalte + Pflege-Trigger ──
ALTER TABLE public.metashop_products ADD COLUMN IF NOT EXISTS search_text text;

-- Baut den normalisierten Suchtext einer Produktzeile: alle relevanten Felder
-- + die Kategorienamen aller Sprachen. Lowercased + unaccent -> Vergleich
-- unabhaengig von Gross/Klein und Akzenten.
CREATE OR REPLACE FUNCTION public.metashop_search_text(
  p_name text, p_manufacturer text, p_description text, p_part_number text,
  p_ean text, p_tags text[], p_category text, p_category_id uuid
) RETURNS text
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT extensions.unaccent(lower(
    coalesce(p_name,'') || ' ' || coalesce(p_manufacturer,'') || ' ' ||
    coalesce(p_description,'') || ' ' || coalesce(p_part_number,'') || ' ' ||
    coalesce(p_ean,'') || ' ' || coalesce(array_to_string(p_tags,' '),'') || ' ' ||
    coalesce(p_category,'') || ' ' ||
    coalesce((SELECT coalesce(c.name_de,'')||' '||coalesce(c.name_en,'')||' '||
                     coalesce(c.name_fr,'')||' '||coalesce(c.name_it,'')||' '||
                     coalesce(c.name_es,'')||' '||coalesce(c.name_nl,'')
              FROM public.product_categories c WHERE c.id = p_category_id), '')
  ));
$$;

CREATE OR REPLACE FUNCTION public.trg_metashop_search_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  NEW.search_text := public.metashop_search_text(
    NEW.name, NEW.manufacturer, NEW.description, NEW.part_number,
    NEW.ean, NEW.tags, NEW.category, NEW.category_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS metashop_search_text_upd ON public.metashop_products;
CREATE TRIGGER metashop_search_text_upd
  BEFORE INSERT OR UPDATE OF name, manufacturer, description, part_number, ean, tags, category, category_id
  ON public.metashop_products
  FOR EACH ROW EXECUTE FUNCTION public.trg_metashop_search_text();

-- Wird eine Kategorie umbenannt, die betroffenen Produkte neu berechnen
-- (No-op-Update feuert den Zeilen-Trigger).
CREATE OR REPLACE FUNCTION public.trg_category_rename_refresh()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.metashop_products SET category_id = category_id WHERE category_id = NEW.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS product_categories_rename_refresh ON public.product_categories;
CREATE TRIGGER product_categories_rename_refresh
  AFTER UPDATE OF name_de, name_en, name_fr, name_it, name_es, name_nl
  ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.trg_category_rename_refresh();

-- Backfill bestehender Produkte
UPDATE public.metashop_products SET search_text = public.metashop_search_text(
  name, manufacturer, description, part_number, ean, tags, category, category_id);

-- Trigramm-Index fuer schnelle ILIKE '%term%'-Treffer
CREATE INDEX IF NOT EXISTS idx_metashop_search_text_trgm
  ON public.metashop_products USING gin (search_text extensions.gin_trgm_ops);

-- ── 2) Synonym-Tabelle ──
CREATE TABLE IF NOT EXISTS public.search_synonyms (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  terms text[] NOT NULL          -- Gruppe wechselseitiger Synonyme (lower, unaccent)
);

-- Idempotenter Seed: nur einfuegen, wenn Tabelle leer.
INSERT INTO public.search_synonyms (terms)
SELECT * FROM (VALUES
  (ARRAY['kleidung','bekleidung','funktionskleidung','clothing','apparel','textilien','outfit','garment']),
  (ARRAY['jacke','jacken','jacket','jackets','weste','westen','vest']),
  (ARRAY['hose','hosen','pants','trousers','shorts','bermuda']),
  (ARRAY['polo','polos','poloshirt','poloshirts']),
  (ARRAY['shirt','shirts','tshirt','tshirts','oberteil']),
  (ARRAY['pullover','pulli','sweater','sweatshirt','hoodie','fleece']),
  (ARRAY['schuh','schuhe','shoes','stiefel','boots','segelschuhe','deckschuhe']),
  (ARRAY['muetze','mutze','cap','beanie','kappe','hat','hut']),
  (ARRAY['handschuh','handschuhe','gloves','segelhandschuhe']),
  (ARRAY['regenjacke','oelzeug','olzeug','oilskin','regenkleidung','foulies','regenhose']),
  (ARRAY['schwimmweste','rettungsweste','lifejacket','auftriebshilfe','lifebelt']),
  (ARRAY['tau','tauwerk','leine','leinen','rope','ropes','schot','schoten','fall','faelle','festmacher']),
  (ARRAY['anker','ankerkette','anchor','ankerleine']),
  (ARRAY['fender','fenders','abweiser']),
  (ARRAY['batterie','batterien','akku','akkus','battery','batteries']),
  (ARRAY['motor','motoren','engine','engines','antrieb']),
  (ARRAY['reinigung','reiniger','cleaner','cleaners','pflege','care'])
) AS v(terms)
WHERE NOT EXISTS (SELECT 1 FROM public.search_synonyms);

GRANT SELECT ON public.search_synonyms TO anon, authenticated;

-- ── 3) RPC: unscharfe Produktsuche ──
CREATE OR REPLACE FUNCTION public.search_products(
  q text,
  p_category uuid DEFAULT NULL,
  p_provider uuid DEFAULT NULL,
  p_limit int DEFAULT 40,
  p_offset int DEFAULT 0
) RETURNS SETOF public.metashop_products
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_q      text := extensions.unaccent(lower(coalesce(q, '')));
  v_tokens text[];
  tok      text;
  grp      text[];
  term     text;
  cond     text;
  parts    text[] := '{}';
  v_where  text;
  v_sql    text;
BEGIN
  -- Wort-Aehnlichkeits-Schwelle fuer Tippfehler-Toleranz (Operator <%),
  -- lokal fuer diese Funktion. Etwas lockerer als der Default (0.6).
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.45', true);

  -- Tokens: an Nicht-Alphanumerik trennen, min. 2 Zeichen, max. 6 Tokens.
  SELECT array_agg(t) INTO v_tokens FROM (
    SELECT t FROM regexp_split_to_table(v_q, '[^[:alnum:]]+') AS t
    WHERE length(t) >= 2
    LIMIT 6
  ) s;

  -- Ohne brauchbares Token: normale (gefilterte) Liste zurueckgeben.
  IF v_tokens IS NULL OR array_length(v_tokens, 1) IS NULL THEN
    RETURN QUERY
      SELECT p.* FROM public.metashop_products p
      WHERE p.is_active
        AND (p_category IS NULL OR p.category_id = p_category)
        AND (p_provider IS NULL OR p.provider_id = p_provider)
      ORDER BY p.created_at DESC, p.id
      LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- Je Token eine (Synonym-erweiterte) ODER-Gruppe gegen search_text bauen.
  FOREACH tok IN ARRAY v_tokens LOOP
    SELECT array_agg(DISTINCT x) INTO grp FROM (
      SELECT tok AS x
      UNION
      SELECT unnest(s.terms) FROM public.search_synonyms s WHERE tok = ANY(s.terms)
    ) g;
    IF grp IS NULL THEN grp := ARRAY[tok]; END IF;

    cond := '';
    FOREACH term IN ARRAY grp LOOP
      IF cond <> '' THEN cond := cond || ' OR '; END IF;
      cond := cond || format('b.search_text LIKE %L', '%' || term || '%');
    END LOOP;
    -- Tippfehler-Toleranz: Token ist einem Wort in search_text aehnlich
    -- genug (index-gestuetzter <%-Operator). Nur ab 3 Zeichen sinnvoll.
    IF length(tok) >= 3 THEN
      cond := cond || format(' OR (%L <%% b.search_text)', tok);
    END IF;
    parts := parts || ('(' || cond || ')');
  END LOOP;

  v_where := array_to_string(parts, ' AND ');

  v_sql := format($f$
    SELECT b.* FROM public.metashop_products b
    WHERE b.is_active
      AND (%L::uuid IS NULL OR b.category_id = %L::uuid)
      AND (%L::uuid IS NULL OR b.provider_id = %L::uuid)
      AND ( (%s) OR extensions.similarity(coalesce(b.search_text,''), %L) > 0.30 )
    ORDER BY
      (extensions.unaccent(lower(coalesce(b.name,''))) = %L) DESC,          -- exakter Name
      (extensions.unaccent(lower(coalesce(b.name,''))) LIKE %L) DESC,       -- Name beginnt mit
      extensions.similarity(coalesce(b.name,''), %L) DESC,                  -- Namensaehnlichkeit
      b.created_at DESC, b.id
    LIMIT %s OFFSET %s
  $f$,
    p_category, p_category, p_provider, p_provider,
    v_where, v_q,
    v_q, v_q || '%', v_q,
    p_limit, p_offset
  );

  RETURN QUERY EXECUTE v_sql;
END $$;

GRANT EXECUTE ON FUNCTION public.search_products(text, uuid, uuid, int, int) TO anon, authenticated;
