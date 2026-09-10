-- 131_admin_list_users_customer_number.sql
-- Kundennummer in die Admin-Benutzerliste aufnehmen (RPC admin_list_users).
-- Ergänzt profiles.customer_number (aus Migration 130) in der Rückgabe, damit
-- das Admin-Panel sie anzeigen und danach suchen kann.

BEGIN;

-- Rueckgabe-Typ aendert sich → Funktion zuerst droppen.
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
    id uuid,
    email text,
    full_name text,
    role text,
    customer_number bigint,
    created_at timestamptz,
    last_sign_in_at timestamptz,
    boats_count bigint,
    orders_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NOT public.is_admin_or_readonly() THEN
        RAISE EXCEPTION 'forbidden: admin only';
    END IF;

    RETURN QUERY
        SELECT
            p.id,
            p.email,
            p.full_name,
            p.role,
            p.customer_number,
            p.created_at,
            u.last_sign_in_at,
            COALESCE(b.cnt, 0) AS boats_count,
            COALESCE(o.cnt, 0) AS orders_count
          FROM public.profiles p
          LEFT JOIN auth.users u ON u.id = p.id
          LEFT JOIN (
                SELECT owner_id, COUNT(*)::bigint AS cnt
                  FROM public.boats GROUP BY owner_id
          ) b ON b.owner_id = p.id
          LEFT JOIN (
                SELECT buyer_id, COUNT(*)::bigint AS cnt
                  FROM public.orders GROUP BY buyer_id
          ) o ON o.buyer_id = p.id
         ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

COMMIT;
