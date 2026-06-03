-- 076_provider_shipping_countries.sql
--
-- Liefer-Länder pro Provider eingrenzen können — Hintergrund:
-- EU-Verpackungsverordnung (PPWR / nationale EPR-Pflichten wie LUCID/DE,
-- Triman/FR, RAEE/IT, …). Wer in ein Land liefert, muss dort registriert
-- sein. Kleine Provider können sich nicht in allen 27 EU-Staaten anmelden
-- und brauchen die Möglichkeit, ihre Auslieferung zu beschränken.
--
-- Schema:
--   shipping_countries TEXT[]  -- ISO-3166-1 Alpha-2 Codes ("DE","AT","CH",…)
--   NULL  → noch nicht konfiguriert (vom UI als "alle Länder" interpretiert,
--           wird beim ersten Profile-Save explizit gesetzt)
--   { }   → leeres Array = liefert in KEIN Land (Provider hat aktiv leer
--           gespeichert — z. B. Service-Only ohne Versand)
--   {"DE","AT"} → nur diese Länder

ALTER TABLE public.service_providers
    ADD COLUMN IF NOT EXISTS shipping_countries TEXT[];

COMMENT ON COLUMN public.service_providers.shipping_countries IS
    'ISO-3166-1 Alpha-2 Codes der Länder, in die der Provider versendet. '
    'NULL = unkonfiguriert (Fallback auf "alle"), [] = liefert nirgendwohin, '
    'sonst nur die gelisteten Länder. Grundlage für EU-Verpackungs-EPR-Pflichten.';

-- Index nur, wenn häufiger nach lieferbaren Anbietern für ein Land gesucht wird.
-- GIN-Index auf TEXT[] erlaubt schnelle "@>"-/"&&"-Abfragen.
CREATE INDEX IF NOT EXISTS idx_service_providers_shipping_countries
    ON public.service_providers USING GIN (shipping_countries);
