const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost', 
    database: 'totilove',
    password: 'root',
    port: 5432,
});

async function checkUsersTable() {
    try {
        // Get table structure
        const structure = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'users'
            ORDER BY ordinal_position;
        `);
        
        console.log('Users table structure:');
        structure.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        
        await pool.end();
    } catch (error) {
        console.error('Error:', error.message);
        await pool.end();
    }
}

checkUsersTable();
