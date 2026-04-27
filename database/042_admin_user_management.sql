-- ============================================================
-- Migration 042: Admin-User-Management
-- ============================================================
-- Erweitert das Rollen-Modell um eine eingeschränkte Admin-Rolle und
-- liefert die RPCs für die User-Verwaltung im Admin-Web.
--
-- Rollen:
--   user           – normaler App-Nutzer
--   admin          – voller Admin-Zugriff
--   admin_readonly – darf das Admin-Panel sehen, aber nichts schreiben
-- ============================================================

-- 1. Whitelist gültiger Rollen (CHECK-Constraint)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_role_check
            CHECK (role IN ('user', 'admin', 'admin_readonly'));
    END IF;
END $$;

-- 2. Helper: ist der aktuelle User Admin (voll)?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- 3. Helper: darf der aktuelle User das Admin-Panel sehen?
CREATE OR REPLACE FUNCTION public.is_admin_or_readonly()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = auth.uid() AND role IN ('admin', 'admin_readonly')
    );
$$;

-- 4. RPC: alle User für das Admin-Panel auflisten
--    Beinhaltet auth.users.last_sign_in_at, das via RLS sonst nicht erreichbar ist.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
    id uuid,
    email text,
    full_name text,
    role text,
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

-- 5. RPC: User komplett löschen (admin only, nicht sich selbst, nicht den letzten Admin)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    target_role text;
    admin_count integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden: full admin only';
    END IF;

    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'cannot delete yourself';
    END IF;

    SELECT role INTO target_role FROM public.profiles WHERE id = target_user_id;
    IF target_role IS NULL THEN
        RAISE EXCEPTION 'user not found';
    END IF;

    -- Letzten Admin schützen
    IF target_role = 'admin' THEN
        SELECT COUNT(*) INTO admin_count FROM public.profiles WHERE role = 'admin';
        IF admin_count <= 1 THEN
            RAISE EXCEPTION 'cannot delete the last admin';
        END IF;
    END IF;

    -- Cascading delete identisch zu delete_user_account, aber für target_user_id
    DELETE FROM public.messages WHERE sender_id = target_user_id OR recipient_id = target_user_id;
    DELETE FROM public.conversations WHERE buyer_id = target_user_id OR seller_id = target_user_id;
    DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE buyer_id = target_user_id);
    DELETE FROM public.orders WHERE buyer_id = target_user_id;
    DELETE FROM public.reviews WHERE reviewer_id = target_user_id;
    DELETE FROM public.user_favorites WHERE user_id = target_user_id;
    DELETE FROM public.maintenance_records
        WHERE boat_id IN (SELECT id FROM public.boats WHERE owner_id = target_user_id);
    DELETE FROM public.equipment
        WHERE boat_id IN (SELECT id FROM public.boats WHERE owner_id = target_user_id);
    DELETE FROM public.boats WHERE owner_id = target_user_id;
    DELETE FROM public.profiles WHERE id = target_user_id;

    DELETE FROM storage.objects
     WHERE bucket_id = 'user-photos'
       AND (name LIKE 'avatars/' || target_user_id::text || '%'
            OR name LIKE target_user_id::text || '/%');
    DELETE FROM storage.objects
     WHERE bucket_id = 'boat-images' AND name LIKE target_user_id::text || '/%';
    DELETE FROM storage.objects
     WHERE bucket_id = 'equipment-photos' AND name LIKE target_user_id::text || '/%';

    DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- 6. RPC: Rolle ändern (admin only, nicht sich selbst, nicht den letzten Admin demoten)
CREATE OR REPLACE FUNCTION public.admin_set_user_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_role text;
    admin_count integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden: full admin only';
    END IF;

    IF new_role NOT IN ('user', 'admin', 'admin_readonly') THEN
        RAISE EXCEPTION 'invalid role: %', new_role;
    END IF;

    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'cannot change your own role';
    END IF;

    SELECT role INTO current_role FROM public.profiles WHERE id = target_user_id;
    IF current_role IS NULL THEN
        RAISE EXCEPTION 'user not found';
    END IF;

    -- Letzten Admin schützen
    IF current_role = 'admin' AND new_role <> 'admin' THEN
        SELECT COUNT(*) INTO admin_count FROM public.profiles WHERE role = 'admin';
        IF admin_count <= 1 THEN
            RAISE EXCEPTION 'cannot demote the last admin';
        END IF;
    END IF;

    UPDATE public.profiles
       SET role = new_role, updated_at = now()
     WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 042: Admin-User-Management RPCs aktiv';
END $$;
