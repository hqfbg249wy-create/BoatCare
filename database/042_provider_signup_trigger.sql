-- =====================================================================
-- 042_provider_signup_trigger.sql
--
-- Legt automatisch eine Zeile in public.service_providers an, sobald
-- sich ein User mit Metadata { is_provider: true } registriert.
--
-- Getriggert von:
--   a) Provider-Portal Signup-Seite  (supabase.auth.signUp)
--   b) Edge Function  'invite-provider' (admin.inviteUserByEmail mit
--      user_metadata.is_provider = true)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_provider_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'is_provider','false') = 'true' THEN
    INSERT INTO public.service_providers (
      user_id, name, category, email, city, country
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'company_name', 'Neuer Provider'),
      COALESCE(NEW.raw_user_meta_data->>'category',     'repair'),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'city',         NULL),
      COALESCE(NEW.raw_user_meta_data->>'country',      'Deutschland')
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_provider_signup ON auth.users;
CREATE TRIGGER on_auth_provider_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_provider_signup();

-- Grant (nur zur Sicherheit -- SECURITY DEFINER genügt normalerweise)
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT ON public.service_providers TO supabase_auth_admin;
