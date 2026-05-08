-- Migration: Create user_icon_reaction table
-- Purpose: Persist per-user reaction on each message.
-- Design:
-- - Multiple reactions per user per message
-- - No duplicate same-emoji reaction per user/message
-- - Strict participant validation via trigger (only sender/receiver can react)
-- - Cascades when message/user is deleted

CREATE TABLE IF NOT EXISTS user_icon_reaction (
    message_id INTEGER NOT NULL REFERENCES user_messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_emoji VARCHAR(16) NOT NULL,
    reacted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_icon_reaction_pk PRIMARY KEY (message_id, user_id, reaction_emoji),
    CONSTRAINT user_icon_reaction_emoji_not_empty CHECK (char_length(trim(reaction_emoji)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_user_icon_reaction_user_id
    ON user_icon_reaction(user_id);

CREATE INDEX IF NOT EXISTS idx_user_icon_reaction_message_id_reaction
    ON user_icon_reaction(message_id, reaction_emoji);

-- Keep updated_at accurate on UPSERT/UPDATE paths.
CREATE OR REPLACE FUNCTION set_user_icon_reaction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_user_icon_reaction_updated_at ON user_icon_reaction;
CREATE TRIGGER trg_set_user_icon_reaction_updated_at
BEFORE UPDATE ON user_icon_reaction
FOR EACH ROW
EXECUTE FUNCTION set_user_icon_reaction_updated_at();

-- Enforce that only conversation participants can react.
CREATE OR REPLACE FUNCTION validate_user_icon_reaction_participant()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM user_messages m
        WHERE m.id = NEW.message_id
          AND (m.sender_id = NEW.user_id OR m.receiver_id = NEW.user_id)
    ) THEN
        RAISE EXCEPTION 'User % is not a participant of message %', NEW.user_id, NEW.message_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_user_icon_reaction_participant ON user_icon_reaction;
CREATE TRIGGER trg_validate_user_icon_reaction_participant
BEFORE INSERT OR UPDATE ON user_icon_reaction
FOR EACH ROW
EXECUTE FUNCTION validate_user_icon_reaction_participant();

COMMENT ON TABLE user_icon_reaction IS 'Per-user reactions for each message. One row per (message_id, user_id, reaction_emoji).';
COMMENT ON COLUMN user_icon_reaction.reaction_emoji IS 'Emoji selected by the user (e.g., 👍, ❤️, 😂).';
