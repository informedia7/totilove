-- Create relationship_types table for "What I'm Looking For" preferences
-- This table stores relationship type options (e.g., Serious Relationship, Casual Dating, etc.)

CREATE TABLE IF NOT EXISTS user_relationship_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_relationship_types_active ON user_relationship_types(is_active, display_order);

-- Insert default relationship types
INSERT INTO user_relationship_types (name, description, display_order, is_active) VALUES
    ('Serious Relationship', 'Looking for a committed, long-term relationship', 1, true),
    ('Casual Dating', 'Looking for casual dating and fun', 2, true),
    ('Friendship', 'Looking for friends and companionship', 3, true),
    ('Marriage', 'Looking for marriage and life partner', 4, true),
    ('Not Sure Yet', 'Still figuring out what I want', 5, true)
ON CONFLICT (name) DO NOTHING;

-- Add comment
COMMENT ON TABLE user_relationship_types IS 'Stores relationship type options for user preferences';
COMMENT ON COLUMN user_relationship_types.display_order IS 'Order in which options should be displayed in dropdown';





























