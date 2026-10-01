-- 174_admin_list_announcements.sql
-- Verlaufsliste der Ankuendigungen fuer das Admin-Panel (nur Admins).
-- SECURITY DEFINER umgeht RLS, daher Admin-Gate explizit in der Funktion.

CREATE OR REPLACE FUNCTION public.admin_list_announcements(p_limit int DEFAULT 50)
RETURNS TABLE(
  id uuid, title text, body text, accent text, category text,
  audience text, action_url text, created_at timestamptz, read_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.title, a.body, a.accent, a.category, a.audience, a.action_url, a.created_at,
         (SELECT count(*) FROM public.announcement_reads r
           WHERE r.announcement_id = a.id AND r.read_at IS NOT NULL)
    FROM public.announcements a
   WHERE public.is_admin()
   ORDER BY a.created_at DESC
   LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_announcements(int) TO authenticated;
