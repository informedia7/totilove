-- Create users_deleted table
-- This is a global list of deleted users (no receiver_id)
-- Structure: id, deleted_user_id (UNIQUE), real_name, email, created_at
-- Use messages table to determine which users should see deleted users in their conversation list

-- Drop table if exists (use with caution - this will delete all data)
-- DROP TABLE IF EXISTS users_deleted CASCADE;

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS users_deleted (
    id SERIAL PRIMARY KEY,
    deleted_user_id INTEGER NOT NULL,
    real_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraint on deleted_user_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'users_deleted_deleted_user_id_key'
    ) THEN
        ALTER TABLE users_deleted 
        ADD CONSTRAINT users_deleted_deleted_user_id_key UNIQUE (deleted_user_id);
    END IF;
END $$;

-- Create index for faster lookups if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_users_deleted_deleted_user ON users_deleted(deleted_user_id);

-- Add table comment
COMMENT ON TABLE users_deleted IS 'Stores deleted user information: deleted_user_id, real_name, email, and when deleted (created_at). This is a global list - no receiver_id. Use messages table to determine which users should see deleted users in their conversation list.';

-- Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users_deleted' 
ORDER BY ordinal_position;
