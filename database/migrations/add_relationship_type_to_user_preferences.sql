-- Add relationship_type column to user_preferences table
-- This column stores the user's preferred relationship type (e.g., Serious Relationship, Casual Dating, etc.)

-- Add the column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_preferences' 
        AND column_name = 'relationship_type'
    ) THEN
        ALTER TABLE user_preferences 
        ADD COLUMN relationship_type VARCHAR(255);
        
        COMMENT ON COLUMN user_preferences.relationship_type IS 'Preferred relationship type (e.g., Serious Relationship, Casual Dating, Marriage, etc.)';
    END IF;
END $$;





























