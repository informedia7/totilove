-- Migration: Rename matches table to user_matches
-- This provides a clearer naming convention for the matches relationship table
-- If matches exists, rename it. If neither exists, create user_matches.

-- Step 1: Check if user_matches already exists
DO $$
BEGIN
    -- If user_matches already exists, do nothing
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_matches'
    ) THEN
        RAISE NOTICE 'Table user_matches already exists. Skipping migration.';
    -- If matches exists, rename it
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'matches'
    ) THEN
        EXECUTE 'ALTER TABLE matches RENAME TO user_matches';
        RAISE NOTICE 'Table matches renamed to user_matches.';
    -- If neither exists, create the table
    ELSE
        EXECUTE 'CREATE TABLE user_matches (
            id SERIAL PRIMARY KEY,
            user1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            user2_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(20)
        )';
        RAISE NOTICE 'Table user_matches created.';
    END IF;
END $$;

-- Step 2: Rename any indexes that reference the old table name
DO $$
DECLARE
    idx_record RECORD;
BEGIN
    FOR idx_record IN 
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'user_matches' 
        AND indexname LIKE '%matches%'
    LOOP
        EXECUTE 'ALTER INDEX IF EXISTS ' || quote_ident(idx_record.indexname) || 
                ' RENAME TO ' || replace(idx_record.indexname, 'matches', 'user_matches');
    END LOOP;
END $$;

-- Step 3: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_user_matches_user1_id ON user_matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_user_matches_user2_id ON user_matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_user_matches_user1_user2 ON user_matches(user1_id, user2_id);
CREATE INDEX IF NOT EXISTS idx_user_matches_match_date ON user_matches(match_date);

-- Step 4: Update table comment
COMMENT ON TABLE user_matches IS 'Stores match relationships between users. Records when two users have matched (mutual likes). Columns: user1_id, user2_id (the two users who matched), match_date (when matched), status (match status).';

-- Step 5: Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'user_matches'
ORDER BY ordinal_position;

-- Step 6: Verify table rename
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name = 'user_matches';























































































































