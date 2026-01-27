-- Migration: Add metadata column to user_images table
-- Date: 2024-01-01
-- Description: Adds support for image metadata storage
-- Notes: 
--   - featured column already exists in the database
--   - thumbnail_path column already exists in the database (but not currently used by code)

-- Add metadata column (JSONB, nullable)
-- This stores image metadata like dimensions, format, size, etc.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_images' 
        AND column_name = 'metadata'
    ) THEN
        ALTER TABLE user_images 
        ADD COLUMN metadata JSONB;
        
        -- Create GIN index for JSONB queries
        CREATE INDEX IF NOT EXISTS idx_user_images_metadata 
        ON user_images USING GIN (metadata);
        
        RAISE NOTICE 'Added metadata column to user_images table';
    ELSE
        RAISE NOTICE 'metadata column already exists in user_images table';
    END IF;
END $$;

-- Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_images' 
AND column_name IN ('featured', 'metadata', 'thumbnail_path')
ORDER BY column_name;

-- Note: thumbnail_path column exists but is not currently used by the code.
-- Thumbnails are generated and returned in API responses but not stored in database.

