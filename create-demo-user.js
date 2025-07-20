const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost', 
    database: 'totilove',
    password: 'root',
    port: 5432,
});

async function createTestUser() {
    try {
        console.log('Creating test user...');
        
        // Check if test user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            ['demo@totilove.com']
        );
        
        if (existingUser.rows.length > 0) {
            console.log('Demo user already exists with ID:', existingUser.rows[0].id);
        } else {
            // Create demo user
            const bcrypt = require('bcrypt');
            const hashedPassword = await bcrypt.hash('Demo123', 10);
            
            const result = await pool.query(`
                INSERT INTO users (username, email, password, birthdate, gender, date_joined)
                VALUES ($1, $2, $3, $4, $5, NOW())
                RETURNING id, username, email
            `, [
                'DemoUser',
                'demo@totilove.com', 
                hashedPassword,
                '1990-01-01',
                'Other'
            ]);
            
            console.log('✅ Demo user created:', result.rows[0]);
        }
        
        await pool.end();
    } catch (error) {
        console.error('❌ Error:', error.message);
        await pool.end();
    }
}

createTestUser();
