-- 209_products_missing_translation.sql
-- Hilfs-RPC fuer den Uebersetzungs-Backfill (Schritt 2): liefert die IDs aktiver
-- Produkte, denen die Uebersetzung einer bestimmten Sprache fehlt. Wird vom
-- Backfill-Skript genutzt, um translate-product gezielt (batchweise) nur fuer
-- die Luecken aufzurufen.

CREATE OR REPLACE FUNCTION public.products_missing_translation(p_lang text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.metashop_products
  WHERE is_active
    AND NOT (coalesce(translations, '{}'::jsonb) ? p_lang);
$$;

GRANT EXECUTE ON FUNCTION public.products_missing_translation(text) TO anon, authenticated, service_role;

DO $$ BEGIN
  RAISE NOTICE '✅ Migration 209: RPC products_missing_translation(lang) fuer den Uebersetzungs-Backfill.';
END $$;
