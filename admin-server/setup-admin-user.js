/**
 * Script to create an admin user
 * Usage: node setup-admin-user.js <username> <email> <password>
 */

const bcrypt = require('bcryptjs');
const { query } = require('./config/database');
require('dotenv').config();

async function createAdminUser() {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.log('Usage: node setup-admin-user.js <username> <email> <password>');
        console.log('Example: node setup-admin-user.js admin admin@example.com mypassword123');
        process.exit(1);
    }

    const [username, email, password] = args;

    try {
        // Check if user already exists
        const existing = await query(
            'SELECT id FROM admin_users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existing.rows.length > 0) {
            console.error('Error: Admin user with this username or email already exists');
            process.exit(1);
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Create admin user
        const result = await query(
            `INSERT INTO admin_users (username, email, password_hash, role, status, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING id, username, email, role`,
            [username, email, passwordHash, 'admin', 'active']
        );

        const admin = result.rows[0];
        console.log('✅ Admin user created successfully!');
        console.log(`   ID: ${admin.id}`);
        console.log(`   Username: ${admin.username}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Role: ${admin.role}`);
        console.log('\nYou can now login at http://localhost:3003/login');

    } catch (error) {
        console.error('Error creating admin user:', error);
        process.exit(1);
    }
}

createAdminUser();




















































