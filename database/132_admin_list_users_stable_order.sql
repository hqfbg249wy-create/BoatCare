-- 132_admin_list_users_stable_order.sql
-- Stabile Sortierung fuer admin_list_users.
--
-- Grund: Das Admin-Panel paginiert das RPC-Ergebnis in 1000er-Batches
-- (.range(from, from+999)), weil PostgREST auch RPC-Ergebnisse bei 1000 Zeilen
-- kappt. Die Funktion sortierte bisher nur ORDER BY created_at DESC — eine NICHT
-- eindeutige Spalte. Teilen sich mehrere Nutzer denselben created_at (z. B.
-- gebuendelt angelegte/geclaimte Accounts), ist die Reihenfolge bei Gleichstand
-- nicht deterministisch → aufeinanderfolgende Batches ueberlappen bzw.
-- ueberspringen Zeilen → Nutzer doppelt gezaehlt oder in der Liste fehlend.
--
-- Fix: eindeutiger Tiebreaker p.id in der ORDER BY. Rueckgabetyp unveraendert,
-- daher CREATE OR REPLACE ohne DROP.

BEGIN;

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
         ORDER BY p.created_at DESC, p.id;   -- eindeutiger Tiebreaker
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

COMMIT;
