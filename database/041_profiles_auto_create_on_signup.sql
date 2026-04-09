-- ============================================================
-- Migration 041: profiles Auto-Create beim Sign-Up
-- ============================================================
-- Fix für "new row violates row-level security policy for table profiles"
-- bei der Registrierung.
--
-- Ursache: Der iOS-Client ruft supabase.auth.signUp() auf und versucht
-- unmittelbar danach einen client-seitigen INSERT in public.profiles.
-- Wenn im Projekt Email-Bestätigung aktiv ist, liefert signUp() aber
-- KEINE Session zurück — damit ist der Request anonym, und die RLS
-- Policy blockt den INSERT. Selbst ohne Email-Bestätigung braucht die
-- Tabelle eine explizite INSERT-Policy für die eigene id.
--
-- Lösung (belt + suspenders):
--   1) Trigger auf auth.users, der bei jedem neuen User automatisch eine
--      profiles-Zeile anlegt (SECURITY DEFINER → bypasst RLS).
--   2) INSERT-Policy, die dem eingeloggten User erlaubt, seine eigene
--      Zeile anzulegen (falls der Client doch mal selbst inserten will).
--   3) Optionaler Backfill für alle auth.users ohne profiles-Zeile
--      (falls es bereits Waisen-Accounts gibt).
-- ============================================================

-- 1. Trigger-Funktion: legt für jeden neuen auth.users automatisch eine
--    profiles-Zeile an. Holt full_name/avatar_url aus raw_user_meta_data,
--    falls der Client die beim signUp übergeben hat.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, role, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
        'user',
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- 2. Trigger ans auth.users-INSERT hängen
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 3. INSERT-Policy für eingeloggte User: eigene Zeile anlegen erlaubt.
--    (Wichtig als Fallback, falls der Trigger mal nicht greift oder
--    der Client full_name später als separates INSERT nachreichen will.)
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

-- 4. UPDATE-Policy sicherstellen (für .upsert fallback)
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 5. SELECT-Policy (eigene Zeile lesen) falls noch nicht vorhanden
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
CREATE POLICY "profiles_select_self" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

-- 6. Backfill: für alle auth.users ohne profiles-Zeile nachträglich eine anlegen
INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
SELECT
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', ''),
    'user',
    now(),
    now()
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 041: profiles Auto-Create-Trigger + RLS aktiviert';
END $$;
