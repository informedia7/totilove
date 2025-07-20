-- Create messages table for chat functionality
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_sender ON messages(receiver_id, sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- Create likes table for matching functionality
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    liked_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    liked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(liked_by, liked_user_id)
);

-- Create user_passes table for matching functionality
CREATE TABLE IF NOT EXISTS user_passes (
    id SERIAL PRIMARY KEY,
    passed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    passed_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(passed_by, passed_user_id)
);

-- Create indexes for matching tables
CREATE INDEX IF NOT EXISTS idx_likes_liked_by ON likes(liked_by);
CREATE INDEX IF NOT EXISTS idx_likes_liked_user_id ON likes(liked_user_id);
CREATE INDEX IF NOT EXISTS idx_user_passes_passed_by ON user_passes(passed_by);
CREATE INDEX IF NOT EXISTS idx_user_passes_passed_user_id ON user_passes(passed_user_id);

-- Create user_activity table for tracking user actions
CREATE TABLE IF NOT EXISTS user_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for user activity
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at);

COMMIT;
