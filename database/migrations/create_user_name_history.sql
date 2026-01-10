-- Migration: Create user_name_history table
-- This table tracks all name (real_name) changes made by users for rate limiting and audit purposes

CREATE TABLE IF NOT EXISTS user_name_change_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_real_name VARCHAR(255),
    new_real_name VARCHAR(255) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT,
    CONSTRAINT fk_user_name_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_name_change_history_user_id ON user_name_change_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_name_change_history_changed_at ON user_name_change_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_user_name_change_history_user_changed_at ON user_name_change_history(user_id, changed_at);

-- Add comment
COMMENT ON TABLE user_name_change_history IS 'Tracks all name (real_name) changes made by users for rate limiting (max 1 change per 90 days) and audit purposes';

