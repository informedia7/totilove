const { Pool } = require('pg');

async function testDatabaseConnection() {
    let pool;
    try {
        console.log('🔍 Testing database connection...');
        
        pool = new Pool({
            user: 'postgres',
            host: 'localhost', 
            database: 'totilove',
            password: 'root',
            port: 5432,
            // Add connection timeout and retry settings
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            max: 10
        });

        // Test connection
        const client = await pool.connect();
        console.log('✅ Database connection successful!');
        
        // Test a simple query
        const result = await client.query('SELECT NOW() as current_time, COUNT(*) as user_count FROM users');
        console.log('✅ Query successful:', result.rows[0]);
        
        client.release();
        await pool.end();
        
    } catch (error) {
        console.error('❌ Database connection error:', error.message);
        console.error('Full error:', error);
        
        if (pool) {
            await pool.end();
        }
    }
}

testDatabaseConnection();
