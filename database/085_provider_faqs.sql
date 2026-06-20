-- Migration 085: Provider-Portal FAQs
--
-- Mehrsprachige FAQ-Einträge fürs Provider-Portal. Deutsch ist die Quelle
-- (Spalten question/answer); Übersetzungen liegen in translations jsonb:
--   { "en": {"question": "...", "answer": "..."}, "fr": {...}, ... }
-- Das Provider-Portal zeigt die gewählte Sprache und fällt auf DE zurück,
-- wenn eine Übersetzung fehlt. Pflege + KI-Hilfe + Übersetzung im Admin-Portal.

CREATE TABLE IF NOT EXISTS public.provider_faqs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category     text NOT NULL,                 -- slug, siehe unten
    question     text NOT NULL,                 -- Deutsch (Quelle)
    answer       text NOT NULL,                 -- Deutsch (Quelle)
    translations jsonb NOT NULL DEFAULT '{}'::jsonb,
    sort_order   integer NOT NULL DEFAULT 0,
    is_published boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.provider_faqs.category IS
    'csv | api | team | offering | payment | orders_shipping | market_analysis | advantages | commission';

CREATE INDEX IF NOT EXISTS idx_provider_faqs_sort
    ON public.provider_faqs (category, sort_order);

-- Doppel-Seed verhindern: (Kategorie, Frage) eindeutig → erneutes Ausführen
-- des Seeds dupliziert nicht (siehe ON CONFLICT unten).
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_faqs_cat_q
    ON public.provider_faqs (category, question);

-- updated_at automatisch pflegen
CREATE OR REPLACE FUNCTION public.touch_provider_faqs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_provider_faqs ON public.provider_faqs;
CREATE TRIGGER trg_touch_provider_faqs
    BEFORE UPDATE ON public.provider_faqs
    FOR EACH ROW EXECUTE FUNCTION public.touch_provider_faqs();

-- ── RLS ──
ALTER TABLE public.provider_faqs ENABLE ROW LEVEL SECURITY;

-- Lesen: veröffentlichte FAQs für alle (anon + eingeloggte Provider)
DROP POLICY IF EXISTS "provider_faqs_read_published" ON public.provider_faqs;
CREATE POLICY "provider_faqs_read_published" ON public.provider_faqs
    FOR SELECT TO anon, authenticated USING (is_published = true);

-- Admins (profiles.role='admin') sehen + verwalten ALLES
DROP POLICY IF EXISTS "provider_faqs_admin_read_all" ON public.provider_faqs;
CREATE POLICY "provider_faqs_admin_read_all" ON public.provider_faqs
    FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "provider_faqs_admin_write" ON public.provider_faqs;
CREATE POLICY "provider_faqs_admin_write" ON public.provider_faqs
    FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ════════════════════════════════════════════════════════════════
-- SEED — Deutsche Quelltexte (Übersetzungen füllt das Admin-Portal)
-- ════════════════════════════════════════════════════════════════
INSERT INTO public.provider_faqs (category, sort_order, question, answer) VALUES

-- ── CSV-Produktimport ──
('csv', 10,
 'Wie importiere ich meine Produkte per CSV?',
 'Im Provider-Portal unter „Produkte" lädst du eine CSV-Datei hoch. Jede Zeile ist ein Produkt. Pflichtfelder sind Name und Preis; optional sind u. a. Beschreibung, Hersteller, Artikelnummer (SKU/EAN), Lagerbestand, Gewicht, Lieferzeit und eine Bild-URL. Die Spaltenüberschriften der ersten Zeile ordnen die Werte zu. Dein Provider wird automatisch und sicher zugewiesen — du kannst keine Produkte für einen fremden Betrieb anlegen.'),
('csv', 20,
 'Welche Spalten sollte meine CSV enthalten?',
 'Empfohlen: name, description, manufacturer, sku, ean, price, currency, stock_quantity, weight_kg, delivery_days, image_url, is_active. Nur „name" und „price" sind zwingend. Unbekannte Spalten werden ignoriert. Preise als Zahl (z. B. 24.90), nicht als Text mit Währungszeichen.'),
('csv', 30,
 'Warum wird mein Produktbild im Shop nicht angezeigt?',
 'Trage die Bild-URL in der Spalte „image_url" als vollständige, öffentlich erreichbare https-Adresse ein. Das System übernimmt das Bild automatisch sowohl in die Shop-Liste als auch in die Detailansicht. Achte darauf, dass die URL ohne Login erreichbar ist und auf ein Bild (jpg/png/webp) zeigt.'),
('csv', 40,
 'Ich bekomme beim CSV-Upload eine Fehlermeldung — was tun?',
 'Häufige Ursachen: fehlende Pflichtspalte (name/price), Preis als Text statt Zahl, oder eine kaputte Zeichenkodierung. Speichere die Datei als UTF-8-CSV mit Komma- oder Semikolon-Trennung. Team-Mitglieder mit Bearbeitungsrecht dürfen importieren — falls es trotzdem klemmt, melde dich beim Skipily-Team mit der betroffenen Datei.'),

-- ── API / Schnittstelle / Webhook ──
('api', 10,
 'Kann ich Bestellungen automatisch in mein System (z. B. Shopify oder Odoo) übernehmen?',
 'Ja. Skipily bietet eine Orders-REST-API. Du rufst neue und geänderte Bestellungen ab (inkl. inkrementell „seit Zeitpunkt X") und meldest Status und Tracking-Nummer zurück. Damit lässt sich Skipily an Shopify, Odoo, ein ERP oder eine eigene Middleware anbinden. Die API ist ab dem Pro-Paket verfügbar.'),
('api', 20,
 'Wie authentifiziere ich mich an der API?',
 'Über einen API-Schlüssel (x-api-key im Header). Der Schlüssel ist fest deinem Betrieb zugeordnet — du siehst und steuerst ausschließlich deine eigenen Bestellungen. Behandle den Schlüssel wie ein Passwort.'),
('api', 30,
 'Wie funktionieren die Webhooks?',
 'Statt zu pollen kannst du dir Ereignisse pushen lassen: Bei einer bezahlten Bestellung wird „order_confirmed" ausgelöst, bei Status-/Tracking-Updates ein entsprechendes Ereignis. So bleibt dein System ohne ständige Abfragen synchron.'),
('api', 40,
 'Welche Bestelldaten bekomme ich über die Schnittstelle?',
 'Pro Bestellung u. a.: Positionen (Produkt, Menge, Preis), Liefer- und Rechnungsadresse, Versandkosten, Zahlungsstatus und Zeitstempel. Du meldest zurück: Bearbeitungsstatus und Tracking-Nummer — diese fließen automatisch zurück an den Käufer.'),

-- ── Teammitglieder ──
('team', 10,
 'Kann ich Kolleginnen und Kollegen Zugriff geben?',
 'Ja. Unter „Stammdaten" lädst du Teammitglieder per E-Mail ein. Sie erhalten einen Einladungslink und legen ihr eigenes Passwort fest — niemand teilt sich einen Account.'),
('team', 20,
 'Welche Rollen und Rechte gibt es?',
 'Es gibt eine Hauptrolle (Inhaber/Owner) und Teamrollen mit abgestuften Rechten (z. B. Produkte und Bestellungen bearbeiten vs. nur ansehen). Im Profil siehst du die Rollen-Hierarchie inkl. einer Legende, welche Rolle was darf. Rechte änderst du dort jederzeit.'),
('team', 30,
 'Ein eingeladenes Mitglied bekommt keine oder eine verwirrende E-Mail — woran liegt das?',
 'Bestehende Nutzer bekommen eine Team-Benachrichtigung mit Login-Hinweis; neue Nutzer einen Einladungslink zum Passwort-Setzen. Falls keine Mail ankommt: Spam-Ordner prüfen und die Einladung erneut auslösen. Der Zugang ist erst nach Annahme der Einladung aktiv.'),

-- ── Was wir bieten ──
('offering', 10,
 'Was ist Skipily und was habe ich als Anbieter davon?',
 'Skipily ist ein Marktplatz für Boots- und Yacht-Services und -Ersatzteile. Du erreichst Bootseigner direkt in der App und im Web — ohne eigenen Marketing-Aufwand. Bestellungen, Zahlungen und Versandlogik laufen über die Plattform; du lieferst und betreust deine Kundschaft.'),
('offering', 20,
 'In welchen Ländern und Sprachen ist Skipily verfügbar?',
 'Skipily ist auf Europa ausgerichtet und in sechs Sprachen verfügbar: Deutsch, Englisch, Französisch, Italienisch, Spanisch und Niederländisch. Deine Produkte und dein Profil werden für die jeweilige Sprache der Nutzer aufbereitet.'),
('offering', 30,
 'Brauche ich einen eigenen Onlineshop, um mitzumachen?',
 'Nein. Du kannst deine Produkte per CSV oder über die Schnittstelle einstellen — ein eigener Shop ist nicht nötig. Hast du bereits einen (z. B. Shopify), bindest du ihn über die API an und sparst Doppelpflege.'),

-- ── Zahlungen, Rechnung & Abrechnung (Stripe) ──
('payment', 10,
 'Wie bekomme ich mein Geld?',
 'Zahlungen laufen über Stripe. Bei der Einrichtung verbindest du ein Stripe-Konto (Stripe Connect). Der Kunde zahlt über die Plattform, die Auszahlung an dich erfolgt automatisch über Stripe — abzüglich der Marktplatz-Provision.'),
('payment', 20,
 'Wer trägt die Zahlungsgebühren (z. B. Apple Pay / Kreditkarte)?',
 'Die Zahlungsgebühren trägt der Händler, nicht Skipily — sie werden bei der Abrechnung berücksichtigt. Du siehst pro Bestellung transparent Umsatz, Provision und Gebühren.'),
('payment', 30,
 'Wie funktioniert die Rechnungsstellung und Abrechnung?',
 'Die Provision wird je Bestellung automatisch einbehalten; die Auszahlung des Restbetrags erfolgt über Stripe nach dessen Auszahlungsrhythmus. Eine Übersicht deiner Umsätze, Provisionen und Auszahlungen findest du im Portal — geeignet als Grundlage für deine Buchhaltung.'),
('payment', 40,
 'Was muss ich einmalig einrichten, bevor ich verkaufen kann?',
 'Du verbindest dein Stripe-Konto (Identität/Bankverbindung für Auszahlungen) und legst deine Versandregeln fest. Danach sind deine Produkte verkaufsbereit.'),

-- ── Bestellung & Versand ──
('orders_shipping', 10,
 'Wie werden die Versandkosten berechnet?',
 'Über eine hinterlegte Versandlogik nach Gewicht und Zone (Inland/EU/Welt) mit Grundbetrag plus Betrag je Kilogramm. Beispiel-Regel: ab 85 € Bestellwert versandkostenfrei innerhalb Deutschlands. Deine Heimat-/Versandregion und Schwellen stellst du in den Stammdaten ein.'),
('orders_shipping', 20,
 'Wie läuft eine Bestellung ab?',
 'Der Kunde bestellt und bezahlt in der App/im Web. Du erhältst die Bestellung im Portal (oder per API/Webhook), verpackst und versendest, und trägst die Tracking-Nummer ein. Status und Tracking werden dem Käufer automatisch angezeigt.'),
('orders_shipping', 30,
 'Wo trage ich Versandstatus und Sendungsnummer ein?',
 'Direkt an der Bestellung im Portal — oder automatisiert über die API (PUT mit Status + Tracking). Beides aktualisiert den Käufer in Echtzeit.'),

-- ── Marktanalyse nutzen ──
('market_analysis', 10,
 'Was zeigt mir die Marktanalyse?',
 'Unter „Marktanalyse" siehst du Nachfrage und Trends in deinem Segment: gefragte Produktkategorien, Suchinteressen und wie deine Sortimente dazu passen. So erkennst du Chancen, bevor du Sortiment und Preise festlegst.'),
('market_analysis', 20,
 'Wie nutze ich den Drilldown sinnvoll?',
 'Beginne mit der Übersicht und klicke dich in Kategorien hinein (Drilldown), bis zu konkreten Produktgruppen. Dort erkennst du, wo Nachfrage auf wenig Angebot trifft — ideale Stellen, um gezielt Produkte einzustellen oder Angebote zu platzieren.'),
('market_analysis', 30,
 'Wie platziere ich aus der Analyse heraus ein Angebot?',
 'Identifizierst du eine Chance, legst du unter „Angebote" eine Aktion an (z. B. Rabatt oder hervorgehobenes Produkt). So machst du nachgefragte Artikel sichtbarer und steigerst die Conversion gezielt dort, wo die Nachfrage ist.'),

-- ── Marktvorteile Skipily ──
('advantages', 10,
 'Welche Vorteile habe ich gegenüber einem eigenen Shop oder anderen Marktplätzen?',
 'Skipily ist auf die Bootsbranche spezialisiert: passende Zielgruppe statt Streuverlust. Du profitierst von Reichweite in App und Web, sechs Sprachen, integrierter Zahlung und Versandlogik sowie Marktanalysen, die zeigen, was Bootseigner wirklich suchen.'),
('advantages', 20,
 'Warum lohnt sich die Spezialisierung auf Boote für mich?',
 'Käufer kommen mit konkreter Kauf- und Service-Absicht — die Abschlusswahrscheinlichkeit ist höher als auf allgemeinen Plattformen. Gleichzeitig stärkst du deine Sichtbarkeit bei genau der Kundschaft, die deine Produkte und Dienstleistungen nachfragt.'),

-- ── Provisions-Staffelung & Pakete ──
('commission', 10,
 'Wie hoch ist die Marktplatz-Provision?',
 'Die Standard-Provision beträgt 10 % vom Umsatz. Es gibt vergünstigte Sätze über drei Wege: einen Early-Bird-Satz für früh angebundene Betriebe, niedrigere Sätze in höheren Paketen (Professional/Enterprise) und eine Umsatzstaffel. Es gilt automatisch der für dich günstigste zutreffende Satz. Deine aktuelle Provider-Rate siehst du jederzeit im Portal.'),
('commission', 20,
 'Wie funktioniert die Umsatzstaffel?',
 'Mit steigendem (bezahltem) Umsatz sinkt dein Provisionssatz automatisch in Stufen — sobald du eine Umsatzschwelle erreichst, gilt der niedrigere Satz für künftige Bestellungen. Du musst nichts tun; die Anpassung passiert automatisch.'),
('commission', 30,
 'Welche Pakete gibt es und lohnt sich ein höheres?',
 'Neben dem Standard-Paket gibt es höhere Pakete (Professional/Enterprise) mit zusätzlichen Funktionen — z. B. die Orders-API und Webhooks — und einer niedrigeren Provision. Es gilt stets der günstigste für dich zutreffende Satz aus Paket, Umsatzstaffel und Early-Bird. Individuelle Sonderkonditionen vereinbarst du mit dem Skipily-Team.')

ON CONFLICT (category, question) DO NOTHING;
