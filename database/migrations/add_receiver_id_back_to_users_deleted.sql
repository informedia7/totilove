-- Migration: Add receiver_id back to users_deleted table
-- Since messages are deleted when user is deleted, we need receiver_id to track
-- which users should see deleted users in their conversation list

-- Step 1: Add receiver_id column back
ALTER TABLE users_deleted 
ADD COLUMN IF NOT EXISTS receiver_id INTEGER;

-- Step 2: For existing entries without receiver_id, we can't determine who should see them
-- (messages are already deleted). These entries will need to be handled manually or
-- recreated when the system processes deleted users again.

-- Step 3: Make receiver_id NOT NULL for new entries (but allow NULL for existing ones temporarily)
-- We'll update this constraint after populating receiver_id for existing entries

-- Step 4: Drop the unique constraint on deleted_user_id (since we'll have receiver_id again)
ALTER TABLE users_deleted 
DROP CONSTRAINT IF EXISTS users_deleted_deleted_user_id_key;

-- Step 5: Add unique constraint on (receiver_id, deleted_user_id)
-- This allows the same deleted user to appear for multiple receivers
ALTER TABLE users_deleted 
DROP CONSTRAINT IF EXISTS users_deleted_receiver_id_deleted_user_id_key;

-- Note: We can't add the constraint yet if receiver_id has NULL values
-- We'll add it after populating receiver_id

-- Step 6: Recreate index on receiver_id
CREATE INDEX IF NOT EXISTS idx_users_deleted_receiver ON users_deleted(receiver_id);

-- Step 7: Update table comment
COMMENT ON TABLE users_deleted IS 'Stores deleted user information for each receiver. When a user is deleted, entries are created for all users who had messages with them (before messages are deleted).';

-- IMPORTANT: After running this migration, you need to:
-- 1. Update deleteUser function to populate receiver_id BEFORE deleting messages
-- 2. Populate receiver_id for existing entries (if possible from other sources)
-- 3. Then make receiver_id NOT NULL and add the unique constraint


































































































































































































