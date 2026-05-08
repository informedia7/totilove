-- Migration: Add Account Status and Pause/Suspend Support
-- Date: 2026-04-29
-- Purpose: Add pause/suspend account status tracking for message blocking

-- Table: users
-- Status: All columns now present in production database

-- Column: account_status
-- Type: VARCHAR(16)
-- Constraint: CHECK (account_status IN ('active', 'paused'))
-- Default: 'active'
-- Purpose: Track whether user account is active or paused
-- Note: Added via ensureAccountStatusSchema() in utils/accountStatus.js

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(16) NOT NULL DEFAULT 'active';

-- Add constraint to enforce only valid status values
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_account_status;
ALTER TABLE users ADD CONSTRAINT chk_users_account_status CHECK (account_status IN ('active', 'paused'));

-- Index for performance on account_status queries
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);

-- Column: is_suspended
-- Type: BOOLEAN
-- Default: false
-- Purpose: Track whether user account is suspended by admin
-- Note: Already exists from add_is_suspended_to_users.sql migration

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_is_suspended ON users(is_suspended);

-- Column: paused_at
-- Type: TIMESTAMP WITH TIME ZONE
-- Purpose: Timestamp when account was paused (for audit trail)
-- Note: Added via ensureAccountStatusSchema() in utils/accountStatus.js

ALTER TABLE users ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_users_paused_at ON users(paused_at);

-- Column: pause_reason
-- Type: TEXT
-- Purpose: Admin reason for pausing account
-- Note: Already existed in production database

ALTER TABLE users ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- Validation: Ensure all columns are present
-- Run this query to verify:
-- SELECT 
--   EXISTS (SELECT 1 FROM information_schema.columns 
--           WHERE table_name='users' AND column_name='account_status') as has_account_status,
--   EXISTS (SELECT 1 FROM information_schema.columns 
--           WHERE table_name='users' AND column_name='is_suspended') as has_is_suspended,
--   EXISTS (SELECT 1 FROM information_schema.columns 
--           WHERE table_name='users' AND column_name='paused_at') as has_paused_at,
--   EXISTS (SELECT 1 FROM information_schema.columns 
--           WHERE table_name='users' AND column_name='pause_reason') as has_pause_reason;
-- Expected: all true
