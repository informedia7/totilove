// Simple script to check users in database
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
        const result = await pool.query('SELECT id, username, email FROM users ORDER BY id');
        console.log('All users:');
        console.table(result.rows);
        
        // Check for user ID 20 specifically
        const user20 = await pool.query('SELECT id, username, email FROM users WHERE id = 20');
        if (user20.rows.length > 0) {
            console.log('\nUser ID 20 found:');
            console.table(user20.rows);
        } else {
            console.log('\nUser ID 20 not found');
        }
        
        // Also check messages
        const messagesResult = await pool.query('SELECT COUNT(*) as message_count FROM messages');
        console.log(`\nTotal messages: ${messagesResult.rows[0].message_count}`);
        
        pool.end();
    } catch (error) {
        console.error('Error:', error);
        pool.end();
    }
}

checkUsers();
