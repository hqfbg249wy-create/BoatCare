-- 176_inquiry_rope_config.sql
-- Tauwerk-Kriterien strukturiert an die Anfrage haengen, damit der Anbieter den
-- Angebots-Builder daraus vorbefuellen kann. Rope-Anfrage = rope_config IS NOT NULL.
--
-- Inhalt rope_config (jsonb):
--   { length_m, diameter_mm, material, end1, end2,
--     end1_eye_length_cm, end2_eye_length_cm, article_number, matched_product_id }

ALTER TABLE public.service_inquiries
  ADD COLUMN IF NOT EXISTS rope_config jsonb;

-- Anschreiben (Anbieter -> Kunde) des Tauwerk-Angebots (mit Platzhaltern).
ALTER TABLE public.service_inquiries
  ADD COLUMN IF NOT EXISTS offer_cover_letter text;

-- Gewaehlte Variante (wird bei Annahme gesetzt).
ALTER TABLE public.service_inquiries
  ADD COLUMN IF NOT EXISTS offer_selected_variant_id uuid;
