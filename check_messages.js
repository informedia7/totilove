const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432
});

async function checkMessages() {
    try {
        console.log('📨 Checking messages in database...');
        
        const result = await pool.query(`
            SELECT m.id, m.sender_id, m.receiver_id, m.message, 
                   m.timestamp, m.status,
                   u1.username as sender_username,
                   u2.username as receiver_username
            FROM messages m
            LEFT JOIN users u1 ON m.sender_id = u1.id
            LEFT JOIN users u2 ON m.receiver_id = u2.id
            ORDER BY m.timestamp DESC
            LIMIT 10
        `);
        
        console.log(`Found ${result.rows.length} messages:`);
        console.log('='.repeat(50));
        
        result.rows.forEach((msg, index) => {
            console.log(`${index + 1}. ID: ${msg.id}`);
            console.log(`   From: ${msg.sender_username} (${msg.sender_id}) → To: ${msg.receiver_username} (${msg.receiver_id})`);
            console.log(`   Message: "${msg.message}"`);
            console.log(`   Time: ${msg.timestamp}`);
            console.log(`   Status: ${msg.status}`);
            console.log('-'.repeat(30));
        });

        // Test specific conversation
        console.log('\n🔍 Messages between users 106 and 109:');
        const conversation = await pool.query(`
            SELECT m.*, u1.username as sender_username
            FROM messages m
            LEFT JOIN users u1 ON m.sender_id = u1.id
            WHERE (m.sender_id = 106 AND m.receiver_id = 109) 
               OR (m.sender_id = 109 AND m.receiver_id = 106)
            ORDER BY m.timestamp ASC
        `);
        
        conversation.rows.forEach((msg, index) => {
            console.log(`${index + 1}. [${msg.sender_username}]: ${msg.message}`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        pool.end();
    }
}

checkMessages();
