-- Migration: Clear expired Google Places photo URLs from service_providers
--
-- Background: A backfill job at some point populated `logo_url` and
-- `cover_image_url` with Google Places API v1 photo URLs of the form
--   https://places.googleapis.com/v1/places/.../photos/.../media?...&key=...
-- Google's photo `name` tokens are only valid for a short window after the
-- Places lookup that produced them. Once cached, they expire and the endpoint
-- returns HTTP 400 "The photo resource in the request is invalid".
--
-- Effect on the app: AsyncImage spins forever, no fallback shown.
-- The client now filters these URLs out (see ImageURLSanitizing.swift) but
-- this migration removes the dead data so URLCache doesn't keep error
-- responses around and so re-imports later don't think these are valid.

UPDATE public.service_providers
   SET logo_url = NULL
 WHERE logo_url ILIKE '%places.googleapis.com%'
    OR logo_url ILIKE '%maps.googleapis.com/maps/api/place/photo%';

UPDATE public.service_providers
   SET cover_image_url = NULL
 WHERE cover_image_url ILIKE '%places.googleapis.com%'
    OR cover_image_url ILIKE '%maps.googleapis.com/maps/api/place/photo%';

-- Optional: report how many rows were affected
DO $$
DECLARE
  remaining_logos INT;
  remaining_covers INT;
BEGIN
  SELECT COUNT(*) INTO remaining_logos
    FROM public.service_providers
   WHERE logo_url IS NOT NULL;
  SELECT COUNT(*) INTO remaining_covers
    FROM public.service_providers
   WHERE cover_image_url IS NOT NULL;
  RAISE NOTICE 'After cleanup: % providers still have a logo_url, % still have a cover_image_url',
    remaining_logos, remaining_covers;
END $$;
