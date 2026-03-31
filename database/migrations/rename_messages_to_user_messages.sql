-- Migration: Rename messages table to user_messages
-- This provides a clearer naming convention for the messages table
-- If messages exists, rename it. If neither exists, create user_messages.

-- Step 1: Store foreign key constraint info BEFORE renaming (if it exists)
DO $$
DECLARE
    fk_constraint_name TEXT;
    messages_table_oid OID;
BEGIN
    -- Get the OID of the messages table before renaming
    SELECT oid INTO messages_table_oid 
    FROM pg_class 
    WHERE relname = 'messages' AND relnamespace = 'public'::regnamespace;
    
    -- Store the foreign key constraint name in a temp variable if it exists
    IF messages_table_oid IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'user_message_attachments' AND relnamespace = 'public'::regnamespace
    ) THEN
        SELECT conname INTO fk_constraint_name
        FROM pg_constraint
        WHERE conrelid = 'user_message_attachments'::regclass
        AND contype = 'f'
        AND confrelid = messages_table_oid
        LIMIT 1;
        
        -- Store it in a session variable for later use
        IF fk_constraint_name IS NOT NULL THEN
            PERFORM set_config('app.fk_constraint_name', fk_constraint_name, false);
            RAISE NOTICE 'Found foreign key constraint: %', fk_constraint_name;
        END IF;
    END IF;
END $$;

-- Step 1b: Check if user_messages already exists and rename if needed
DO $$
BEGIN
    -- If user_messages already exists, do nothing
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_messages'
    ) THEN
        RAISE NOTICE 'Table user_messages already exists. Skipping migration.';
    -- If messages exists, rename it
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'messages'
    ) THEN
        EXECUTE 'ALTER TABLE messages RENAME TO user_messages';
        RAISE NOTICE 'Table messages renamed to user_messages.';
    -- If neither exists, create the table with full structure based on codebase analysis
    ELSE
        -- Create table without self-referencing foreign key first
        EXECUTE 'CREATE TABLE user_messages (
            id SERIAL PRIMARY KEY,
            sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message TEXT NOT NULL,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(20) DEFAULT ''sent'',
            read_at TIMESTAMP WITH TIME ZONE,
            recall_type VARCHAR(20) DEFAULT ''none'',
            recalled_at TIMESTAMP WITH TIME ZONE,
            attachment_count INTEGER DEFAULT 0,
            saved BOOLEAN DEFAULT FALSE,
            saved_by_sender BOOLEAN DEFAULT FALSE,
            saved_by_receiver BOOLEAN DEFAULT FALSE,
            deleted_by_sender BOOLEAN DEFAULT FALSE,
            deleted_by_receiver BOOLEAN DEFAULT FALSE,
            deleted_at TIMESTAMP WITH TIME ZONE,
            is_read BOOLEAN DEFAULT FALSE,
            message_type VARCHAR(20) DEFAULT ''text'',
            reply_to_id INTEGER,
            reply_to_text TEXT,
            reply_to_sender INTEGER REFERENCES users(id) ON DELETE SET NULL
        )';
        RAISE NOTICE 'Table user_messages created with full structure.';
        
        -- Add self-referencing foreign key after table creation
        EXECUTE 'ALTER TABLE user_messages 
        ADD CONSTRAINT user_messages_reply_to_id_fkey 
        FOREIGN KEY (reply_to_id) 
        REFERENCES user_messages(id) 
        ON DELETE SET NULL';
        
        -- Create indexes for performance (outside EXECUTE)
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_messages_sender_id ON user_messages(sender_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_messages_receiver_id ON user_messages(receiver_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_messages_timestamp ON user_messages(timestamp DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_messages_sender_receiver ON user_messages(sender_id, receiver_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_messages_status ON user_messages(status)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_messages_message_type ON user_messages(message_type)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_messages_reply_to_id ON user_messages(reply_to_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_messages_read_at ON user_messages(read_at) WHERE read_at IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_messages_deleted_by_sender ON user_messages(deleted_by_sender) WHERE deleted_by_sender = true';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_messages_deleted_by_receiver ON user_messages(deleted_by_receiver) WHERE deleted_by_receiver = true';
        
        RAISE NOTICE 'Indexes created for user_messages table.';
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
        WHERE tablename = 'user_messages' 
        AND indexname LIKE '%messages%'
    LOOP
        EXECUTE 'ALTER INDEX IF EXISTS ' || quote_ident(idx_record.indexname) || 
                ' RENAME TO ' || replace(idx_record.indexname, 'messages', 'user_messages');
    END LOOP;
END $$;

-- Step 3: Update foreign key constraint in user_message_attachments if it exists
DO $$
DECLARE
    fk_constraint_name TEXT;
    new_table_oid OID;
    constraint_record RECORD;
BEGIN
    -- Check if user_message_attachments table exists
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_message_attachments' AND relnamespace = 'public'::regnamespace) THEN
        RAISE NOTICE 'Table user_message_attachments does not exist. Skipping foreign key update.';
        RETURN;
    END IF;
    
    -- Get OID of user_messages table
    SELECT oid INTO new_table_oid 
    FROM pg_class 
    WHERE relname = 'user_messages' AND relnamespace = 'public'::regnamespace;
    
    IF new_table_oid IS NULL THEN
        RAISE NOTICE 'Table user_messages does not exist. Cannot update foreign key.';
        RETURN;
    END IF;
    
    -- Get the stored constraint name from before the rename
    fk_constraint_name := current_setting('app.fk_constraint_name', true);
    
    -- If we have a stored constraint name, drop and recreate it
    IF fk_constraint_name IS NOT NULL AND fk_constraint_name != '' THEN
        -- Drop the old constraint
        BEGIN
            EXECUTE 'ALTER TABLE user_message_attachments DROP CONSTRAINT IF EXISTS ' || quote_ident(fk_constraint_name);
            RAISE NOTICE 'Dropped old foreign key constraint: %', fk_constraint_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop constraint %: %', fk_constraint_name, SQLERRM;
        END;
    END IF;
    
    -- Check if foreign key already references user_messages
    SELECT conname INTO fk_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'user_message_attachments'::regclass
    AND contype = 'f'
    AND confrelid = new_table_oid
    LIMIT 1;
    
    IF fk_constraint_name IS NOT NULL THEN
        RAISE NOTICE 'Foreign key in user_message_attachments already references user_messages: %', fk_constraint_name;
    ELSE
        -- Try to find any foreign key on message_id column and update it
        FOR constraint_record IN
            SELECT conname, confrelid
            FROM pg_constraint
            WHERE conrelid = 'user_message_attachments'::regclass
            AND contype = 'f'
            AND conkey::int[] = ARRAY(
                SELECT attnum FROM pg_attribute 
                WHERE attrelid = 'user_message_attachments'::regclass 
                AND attname = 'message_id'
            )
        LOOP
            -- Drop the constraint if it exists
            BEGIN
                EXECUTE 'ALTER TABLE user_message_attachments DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_record.conname);
                RAISE NOTICE 'Dropped foreign key constraint: %', constraint_record.conname;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Could not drop constraint %: %', constraint_record.conname, SQLERRM;
            END;
        END LOOP;
        
        -- Add new constraint referencing user_messages
        BEGIN
            ALTER TABLE user_message_attachments 
            ADD CONSTRAINT user_message_attachments_message_id_fkey 
            FOREIGN KEY (message_id) 
            REFERENCES user_messages(id) 
            ON DELETE CASCADE;
            
            RAISE NOTICE 'Added foreign key in user_message_attachments to reference user_messages.';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not add foreign key constraint: %', SQLERRM;
        END;
    END IF;
END $$;

-- Step 4: Update table comment
COMMENT ON TABLE user_messages IS 'Stores messages between users. Columns include sender_id, receiver_id, message content, timestamp, status, read status, attachment_count, and soft-delete flags.';

-- Step 5: Verify table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'user_messages'
ORDER BY ordinal_position;

-- Step 6: Verify table rename
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name = 'user_messages';

