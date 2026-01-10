-- Migration: Rename deleted_user_placeholders to users_deleted
-- Add real_name and email columns, remove user_data JSONB column

-- Step 1: Rename the table
ALTER TABLE IF EXISTS deleted_user_placeholders 
RENAME TO users_deleted;

-- Step 2: Drop the user_data JSONB column if it exists
ALTER TABLE users_deleted 
DROP COLUMN IF EXISTS user_data;

-- Step 3: Add real_name and email columns if they don't exist
ALTER TABLE users_deleted 
ADD COLUMN IF NOT EXISTS real_name VARCHAR(255) NOT NULL DEFAULT 'Deleted User';

ALTER TABLE users_deleted 
ADD COLUMN IF NOT EXISTS email VARCHAR(255) NOT NULL DEFAULT '';

-- Step 4: Update existing rows to have proper defaults (if any exist)
UPDATE users_deleted 
SET real_name = 'Deleted User', email = '' 
WHERE real_name IS NULL OR email IS NULL;

-- Step 5: Make columns NOT NULL (after setting defaults)
ALTER TABLE users_deleted 
ALTER COLUMN real_name SET NOT NULL,
ALTER COLUMN email SET NOT NULL;

-- Step 6: Rename indexes
DROP INDEX IF EXISTS idx_deleted_user_placeholders_receiver;
DROP INDEX IF EXISTS idx_deleted_user_placeholders_deleted_user;
DROP INDEX IF EXISTS idx_deleted_user_placeholders_user_data;

CREATE INDEX IF NOT EXISTS idx_users_deleted_receiver ON users_deleted(receiver_id);
CREATE INDEX IF NOT EXISTS idx_users_deleted_deleted_user ON users_deleted(deleted_user_id);

-- Step 7: Add comment to document the table
COMMENT ON TABLE users_deleted IS 'Stores deleted user information (real_name, email) for receivers who had conversations with them';
















































































































































































































