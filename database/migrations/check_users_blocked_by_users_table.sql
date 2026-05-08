-- Check if users_blocked_by_users table exists
-- This script checks for both the new name and old name (blocked_users)

-- Check if users_blocked_by_users exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'users_blocked_by_users'
        ) THEN 'Table "users_blocked_by_users" EXISTS ✓'
        ELSE 'Table "users_blocked_by_users" DOES NOT EXIST ✗'
    END as table_status;

-- Check if blocked_users exists (old name)
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'blocked_users'
        ) THEN 'Table "blocked_users" EXISTS (needs migration) ⚠'
        ELSE 'Table "blocked_users" does not exist ✓'
    END as old_table_status;

-- If users_blocked_by_users exists, show its structure
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users_blocked_by_users'
    ) THEN
        RAISE NOTICE 'Table users_blocked_by_users structure:';
    END IF;
END $$;

-- Show table columns if table exists
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users_blocked_by_users'
ORDER BY ordinal_position;
























































































































