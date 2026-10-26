-- =====================================================================
-- 194_provider_faq_news_ads — FAQ-Einträge zu News-Feed & Werbung.
-- Erklärt Anbietern: News-Feed-Nutzung, enthaltenes Werbe-Kontingent im
-- Paket und "Werbung Plus" für zusätzliche Anzeigen. Kategorie 'news'
-- (im Help-Frontend ergänzt). DE = Quelle, EN in translations; übrige
-- Sprachen fallen auf DE zurück.
-- =====================================================================

INSERT INTO public.provider_faqs (category, question, answer, translations, sort_order, is_published)
VALUES
(
  'news',
  'Wie nutze ich den News-Feed als Anbieter?',
  'Im News-Feed stellst du deine Produkte als Lösung vor (Produktvorstellung). Du kannst mehrere deiner Shop-Produkte verknüpfen. Klickt ein Leser auf „Im Shop ansehen", werden genau diese Produkte im Skipily-Shop oben hervorgehoben. Eigner teilen dort ihre Lösungen; deine Produktvorstellungen werden im Verhältnis 3:1 eingemischt. Alle Beiträge werden per KI moderiert. Produktvorstellungen sind Pro- und Enterprise-Anbietern vorbehalten.',
  '{"en":{"question":"How do I use the news feed as a provider?","answer":"In the news feed you present your products as a solution (product post). You can link several of your shop products; when a reader taps \"View in shop\", exactly those products are highlighted at the top of the Skipily shop. Boat owners share their solutions there; your product posts are mixed in at a 3:1 ratio. All posts are moderated by AI. Product posts are reserved for Pro and Enterprise providers."}}',
  10, true
),
(
  'news',
  'Wie viel Werbung ist in meinem monatlichen Beitrag enthalten?',
  'Dein monatlicher Paketbeitrag deckt bereits eine feste Menge Werbung im News-Feed ab: Als Pro-Anbieter kannst du 2 Produktvorstellungen pro Woche bewerben, als Enterprise-Anbieter 4 pro Woche. Diese sind ohne Zusatzkosten sofort aktiv.',
  '{"en":{"question":"How much advertising is included in my monthly plan?","answer":"Your monthly plan already covers a fixed amount of advertising in the news feed: Pro providers can promote 2 product posts per week, Enterprise providers 4 per week. These are active immediately at no extra cost."}}',
  20, true
),
(
  'news',
  'Was ist „Werbung Plus"?',
  'Möchtest du über dein enthaltenes Kontingent hinaus werben, nutzt du „Werbung Plus": Du buchst zusätzliche Anzeigen mit einem Tagesbudget ab 10 €/Tag für einen gewählten Zeitraum, bezahlt per Stripe. Je höher das Tagesbudget, desto häufiger und weiter oben erscheint deine Produktvorstellung im News-Feed (mehr Einblendungen, größere Reichweite und Vorrang vor anderen Anzeigen). Vor der Buchung zeigt dir eine unverbindliche KI-Schätzung die voraussichtliche Wirkung.',
  '{"en":{"question":"What is \"Werbung Plus\" (Advertising Plus)?","answer":"To advertise beyond your included quota, use \"Werbung Plus\": book additional ads with a daily budget from 10 EUR/day for a chosen period, paid via Stripe. The higher the daily budget, the more often and higher up your product post appears in the news feed (more impressions, greater reach and priority over other ads). Before booking, a non-binding AI estimate shows the expected effect."}}',
  30, true
);
