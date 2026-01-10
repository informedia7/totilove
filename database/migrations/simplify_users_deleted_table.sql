-- Migration: Simplify users_deleted table structure
-- Remove receiver_id column - table now only contains deleted user info
-- Columns: deleted_user_id, real_name, email, created_at

-- Step 1: Drop the receiver_id column if it exists
ALTER TABLE users_deleted 
DROP COLUMN IF EXISTS receiver_id;

-- Step 2: Drop the unique constraint on (receiver_id, deleted_user_id) if it exists
ALTER TABLE users_deleted 
DROP CONSTRAINT IF EXISTS users_deleted_receiver_id_deleted_user_id_key;

-- Step 3: Drop indexes related to receiver_id if they exist
DROP INDEX IF EXISTS idx_users_deleted_receiver;

-- Step 4: Ensure the table has only the required columns
-- (deleted_user_id, real_name, email, created_at should already exist)

-- Step 5: Remove duplicate entries for deleted_user_id before adding unique constraint
-- Keep only the most recent entry (highest id or latest created_at) for each deleted_user_id
DELETE FROM users_deleted
WHERE id NOT IN (
    SELECT DISTINCT ON (deleted_user_id) id
    FROM users_deleted
    ORDER BY deleted_user_id, created_at DESC, id DESC
);

-- Step 6: Add unique constraint on deleted_user_id (each deleted user appears once)
ALTER TABLE users_deleted 
DROP CONSTRAINT IF EXISTS users_deleted_deleted_user_id_key;

ALTER TABLE users_deleted 
ADD CONSTRAINT users_deleted_deleted_user_id_key UNIQUE (deleted_user_id);

-- Step 6: Update table comment
COMMENT ON TABLE users_deleted IS 'Stores deleted user information: deleted_user_id, real_name, email, and when deleted (created_at). No receiver_id - this is a global list of deleted users.';

-- Step 7: Verify table structure
-- Expected columns:
--   - id (SERIAL PRIMARY KEY)
--   - deleted_user_id (INTEGER NOT NULL, UNIQUE)
--   - real_name (VARCHAR(255) NOT NULL)
--   - email (VARCHAR(255) NOT NULL)
--   - created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

