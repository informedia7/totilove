-- Table to track deleted user placeholders in conversation lists
-- When a user deletes their account, placeholder entries are created for all receivers
-- When a receiver clicks "Clear", the placeholder is removed

CREATE TABLE IF NOT EXISTS users_deleted (
    id SERIAL PRIMARY KEY,
    receiver_id INTEGER NOT NULL,
    deleted_user_id INTEGER NOT NULL,
    real_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(receiver_id, deleted_user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_deleted_receiver ON users_deleted(receiver_id);
CREATE INDEX IF NOT EXISTS idx_users_deleted_deleted_user ON users_deleted(deleted_user_id);

-- Foreign key constraints (optional, can be added if needed)
-- ALTER TABLE users_deleted ADD CONSTRAINT fk_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;
-- ALTER TABLE users_deleted ADD CONSTRAINT fk_deleted_user FOREIGN KEY (deleted_user_id) REFERENCES users(id) ON DELETE CASCADE;












