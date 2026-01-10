-- Migration: Create admin_blacklisted_users table
-- This table stores users who have been blacklisted/banned by administrators.
-- Allows admins to permanently or temporarily prevent users from accessing the platform.

-- Create the admin_blacklisted_users table
CREATE TABLE IF NOT EXISTS admin_blacklisted_users (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'removed')),
    ip_address VARCHAR(45),
    user_ip_address VARCHAR(45),
    user_agent TEXT,
    notes TEXT,
    blacklisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMP,
    removed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_admin_blacklisted_users_user_id ON admin_blacklisted_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_blacklisted_users_email ON admin_blacklisted_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_blacklisted_users_admin_id ON admin_blacklisted_users(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_blacklisted_users_status ON admin_blacklisted_users(status);
CREATE INDEX IF NOT EXISTS idx_admin_blacklisted_users_user_status ON admin_blacklisted_users(user_id, status);
CREATE INDEX IF NOT EXISTS idx_admin_blacklisted_users_user_ip ON admin_blacklisted_users(user_ip_address) WHERE user_ip_address IS NOT NULL;

-- Add unique constraint: A user can only have one active blacklist record at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_blacklisted_users_user_active 
    ON admin_blacklisted_users(user_id) 
    WHERE status = 'active';

-- Add table comment
COMMENT ON TABLE admin_blacklisted_users IS 'Stores users who have been permanently blacklisted/banned by administrators. Blacklists are permanent until manually removed by an admin.';

-- Add column comments
COMMENT ON COLUMN admin_blacklisted_users.user_id IS 'The user who was blacklisted';
COMMENT ON COLUMN admin_blacklisted_users.email IS 'Email address of the blacklisted user (stored at time of blacklisting)';
COMMENT ON COLUMN admin_blacklisted_users.admin_id IS 'The admin who performed the blacklist action';
COMMENT ON COLUMN admin_blacklisted_users.reason IS 'Reason for blacklisting (displayed to user if needed)';
COMMENT ON COLUMN admin_blacklisted_users.status IS 'Status: active (blacklisted), removed (unblacklisted). Blacklists are permanent.';
COMMENT ON COLUMN admin_blacklisted_users.ip_address IS 'IP address from which the admin action was taken';
COMMENT ON COLUMN admin_blacklisted_users.user_ip_address IS 'IP address of the blacklisted user (stored at time of blacklisting)';
COMMENT ON COLUMN admin_blacklisted_users.user_agent IS 'User agent string from which the blacklist action was taken';
COMMENT ON COLUMN admin_blacklisted_users.notes IS 'Internal admin notes (not visible to user)';
COMMENT ON COLUMN admin_blacklisted_users.blacklisted_at IS 'Timestamp when user was blacklisted (permanent)';
COMMENT ON COLUMN admin_blacklisted_users.removed_at IS 'Timestamp when blacklist was removed';
COMMENT ON COLUMN admin_blacklisted_users.removed_by IS 'Admin who removed the blacklist';

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_admin_blacklisted_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_admin_blacklisted_users_updated_at
    BEFORE UPDATE ON admin_blacklisted_users
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_blacklisted_users_updated_at();

-- Verification query
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'admin_blacklisted_users' 
ORDER BY ordinal_position;

