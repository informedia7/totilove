require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query } = require('../config/database');

async function fixCorruptedUsers() {
    try {
        console.log('🔧 Fixing Database Corruption\n');
        console.log('='.repeat(80));
        
        // Fix 1: Invalid location references (state_id/city_id mismatch)
        console.log('\n1️⃣ Fixing invalid location references...');
        console.log('-'.repeat(80));
        
        const invalidLocations = await query(`
            SELECT u.id, u.email, u.real_name, u.country_id, u.state_id, u.city_id,
                s.country_id as state_country_id,
                c.state_id as city_state_id
            FROM users u
            LEFT JOIN state s ON u.state_id = s.id
            LEFT JOIN city c ON u.city_id = c.id
            WHERE (
                (u.state_id IS NOT NULL AND s.country_id IS NOT NULL AND u.country_id != s.country_id)
                OR (u.city_id IS NOT NULL AND c.state_id IS NOT NULL AND u.state_id != c.state_id)
            )
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        if (invalidLocations.rows.length > 0) {
            console.log(`   Found ${invalidLocations.rows.length} user(s) with invalid location references:`);
            
            for (const user of invalidLocations.rows) {
                let updates = [];
                
                // Fix state_id if it doesn't match country_id
                if (user.state_id && user.state_country_id && user.country_id != user.state_country_id) {
                    console.log(`      User ${user.id} (${user.email}): state_id=${user.state_id} doesn't match country_id=${user.country_id}`);
                    console.log(`         → Setting state_id to NULL`);
                    updates.push(`state_id = NULL`);
                }
                
                // Fix city_id if it doesn't match state_id
                if (user.city_id && user.city_state_id && user.state_id != user.city_state_id) {
                    console.log(`      User ${user.id} (${user.email}): city_id=${user.city_id} doesn't match state_id=${user.state_id}`);
                    console.log(`         → Setting city_id to NULL`);
                    updates.push(`city_id = NULL`);
                }
                
                if (updates.length > 0) {
                    await query(`
                        UPDATE users
                        SET ${updates.join(', ')}
                        WHERE id = $1
                    `, [user.id]);
                    console.log(`      ✅ Fixed user ${user.id}`);
                }
            }
        } else {
            console.log('   ✅ No invalid location references found');
        }
        
        // Fix 2: Invalid age preferences (min > max)
        console.log('\n2️⃣ Fixing invalid age preferences...');
        console.log('-'.repeat(80));
        
        const invalidAgePrefs = await query(`
            SELECT up.user_id, u.email, u.real_name, up.age_min, up.age_max
            FROM user_preferences up
            JOIN users u ON up.user_id = u.id
            WHERE up.age_min IS NOT NULL
            AND up.age_max IS NOT NULL
            AND up.age_min > up.age_max
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        if (invalidAgePrefs.rows.length > 0) {
            console.log(`   Found ${invalidAgePrefs.rows.length} user(s) with invalid age preferences:`);
            
            for (const user of invalidAgePrefs.rows) {
                console.log(`      User ${user.user_id} (${user.email}): age_min=${user.age_min} > age_max=${user.age_max}`);
                
                // Swap them (assume the values were entered in wrong order)
                const fixedMin = Math.min(user.age_min, user.age_max);
                const fixedMax = Math.max(user.age_min, user.age_max);
                
                await query(`
                    UPDATE user_preferences
                    SET age_min = $1, age_max = $2
                    WHERE user_id = $3
                `, [fixedMin, fixedMax, user.user_id]);
                
                console.log(`         → Fixed: age_min=${fixedMin}, age_max=${fixedMax}`);
                console.log(`      ✅ Fixed user ${user.user_id}`);
            }
        } else {
            console.log('   ✅ No invalid age preferences found');
        }
        
        // Fix 3: Create missing user_preferences for users with attributes
        console.log('\n3️⃣ Creating missing user_preferences...');
        console.log('-'.repeat(80));
        
        const missingPrefs = await query(`
            SELECT u.id, u.email, u.real_name
            FROM users u
            WHERE EXISTS (SELECT 1 FROM user_attributes ua WHERE ua.user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM user_preferences up WHERE up.user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        if (missingPrefs.rows.length > 0) {
            console.log(`   Found ${missingPrefs.rows.length} user(s) with attributes but no preferences:`);
            
            for (const user of missingPrefs.rows) {
                console.log(`      User ${user.id} (${user.email}): Creating default preferences`);
                
                // Create default preferences
                await query(`
                    INSERT INTO user_preferences (user_id, age_min, age_max, preferred_gender, location_radius)
                    VALUES ($1, 18, 65, NULL, 0)
                `, [user.id]);
                
                console.log(`      ✅ Created preferences for user ${user.id}`);
            }
        } else {
            console.log('   ✅ No missing preferences found');
        }
        
        // Verify fixes
        console.log('\n4️⃣ Verifying fixes...');
        console.log('-'.repeat(80));
        
        const remainingInvalidLocations = await query(`
            SELECT COUNT(*) as count
            FROM users u
            LEFT JOIN state s ON u.state_id = s.id
            LEFT JOIN city c ON u.city_id = c.id
            WHERE (
                (u.state_id IS NOT NULL AND s.country_id IS NOT NULL AND u.country_id != s.country_id)
                OR (u.city_id IS NOT NULL AND c.state_id IS NOT NULL AND u.state_id != c.state_id)
            )
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        const remainingInvalidAgePrefs = await query(`
            SELECT COUNT(*) as count
            FROM user_preferences up
            JOIN users u ON up.user_id = u.id
            WHERE up.age_min IS NOT NULL
            AND up.age_max IS NOT NULL
            AND up.age_min > up.age_max
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        const remainingMissingPrefs = await query(`
            SELECT COUNT(*) as count
            FROM users u
            WHERE EXISTS (SELECT 1 FROM user_attributes ua WHERE ua.user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM user_preferences up WHERE up.user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        console.log(`   Invalid location references: ${remainingInvalidLocations.rows[0].count}`);
        console.log(`   Invalid age preferences: ${remainingInvalidAgePrefs.rows[0].count}`);
        console.log(`   Missing preferences: ${remainingMissingPrefs.rows[0].count}`);
        
        if (remainingInvalidLocations.rows[0].count == 0 && 
            remainingInvalidAgePrefs.rows[0].count == 0 && 
            remainingMissingPrefs.rows[0].count == 0) {
            console.log(`\n   ✅ All issues fixed!`);
        } else {
            console.log(`\n   ⚠️  Some issues remain`);
        }
        
        // Fix 4: Clean up orphaned records in user-related tables
        console.log('\n4️⃣ Cleaning up orphaned records in user-related tables...');
        console.log('-'.repeat(80));
        
        // Clean orphaned user_images
        const orphanedImages = await query(`
            DELETE FROM user_images
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_images.user_id)
        `);
        if (orphanedImages.rowCount > 0) {
            console.log(`   ✅ Deleted ${orphanedImages.rowCount} orphaned user_images record(s)`);
        }
        
        // Clean orphaned user_matches
        const orphanedMatches = await query(`
            DELETE FROM user_matches
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_matches.user1_id)
               OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_matches.user2_id)
        `);
        if (orphanedMatches.rowCount > 0) {
            console.log(`   ✅ Deleted ${orphanedMatches.rowCount} orphaned user_matches record(s)`);
        }
        
        // Clean orphaned user_compatibility_cache
        const orphanedCompatibility = await query(`
            DELETE FROM user_compatibility_cache
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_compatibility_cache.user_id)
               OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_compatibility_cache.target_user_id)
        `);
        if (orphanedCompatibility.rowCount > 0) {
            console.log(`   ✅ Deleted ${orphanedCompatibility.rowCount} orphaned user_compatibility_cache record(s)`);
        }
        
        // Clean orphaned user_conversation_removals
        const orphanedRemovals = await query(`
            DELETE FROM user_conversation_removals
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_conversation_removals.remover_id)
               OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_conversation_removals.removed_user_id)
        `);
        if (orphanedRemovals.rowCount > 0) {
            console.log(`   ✅ Deleted ${orphanedRemovals.rowCount} orphaned user_conversation_removals record(s)`);
        }
        
        // Clean orphaned user_reports
        const orphanedReports = await query(`
            DELETE FROM user_reports
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_reports.reporter_id)
               OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_reports.reported_user_id)
        `);
        if (orphanedReports.rowCount > 0) {
            console.log(`   ✅ Deleted ${orphanedReports.rowCount} orphaned user_reports record(s)`);
        }
        
        // Clean orphaned user_name_change_history
        const orphanedNameHistory = await query(`
            DELETE FROM user_name_change_history
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_name_change_history.user_id)
        `);
        if (orphanedNameHistory.rowCount > 0) {
            console.log(`   ✅ Deleted ${orphanedNameHistory.rowCount} orphaned user_name_change_history record(s)`);
        }
        
        // Clean orphaned admin_blacklisted_users
        const orphanedBlacklisted = await query(`
            DELETE FROM admin_blacklisted_users
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = admin_blacklisted_users.user_id)
        `);
        if (orphanedBlacklisted.rowCount > 0) {
            console.log(`   ✅ Deleted ${orphanedBlacklisted.rowCount} orphaned admin_blacklisted_users record(s)`);
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('\n✅ All fixes applied successfully!\n');
        console.log('='.repeat(80));
        
    } catch (error) {
        console.error('❌ Error:', error);
        console.error('Stack:', error.stack);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    fixCorruptedUsers()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            process.exit(1);
        });
}

module.exports = { fixCorruptedUsers };

