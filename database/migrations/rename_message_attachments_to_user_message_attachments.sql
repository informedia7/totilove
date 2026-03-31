-- Migration: Rename message_attachments table to user_message_attachments
-- This provides a clearer naming convention for the message attachments table
-- If message_attachments exists, rename it. If neither exists, create user_message_attachments.

-- Step 1: Check if user_message_attachments already exists
DO $$
BEGIN
    -- If user_message_attachments already exists, do nothing
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_message_attachments'
    ) THEN
        RAISE NOTICE 'Table user_message_attachments already exists. Skipping migration.';
    -- If message_attachments exists, rename it
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'message_attachments'
    ) THEN
        EXECUTE 'ALTER TABLE message_attachments RENAME TO user_message_attachments';
        RAISE NOTICE 'Table message_attachments renamed to user_message_attachments.';
    -- If neither exists, create the table
    ELSE
        EXECUTE 'CREATE TABLE user_message_attachments (
            id SERIAL PRIMARY KEY,
            message_id INTEGER NOT NULL REFERENCES user_messages(id) ON DELETE CASCADE,
            attachment_type VARCHAR(20) DEFAULT ''image'',
            original_filename VARCHAR(255) NOT NULL,
            stored_filename VARCHAR(255) NOT NULL,
            file_path VARCHAR(500) NOT NULL,
            thumbnail_path VARCHAR(500),
            file_size INTEGER NOT NULL DEFAULT 0,
            mime_type VARCHAR(100) NOT NULL,
            width INTEGER,
            height INTEGER,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            is_deleted BOOLEAN DEFAULT false,
            is_missing BOOLEAN DEFAULT false,
            last_verified TIMESTAMP DEFAULT now()
        )';
        RAISE NOTICE 'Table user_message_attachments created.';
    END IF;
END $$;

-- Step 2: Rename any indexes that reference the old table name
DO $$
DECLARE
    idx_record RECORD;
BEGIN
    FOR idx_record IN 
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'user_message_attachments' 
        AND indexname LIKE '%message_attachments%'
    LOOP
        EXECUTE 'ALTER INDEX IF EXISTS ' || quote_ident(idx_record.indexname) || 
                ' RENAME TO ' || replace(idx_record.indexname, 'message_attachments', 'user_message_attachments');
    END LOOP;
END $$;

-- Step 3: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_user_message_attachments_message_id ON user_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_user_message_attachments_uploaded_by ON user_message_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_user_message_attachments_is_deleted ON user_message_attachments(is_deleted);
CREATE INDEX IF NOT EXISTS idx_user_message_attachments_message_deleted ON user_message_attachments(message_id, is_deleted);

-- Step 4: Update table comment
COMMENT ON TABLE user_message_attachments IS 'Stores attachments (images, files) associated with messages. Columns: message_id (message this attachment belongs to), attachment_type, original_filename, stored_filename, file_path, thumbnail_path, file_size, mime_type, width, height, uploaded_at, uploaded_by, is_deleted, is_missing, last_verified.';

-- Step 5: Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'user_message_attachments'
ORDER BY ordinal_position;

-- Step 6: Verify table rename
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name = 'user_message_attachments';

