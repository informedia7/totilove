const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost', 
    database: 'totilove',
    password: 'postgres',
    port: 5432,
});

async function checkUsers() {
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.email, u.country_id, u.state_id, u.city_id,
                   c.name as country, s.name as state, ct.name as city
            FROM users u
            LEFT JOIN country c ON u.country_id = c.id
            LEFT JOIN state s ON u.state_id = s.id
            LEFT JOIN city ct ON u.city_id = ct.id
            ORDER BY u.id DESC
            LIMIT 10
        `);
        
        console.log('Recent users and their geographic data:');
        console.log('ID | Username | Country | State | City');
        console.log('-'.repeat(60));
        result.rows.forEach(user => {
            console.log(`${user.id} | ${user.username} | ${user.country || 'Not specified'} | ${user.state || 'Not specified'} | ${user.city || 'Not specified'}`);
        });
        
        const missingGeoData = await pool.query(`
            SELECT COUNT(*) as count 
            FROM users 
            WHERE country_id IS NULL
        `);
        
        console.log(`\nUsers with missing geographic data: ${missingGeoData.rows[0].count}`);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkUsers();
