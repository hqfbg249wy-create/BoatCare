-- Migration 010: Add is_verified column to service_providers
-- Needed for the new provider approval flow

ALTER TABLE public.service_providers
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- All existing (admin-imported) providers are considered verified
UPDATE public.service_providers
    SET is_verified = TRUE
    WHERE is_verified = FALSE;

-- Index for faster filtering
CREATE INDEX IF NOT EXISTS idx_service_providers_is_verified
    ON public.service_providers (is_verified);
