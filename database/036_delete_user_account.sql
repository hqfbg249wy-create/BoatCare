-- Migration: delete_user_account RPC
-- Purpose: App Store compliance (Apple Guideline 5.1.1(v) - account deletion).
-- Cascading delete of all user-generated data and the auth user itself.
--
-- Usage from app: supabase.rpc('delete_user_account').execute()
-- Security: SECURITY DEFINER so it can reach auth.users; gated to auth.uid().

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- User content (ordered to satisfy FKs; most tables also have ON DELETE CASCADE).
  -- Use IF EXISTS-guards via dynamic SQL only when necessary; direct DELETE otherwise.

  -- Messaging
  DELETE FROM public.messages
   WHERE sender_id = uid OR recipient_id = uid;
  DELETE FROM public.conversations
   WHERE buyer_id = uid OR seller_id = uid;

  -- Commerce
  DELETE FROM public.order_items
   WHERE order_id IN (SELECT id FROM public.orders WHERE buyer_id = uid);
  DELETE FROM public.orders WHERE buyer_id = uid;

  -- Reviews & favorites
  DELETE FROM public.reviews WHERE reviewer_id = uid;
  DELETE FROM public.user_favorites WHERE user_id = uid;

  -- Maintenance & equipment (cascades from boats, but clean explicit user-scoped rows first)
  DELETE FROM public.maintenance_records
   WHERE boat_id IN (SELECT id FROM public.boats WHERE owner_id = uid);
  DELETE FROM public.equipment
   WHERE boat_id IN (SELECT id FROM public.boats WHERE owner_id = uid);

  -- Boats
  DELETE FROM public.boats WHERE owner_id = uid;

  -- Profile (FK to auth.users cascades, but remove explicitly for clarity)
  DELETE FROM public.profiles WHERE id = uid;

  -- Storage objects (user-photos bucket prefix by user id)
  DELETE FROM storage.objects
   WHERE bucket_id = 'user-photos'
     AND (name LIKE 'avatars/' || uid::text || '%'
          OR name LIKE uid::text || '/%');
  DELETE FROM storage.objects
   WHERE bucket_id = 'boat-images'
     AND name LIKE uid::text || '/%';
  DELETE FROM storage.objects
   WHERE bucket_id = 'equipment-photos'
     AND name LIKE uid::text || '/%';

  -- Finally delete the auth user. Requires SECURITY DEFINER.
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Only authenticated users may call it.
REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

COMMENT ON FUNCTION public.delete_user_account() IS
  'App Store compliance: cascading delete of all user data + auth user. Caller must be authenticated; operates on auth.uid().';
