-- Adds last_seen_at for accurate presence history and removes legacy is_online flag
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE users
    DROP COLUMN IF EXISTS is_online;

CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users (last_seen_at DESC NULLS LAST);
