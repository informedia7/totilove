/**
 * Script to check if all admin tables exist and create missing ones
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

async function checkAndCreateTables() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Checking admin tables...\n');

        // Read SQL file
        const sqlFile = path.join(__dirname, 'create-admin-tables.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');

        // Execute SQL
        await client.query(sql);
        console.log('✅ Admin tables checked/created successfully\n');

        // Verify tables exist
        const tables = [
            'admin_users',
            'admin_sessions',
            'admin_actions',
            'admin_activity_log',
            'admin_analytics',
            'admin_system_settings'
        ];

        console.log('📋 Verifying tables exist...\n');
        for (const table of tables) {
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
                console.log(`  ❌ ${table} missing`);
            }
        }

        // Check if admin_system_settings has unique constraint
        console.log('\n🔍 Checking admin_system_settings constraints...\n');
        const constraintCheck = await client.query(`
            SELECT constraint_name, constraint_type
            FROM information_schema.table_constraints
            WHERE table_name = 'admin_system_settings'
            AND constraint_type IN ('UNIQUE', 'PRIMARY KEY')
        `);

        if (constraintCheck.rows.length > 0) {
            console.log('  ✅ Unique constraint exists on setting_key');
            constraintCheck.rows.forEach(row => {
                console.log(`     - ${row.constraint_name}: ${row.constraint_type}`);
            });
        } else {
            console.log('  ⚠️  No unique constraint found - adding it...');
            try {
                await client.query(`
                    ALTER TABLE admin_system_settings 
                    ADD CONSTRAINT admin_system_settings_setting_key_key UNIQUE (setting_key)
                `);
                console.log('  ✅ Unique constraint added');
            } catch (error) {
                console.log(`  ⚠️  Could not add constraint: ${error.message}`);
            }
        }

        console.log('\n✅ All admin tables are ready!\n');

    } catch (error) {
        console.error('❌ Error checking/creating tables:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

checkAndCreateTables();




















































