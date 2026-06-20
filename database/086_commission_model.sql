-- Migration 086: Konfigurierbares Provisions-Modell
--
-- Generische Sätze (zentral im Admin pflegbar):
--   • Early-Bird-Satz (für früh angebundene Betriebe)
--   • Paket-Sätze (standard / professional / enterprise)
--   • Umsatzstaffel (ab Umsatz X gilt Satz Y)
-- Plus individueller Override pro Anbieter.
--
-- Effektiver Satz eines Anbieters:
--   1) Ist ein Override gesetzt → der gilt.
--   2) Sonst der GÜNSTIGSTE (= niedrigste) der zutreffenden generischen Sätze:
--      Default, Paket-Satz, Umsatzstaffel-Satz, Early-Bird (falls markiert).
-- Der effektive Satz wird in service_providers.commission_rate gespiegelt
-- (das lesen Bestellungen/Anzeigen weiterhin) und bei jeder bezahlten
-- Bestellung sowie auf Knopfdruck neu berechnet.

-- ── 1) Generische Einstellungen (Singleton) ──
CREATE TABLE IF NOT EXISTS public.commission_settings (
    id                integer PRIMARY KEY DEFAULT 1,
    default_rate      numeric(4,2) NOT NULL DEFAULT 10,
    early_bird_rate   numeric(4,2) NOT NULL DEFAULT 7,
    early_bird_active boolean      NOT NULL DEFAULT true,
    package_rates     jsonb        NOT NULL DEFAULT '{"standard":10,"professional":8,"enterprise":6}'::jsonb,
    revenue_tiers     jsonb        NOT NULL DEFAULT '[{"min_revenue":0,"rate":10},{"min_revenue":25000,"rate":8},{"min_revenue":100000,"rate":6}]'::jsonb,
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT commission_settings_singleton CHECK (id = 1)
);
INSERT INTO public.commission_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commission_settings_admin" ON public.commission_settings;
CREATE POLICY "commission_settings_admin" ON public.commission_settings
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 2) Pro-Anbieter: Override + Early-Bird-Markierung ──
ALTER TABLE public.service_providers
    ADD COLUMN IF NOT EXISTS commission_override numeric(4,2),
    ADD COLUMN IF NOT EXISTS early_bird boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_providers.commission_override IS
    'Individueller Provisionssatz. Wenn gesetzt, überschreibt er das generische Modell.';
COMMENT ON COLUMN public.service_providers.early_bird IS
    'Früh-Partner: erhält den Early-Bird-Satz (sofern in commission_settings aktiv).';

-- Bestehende Daten schonend übernehmen:
--   • Wer aktuell 7% hat, war Early Bird → markieren.
UPDATE public.service_providers SET early_bird = true
    WHERE commission_rate = 7 AND early_bird = false;
--   • Wer einen "krummen" Satz (nicht 7/10) hat, hatte eine Sondervereinbarung
--     → als Override sichern, damit die Neuberechnung ihn nicht überschreibt.
UPDATE public.service_providers SET commission_override = commission_rate
    WHERE commission_rate IS NOT NULL
      AND commission_rate NOT IN (7, 10)
      AND commission_override IS NULL;

-- ── 3) Funktionen ──

-- bezahlter Lebenszeit-Umsatz eines Anbieters
CREATE OR REPLACE FUNCTION public.provider_paid_revenue(p_id uuid)
RETURNS numeric LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(SUM(total), 0) FROM public.orders
     WHERE provider_id = p_id AND payment_status = 'paid';
$$;

-- effektiven Satz berechnen (ohne zu speichern)
CREATE OR REPLACE FUNCTION public.compute_commission_rate(p_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    sp   public.service_providers%ROWTYPE;
    s    public.commission_settings%ROWTYPE;
    pkg  text;
    rev  numeric;
    cand numeric[];
    tier jsonb;
    tierbest numeric;
    result numeric;
BEGIN
    SELECT * INTO sp FROM public.service_providers WHERE id = p_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF sp.commission_override IS NOT NULL THEN RETURN sp.commission_override; END IF;

    SELECT * INTO s FROM public.commission_settings WHERE id = 1;
    IF NOT FOUND THEN RETURN COALESCE(sp.commission_rate, 10); END IF;

    pkg := CASE
        WHEN sp.subscription_plan IN ('ent_monthly','ent_yearly') THEN 'enterprise'
        WHEN sp.subscription_plan IN ('pro_monthly','pro_yearly')
             OR sp.subscription_tier = 'professional' THEN 'professional'
        ELSE 'standard' END;

    cand := ARRAY[ s.default_rate ];
    IF s.package_rates ? pkg THEN
        cand := cand || (s.package_rates ->> pkg)::numeric;
    END IF;
    IF COALESCE(sp.early_bird, false) AND COALESCE(s.early_bird_active, false) THEN
        cand := cand || s.early_bird_rate;
    END IF;

    -- Umsatzstaffel: höchste erreichte Schwelle gewinnt
    rev := public.provider_paid_revenue(p_id);
    tierbest := NULL;
    FOR tier IN SELECT * FROM jsonb_array_elements(COALESCE(s.revenue_tiers, '[]'::jsonb))
    LOOP
        IF rev >= (tier ->> 'min_revenue')::numeric THEN
            IF tierbest IS NULL OR (tier ->> 'rate')::numeric < tierbest THEN
                tierbest := (tier ->> 'rate')::numeric;
            END IF;
        END IF;
    END LOOP;
    IF tierbest IS NOT NULL THEN cand := cand || tierbest; END IF;

    SELECT MIN(x) INTO result FROM unnest(cand) AS x;  -- günstigster Satz
    RETURN result;
END $$;

-- effektiven Satz berechnen UND in commission_rate speichern
CREATE OR REPLACE FUNCTION public.recompute_commission_rate(p_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r numeric;
BEGIN
    r := public.compute_commission_rate(p_id);
    UPDATE public.service_providers SET commission_rate = r WHERE id = p_id;
    RETURN r;
END $$;

-- alle Anbieter neu berechnen (Admin-Knopf)
CREATE OR REPLACE FUNCTION public.recompute_all_commission_rates()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; rec record;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
    FOR rec IN SELECT id FROM public.service_providers LOOP
        PERFORM public.recompute_commission_rate(rec.id);
        n := n + 1;
    END LOOP;
    RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.recompute_all_commission_rates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_all_commission_rates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_commission_rate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_commission_rate(uuid) TO authenticated;

-- ── 4) Auto-Neuberechnung, wenn eine Bestellung bezahlt wird ──
-- (Umsatzstaffel greift dadurch automatisch für künftige Bestellungen.)
CREATE OR REPLACE FUNCTION public.trg_order_paid_recompute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.payment_status = 'paid' AND NEW.provider_id IS NOT NULL THEN
        PERFORM public.recompute_commission_rate(NEW.provider_id);
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_paid_recompute ON public.orders;
CREATE TRIGGER order_paid_recompute
    AFTER INSERT OR UPDATE OF payment_status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.trg_order_paid_recompute();
