-- Migration 095: App-/Website-FAQs (Endkunden)
--
-- Mehrsprachige FAQ-Einträge für die öffentliche Website (skipily.app) und
-- optional den In-App-Hilfe-Screen. Aufbau identisch zu provider_faqs (085):
-- Deutsch ist die Quelle (question/answer), Übersetzungen liegen in
-- translations jsonb: { "en": {"question":"…","answer":"…"}, "fr": {…}, … }.
-- Pflege + KI-Übersetzung erfolgen im Admin-Panel (eigene Rubrik).

CREATE TABLE IF NOT EXISTS public.app_faqs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category     text NOT NULL,
    question     text NOT NULL,                 -- Deutsch (Quelle)
    answer       text NOT NULL,                 -- Deutsch (Quelle)
    translations jsonb NOT NULL DEFAULT '{}'::jsonb,
    sort_order   integer NOT NULL DEFAULT 0,
    is_published boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.app_faqs.category IS
    'general | getting_started | features | ai | plus | account | privacy';

CREATE INDEX IF NOT EXISTS idx_app_faqs_sort
    ON public.app_faqs (category, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_faqs_cat_q
    ON public.app_faqs (category, question);

-- updated_at automatisch pflegen
CREATE OR REPLACE FUNCTION public.touch_app_faqs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_app_faqs ON public.app_faqs;
CREATE TRIGGER trg_touch_app_faqs
    BEFORE UPDATE ON public.app_faqs
    FOR EACH ROW EXECUTE FUNCTION public.touch_app_faqs();

-- ── RLS ──
ALTER TABLE public.app_faqs ENABLE ROW LEVEL SECURITY;

-- Lesen: veröffentlichte FAQs für alle (anon Website + App + eingeloggt)
DROP POLICY IF EXISTS "app_faqs_read_published" ON public.app_faqs;
CREATE POLICY "app_faqs_read_published" ON public.app_faqs
    FOR SELECT TO anon, authenticated USING (is_published = true);

-- Admins sehen + verwalten ALLES
DROP POLICY IF EXISTS "app_faqs_admin_read_all" ON public.app_faqs;
CREATE POLICY "app_faqs_admin_read_all" ON public.app_faqs
    FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "app_faqs_admin_write" ON public.app_faqs;
CREATE POLICY "app_faqs_admin_write" ON public.app_faqs
    FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ════════════════════════════════════════════════════════════════
-- SEED — Deutsche Quelltexte (Übersetzungen füllt das Admin-Panel)
-- ════════════════════════════════════════════════════════════════
INSERT INTO public.app_faqs (category, sort_order, question, answer) VALUES

('general', 10,
 'Was ist Skipily?',
 'Skipily ist die App für Bootseigner: Werften, Werkstätten, Segelmacher und Zubehör-Shops auf einer Karte finden, das eigene Boot mit Ausrüstung verwalten, Wartung im Blick behalten und einen KI-Bootsassistenten nutzen, der dein Boot kennt.'),
('general', 20,
 'Was kostet Skipily?',
 'Die App ist kostenlos – alle Kernfunktionen inklusive. Optional gibt es „Skipily Plus" mit unbegrenztem KI-Assistenten, Schadens-Foto-Analyse und Ausrüstungs-Empfehlungen.'),
('general', 30,
 'Auf welchen Geräten läuft Skipily?',
 'Skipily gibt es als App für iPhone/iPad (App Store) und für Android (Google Play). Eine Anmeldung mit demselben Konto funktioniert auf allen Geräten.'),
('general', 40,
 'In welchen Sprachen ist Skipily verfügbar?',
 'In sechs Sprachen: Deutsch, Englisch, Französisch, Italienisch, Spanisch und Niederländisch. Die App richtet sich nach deiner Gerätesprache.'),

('getting_started', 10,
 'Wie lege ich mein Boot an?',
 'Nach der Anmeldung tippst du auf „Boote" und legst dein Boot mit Marke, Modell, Maßen und Ausrüstung an. Fotos und Seriennummern kannst du direkt hinterlegen – alles an einem Ort, auch offline.'),
('getting_started', 20,
 'Wie finde ich Service-Anbieter in meiner Nähe?',
 'Über die Karte: Skipily zeigt Werften, Werkstätten, Segelmacher und Shops in deiner Umgebung – gefiltert nach Kategorie und Entfernung, mit Bewertungen, Route und direktem Kontakt.'),

('ai', 10,
 'Wie funktioniert der KI-Bootsassistent?',
 'Der Assistent kennt deine hinterlegte Ausrüstung und beantwortet konkrete Fragen – von „Welches Öl braucht mein Motor?" bis zu Wartungsschritten. Antworten kannst du direkt an einen Service-Anbieter weiterleiten.'),

('plus', 10,
 'Was bringt Skipily Plus?',
 'Plus schaltet den KI-Assistenten unbegrenzt frei, ermöglicht die Schadens-Foto-Analyse und schlägt fehlende Ausrüstung passend zu deinem Boot vor. Es gibt eine 7-tägige Gratis-Testphase.'),
('plus', 20,
 'Wie kündige ich Skipily Plus?',
 'Die Verwaltung und Kündigung läuft über deinen App-Store- bzw. Google-Play-Account (Abo-Einstellungen). Nach der Kündigung bleibt Plus bis zum Ende der bezahlten Periode aktiv.'),

('account', 10,
 'Wie lösche ich mein Konto?',
 'In der App unter „Profil → Konto löschen" – oder per E-Mail an info@skipily.app. Dein Konto und die zugehörigen Daten werden anschließend gelöscht. Details: skipily.app/account-deletion.'),

('privacy', 10,
 'Was passiert mit meinen Daten?',
 'Deine Daten werden nur zur Bereitstellung der App genutzt und nicht verkauft. Verschlüsselte Übertragung, Hosting in der EU. Alle Details stehen in der Datenschutzerklärung unter skipily.app/datenschutz.')

ON CONFLICT (category, question) DO NOTHING;
