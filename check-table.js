const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost', 
    database: 'totilove',
    password: 'root',
    port: 5432,
});

async function checkTable() {
    try {
        // Check if table exists
        const tableExists = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'user_sessions'
            );
        `);
        
        console.log('Table exists:', tableExists.rows[0].exists);
        
        if (tableExists.rows[0].exists) {
            // Get table structure
            const structure = await pool.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'user_sessions'
                ORDER BY ordinal_position;
            `);
            
            console.log('\nTable structure:');
            structure.rows.forEach(row => {
                console.log(`${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
            });
            
            // Check constraints
            const constraints = await pool.query(`
                SELECT constraint_name, constraint_type
                FROM information_schema.table_constraints 
                WHERE table_name = 'user_sessions';
            `);
            
            console.log('\nConstraints:');
            constraints.rows.forEach(row => {
                console.log(`${row.constraint_name}: ${row.constraint_type}`);
            });
        }
        
        await pool.end();
    } catch (error) {
        console.error('Error:', error.message);
        await pool.end();
    }
}

checkTable();
