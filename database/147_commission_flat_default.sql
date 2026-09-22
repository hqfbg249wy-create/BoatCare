-- 147_commission_flat_default.sql
-- Grundsatz: es gilt der je Provider VEREINBARTE Satz; ohne Vereinbarung 10 %.
-- Die bisherigen Saetze < 10 % stammen ausschliesslich aus der pauschalen
-- Fruehbucher-Automatik (claim-provider), NICHT aus Einzelabsprachen -> auf 10 %.
-- Kuenftige Einzelabsprachen werden manuell gesetzt und hier nicht angefasst.

UPDATE public.service_providers
SET commission_rate = 10.00
WHERE commission_rate < 10.00;
