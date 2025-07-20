const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432
});

async function upgradeMessagesTable() {
    try {
        console.log('🔄 Upgrading messages table...');
        
        // Add NOT NULL constraints
        await pool.query(`
            ALTER TABLE messages 
            ALTER COLUMN sender_id SET NOT NULL,
            ALTER COLUMN receiver_id SET NOT NULL,
            ALTER COLUMN message SET NOT NULL;
        `);
        console.log('✅ Added NOT NULL constraints');
        
        // Add status column
        await pool.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent' 
            CHECK (status IN ('sent', 'delivered', 'read'));
        `);
        console.log('✅ Added status column');
        
        // Add foreign key constraints
        await pool.query(`
            ALTER TABLE messages 
            ADD CONSTRAINT fk_messages_sender 
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
        `);
        console.log('✅ Added sender foreign key');
        
        await pool.query(`
            ALTER TABLE messages 
            ADD CONSTRAINT fk_messages_receiver 
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;
        `);
        console.log('✅ Added receiver foreign key');
        
        // Create indexes for better performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver 
            ON messages(sender_id, receiver_id);
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
            ON messages(timestamp);
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_status 
            ON messages(status);
        `);
        console.log('✅ Created performance indexes');
        
        // Also create the likes and user_passes tables for matching
        await pool.query(`
            CREATE TABLE IF NOT EXISTS likes (
                id SERIAL PRIMARY KEY,
                liked_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                liked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(liked_by, liked_user_id)
            );
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_passes (
                id SERIAL PRIMARY KEY,
                passed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                passed_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(passed_by, passed_user_id)
            );
        `);
        console.log('✅ Created matching tables');
        
        console.log('🎉 Messages table upgrade completed successfully!');
        
    } catch (error) {
        console.error('❌ Error upgrading table:', error.message);
        if (error.message.includes('already exists')) {
            console.log('⚠️  Some constraints already exist, continuing...');
        }
    } finally {
        pool.end();
    }
}

upgradeMessagesTable();
