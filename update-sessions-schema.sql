-- Enhanced user_sessions table with proper expiry management
-- Run this to update your session management

-- First, let's see the current structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_sessions' 
ORDER BY ordinal_position;

-- Add expires_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_sessions' AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE user_sessions ADD COLUMN expires_at TIMESTAMP;
        PRINT 'Added expires_at column';
    END IF;
END $$;

-- Update existing sessions to have expiry (2 hours from now)
UPDATE user_sessions 
SET expires_at = NOW() + INTERVAL '2 hours'
WHERE expires_at IS NULL AND is_active = true;

-- Create index for efficient session lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_active 
ON user_sessions(session_token, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry 
ON user_sessions(expires_at) 
WHERE is_active = true;

-- Create a function to clean up expired sessions automatically
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    cleaned_count INTEGER;
BEGIN
    UPDATE user_sessions 
    SET is_active = false, 
        last_activity = NOW()
    WHERE expires_at < NOW() 
    AND is_active = true;
    
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    
    RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- Create a stored procedure to create new sessions
CREATE OR REPLACE FUNCTION create_user_session(
    p_user_id INTEGER,
    p_session_token VARCHAR(64),
    p_expires_hours INTEGER DEFAULT 1
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Deactivate old sessions for this user
    UPDATE user_sessions 
    SET is_active = false, last_activity = NOW()
    WHERE user_id = p_user_id AND is_active = true;
    
    -- Create new session
    INSERT INTO user_sessions (
        user_id, 
        session_token, 
        expires_at, 
        is_active, 
        created_at, 
        last_activity
    ) VALUES (
        p_user_id,
        p_session_token,
        NOW() + (p_expires_hours || ' hours')::INTERVAL,
        true,
        NOW(),
        NOW()
    );
    
    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Show current active sessions
SELECT 
    us.user_id,
    u.username,
    LEFT(us.session_token, 16) || '...' as token_preview,
    us.created_at,
    us.expires_at,
    us.last_activity,
    us.is_active,
    CASE 
        WHEN us.expires_at < NOW() THEN 'EXPIRED'
        WHEN us.expires_at < NOW() + INTERVAL '5 minutes' THEN 'EXPIRING_SOON'
        ELSE 'VALID'
    END as status
FROM user_sessions us
JOIN users u ON us.user_id = u.id
WHERE us.is_active = true
ORDER BY us.last_activity DESC
LIMIT 10;
