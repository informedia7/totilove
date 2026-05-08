-- Migration: Create user_location_history table
-- This table tracks all location changes made by users for audit and rate limiting purposes
-- Stores old and new location values (country, state, city) with timestamp, IP, and user agent

-- Create the user_location_history table
CREATE TABLE IF NOT EXISTS user_location_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_country_id INTEGER REFERENCES country(id),
    old_state_id INTEGER REFERENCES state(id),
    old_city_id INTEGER REFERENCES city(id),
    new_country_id INTEGER NOT NULL REFERENCES country(id),
    new_state_id INTEGER REFERENCES state(id),
    new_city_id INTEGER REFERENCES city(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_location_history_user_id ON user_location_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_location_history_changed_at ON user_location_history(user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_location_history_user_changed_at ON user_location_history(user_id, changed_at);

-- Add table comment
COMMENT ON TABLE user_location_history IS 'Tracks all location changes made by users. Stores old and new location values (country, state, city) with timestamp, IP address, and user agent for audit and rate limiting purposes.';

-- Add column comments
COMMENT ON COLUMN user_location_history.user_id IS 'User who changed their location';
COMMENT ON COLUMN user_location_history.old_country_id IS 'Previous country ID (NULL on first location set)';
COMMENT ON COLUMN user_location_history.old_state_id IS 'Previous state ID (NULL if no state)';
COMMENT ON COLUMN user_location_history.old_city_id IS 'Previous city ID (NULL if no city)';
COMMENT ON COLUMN user_location_history.new_country_id IS 'New country ID (required)';
COMMENT ON COLUMN user_location_history.new_state_id IS 'New state ID (NULL if no state)';
COMMENT ON COLUMN user_location_history.new_city_id IS 'New city ID (NULL if no city)';
COMMENT ON COLUMN user_location_history.changed_at IS 'Timestamp when location was changed';
COMMENT ON COLUMN user_location_history.ip_address IS 'IP address from which the change was made';
COMMENT ON COLUMN user_location_history.user_agent IS 'User agent string from the browser';

-- Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_location_history' 
ORDER BY ordinal_position;


























































































































