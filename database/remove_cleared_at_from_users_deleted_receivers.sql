-- Remove cleared_at column from users_deleted_receivers table
-- Since we're now deleting rows instead of marking them as cleared,
-- the cleared_at column is no longer needed

-- Step 1: Drop the index that uses cleared_at
DROP INDEX IF EXISTS idx_users_deleted_receivers_not_cleared;
DROP INDEX IF EXISTS idx_users_deleted_receivers_cleared_at;

-- Step 2: Remove the comment on the column (if it exists)
COMMENT ON COLUMN users_deleted_receivers.cleared_at IS NULL;

-- Step 3: Drop the cleared_at column
ALTER TABLE users_deleted_receivers 
DROP COLUMN IF EXISTS cleared_at;

-- Step 4: Verify the table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users_deleted_receivers' 
ORDER BY ordinal_position;



















































































































































































