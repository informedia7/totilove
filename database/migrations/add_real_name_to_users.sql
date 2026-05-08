-- Migration: Add real_name column to users table
-- This migration adds support for real names instead of real_names

-- Step 1: Add real_name column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS real_name VARCHAR(255);

-- Step 2: Migrate existing real_name data to real_name (for backward compatibility)
UPDATE users 
SET real_name = real_name 
WHERE real_name IS NULL AND real_name IS NOT NULL;

-- Step 3: Make real_name nullable (optional for backward compatibility)
-- Note: We keep real_name column for now to maintain backward compatibility
-- It can be removed later if not needed
ALTER TABLE users 
ALTER COLUMN real_name DROP NOT NULL;

-- Step 4: Add index for real_name searches (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_users_real_name ON users(real_name);

-- Step 5: Update users_deleted table to include real_name
ALTER TABLE users_deleted 
ADD COLUMN IF NOT EXISTS real_name VARCHAR(255);

-- Step 6: Migrate existing real_name data in users_deleted
UPDATE users_deleted 
SET real_name = real_name 
WHERE real_name IS NULL AND real_name IS NOT NULL;

-- Step 7: Add comment to document the change
COMMENT ON COLUMN users.real_name IS 'User real name (replaces real_name for display purposes). Can be edited by user.';
COMMENT ON COLUMN users.real_name IS 'Legacy real_name field. Kept for backward compatibility. Can be NULL.';

-- Verification query (uncomment to run)
-- SELECT id, real_name, real_name, email FROM users LIMIT 10;








































































































