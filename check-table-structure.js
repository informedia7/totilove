// Check messages table structure
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432,
});

async function checkTableStructure() {
    try {
        console.log('🔍 Checking messages table structure...');
        
        // Check if messages table exists and its structure
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'messages' 
            ORDER BY ordinal_position
        `);
        
        if (result.rows.length === 0) {
            console.log('❌ Messages table does not exist');
            
            // Check what tables do exist
            const tables = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            `);
            
            console.log('\n📋 Available tables:');
            tables.rows.forEach(row => console.log(`  - ${row.table_name}`));
        } else {
            console.log('\n✅ Messages table structure:');
            result.rows.forEach(row => {
                console.log(`  ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error checking table structure:', error);
    } finally {
        await pool.end();
    }
}

checkTableStructure();
