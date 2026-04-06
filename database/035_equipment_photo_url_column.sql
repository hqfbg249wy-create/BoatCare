-- Migration 035: Add photo_url column to equipment table
-- The app stores comma-separated photo URLs in this column
-- but the column was never added to the equipment table.

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS item_description TEXT DEFAULT '';
