-- Create email_verification_tokens table
-- This table stores email verification tokens for new user registrations

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP WITHOUT TIME ZONE NULL
);

-- Create index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- Add comment
COMMENT ON TABLE email_verification_tokens IS 'Stores email verification tokens for user registration';
COMMENT ON COLUMN email_verification_tokens.token IS 'Unique verification token';
COMMENT ON COLUMN email_verification_tokens.expires_at IS 'Token expiration timestamp (typically 24 hours)';
COMMENT ON COLUMN email_verification_tokens.used_at IS 'Timestamp when token was used (NULL if not used yet)';





























