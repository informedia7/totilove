-- Migration: Rename likes table to users_likes
-- This provides a clearer naming convention for the likes relationship table
-- If likes exists, rename it. If neither exists, create users_likes.

-- Step 1: Check if users_likes already exists
DO $$
BEGIN
    -- If users_likes already exists, do nothing
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users_likes'
    ) THEN
        RAISE NOTICE 'Table users_likes already exists. Skipping migration.';
    -- If likes exists, rename it
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'likes'
    ) THEN
        EXECUTE 'ALTER TABLE likes RENAME TO users_likes';
        RAISE NOTICE 'Table likes renamed to users_likes.';
    -- If neither exists, create the table
    ELSE
        EXECUTE 'CREATE TABLE users_likes (
            id SERIAL PRIMARY KEY,
            liked_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            liked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
        RAISE NOTICE 'Table users_likes created.';
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
        WHERE tablename = 'users_likes' 
        AND indexname LIKE '%likes%'
    LOOP
        EXECUTE 'ALTER INDEX IF EXISTS ' || quote_ident(idx_record.indexname) || 
                ' RENAME TO ' || replace(idx_record.indexname, 'likes', 'users_likes');
    END LOOP;
END $$;

-- Step 3: Add unique constraint if it doesn't exist (to prevent duplicate likes)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_user_like'
        AND conrelid = 'users_likes'::regclass
    ) THEN
        ALTER TABLE users_likes 
        ADD CONSTRAINT unique_user_like UNIQUE (liked_by, liked_user_id);
    END IF;
END $$;

-- Step 4: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_users_likes_liked_by ON users_likes(liked_by);
CREATE INDEX IF NOT EXISTS idx_users_likes_liked_user_id ON users_likes(liked_user_id);
CREATE INDEX IF NOT EXISTS idx_users_likes_created_at ON users_likes(created_at);
CREATE INDEX IF NOT EXISTS idx_users_likes_liked_by_created_at ON users_likes(liked_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_likes_liked_user_created_at ON users_likes(liked_user_id, created_at DESC);

-- Step 5: Update table comment
COMMENT ON TABLE users_likes IS 'Stores like relationships between users. Records when one user likes another user. Columns: liked_by (who liked), liked_user_id (who was liked), created_at (when liked).';

-- Step 6: Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users_likes'
ORDER BY ordinal_position;

-- Step 7: Verify table rename
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name = 'users_likes';























































































































