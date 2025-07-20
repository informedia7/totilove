const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432,
});

async function addDeletionColumns() {
    try {
        // Add deletion tracking columns
        await pool.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS deleted_by_sender BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS deleted_by_receiver BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP
        `);
        console.log('✅ Added deletion tracking columns');
        
        // Update existing messages
        await pool.query(`
            UPDATE messages 
            SET deleted_by_sender = FALSE, deleted_by_receiver = FALSE 
            WHERE deleted_by_sender IS NULL OR deleted_by_receiver IS NULL
        `);
        console.log('✅ Updated existing messages with default values');
        
        // Verify the columns were added
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'messages' 
            ORDER BY ordinal_position
        `);
        
        console.log('\n📋 Updated messages table structure:');
        result.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type}`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        pool.end();
    }
}

addDeletionColumns();
