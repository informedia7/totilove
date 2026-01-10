#!/usr/bin/env node

/**
 * List all tables in the database
 */

const path = require('path');
const databaseManager = require(path.join(__dirname, '..', 'config', 'database'));

async function listTables() {
    try {
        console.log('🔄 Connecting to database...');
        await databaseManager.connect();
        console.log('✅ Connected\n');

        // Get all tables
        const result = await databaseManager.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE' 
            ORDER BY table_name
        `);

        console.log('📊 All tables in database:');
        console.log('='.repeat(60));
        
        const tables = result.rows.map(row => row.table_name);
        tables.forEach((table, index) => {
            console.log(`${(index + 1).toString().padStart(3)}. ${table}`);
        });

        console.log('='.repeat(60));
        console.log(`\nTotal: ${tables.length} tables\n`);

        // Filter user-related tables (excluding admin tables)
        const userTables = tables.filter(table => 
            (table.includes('user') || 
             table.includes('message') ||
             table.includes('like') ||
             table.includes('match') ||
             table.includes('session') ||
             table.includes('report') ||
             table.includes('favorite') ||
             table.includes('block') ||
             table.includes('conversation') ||
             table.includes('activity')) &&
            !table.startsWith('admin_') &&
            table !== 'sessions' && // Exclude generic sessions table
            table !== 'reports' // Exclude generic reports table
        );

        if (userTables.length > 0) {
            console.log('👤 User-related tables:');
            console.log('='.repeat(60));
            userTables.forEach((table, index) => {
                console.log(`${(index + 1).toString().padStart(3)}. ${table}`);
            });
            console.log('='.repeat(60));
            console.log(`\nTotal: ${userTables.length} user-related tables\n`);
        }

        // Check for specific tables mentioned in deleteUser
        const deleteUserTables = [
            'users',
            'user_messages',
            'user_message_attachments',
            'users_likes',
            'users_profile_views',
            'user_images',
            'users_favorites',
            'users_blocked_by_users',
            'user_attributes',
            'user_preferences',
            'user_sessions',
            'user_matches',
            'user_activity',
            'user_reports',
            'user_compatibility_cache',
            'user_conversation_removals',
            'users_deleted',
            'users_deleted_receivers',
            'user_profile_settings',
            'user_measurement_preferences',
            'user_contact_countries',
            'user_languages',
            'user_location_history',
            'user_name_change_history'
        ];

        console.log('🔍 Checking tables used in deleteUser function:');
        console.log('='.repeat(60));
        
        const existingTables = [];
        const missingTables = [];
        
        deleteUserTables.forEach(table => {
            if (tables.includes(table)) {
                existingTables.push(table);
                console.log(`✅ ${table}`);
            } else {
                missingTables.push(table);
                console.log(`❌ ${table} - MISSING`);
            }
        });

        console.log('='.repeat(60));
        console.log(`\n✅ Existing: ${existingTables.length}`);
        console.log(`❌ Missing: ${missingTables.length}\n`);

        if (missingTables.length > 0) {
            console.log('⚠️  Missing tables that need to be handled gracefully:');
            missingTables.forEach(table => console.log(`   - ${table}`));
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        try {
            await databaseManager.disconnect();
            console.log('\n✅ Disconnected from database');
        } catch (e) {
            // Ignore disconnect errors
        }
    }
}

listTables();

