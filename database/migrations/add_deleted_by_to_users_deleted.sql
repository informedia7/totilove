-- Migration: Add deleted_by column to users_deleted table
-- This tracks whether the user was deleted by admin or by the user themselves
-- Values: 'admin' or 'user'

-- Step 1: Add deleted_by column if it doesn't exist
ALTER TABLE users_deleted 
ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(20) DEFAULT 'user';

-- Step 2: Update existing rows to have default value
UPDATE users_deleted 
SET deleted_by = 'user' 
WHERE deleted_by IS NULL;

-- Step 3: Add check constraint to ensure only 'admin' or 'user' values
ALTER TABLE users_deleted 
DROP CONSTRAINT IF EXISTS users_deleted_deleted_by_check;

ALTER TABLE users_deleted 
ADD CONSTRAINT users_deleted_deleted_by_check 
CHECK (deleted_by IN ('admin', 'user'));

-- Step 4: Add comment to document the column
COMMENT ON COLUMN users_deleted.deleted_by IS 'Tracks who deleted the user: ''admin'' (deleted by admin) or ''user'' (deleted by user themselves)';

-- Step 5: Create index for faster queries by deleted_by
CREATE INDEX IF NOT EXISTS idx_users_deleted_deleted_by ON users_deleted(deleted_by);

-- Step 6: Verify the column was added
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users_deleted' 
AND column_name = 'deleted_by';

















































































































































































