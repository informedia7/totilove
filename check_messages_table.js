const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432
});

async function describeMessagesTable() {
    try {
        console.log('Messages table structure:');
        console.log('========================');
        
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'messages' 
            ORDER BY ordinal_position;
        `);
        
        if (result.rows.length === 0) {
            console.log('❌ Messages table does not exist');
            
            // Check if any table with similar name exists
            const tables = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name LIKE '%message%';
            `);
            
            console.log('Tables with "message" in name:', tables.rows);
        } else {
            result.rows.forEach(row => {
                console.log(`${row.column_name.padEnd(20)} ${row.data_type.padEnd(25)} ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${row.column_default || ''}`);
            });
        }
        
        console.log('\n--- SQL to describe messages table ---');
        console.log('\\d messages');
        console.log('\n--- Or use this query ---');
        console.log(`SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'messages' 
ORDER BY ordinal_position;`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        pool.end();
    }
}

describeMessagesTable();
