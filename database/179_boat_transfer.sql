-- =====================================================================
-- 179_boat_transfer.sql
-- Boot-Uebergabe per Key (Schiffsverkauf): Der Verkaeufer erzeugt einen
-- Uebergabe-Key fuer ein Boot. Der Kaeufer loest den Key in seinem Konto ein
-- und erhaelt eine eigenstaendige KOPIE des Bootes inkl. gesamter Ausruestung,
-- Fotos, Mess-/Tauwerk-Daten und Wartungshistorie. Der Verkaeufer behaelt
-- sein Original (reine Kopie, keine Loeschung).
--
-- Die eigentliche Tiefen-Kopie beim Einloesen macht die Edge Function
-- `redeem-boat-transfer` mit Service-Role (umgeht RLS). Diese Tabelle haelt
-- nur Key, Status und Verknuepfungen.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.boat_transfers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    boat_id          UUID NOT NULL REFERENCES public.boats(id) ON DELETE CASCADE,
    key              TEXT NOT NULL UNIQUE,
    created_by       UUID NOT NULL DEFAULT auth.uid(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 days'),
    status           TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'redeemed', 'revoked')),
    redeemed_by      UUID,
    redeemed_at      TIMESTAMPTZ,
    redeemed_boat_id UUID REFERENCES public.boats(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_boat_transfers_key ON public.boat_transfers(key);
CREATE INDEX IF NOT EXISTS idx_boat_transfers_created_by ON public.boat_transfers(created_by);

ALTER TABLE public.boat_transfers ENABLE ROW LEVEL SECURITY;

-- Verkaeufer verwaltet seine eigenen Uebergaben. Das Einloesen laeuft ueber
-- die Edge Function mit Service-Role, daher braucht der Kaeufer hier keinen
-- direkten Lese-/Schreibzugriff auf fremde Zeilen.
DROP POLICY IF EXISTS boat_transfers_owner_select ON public.boat_transfers;
CREATE POLICY boat_transfers_owner_select ON public.boat_transfers
    FOR SELECT TO authenticated
    USING (created_by = auth.uid());

DROP POLICY IF EXISTS boat_transfers_owner_insert ON public.boat_transfers;
CREATE POLICY boat_transfers_owner_insert ON public.boat_transfers
    FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (SELECT 1 FROM public.boats b WHERE b.id = boat_id AND b.owner_id = auth.uid())
    );

DROP POLICY IF EXISTS boat_transfers_owner_update ON public.boat_transfers;
CREATE POLICY boat_transfers_owner_update ON public.boat_transfers
    FOR UPDATE TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS boat_transfers_owner_delete ON public.boat_transfers;
CREATE POLICY boat_transfers_owner_delete ON public.boat_transfers
    FOR DELETE TO authenticated
    USING (created_by = auth.uid());
