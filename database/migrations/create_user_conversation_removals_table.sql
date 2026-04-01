-- Table to track when users are removed from conversations
-- This allows explicit tracking of removals and prevents removed users from reappearing

CREATE TABLE IF NOT EXISTS user_conversation_removals (
    id SERIAL PRIMARY KEY,
    remover_id INTEGER NOT NULL,
    removed_user_id INTEGER NOT NULL,
    removed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(remover_id, removed_user_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_conversation_removals_remover ON user_conversation_removals(remover_id);
CREATE INDEX IF NOT EXISTS idx_user_conversation_removals_removed ON user_conversation_removals(removed_user_id);

-- Add table comment
COMMENT ON TABLE user_conversation_removals IS 'Tracks when users are removed from conversations. When user A removes user B, this prevents the conversation from appearing in user A''s list, even if new messages are sent.';

























































