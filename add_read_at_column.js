const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    password: 'admin',
    host: 'localhost',
    port: 5432,
    database: 'totilove',
});

async function addReadAtColumn() {
    try {
        // Add read_at column to messages table
        await pool.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS read_at TIMESTAMP DEFAULT NULL
        `);
        
        console.log('✅ Successfully added read_at column to messages table');
        
        // Check if column was added
        const checkResult = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'messages' AND column_name = 'read_at'
        `);
        
        if (checkResult.rows.length > 0) {
            console.log('✅ Confirmed: read_at column exists in messages table');
        } else {
            console.log('❌ read_at column was not found');
        }
        
    } catch (error) {
        console.error('Error adding read_at column:', error);
    } finally {
        await pool.end();
    }
}

addReadAtColumn();
