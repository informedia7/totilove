-- Migration: Rename likes_backup table to users_likes_backup
-- This provides a clearer naming convention for the likes backup table
-- If likes_backup exists, rename it. If neither exists, create users_likes_backup.

-- Step 1: Check if users_likes_backup already exists
DO $$
BEGIN
    -- If users_likes_backup already exists, do nothing
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users_likes_backup'
    ) THEN
        RAISE NOTICE 'Table users_likes_backup already exists. Skipping migration.';
    -- If likes_backup exists, rename it
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'likes_backup'
    ) THEN
        EXECUTE 'ALTER TABLE likes_backup RENAME TO users_likes_backup';
        RAISE NOTICE 'Table likes_backup renamed to users_likes_backup.';
    -- If neither exists, create the table
    ELSE
        EXECUTE 'CREATE TABLE users_likes_backup (
            id SERIAL PRIMARY KEY,
            liked_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            liked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
        )';
        RAISE NOTICE 'Table users_likes_backup created.';
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
        WHERE tablename = 'users_likes_backup' 
        AND indexname LIKE '%likes_backup%'
    LOOP
        EXECUTE 'ALTER INDEX IF EXISTS ' || quote_ident(idx_record.indexname) || 
                ' RENAME TO ' || replace(idx_record.indexname, 'likes_backup', 'users_likes_backup');
    END LOOP;
END $$;

-- Step 3: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_users_likes_backup_liked_by ON users_likes_backup(liked_by);
CREATE INDEX IF NOT EXISTS idx_users_likes_backup_liked_user_id ON users_likes_backup(liked_user_id);
CREATE INDEX IF NOT EXISTS idx_users_likes_backup_blocker_id ON users_likes_backup(blocker_id);
CREATE INDEX IF NOT EXISTS idx_users_likes_backup_blocked_id ON users_likes_backup(blocked_id);
CREATE INDEX IF NOT EXISTS idx_users_likes_backup_blocker_blocked ON users_likes_backup(blocker_id, blocked_id);

-- Step 4: Update table comment
COMMENT ON TABLE users_likes_backup IS 'Stores backup of like relationships before they are deleted during user blocking. Used to restore likes when users unblock each other. Columns: liked_by, liked_user_id, created_at, blocked_at, blocker_id, blocked_id.';

-- Step 5: Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users_likes_backup'
ORDER BY ordinal_position;

-- Step 6: Verify table rename
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name = 'users_likes_backup';























































































































