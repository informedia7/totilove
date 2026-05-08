-- Add pause/resume account state columns
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_status VARCHAR(16) NOT NULL DEFAULT 'active';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pause_reason TEXT;

UPDATE users
SET account_status = 'active'
WHERE account_status IS NULL OR TRIM(account_status) = '';

CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_paused_at ON users(paused_at);
