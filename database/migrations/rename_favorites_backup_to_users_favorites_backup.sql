-- Migration: Rename favorites_backup table to users_favorites_backup
-- This provides a clearer naming convention for the favorites backup table
-- If favorites_backup exists, rename it. If neither exists, create users_favorites_backup.

-- Step 1: Check if users_favorites_backup already exists
DO $$
BEGIN
    -- If users_favorites_backup already exists, do nothing
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users_favorites_backup'
    ) THEN
        RAISE NOTICE 'Table users_favorites_backup already exists. Skipping migration.';
    -- If favorites_backup exists, rename it
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'favorites_backup'
    ) THEN
        EXECUTE 'ALTER TABLE favorites_backup RENAME TO users_favorites_backup';
        RAISE NOTICE 'Table favorites_backup renamed to users_favorites_backup.';
    -- If neither exists, create the table
    ELSE
        EXECUTE 'CREATE TABLE users_favorites_backup (
            id SERIAL PRIMARY KEY,
            favorited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            favorited_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            favorited_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
        )';
        RAISE NOTICE 'Table users_favorites_backup created.';
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
        WHERE tablename = 'users_favorites_backup' 
        AND indexname LIKE '%favorites_backup%'
    LOOP
        EXECUTE 'ALTER INDEX IF EXISTS ' || quote_ident(idx_record.indexname) || 
                ' RENAME TO ' || replace(idx_record.indexname, 'favorites_backup', 'users_favorites_backup');
    END LOOP;
END $$;

-- Step 3: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_users_favorites_backup_favorited_by ON users_favorites_backup(favorited_by);
CREATE INDEX IF NOT EXISTS idx_users_favorites_backup_favorited_user_id ON users_favorites_backup(favorited_user_id);
CREATE INDEX IF NOT EXISTS idx_users_favorites_backup_blocker_id ON users_favorites_backup(blocker_id);
CREATE INDEX IF NOT EXISTS idx_users_favorites_backup_blocked_id ON users_favorites_backup(blocked_id);
CREATE INDEX IF NOT EXISTS idx_users_favorites_backup_blocker_blocked ON users_favorites_backup(blocker_id, blocked_id);

-- Step 4: Update table comment
COMMENT ON TABLE users_favorites_backup IS 'Stores backup of favorite relationships before they are deleted during user blocking. Used to restore favorites when users unblock each other. Columns: favorited_by, favorited_user_id, favorited_date, blocked_at, blocker_id, blocked_id.';

-- Step 5: Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users_favorites_backup'
ORDER BY ordinal_position;

-- Step 6: Verify table rename
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name = 'users_favorites_backup';























































































































