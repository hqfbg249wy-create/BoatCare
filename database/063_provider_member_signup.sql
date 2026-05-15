-- Migration 063: Auto-link für Provider-Member-Einladungen
--
-- Wenn ein User sich erstmalig einloggt nachdem er als Provider-Mitglied
-- eingeladen wurde, soll provider_members.user_id + accepted_at automatisch
-- gesetzt werden — egal ob die Einladung über E-Mail (auth.users-Insert) oder
-- per späterem Login an ein bestehendes profile ging.

CREATE OR REPLACE FUNCTION public.handle_provider_member_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE provider_members
     SET user_id     = NEW.id,
         accepted_at = NOW()
   WHERE LOWER(email) = LOWER(NEW.email)
     AND (user_id IS NULL OR accepted_at IS NULL);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_provider_member_signup ON auth.users;
CREATE TRIGGER on_auth_provider_member_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_provider_member_signup();

-- Auch für Familienmitglieder das gleiche
CREATE OR REPLACE FUNCTION public.handle_family_member_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE plus_family_members
     SET member_user_id = NEW.id,
         accepted_at    = NOW()
   WHERE LOWER(member_email) = LOWER(NEW.email)
     AND (member_user_id IS NULL OR accepted_at IS NULL);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_family_member_signup ON auth.users;
CREATE TRIGGER on_auth_family_member_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_family_member_signup();

GRANT INSERT, UPDATE ON public.provider_members    TO supabase_auth_admin;
GRANT INSERT, UPDATE ON public.plus_family_members TO supabase_auth_admin;
