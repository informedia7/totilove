// Check existing users
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432,
});

async function checkUsers() {
    try {
        const result = await pool.query('SELECT id, username FROM users ORDER BY id');
        console.log('Available users:');
        result.rows.forEach(user => {
            console.log(`ID: ${user.id}, Username: ${user.username}`);
        });
        
        // Check messages for user 20
        const messages = await pool.query(`
            SELECT sender_id, receiver_id, message, timestamp 
            FROM messages 
            WHERE sender_id = 20 OR receiver_id = 20 
            ORDER BY timestamp DESC 
            LIMIT 10
        `);
        console.log(`\nMessages involving user 20: ${messages.rows.length}`);
        messages.rows.forEach(msg => {
            console.log(`${msg.sender_id} -> ${msg.receiver_id}: ${msg.message.substring(0, 50)}...`);
        });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        pool.end();
    }
}

checkUsers();
