const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost', 
    database: 'totilove',
    password: 'postgres',
    port: 5432,
});

async function checkMaxUserId() {
    try {
        const result = await pool.query('SELECT MAX(id) as max_id FROM users');
        console.log('Highest user ID:', result.rows[0].max_id);
        
        const latestUsers = await pool.query('SELECT id, username, email, country_id, state_id, city_id FROM users ORDER BY id DESC LIMIT 5');
        console.log('\nLatest 5 users:');
        latestUsers.rows.forEach(user => {
            console.log(`ID: ${user.id}, Username: ${user.username}, Country ID: ${user.country_id}, State ID: ${user.state_id}, City ID: ${user.city_id}`);
        });
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkMaxUserId();
