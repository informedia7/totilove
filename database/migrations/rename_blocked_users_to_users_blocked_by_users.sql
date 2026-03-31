-- Migration: Rename blocked_users table to users_blocked_by_users
-- This provides a clearer naming convention for the blocking relationship table
-- If blocked_users exists, rename it. If neither exists, create users_blocked_by_users.

-- Step 1: Check if users_blocked_by_users already exists
DO $$
BEGIN
    -- If users_blocked_by_users already exists, do nothing
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users_blocked_by_users'
    ) THEN
        RAISE NOTICE 'Table users_blocked_by_users already exists. Skipping migration.';
    -- If blocked_users exists, rename it
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'blocked_users'
    ) THEN
        EXECUTE 'ALTER TABLE blocked_users RENAME TO users_blocked_by_users';
        RAISE NOTICE 'Table blocked_users renamed to users_blocked_by_users.';
    -- If neither exists, create the table
    ELSE
        EXECUTE 'CREATE TABLE users_blocked_by_users (
            id SERIAL PRIMARY KEY,
            blocker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            blocked_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
        RAISE NOTICE 'Table users_blocked_by_users created.';
    END IF;
END $$;

-- Step 2: Rename any indexes that reference the old table name
-- Note: Index names might need to be updated if they explicitly reference 'blocked_users'
-- Check and rename if they exist
DO $$
DECLARE
    idx_record RECORD;
BEGIN
    FOR idx_record IN 
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'users_blocked_by_users' 
        AND indexname LIKE '%blocked_users%'
    LOOP
        EXECUTE 'ALTER INDEX IF EXISTS ' || quote_ident(idx_record.indexname) || 
                ' RENAME TO ' || replace(idx_record.indexname, 'blocked_users', 'users_blocked_by_users');
    END LOOP;
END $$;

-- Step 3: Update table comment
COMMENT ON TABLE users_blocked_by_users IS 'Stores block relationships between users. Records when one user blocks another user. Columns: blocker_id (who blocked), blocked_id (who was blocked), reason (optional), created_at (when blocked).';

-- Step 4: Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users_blocked_by_users' 
ORDER BY ordinal_position;

-- Step 5: Verify table rename
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name = 'users_blocked_by_users';

