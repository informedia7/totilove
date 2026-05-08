-- Migration: add suspended state support for admin moderation.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;

ALTER TABLE users
    ALTER COLUMN is_suspended SET DEFAULT false;

UPDATE users
SET is_suspended = false
WHERE is_suspended IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_is_suspended ON users(is_suspended);
