-- 153_find_rope_providers.sql
-- Zentrale Tauwerk-Anbietersuche in der DB (statt in jedem Frontend dupliziert).
-- Clients rufen nur noch diese RPC (via Edge-Adapter) auf; Regeländerungen
-- passieren damit NUR hier, ohne Portale/iOS neu zu bauen.
--
-- Treffer-Logik (nach Priorität):
--   Stark (score 3): Leistung enthält Tauwerk (mehrsprachig), ODER der Shop
--     (metashop_products) führt Tauwerk-artige Produkte, ODER der Firmenname
--     nennt explizit Tauwerkhandel (Touwhandel, Tauwerk Discount, Premium Ropes).
--   Schwach (score 1): nur passende Kategorie (Segelmacher/Rigger/Takelage) —
--     aber NUR, wenn der Betrieb nicht klar fachfremd ist (Kran/Propeller/
--     Finanz/Charter/Yachting ...). So fliegen falsch kategorisierte Firmen raus.

CREATE OR REPLACE FUNCTION public.find_rope_providers()
RETURNS TABLE (
  id uuid, name text, city text, country text,
  category text, rating numeric, has_email boolean, score integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT
      p.id, p.name, p.city, p.country, p.category, p.rating, p.email,
      lower(coalesce(p.name, ''))                                             AS lname,
      lower(concat_ws(' ', p.category, p.category2, p.category3,
                      array_to_string(p.categories, ' ')))                    AS lcats,
      lower(array_to_string(p.services, ' '))                                 AS lsvcs
    FROM public.service_providers p
  ),
  sig AS (
    SELECT b.*,
      -- Leistung „Tauwerk" (mehrsprachig, Wortgrenze gegen Treffer wie „Europe")
      (b.lsvcs ~ '\y(tauwerk|tauw|touw|rope|ropes|cordage|cordame|cordes|cabo|cima|drisse|ecoute|spleiss|spleiß|splice|festmacher|takelage|leine|laufendes gut|running rigging)') AS svc_hit,
      -- Shop führt Tauwerk-Produkte
      EXISTS (
        SELECT 1 FROM public.metashop_products m
        WHERE m.provider_id = b.id AND coalesce(m.is_active, true)
          AND (lower(coalesce(m.name, ''))     ~ '\y(tauwerk|touw|rope|cordage|spleiss|festmacher|leine)'
            OR lower(coalesce(m.category, ''))  ~ '\y(tauwerk|rope|rigg|takelage)')
      ) AS shop_hit,
      -- Name nennt explizit Tauwerkhandel
      (b.lname ~ '\y(tauwerk|tauw|touw|rope|ropes|spleiss|spleiß|cordage)|premium ?ropes?|touwhandel|tauwerkhandel|tauwerk[- ]?discount') AS name_hit,
      -- Passende Kategorie
      (b.lcats ~ '\y(segelmacher|sailmaker|rigger|takler|takelage|rigg)') AS cat_hit,
      -- Klar fachfremd
      ((b.lname || ' ' || b.lcats) ~ '(propeller|motorservice|motoren|\ykran\y|crane|finance|finanz|versicherung|insurance|makler|broker|immobilien|charter|yachting|gutachter|survey)') AS excl_hit
    FROM base b
  )
  SELECT id, name, city, country, category, rating,
         (email IS NOT NULL AND email <> '') AS has_email,
         CASE WHEN svc_hit OR shop_hit OR name_hit THEN 3 ELSE 1 END AS score
  FROM sig
  WHERE (svc_hit OR shop_hit OR name_hit)      -- starke Signale immer aufnehmen
     OR (cat_hit AND NOT excl_hit)             -- Kategorie nur ohne Fachfremd-Signal
  ORDER BY score DESC, rating DESC NULLS LAST, name;
$$;

REVOKE ALL ON FUNCTION public.find_rope_providers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_rope_providers() TO authenticated;
