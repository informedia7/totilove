const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost', 
    database: 'totilove',
    password: 'postgres',
    port: 5432,
});

async function checkMissingGeoUsers() {
    try {
        const result = await pool.query(`
            SELECT id, username, email, date_joined
            FROM users 
            WHERE country_id IS NULL
            ORDER BY id
        `);
        
        console.log('Users with missing geographic data:');
        console.log('ID | Username | Email | Date Joined');
        console.log('-'.repeat(60));
        result.rows.forEach(user => {
            console.log(`${user.id} | ${user.username} | ${user.email} | ${user.date_joined ? user.date_joined.toISOString().split('T')[0] : 'Unknown'}`);
        });
        
        console.log(`\nTotal users missing geographic data: ${result.rows.length}`);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkMissingGeoUsers();
