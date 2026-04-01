const { query } = require('./config/database');
require('dotenv').config();

async function checkAdminUsers() {
    try {
        const result = await query('SELECT id, username, email FROM admin_users LIMIT 5');
        if (result.rows.length > 0) {
            console.log('Existing admin users:');
            result.rows.forEach(u => console.log(`  - ${u.username} (${u.email})`));
        } else {
            console.log('No admin users found.');
        }
        process.exit(0);
    } catch(e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

checkAdminUsers();



























