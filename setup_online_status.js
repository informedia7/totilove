const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: 'root',
    port: 5432,
});

async function createOnlineStatusTable() {
    try {
        console.log('Creating online status table...');
        
        const sql = fs.readFileSync('./create_online_status_table.sql', 'utf8');
        await pool.query(sql);
        
        console.log('✅ Online status table created successfully');
    } catch (error) {
        console.error('❌ Error creating table:', error);
    } finally {
        await pool.end();
    }
}

createOnlineStatusTable();
