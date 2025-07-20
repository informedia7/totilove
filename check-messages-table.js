const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'postgres',
    port: 5432,
});

async function checkMessagesTable() {
    try {
        console.log('Checking messages table structure...');
        
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'messages' 
            ORDER BY ordinal_position
        `);
        
        console.log('Messages table columns:', result.rows);
        
        console.log('\nSample messages:');
        const sampleResult = await pool.query('SELECT * FROM messages LIMIT 3');
        console.log(sampleResult.rows);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkMessagesTable();
