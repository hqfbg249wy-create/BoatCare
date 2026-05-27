-- Migration 056: Service-Anfragen (Inquiries)
-- Bootsbesitzer können Anfragen an Service-Provider stellen,
-- als Entwurf speichern und absenden.

CREATE TABLE IF NOT EXISTS public.service_inquiries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_id         UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
    boat_id             UUID REFERENCES public.boats(id) ON DELETE SET NULL,
    subject             TEXT NOT NULL,
    message             TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'sent', 'read', 'replied', 'closed')),
    owner_notes         TEXT,           -- interne Notizen des Eigners (nur für ihn sichtbar)
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    sent_at             TIMESTAMPTZ,
    replied_at          TIMESTAMPTZ,
    provider_reply      TEXT            -- Antwort des Providers (für spätere Erweiterung)
);

CREATE INDEX IF NOT EXISTS idx_inquiries_owner    ON public.service_inquiries(owner_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_provider ON public.service_inquiries(provider_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status   ON public.service_inquiries(status);

-- RLS
ALTER TABLE public.service_inquiries ENABLE ROW LEVEL SECURITY;

-- Eigner sieht und verwaltet nur eigene Anfragen
DROP POLICY IF EXISTS "owner_select_own" ON public.service_inquiries;
CREATE POLICY "owner_select_own" ON public.service_inquiries
    FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "owner_insert_own" ON public.service_inquiries;
CREATE POLICY "owner_insert_own" ON public.service_inquiries
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "owner_update_own" ON public.service_inquiries;
CREATE POLICY "owner_update_own" ON public.service_inquiries
    FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "owner_delete_own" ON public.service_inquiries;
CREATE POLICY "owner_delete_own" ON public.service_inquiries
    FOR DELETE USING (auth.uid() = owner_id);

-- Admins sehen alles
DROP POLICY IF EXISTS "admins_all" ON public.service_inquiries;
CREATE POLICY "admins_all" ON public.service_inquiries
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'admin_readonly')
        )
    );

-- updated_at automatisch setzen
CREATE OR REPLACE FUNCTION public.set_inquiry_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    IF NEW.status = 'sent' AND OLD.status = 'draft' THEN
        NEW.sent_at = now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiry_updated_at ON public.service_inquiries;
CREATE TRIGGER trg_inquiry_updated_at
    BEFORE UPDATE ON public.service_inquiries
    FOR EACH ROW EXECUTE FUNCTION public.set_inquiry_updated_at();

-- Ergebnis prüfen
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'service_inquiries' AND table_schema = 'public'
ORDER BY ordinal_position;
