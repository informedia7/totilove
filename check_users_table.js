const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'admin',
    port: 5432,
});

async function checkUsersTable() {
    try {
        console.log('📋 Checking users table structure...');
        
        // Check table structure
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        console.log('📊 Users table columns:');
        result.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        
    } catch (error) {
        console.error('❌ Error checking users table:', error);
    } finally {
        await pool.end();
    }
}

checkUsersTable();
