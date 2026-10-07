-- 178_rope_preset_labels.sql
-- Anbieter kann die Begrifflichkeiten der Tauwerk-Voreinstellungen anpassen
-- (Enden + Materialien), da die Bezeichnungen nicht ueberall gleich sind.
-- Der KEY bleibt stabil (Standard-Katalog), nur das angezeigte Label aendert sich.

ALTER TABLE public.provider_rope_end_prices
  ADD COLUMN IF NOT EXISTS label text;

CREATE TABLE IF NOT EXISTS public.provider_rope_material_labels (
  provider_id  uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  material_key text NOT NULL,
  label        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, material_key)
);

ALTER TABLE public.provider_rope_material_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rope_material_labels_rw ON public.provider_rope_material_labels;
CREATE POLICY rope_material_labels_rw ON public.provider_rope_material_labels
  FOR ALL USING (public.provider_is_member(provider_id))
          WITH CHECK (public.provider_is_member(provider_id));
