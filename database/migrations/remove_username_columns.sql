-- Migration: Remove real_name columns from users and users_deleted tables
-- This migration removes the legacy real_name columns after migrating to real_name
-- 
-- WARNING: Make sure all data has been migrated to real_name before running this!
-- Run the JavaScript migration script first: scripts/migrate-real_name-to-realname.js

-- Step 1: Check if there are any indexes on real_name column in users table
-- Drop indexes if they exist
DO $$
BEGIN
    -- Drop index on real_name if it exists
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'users' 
        AND indexname LIKE '%real_name%'
    ) THEN
        DROP INDEX IF EXISTS idx_users_real_name;
        DROP INDEX IF EXISTS users_real_name_idx;
        DROP INDEX IF EXISTS users_real_name_key;
    END IF;
END $$;

-- Step 2: Drop unique constraint on real_name if it exists (users table)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname LIKE '%real_name%' 
        AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_real_name_key;
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_real_name_unique;
    END IF;
END $$;

-- Step 3: Remove real_name column from users table
ALTER TABLE users 
DROP COLUMN IF EXISTS real_name;

-- Step 4: Check if there are any indexes on real_name column in users_deleted table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'users_deleted' 
        AND indexname LIKE '%real_name%'
    ) THEN
        DROP INDEX IF EXISTS idx_users_deleted_real_name;
        DROP INDEX IF EXISTS users_deleted_real_name_idx;
    END IF;
END $$;

-- Step 5: Remove real_name column from users_deleted table
ALTER TABLE users_deleted 
DROP COLUMN IF EXISTS real_name;

-- Step 6: Add comment to document the change
COMMENT ON COLUMN users.real_name IS 'User real name (replaces legacy real_name). Can be edited by user.';
COMMENT ON TABLE users IS 'Main user accounts table. Username column has been removed - use real_name instead.';

-- Verification queries (uncomment to run)
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('real_name', 'real_name');
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users_deleted' AND column_name IN ('real_name', 'real_name');








































































































