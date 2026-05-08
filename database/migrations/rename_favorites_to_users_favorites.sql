-- Migration: Rename favorites table to users_favorites
-- This provides a clearer naming convention for the favorites relationship table
-- If favorites exists, rename it. If neither exists, create users_favorites.

-- Step 1: Check if users_favorites already exists
DO $$
BEGIN
    -- If users_favorites already exists, do nothing
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users_favorites'
    ) THEN
        RAISE NOTICE 'Table users_favorites already exists. Skipping migration.';
    -- If favorites exists, rename it
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'favorites'
    ) THEN
        EXECUTE 'ALTER TABLE favorites RENAME TO users_favorites';
        RAISE NOTICE 'Table favorites renamed to users_favorites.';
    -- If neither exists, create the table
    ELSE
        EXECUTE 'CREATE TABLE users_favorites (
            id SERIAL PRIMARY KEY,
            favorited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            favorited_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            favorited_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
        RAISE NOTICE 'Table users_favorites created.';
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
        WHERE tablename = 'users_favorites' 
        AND indexname LIKE '%favorites%'
    LOOP
        EXECUTE 'ALTER INDEX IF EXISTS ' || quote_ident(idx_record.indexname) || 
                ' RENAME TO ' || replace(idx_record.indexname, 'favorites', 'users_favorites');
    END LOOP;
END $$;

-- Step 3: Add unique constraint if it doesn't exist (to prevent duplicate favorites)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_user_favorite'
        AND conrelid = 'users_favorites'::regclass
    ) THEN
        ALTER TABLE users_favorites 
        ADD CONSTRAINT unique_user_favorite UNIQUE (favorited_by, favorited_user_id);
    END IF;
END $$;

-- Step 4: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_users_favorites_favorited_by ON users_favorites(favorited_by);
CREATE INDEX IF NOT EXISTS idx_users_favorites_favorited_user_id ON users_favorites(favorited_user_id);
CREATE INDEX IF NOT EXISTS idx_users_favorites_favorited_date ON users_favorites(favorited_date);
CREATE INDEX IF NOT EXISTS idx_users_favorites_favorited_by_date ON users_favorites(favorited_by, favorited_date DESC);

-- Step 5: Update table comment
COMMENT ON TABLE users_favorites IS 'Stores favorite relationships between users. Records when one user favorites another user. Columns: favorited_by (who favorited), favorited_user_id (who was favorited), favorited_date (when favorited).';

-- Step 6: Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users_favorites'
ORDER BY ordinal_position;

-- Step 7: Verify table rename
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name = 'users_favorites';























































































































