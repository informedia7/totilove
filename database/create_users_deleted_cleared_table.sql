-- Table to track which receivers have cleared which deleted users
-- When a receiver clicks "Clear" on a deleted user, this prevents the deleted user
-- from appearing in that receiver's conversation list

CREATE TABLE IF NOT EXISTS users_deleted_cleared (
    id SERIAL PRIMARY KEY,
    receiver_id INTEGER NOT NULL,
    deleted_user_id INTEGER NOT NULL,
    cleared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(receiver_id, deleted_user_id)
);

-- Create indexes for faster lookups
CREATE INDEX idx_users_deleted_cleared_receiver ON users_deleted_cleared(receiver_id);
CREATE INDEX idx_users_deleted_cleared_deleted_user ON users_deleted_cleared(deleted_user_id);

-- Add table comment
COMMENT ON TABLE users_deleted_cleared IS 'Tracks which receivers have cleared (hidden) which deleted users from their conversation list. When a receiver clears a deleted user, that deleted user will no longer appear in their conversation list.';

