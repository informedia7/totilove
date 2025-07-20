const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'admin',
    port: 5432,
});

async function createOnlineStatusTable() {
    try {
        console.log('📋 Creating online_status table...');
        
        // Create the online_status table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS online_status (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                is_active BOOLEAN DEFAULT true,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ online_status table created successfully');
        
        // Create index for better performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_online_status_user_id 
            ON online_status(user_id)
        `);
        
        console.log('✅ Index created on online_status.user_id');
        
        // Create index for active status queries
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_online_status_active 
            ON online_status(user_id, is_active) 
            WHERE is_active = true
        `);
        
        console.log('✅ Index created for active status queries');
        
    } catch (error) {
        console.error('❌ Error creating online_status table:', error);
    } finally {
        await pool.end();
    }
}

createOnlineStatusTable();
