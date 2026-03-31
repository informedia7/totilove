/**
 * Script to verify that shared tables (subscriptions, payments) exist
 * and have all required columns for the admin server
 * 
 * Usage: node database/verify-shared-tables.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'totilove',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Required columns for each table
const requiredTables = {
    subscriptions: [
        'id',
        'user_id',
        'subscription_type',
        'payment_status',
        'start_date',
        'end_date'
    ],
    payments: [
        'id',
        'user_id',
        'amount',
        'payment_date',
        'payment_method',
        'payment_status'
    ]
};

async function verifySharedTables() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Verifying shared tables for admin server...\n');

        for (const [tableName, requiredColumns] of Object.entries(requiredTables)) {
            console.log(`📋 Checking table: ${tableName}`);
            
            // Check if table exists
            const tableExists = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                )
            `, [tableName]);

            if (!tableExists.rows[0].exists) {
                console.log(`  ❌ Table ${tableName} does NOT exist!\n`);
                continue;
            }

            console.log(`  ✅ Table ${tableName} exists`);

            // Get actual columns
            const columnsResult = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' 
                AND table_name = $1
                ORDER BY ordinal_position
            `, [tableName]);

            const actualColumns = columnsResult.rows.map(row => row.column_name);
            console.log(`  📊 Actual columns: ${actualColumns.join(', ')}`);

            // Check for required columns
            const missingColumns = requiredColumns.filter(col => !actualColumns.includes(col));
            const extraColumns = actualColumns.filter(col => !requiredColumns.includes(col));

            if (missingColumns.length > 0) {
                console.log(`  ⚠️  Missing required columns: ${missingColumns.join(', ')}`);
            } else {
                console.log(`  ✅ All required columns present`);
            }

            if (extraColumns.length > 0) {
                console.log(`  ℹ️  Extra columns (not required but OK): ${extraColumns.join(', ')}`);
            }

            console.log('');
        }

        // Check if users table exists (needed for JOINs)
        const usersExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            )
        `);

        if (usersExists.rows[0].exists) {
            console.log('✅ users table exists (needed for JOINs)');
        } else {
            console.log('❌ users table does NOT exist (needed for JOINs)');
        }

        console.log('\n✅✅✅ Shared tables verification complete! ✅✅✅\n');

    } catch (error) {
        console.error('\n❌ Error verifying tables:', error);
        console.error('Error details:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

verifySharedTables();




















































