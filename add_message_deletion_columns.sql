-- Add deletion tracking columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by_sender BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by_receiver BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_deletion ON messages(deleted_by_sender, deleted_by_receiver);

-- Update existing messages to set default values
UPDATE messages SET deleted_by_sender = FALSE, deleted_by_receiver = FALSE WHERE deleted_by_sender IS NULL OR deleted_by_receiver IS NULL;
