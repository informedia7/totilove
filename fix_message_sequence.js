const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432
});

async function fixMessageSequence() {
    try {
        console.log('🔄 Fixing messages table sequence...');
        
        // Check current max ID
        const maxIdResult = await pool.query('SELECT MAX(id) as max_id FROM messages');
        const maxId = maxIdResult.rows[0].max_id || 0;
        console.log('Current max ID:', maxId);
        
        // Reset the sequence to be higher than the max ID
        const nextVal = maxId + 1;
        await pool.query(`SELECT setval('messages_id_seq', $1, false)`, [nextVal]);
        console.log(`✅ Sequence reset to start from ${nextVal}`);
        
        // Test inserting a message
        const testResult = await pool.query(`
            INSERT INTO messages (sender_id, receiver_id, message, status)
            VALUES (106, 109, 'Test message after sequence fix', 'sent')
            RETURNING id, EXTRACT(EPOCH FROM timestamp) * 1000 as timestamp
        `);
        
        console.log('✅ Test message inserted successfully:', testResult.rows[0]);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        pool.end();
    }
}

fixMessageSequence();
