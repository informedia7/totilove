const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost', 
    database: 'totilove',
    password: 'root',
    port: 5432,
});

async function addUniqueConstraint() {
    try {
        console.log('Adding unique constraint to user_sessions.user_id...');
        
        // First, let's see if there are any duplicate user_id entries
        const duplicates = await pool.query(`
            SELECT user_id, COUNT(*) 
            FROM user_sessions 
            GROUP BY user_id 
            HAVING COUNT(*) > 1;
        `);
        
        if (duplicates.rows.length > 0) {
            console.log('Found duplicate user_id entries:', duplicates.rows);
            console.log('Cleaning up duplicates...');
            
            // Delete older sessions, keep only the most recent one for each user
            await pool.query(`
                DELETE FROM user_sessions 
                WHERE id NOT IN (
                    SELECT DISTINCT ON (user_id) id 
                    FROM user_sessions 
                    ORDER BY user_id, last_activity DESC
                );
            `);
            
            console.log('Duplicates cleaned up.');
        }
        
        // Add unique constraint
        await pool.query(`
            ALTER TABLE user_sessions 
            ADD CONSTRAINT user_sessions_user_id_unique 
            UNIQUE (user_id);
        `);
        
        console.log('✅ Unique constraint added successfully!');
        
        await pool.end();
    } catch (error) {
        console.error('❌ Error:', error.message);
        await pool.end();
    }
}

addUniqueConstraint();
