-- 215_feature_gates.sql
-- Zentrale Paywall-Zuordnung (Free / Basic / Plus) + kurze Upgrade-Meldung
-- aus der DB. Edge Functions und Web-App fragen hier, ob ein Nutzer eine
-- Funktion nutzen darf, und bekommen bei "nein" eine kurze Meldung in seiner
-- Sprache, was mit Basic bzw. Plus möglich wird.
--
--   feature_gates               → Stufe + Meldungen je Funktion (Pflege per SQL)
--   check_feature_access()      → für eingeloggte Nutzer (auth.uid())
--   feature_access_for_user()   → für Edge Functions (service_role)
--
-- Stufen-Logik nutzt die bestehende user_ai_tier() (Migration 122):
-- plus > basic > free.

BEGIN;

CREATE TABLE IF NOT EXISTS feature_gates (
  feature       TEXT PRIMARY KEY,
  required_tier TEXT NOT NULL CHECK (required_tier IN ('basic', 'plus')),
  message       JSONB NOT NULL,          -- { "de": "...", "en": "...", ... }
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feature_gates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feature_gates_read_all ON feature_gates;
CREATE POLICY feature_gates_read_all ON feature_gates
  FOR SELECT USING (true);
-- Schreiben nur via SQL-Editor / service_role.

INSERT INTO feature_gates (feature, required_tier, message) VALUES
-- ── Basic ────────────────────────────────────────────────────────────────
('photo_analysis', 'basic', jsonb_build_object(
  'de', 'Die Schadens-Foto- und Video-Analyse ist ab Skipily Basic (1,99 € im Monat) verfügbar. Mit Basic bekommst du außerdem 5 KI-Fragen pro Tag.',
  'en', 'Damage photo and video analysis is available from Skipily Basic (€1.99 per month). Basic also gives you 5 AI questions per day.',
  'fr', 'L''analyse photo et vidéo des dommages est disponible dès Skipily Basic (1,99 € par mois), avec 5 questions IA par jour.',
  'es', 'El análisis de daños por foto y vídeo está disponible desde Skipily Basic (1,99 € al mes), con 5 preguntas de IA al día.',
  'it', 'L''analisi dei danni da foto e video è disponibile da Skipily Basic (1,99 € al mese), con 5 domande IA al giorno.',
  'nl', 'Schade-analyse via foto en video is beschikbaar vanaf Skipily Basic (€ 1,99 per maand), met 5 AI-vragen per dag.')),
('equipment_photo', 'basic', jsonb_build_object(
  'de', 'Fotos deiner Ausrüstung speicherst du kostenlos. Die KI-Analyse, die das Teil erkennt und die Felder ausfüllt, gibt es ab Skipily Basic (1,99 € im Monat).',
  'en', 'Saving photos of your equipment is free. The AI analysis that recognises the part and fills in the fields comes with Skipily Basic (€1.99 per month).',
  'fr', 'L''enregistrement des photos de votre équipement est gratuit. L''analyse IA qui reconnaît la pièce et remplit les champs est disponible dès Skipily Basic (1,99 € par mois).',
  'es', 'Guardar fotos de tu equipo es gratis. El análisis con IA que reconoce la pieza y rellena los campos está disponible desde Skipily Basic (1,99 € al mes).',
  'it', 'Salvare le foto dell''attrezzatura è gratuito. L''analisi IA che riconosce il pezzo e compila i campi è disponibile da Skipily Basic (1,99 € al mese).',
  'nl', 'Foto''s van je uitrusting opslaan is gratis. De AI-analyse die het onderdeel herkent en de velden invult, krijg je vanaf Skipily Basic (€ 1,99 per maand).')),
('auto_translate', 'basic', jsonb_build_object(
  'de', 'Die Autoübersetzung von News-Beiträgen und Video-Untertiteln ist ab Skipily Basic (1,99 € im Monat) verfügbar.',
  'en', 'Automatic translation of news posts and video subtitles is available from Skipily Basic (€1.99 per month).',
  'fr', 'La traduction automatique des actualités et des sous-titres vidéo est disponible dès Skipily Basic (1,99 € par mois).',
  'es', 'La traducción automática de noticias y subtítulos de vídeo está disponible desde Skipily Basic (1,99 € al mes).',
  'it', 'La traduzione automatica di news e sottotitoli video è disponibile da Skipily Basic (1,99 € al mese).',
  'nl', 'Automatische vertaling van nieuwsberichten en video-ondertitels is beschikbaar vanaf Skipily Basic (€ 1,99 per maand).')),
-- ── Plus ─────────────────────────────────────────────────────────────────
('boat_transfer', 'plus', jsonb_build_object(
  'de', 'Ein Boot per Schlüssel übergeben ist mit Skipily Plus (4,99 € im Monat) möglich: Der Käufer erhält das Boot mit Ausrüstung, Fotos und Historie.',
  'en', 'Handing over a boat by key is available with Skipily Plus (€4.99 per month): the buyer receives the boat with equipment, photos and history.',
  'fr', 'Transférer un bateau par clé est possible avec Skipily Plus (4,99 € par mois) : l''acheteur reçoit le bateau avec équipement, photos et historique.',
  'es', 'Traspasar un barco con una clave es posible con Skipily Plus (4,99 € al mes): el comprador recibe el barco con equipo, fotos e historial.',
  'it', 'Trasferire una barca tramite chiave è possibile con Skipily Plus (4,99 € al mese): l''acquirente riceve la barca con attrezzatura, foto e storico.',
  'nl', 'Een boot via een sleutel overdragen kan met Skipily Plus (€ 4,99 per maand): de koper krijgt de boot met uitrusting, foto''s en historie.')),
('maintenance_pdf', 'plus', jsonb_build_object(
  'de', 'Die komplette Wartungshistorie als PDF herunterladen kannst du mit Skipily Plus (4,99 € im Monat).',
  'en', 'Downloading the complete maintenance history as a PDF is available with Skipily Plus (€4.99 per month).',
  'fr', 'Le téléchargement de l''historique d''entretien complet en PDF est disponible avec Skipily Plus (4,99 € par mois).',
  'es', 'Descargar el historial de mantenimiento completo en PDF está disponible con Skipily Plus (4,99 € al mes).',
  'it', 'Scaricare lo storico completo della manutenzione in PDF è possibile con Skipily Plus (4,99 € al mese).',
  'nl', 'De volledige onderhoudshistorie als pdf downloaden kan met Skipily Plus (€ 4,99 per maand).')),
('strong_ai', 'plus', jsonb_build_object(
  'de', 'Tiefergehende Analysen mit dem leistungsstärkeren KI-Modell gibt es mit Skipily Plus (4,99 € im Monat), dazu 15 KI-Fragen pro Tag.',
  'en', 'In-depth analysis with the more powerful AI model comes with Skipily Plus (€4.99 per month), plus 15 AI questions per day.',
  'fr', 'Les analyses approfondies avec le modèle IA plus puissant sont incluses dans Skipily Plus (4,99 € par mois), avec 15 questions IA par jour.',
  'es', 'Los análisis más profundos con el modelo de IA más potente vienen con Skipily Plus (4,99 € al mes), con 15 preguntas de IA al día.',
  'it', 'Analisi più approfondite con il modello IA più potente sono incluse in Skipily Plus (4,99 € al mese), con 15 domande IA al giorno.',
  'nl', 'Diepgaandere analyses met het krachtigere AI-model krijg je met Skipily Plus (€ 4,99 per maand), plus 15 AI-vragen per dag.')),
('excel_import', 'plus', jsonb_build_object(
  'de', 'Ausrüstung per Excel importieren, inklusive Segelmessblatt und Tauwerk, ist mit Skipily Plus (4,99 € im Monat) möglich.',
  'en', 'Importing equipment via Excel, including sail measurement sheet and rigging lines, is available with Skipily Plus (€4.99 per month).',
  'fr', 'L''import d''équipement via Excel, y compris la fiche de mesure des voiles et les cordages, est disponible avec Skipily Plus (4,99 € par mois).',
  'es', 'Importar equipo desde Excel, incluida la hoja de medidas de velas y los cabos, es posible con Skipily Plus (4,99 € al mes).',
  'it', 'Importare l''attrezzatura da Excel, incluse scheda misure vele e cime, è possibile con Skipily Plus (4,99 € al mese).',
  'nl', 'Uitrusting importeren via Excel, inclusief zeilmeetblad en tuigage, kan met Skipily Plus (€ 4,99 per maand).'))
ON CONFLICT (feature) DO UPDATE
  SET required_tier = EXCLUDED.required_tier,
      message       = EXCLUDED.message,
      updated_at    = NOW();

-- ── Kern: Zugriff + Meldung für einen bestimmten Nutzer ──────────────────
CREATE OR REPLACE FUNCTION feature_access_for_user(
  p_user_id UUID,
  p_feature TEXT,
  p_lang    TEXT DEFAULT 'de',
  p_boat_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g      feature_gates%ROWTYPE;
  v_tier TEXT;
  v_lang TEXT := lower(split_part(replace(coalesce(p_lang, 'de'), '_', '-'), '-', 1));
  v_ok   BOOLEAN;
BEGIN
  SELECT * INTO g FROM feature_gates WHERE feature = p_feature;
  -- Unbekannte Funktion → nicht gegatet
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'feature', p_feature);
  END IF;

  v_tier := CASE WHEN p_user_id IS NULL THEN 'free'
                 ELSE coalesce(user_ai_tier(p_user_id, p_boat_id), 'free') END;
  v_ok := CASE g.required_tier
            WHEN 'basic' THEN v_tier IN ('basic', 'plus')
            ELSE v_tier = 'plus'
          END;

  RETURN jsonb_build_object(
    'allowed',       v_ok,
    'feature',       g.feature,
    'tier',          v_tier,
    'required_tier', g.required_tier,
    'message',       CASE WHEN v_ok THEN NULL
                          ELSE coalesce(g.message ->> v_lang, g.message ->> 'de') END
  );
END $$;
REVOKE ALL ON FUNCTION feature_access_for_user(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION feature_access_for_user(UUID, TEXT, TEXT, UUID) TO service_role;

-- ── Für eingeloggte Nutzer (Web-App): immer der eigene Account ───────────
CREATE OR REPLACE FUNCTION check_feature_access(
  p_feature TEXT,
  p_lang    TEXT DEFAULT 'de',
  p_boat_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT feature_access_for_user(auth.uid(), p_feature, p_lang, p_boat_id);
$$;
GRANT EXECUTE ON FUNCTION check_feature_access(TEXT, TEXT, UUID) TO authenticated;

-- Rabatte (vom Händler vergeben) und Family-Modus (Apple-Familienfreigabe des
-- iOS-Abos) sind bewusst NICHT gegatet. Falls eine frühere Fassung dieser
-- Migration schon eingespielt wurde, hier aufräumen:
DELETE FROM feature_gates WHERE feature IN ('discounts', 'family_mode');
DROP TRIGGER IF EXISTS trg_enforce_family_mode_plus ON plus_family_members;
DROP FUNCTION IF EXISTS enforce_family_mode_plus();

COMMIT;
