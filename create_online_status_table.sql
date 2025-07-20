-- Create table for tracking user online status
CREATE TABLE IF NOT EXISTS user_online_status (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_online_status_last_seen ON user_online_status(last_seen);
CREATE INDEX IF NOT EXISTS idx_user_online_status_online ON user_online_status(is_online);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_online_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_online_status_updated_at
    BEFORE UPDATE ON user_online_status
    FOR EACH ROW
    EXECUTE FUNCTION update_user_online_status_updated_at();
