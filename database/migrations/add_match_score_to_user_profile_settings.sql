-- Add match_score column to user_profile_settings table
-- This column stores the user's minimum match score filter preference (e.g., 50, 60, 70, 80, 90)

-- Add the column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_profile_settings' 
        AND column_name = 'match_score'
    ) THEN
        ALTER TABLE user_profile_settings 
        ADD COLUMN match_score INTEGER;
        
        COMMENT ON COLUMN user_profile_settings.match_score IS 'Minimum match score filter preference (50, 60, 70, 80, 90, or NULL for all matches)';
    END IF;
END $$;

