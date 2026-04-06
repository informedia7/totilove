/**
 * Script to change an admin user's password
 * Usage: node change-admin-password.js <username> <new_password>
 */

const bcrypt = require('bcryptjs');
const { query } = require('./config/database');
require('dotenv').config();

async function changeAdminPassword() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Usage: node change-admin-password.js <username> <new_password>');
        console.log('Example: node change-admin-password.js admin mynewpassword123');
        process.exit(1);
    }

    const [username, newPassword] = args;

    try {
        // Check if user exists
        const existing = await query(
            'SELECT id, username, email FROM admin_users WHERE username = $1',
            [username]
        );

        if (existing.rows.length === 0) {
            console.error(`Error: Admin user "${username}" not found`);
            process.exit(1);
        }

        const admin = existing.rows[0];

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 12);

        // Update password
        await query(
            'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
            [passwordHash, admin.id]
        );

        console.log('✅ Password changed successfully!');
        console.log(`   Username: ${admin.username}`);
        console.log(`   Email: ${admin.email}`);
        console.log('\nYou can now login with the new password at http://localhost:3003/login');

    } catch (error) {
        console.error('Error changing password:', error);
        process.exit(1);
    }
}

changeAdminPassword();



























