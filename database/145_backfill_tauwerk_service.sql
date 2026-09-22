-- 145_backfill_tauwerk_service.sql
-- Dedizierte Tauwerk-Betriebe sollen "Tauwerk" unter Leistungen (services)
-- fuehren, damit sie konsistent (und sprachenuebergreifend) gefunden werden.
-- Ergaenzt "Tauwerk" bei Betrieben, deren NAME auf Tauwerk hinweist ODER die
-- bereits "Laufendes Gut"/"Spleiss" anbieten (= laufendes Gut ist Tauwerk-Arbeit).
-- Idempotent: nur wenn noch kein Service "Tauwerk" enthaelt. Offensichtliche
-- Nicht-Rope-Namen (Versicherung etc., Datenfehler) werden ausgeschlossen.

UPDATE public.service_providers p
SET services = array_append(COALESCE(p.services, '{}'), 'Tauwerk')
WHERE NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.services, '{}')) s
        WHERE lower(s) LIKE '%tauwerk%'
      )
  AND p.name !~* '(assurance|versicherung|insurance|generali)'
  AND (
        p.name ~* '(tauwerk|touwhandel|cordage|premiumrope|spleiss|spleiß|\yrope(s|works)?\y|\ytouw\y)'
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(p.services, '{}')) s
          WHERE lower(s) LIKE '%laufendes gut%'
             OR lower(s) LIKE '%spleiß%'
             OR lower(s) LIKE '%spleiss%'
        )
      );
