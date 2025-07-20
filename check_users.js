const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432
});

async function checkUsers() {
    try {
        console.log('📊 Checking available users...');
        
        const result = await pool.query(`
            SELECT id, username, email 
            FROM users 
            ORDER BY id 
            LIMIT 10
        `);
        
        console.log('Available users:');
        console.log('===============');
        result.rows.forEach(user => {
            console.log(`ID: ${user.id}, Username: ${user.username}, Email: ${user.email}`);
        });
        
        console.log(`\nTotal users found: ${result.rows.length}`);
        
        // Check if user 112 exists
        const user112 = await pool.query('SELECT * FROM users WHERE id = 112');
        console.log(`\nUser 112 exists: ${user112.rows.length > 0}`);
        
        // Check if user 109 exists
        const user109 = await pool.query('SELECT * FROM users WHERE id = 109');
        console.log(`User 109 exists: ${user109.rows.length > 0}`);
        
        if (user109.rows.length > 0) {
            console.log('User 109 details:', user109.rows[0]);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        pool.end();
    }
}

checkUsers();
