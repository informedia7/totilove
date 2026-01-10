-- Migration: Update users_deleted table to final structure
-- Structure: id, deleted_user_id (UNIQUE), real_name, email, created_at
-- No receiver_id - this is a global list of deleted users

-- Step 1: Drop receiver_id column if it exists
ALTER TABLE users_deleted 
DROP COLUMN IF EXISTS receiver_id;

-- Step 2: Drop old constraints and indexes
ALTER TABLE users_deleted 
DROP CONSTRAINT IF EXISTS users_deleted_receiver_id_deleted_user_id_key;

DROP INDEX IF EXISTS idx_users_deleted_receiver;

-- Step 3: Ensure required columns exist
ALTER TABLE users_deleted 
ADD COLUMN IF NOT EXISTS deleted_user_id INTEGER;

ALTER TABLE users_deleted 
ADD COLUMN IF NOT EXISTS real_name VARCHAR(255);

ALTER TABLE users_deleted 
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE users_deleted 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Step 4: Make columns NOT NULL (after ensuring they exist)
-- First, update any NULL values
UPDATE users_deleted 
SET deleted_user_id = id 
WHERE deleted_user_id IS NULL;

UPDATE users_deleted 
SET real_name = 'Deleted User' 
WHERE real_name IS NULL OR real_name = '';

UPDATE users_deleted 
SET email = 'deleted_' || COALESCE(deleted_user_id::text, id::text) || '@deleted.local' 
WHERE email IS NULL OR email = '';

UPDATE users_deleted 
SET created_at = CURRENT_TIMESTAMP 
WHERE created_at IS NULL;

-- Step 5: Remove duplicate entries for deleted_user_id
-- Keep only the most recent entry (highest id or latest created_at) for each deleted_user_id
DELETE FROM users_deleted
WHERE id NOT IN (
    SELECT DISTINCT ON (deleted_user_id) id
    FROM users_deleted
    WHERE deleted_user_id IS NOT NULL
    ORDER BY deleted_user_id, created_at DESC, id DESC
);

-- Step 6: Now make columns NOT NULL
ALTER TABLE users_deleted 
ALTER COLUMN deleted_user_id SET NOT NULL;

ALTER TABLE users_deleted 
ALTER COLUMN real_name SET NOT NULL;

ALTER TABLE users_deleted 
ALTER COLUMN email SET NOT NULL;

-- Step 7: Add unique constraint on deleted_user_id (each deleted user appears once)
ALTER TABLE users_deleted 
DROP CONSTRAINT IF EXISTS users_deleted_deleted_user_id_key;

ALTER TABLE users_deleted 
ADD CONSTRAINT users_deleted_deleted_user_id_key UNIQUE (deleted_user_id);

-- Step 8: Recreate index on deleted_user_id for faster lookups
DROP INDEX IF EXISTS idx_users_deleted_deleted_user;

CREATE INDEX IF NOT EXISTS idx_users_deleted_deleted_user ON users_deleted(deleted_user_id);

-- Step 9: Update table comment
COMMENT ON TABLE users_deleted IS 'Stores deleted user information: deleted_user_id, real_name, email, and when deleted (created_at). This is a global list - no receiver_id. Use messages table to determine which users should see deleted users in their conversation list.';

-- Step 10: Verify final structure
-- Expected columns:
--   - id (SERIAL PRIMARY KEY)
--   - deleted_user_id (INTEGER NOT NULL, UNIQUE)
--   - real_name (VARCHAR(255) NOT NULL)
--   - email (VARCHAR(255) NOT NULL)
--   - created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

-- Verification query (uncomment to run):
-- SELECT 
--     column_name, 
--     data_type, 
--     is_nullable,
--     column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'users_deleted' 
-- ORDER BY ordinal_position;


































































































































































































