-- Create messages table for your dating app
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'sent', -- sent, delivered, read
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- Add some constraints
ALTER TABLE messages ADD CONSTRAINT check_message_length CHECK (LENGTH(message) <= 1000);
ALTER TABLE messages ADD CONSTRAINT check_status CHECK (status IN ('sent', 'delivered', 'read'));

-- Update the database schema to ensure compatibility
-- Note: Run this in pgAdmin or your PostgreSQL client
