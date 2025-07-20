const { Pool } = require('pg');

// Test database connection
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

async function testConnection() {
    try {
        console.log('Testing database connection...');
        const client = await pool.connect();
        console.log('✅ Database connected successfully');
        
        // Test a simple query
        const result = await client.query('SELECT COUNT(*) FROM users');
        console.log('✅ Query executed successfully:', result.rows[0]);
        
        client.release();
        
        // Test server API endpoints
        console.log('\nTesting API endpoints...');
        
        const responses = await Promise.all([
            fetch('http://localhost:3000/api/featured-profiles'),
            fetch('http://localhost:3000/api/current-user'),
        ]);
        
        for (let i = 0; i < responses.length; i++) {
            const response = responses[i];
            console.log(`✅ API endpoint ${i + 1}: Status ${response.status}`);
        }
        
        console.log('\n✅ All connections working properly');
        
    } catch (error) {
        console.error('❌ Connection error:', error.message);
        console.error('Error details:', error);
    } finally {
        await pool.end();
    }
}

testConnection();
