-- 032: Profile Privacy & Personal Data fields
-- Adds DSGVO consent timestamps and phone number to profiles table

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Index for filtering users who accepted privacy (for compliance reporting)
CREATE INDEX IF NOT EXISTS idx_profiles_privacy_accepted
    ON profiles (privacy_accepted_at)
    WHERE privacy_accepted_at IS NOT NULL;

COMMENT ON COLUMN profiles.phone_number IS 'User phone number for contact';
COMMENT ON COLUMN profiles.privacy_accepted_at IS 'Timestamp when user accepted DSGVO privacy policy';
COMMENT ON COLUMN profiles.terms_accepted_at IS 'Timestamp when user accepted terms of service';
