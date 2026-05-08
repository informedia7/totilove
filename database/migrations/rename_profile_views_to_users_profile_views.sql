-- Migration: Rename profile_views table to users_profile_views
-- This provides a clearer naming convention for the profile views relationship table
-- If profile_views exists, rename it. If neither exists, create users_profile_views.

-- Step 1: Check if users_profile_views already exists
DO $$
BEGIN
    -- If users_profile_views already exists, do nothing
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users_profile_views'
    ) THEN
        RAISE NOTICE 'Table users_profile_views already exists. Skipping migration.';
    -- If profile_views exists, rename it
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'profile_views'
    ) THEN
        EXECUTE 'ALTER TABLE profile_views RENAME TO users_profile_views';
        RAISE NOTICE 'Table profile_views renamed to users_profile_views.';
    -- If neither exists, create the table
    ELSE
        EXECUTE 'CREATE TABLE users_profile_views (
            id SERIAL PRIMARY KEY,
            viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            viewed_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_user_profile_view UNIQUE (viewer_id, viewed_user_id)
        )';
        RAISE NOTICE 'Table users_profile_views created.';
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
        WHERE tablename = 'users_profile_views' 
        AND indexname LIKE '%profile_views%'
    LOOP
        EXECUTE 'ALTER INDEX IF EXISTS ' || quote_ident(idx_record.indexname) || 
                ' RENAME TO ' || replace(idx_record.indexname, 'profile_views', 'users_profile_views');
    END LOOP;
END $$;

-- Step 3: Add unique constraint if it doesn't exist (required for ON CONFLICT in code)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_user_profile_view'
        AND conrelid = 'users_profile_views'::regclass
    ) THEN
        ALTER TABLE users_profile_views 
        ADD CONSTRAINT unique_user_profile_view UNIQUE (viewer_id, viewed_user_id);
    END IF;
END $$;

-- Step 4: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_users_profile_views_viewer_id ON users_profile_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_users_profile_views_viewed_user_id ON users_profile_views(viewed_user_id);
CREATE INDEX IF NOT EXISTS idx_users_profile_views_viewed_at ON users_profile_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_users_profile_views_viewed_user_viewed_at ON users_profile_views(viewed_user_id, viewed_at DESC);

-- Step 5: Update table comment
COMMENT ON TABLE users_profile_views IS 'Stores profile view relationships between users. Records when one user views another user''s profile. Columns: viewer_id (who viewed), viewed_user_id (who was viewed), viewed_at (when viewed).';

-- Step 6: Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users_profile_views'
ORDER BY ordinal_position;

-- Step 7: Verify table rename
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name = 'users_profile_views';

