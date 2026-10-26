-- =====================================================================
-- 196_news_post_public — Öffentlich lesbarer Einzelbeitrag für die
-- Landingpage (geteilte Links). Liefert NUR veröffentlichte Beiträge und
-- nur unkritische Felder (Titel/Text/Autor-Snapshot/Medien). SECURITY
-- DEFINER + Grant an anon, damit nicht eingeloggte Besucher den geteilten
-- Beitrag sehen (ohne Zugriff auf die Tabelle selbst).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.news_post_public(p_id UUID)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id',                p.id,
    'kind',              p.kind,
    'title',             p.title,
    'subtitle',          p.subtitle,
    'body',              p.body,
    'boat_ref',          p.boat_ref,
    'equipment_ref',     p.equipment_ref,
    'author_name',       p.author_name,
    'author_avatar_url', p.author_avatar_url,
    'created_at',        p.created_at,
    'media', coalesce((
      SELECT jsonb_agg(jsonb_build_object('url', m.url, 'media_type', m.media_type) ORDER BY m.sort_order)
      FROM public.news_post_media m WHERE m.post_id = p.id
    ), '[]'::jsonb)
  )
  FROM public.news_posts p
  WHERE p.id = p_id AND p.status = 'published';
$$;

GRANT EXECUTE ON FUNCTION public.news_post_public(UUID) TO anon, authenticated;
