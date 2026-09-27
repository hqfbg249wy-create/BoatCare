-- 163_search_suggest_facets.sql
-- Amazon-artige Sucherlebnis-Bausteine, zentral in der DB:
--   1) suggest_products(): Vorschlaege beim Tippen (Kategorien, Hersteller,
--      Produktnamen) - mit Tippfehler-Toleranz.
--   2) search_product_facets(): Eingrenzungs-Chips = die haeufigsten
--      Kategorien innerhalb der aktuellen Treffermenge (nutzt search_products).

-- ── 1) Vorschlaege ──
CREATE OR REPLACE FUNCTION public.suggest_products(
  q text,
  p_limit int DEFAULT 8
) RETURNS TABLE(suggestion text, kind text, category_id uuid)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
#variable_conflict use_column
DECLARE
  v_q text := btrim(regexp_replace(extensions.unaccent(lower(coalesce(q, ''))), '[^a-z0-9 ]', ' ', 'g'));
BEGIN
  IF length(v_q) < 2 THEN RETURN; END IF;

  RETURN QUERY
  WITH cats AS (   -- Kategorien mit dem Tippanfang als Teilstring (Komposita!)
    SELECT c.name_de AS suggestion, 'category'::text AS kind, c.id AS category_id,
           1 AS prio, 1000000::bigint AS ord,
           CASE WHEN extensions.unaccent(lower(coalesce(c.name_de,'') || ' ' || coalesce(c.name_en,''))) ~ ('\y' || v_q) THEN 0 ELSE 1 END AS pfx
    FROM public.product_categories c
    WHERE extensions.unaccent(lower(coalesce(c.name_de,'') || ' ' || coalesce(c.name_en,''))) LIKE '%' || v_q || '%'
  ),
  mans AS (        -- Hersteller nach Haeufigkeit
    SELECT p.manufacturer AS suggestion, 'manufacturer'::text AS kind, NULL::uuid AS category_id,
           2 AS prio, count(*)::bigint AS ord,
           CASE WHEN extensions.unaccent(lower(p.manufacturer)) ~ ('\y' || v_q) THEN 0 ELSE 1 END AS pfx
    FROM public.metashop_products p
    WHERE p.is_active AND p.manufacturer IS NOT NULL AND p.manufacturer <> ''
      AND extensions.unaccent(lower(p.manufacturer)) LIKE '%' || v_q || '%'
    GROUP BY p.manufacturer
  ),
  prods AS (       -- Produktnamen (Kurzform); Wortanfaenge zuerst
    SELECT DISTINCT ON (lower(p.name)) p.name AS suggestion, 'product'::text AS kind, NULL::uuid AS category_id,
           3 AS prio, 0::bigint AS ord,
           CASE WHEN extensions.unaccent(lower(p.name)) ~ ('\y' || v_q) THEN 0 ELSE 1 END AS pfx
    FROM public.metashop_products p
    WHERE p.is_active AND extensions.unaccent(lower(coalesce(p.name,''))) LIKE '%' || v_q || '%'
    LIMIT 40
  ),
  unioned AS (
    SELECT * FROM cats
    UNION ALL SELECT * FROM mans
    UNION ALL SELECT * FROM prods
  ),
  dedup AS (       -- pro Label nur der beste Eintrag
    SELECT DISTINCT ON (lower(suggestion)) suggestion, kind, category_id, prio, ord, pfx
    FROM unioned
    WHERE suggestion IS NOT NULL AND suggestion <> ''
    ORDER BY lower(suggestion), prio, ord DESC
  )
  SELECT d.suggestion, d.kind, d.category_id
  FROM dedup d
  ORDER BY d.pfx, d.prio, d.ord DESC, length(d.suggestion), lower(d.suggestion)
  LIMIT p_limit;
END $$;

GRANT EXECUTE ON FUNCTION public.suggest_products(text, int) TO anon, authenticated;

-- ── 2) Eingrenzungs-Chips (Kategorien der Treffermenge) ──
CREATE OR REPLACE FUNCTION public.search_product_facets(
  q text,
  p_provider uuid DEFAULT NULL,
  p_scan int DEFAULT 2000,
  p_limit int DEFAULT 12
) RETURNS TABLE(
  category_id uuid, name_de text, name_en text, name_fr text,
  name_it text, name_es text, name_nl text, cnt bigint
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name_de, c.name_en, c.name_fr, c.name_it, c.name_es, c.name_nl,
         count(*)::bigint AS cnt
  FROM public.search_products(q, NULL, p_provider, p_scan, 0) sp
  JOIN public.product_categories c ON c.id = sp.category_id
  GROUP BY c.id, c.name_de, c.name_en, c.name_fr, c.name_it, c.name_es, c.name_nl
  ORDER BY count(*) DESC, c.name_de
  LIMIT p_limit;
END $$;

GRANT EXECUTE ON FUNCTION public.search_product_facets(text, uuid, int, int) TO anon, authenticated;
