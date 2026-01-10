/**
 * Setup script to create all admin server database tables
 * Run this before starting the admin server for the first time
 * 
 * Usage: node database/setup-admin-database.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'totilove',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function setupAdminDatabase() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Setting up Admin Server Database Tables...\n');

        // Read and execute SQL file
        const sqlFile = path.join(__dirname, 'create-admin-tables.sql');
        if (!fs.existsSync(sqlFile)) {
            console.error('❌ SQL file not found:', sqlFile);
            process.exit(1);
        }

        const sql = fs.readFileSync(sqlFile, 'utf8');
        await client.query(sql);
        console.log('✅ SQL script executed successfully\n');

        // Verify all tables exist
        console.log('📋 Verifying tables...\n');
        const requiredTables = [
            'admin_users',
            'admin_sessions',
            'admin_actions',
            'admin_activity_log',
            'admin_analytics',
            'admin_system_settings'
        ];

        let allTablesExist = true;
        for (const table of requiredTables) {
            const result = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                )
            `, [table]);

            if (result.rows[0].exists) {
                console.log(`  ✅ ${table}`);
            } else {
                console.log(`  ❌ ${table} - MISSING!`);
                allTablesExist = false;
            }
        }

        if (!allTablesExist) {
            console.log('\n❌ Some tables are missing. Please check the SQL script.');
            process.exit(1);
        }

        // Check critical constraints
        console.log('\n🔍 Checking critical constraints...\n');
        
        // Check admin_system_settings unique constraint
        const constraintCheck = await client.query(`
            SELECT constraint_name, constraint_type
            FROM information_schema.table_constraints
            WHERE table_name = 'admin_system_settings'
            AND constraint_type = 'UNIQUE'
            AND constraint_name LIKE '%setting_key%'
        `);

        if (constraintCheck.rows.length > 0) {
            console.log('  ✅ admin_system_settings.setting_key has UNIQUE constraint');
        } else {
            console.log('  ⚠️  Adding UNIQUE constraint to admin_system_settings.setting_key...');
            try {
                await client.query(`
                    ALTER TABLE admin_system_settings 
                    ADD CONSTRAINT admin_system_settings_setting_key_key UNIQUE (setting_key)
                `);
                console.log('  ✅ UNIQUE constraint added successfully');
            } catch (error) {
                if (error.message.includes('already exists')) {
                    console.log('  ✅ UNIQUE constraint already exists (different name)');
                } else {
                    console.log(`  ⚠️  Could not add constraint: ${error.message}`);
                }
            }
        }

        // Check admin_users unique constraints
        const adminUsersConstraints = await client.query(`
            SELECT constraint_name, constraint_type
            FROM information_schema.table_constraints
            WHERE table_name = 'admin_users'
            AND constraint_type = 'UNIQUE'
        `);

        if (adminUsersConstraints.rows.length >= 2) {
            console.log('  ✅ admin_users has UNIQUE constraints on username and email');
        } else {
            console.log('  ⚠️  Checking admin_users unique constraints...');
            // Try to add if missing
            try {
                await client.query(`
                    ALTER TABLE admin_users 
                    ADD CONSTRAINT admin_users_username_key UNIQUE (username)
                `);
                console.log('  ✅ Added UNIQUE constraint on username');
            } catch (e) {
                // Already exists
            }
            try {
                await client.query(`
                    ALTER TABLE admin_users 
                    ADD CONSTRAINT admin_users_email_key UNIQUE (email)
                `);
                console.log('  ✅ Added UNIQUE constraint on email');
            } catch (e) {
                // Already exists
            }
        }

        // Verify shared tables (subscriptions, payments)
        console.log('\n🔍 Verifying shared tables (subscriptions, payments)...\n');
        const sharedTables = ['subscriptions', 'payments', 'users'];
        let allSharedExist = true;
        
        for (const table of sharedTables) {
            const result = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                )
            `, [table]);

            if (result.rows[0].exists) {
                console.log(`  ✅ ${table} exists`);
            } else {
                console.log(`  ⚠️  ${table} missing (may cause issues with Payment/Subscription features)`);
                allSharedExist = false;
            }
        }

        if (!allSharedExist) {
            console.log('\n⚠️  Some shared tables are missing. These are created by the main app.');
            console.log('   The admin server will work, but Payment/Subscription features may not function properly.\n');
        }

        console.log('\n✅✅✅ All admin tables are ready! ✅✅✅\n');
        console.log('📝 Next steps:');
        console.log('   1. Verify shared tables: node database/verify-shared-tables.js');
        console.log('   2. Create an admin user: node setup-admin-user.js admin admin@example.com password');
        console.log('   3. Start the server: npm start');
        console.log('   4. Login at: http://localhost:3003/login\n');

    } catch (error) {
        console.error('\n❌ Error setting up database:', error);
        console.error('Error details:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

setupAdminDatabase();




















































