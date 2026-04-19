require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query } = require('../config/database');

class CorruptionChecker {
    constructor() {
        this.issues = [];
    }

    async checkAll() {
        console.log('🔍 Checking for Database Corruption in Users\n');
        console.log('='.repeat(80));
        
        await this.checkOrphanedForeignKeys();
        await this.checkInvalidDates();
        await this.checkInvalidAges();
        await this.checkMissingRequiredFields();
        await this.checkDuplicateEmails();
        await this.checkInvalidGenderValues();
        await this.checkOrphanedUserAttributes();
        await this.checkOrphanedUserPreferences();
        await this.checkOrphanedUserRelatedTables();
        await this.checkInvalidLocationReferences();
        await this.checkInconsistentData();
        
        this.printSummary();
    }

    async checkOrphanedForeignKeys() {
        console.log('\n1️⃣ Checking for orphaned foreign key references...');
        console.log('-'.repeat(80));
        
        // Check users with invalid country_id
        const invalidCountry = await query(`
            SELECT u.id, u.email, u.real_name, u.country_id
            FROM users u
            WHERE u.country_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM country c WHERE c.id = u.country_id)
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        if (invalidCountry.rows.length > 0) {
            console.log(`   ❌ Found ${invalidCountry.rows.length} user(s) with invalid country_id:`);
            invalidCountry.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): country_id=${u.country_id} does not exist`);
                this.issues.push({
                    type: 'orphaned_foreign_key',
                    severity: 'high',
                    user_id: u.id,
                    email: u.email,
                    issue: `Invalid country_id: ${u.country_id}`
                });
            });
        } else {
            console.log('   ✅ No orphaned country_id references');
        }
        
        // Check users with invalid state_id
        const invalidState = await query(`
            SELECT u.id, u.email, u.real_name, u.state_id
            FROM users u
            WHERE u.state_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM state s WHERE s.id = u.state_id)
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        if (invalidState.rows.length > 0) {
            console.log(`   ❌ Found ${invalidState.rows.length} user(s) with invalid state_id:`);
            invalidState.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): state_id=${u.state_id} does not exist`);
                this.issues.push({
                    type: 'orphaned_foreign_key',
                    severity: 'high',
                    user_id: u.id,
                    email: u.email,
                    issue: `Invalid state_id: ${u.state_id}`
                });
            });
        } else {
            console.log('   ✅ No orphaned state_id references');
        }
        
        // Check users with invalid city_id
        const invalidCity = await query(`
            SELECT u.id, u.email, u.real_name, u.city_id
            FROM users u
            WHERE u.city_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM city c WHERE c.id = u.city_id)
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        if (invalidCity.rows.length > 0) {
            console.log(`   ❌ Found ${invalidCity.rows.length} user(s) with invalid city_id:`);
            invalidCity.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): city_id=${u.city_id} does not exist`);
                this.issues.push({
                    type: 'orphaned_foreign_key',
                    severity: 'high',
                    user_id: u.id,
                    email: u.email,
                    issue: `Invalid city_id: ${u.city_id}`
                });
            });
        } else {
            console.log('   ✅ No orphaned city_id references');
        }
    }

    async checkInvalidDates() {
        console.log('\n2️⃣ Checking for invalid dates...');
        console.log('-'.repeat(80));
        
        // Check for future birthdates
        const futureBirthdates = await query(`
            SELECT id, email, real_name, birthdate
            FROM users
            WHERE birthdate > CURRENT_DATE
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = users.id)
        `);
        
        if (futureBirthdates.rows.length > 0) {
            console.log(`   ❌ Found ${futureBirthdates.rows.length} user(s) with future birthdates:`);
            futureBirthdates.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): birthdate=${u.birthdate} (future date)`);
                this.issues.push({
                    type: 'invalid_date',
                    severity: 'high',
                    user_id: u.id,
                    email: u.email,
                    issue: `Future birthdate: ${u.birthdate}`
                });
            });
        } else {
            console.log('   ✅ No future birthdates found');
        }
        
        // Check for very old birthdates (before 1900)
        const oldBirthdates = await query(`
            SELECT id, email, real_name, birthdate
            FROM users
            WHERE birthdate < '1900-01-01'
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = users.id)
        `);
        
        if (oldBirthdates.rows.length > 0) {
            console.log(`   ⚠️  Found ${oldBirthdates.rows.length} user(s) with very old birthdates (before 1900):`);
            oldBirthdates.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): birthdate=${u.birthdate}`);
                this.issues.push({
                    type: 'invalid_date',
                    severity: 'medium',
                    user_id: u.id,
                    email: u.email,
                    issue: `Very old birthdate: ${u.birthdate}`
                });
            });
        } else {
            console.log('   ✅ No very old birthdates found');
        }
    }

    async checkInvalidAges() {
        console.log('\n3️⃣ Checking for invalid ages...');
        console.log('-'.repeat(80));
        
        // Check for users with calculated age outside reasonable range (0-120)
        const invalidAges = await query(`
            SELECT id, email, real_name, birthdate,
                EXTRACT(YEAR FROM AGE(birthdate))::INTEGER as calculated_age
            FROM users
            WHERE birthdate IS NOT NULL
            AND (
                EXTRACT(YEAR FROM AGE(birthdate)) < 0
                OR EXTRACT(YEAR FROM AGE(birthdate)) > 120
            )
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = users.id)
        `);
        
        if (invalidAges.rows.length > 0) {
            console.log(`   ❌ Found ${invalidAges.rows.length} user(s) with invalid ages:`);
            invalidAges.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): age=${u.calculated_age} (from birthdate ${u.birthdate})`);
                this.issues.push({
                    type: 'invalid_age',
                    severity: 'high',
                    user_id: u.id,
                    email: u.email,
                    issue: `Invalid age: ${u.calculated_age} (birthdate: ${u.birthdate})`
                });
            });
        } else {
            console.log('   ✅ No invalid ages found');
        }
    }

    async checkMissingRequiredFields() {
        console.log('\n4️⃣ Checking for missing required fields...');
        console.log('-'.repeat(80));
        
        // Check for users without email
        const noEmail = await query(`
            SELECT id, email, real_name
            FROM users
            WHERE email IS NULL OR email = ''
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = users.id)
        `);
        
        if (noEmail.rows.length > 0) {
            console.log(`   ❌ Found ${noEmail.rows.length} user(s) without email:`);
            noEmail.rows.forEach(u => {
                console.log(`      User ${u.id}: email is NULL or empty`);
                this.issues.push({
                    type: 'missing_required_field',
                    severity: 'high',
                    user_id: u.id,
                    email: u.email || 'NULL',
                    issue: 'Missing email'
                });
            });
        } else {
            console.log('   ✅ All users have email');
        }
        
        // Check for users without real_name
        const noName = await query(`
            SELECT id, email, real_name
            FROM users
            WHERE real_name IS NULL OR real_name = ''
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = users.id)
        `);
        
        if (noName.rows.length > 0) {
            console.log(`   ⚠️  Found ${noName.rows.length} user(s) without real_name:`);
            noName.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): real_name is NULL or empty`);
                this.issues.push({
                    type: 'missing_required_field',
                    severity: 'medium',
                    user_id: u.id,
                    email: u.email,
                    issue: 'Missing real_name'
                });
            });
        } else {
            console.log('   ✅ All users have real_name');
        }
    }

    async checkDuplicateEmails() {
        console.log('\n5️⃣ Checking for duplicate emails...');
        console.log('-'.repeat(80));
        
        const duplicates = await query(`
            SELECT email, COUNT(*) as count, ARRAY_AGG(id ORDER BY id) as user_ids
            FROM users
            WHERE email IS NOT NULL AND email != ''
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = users.id)
            GROUP BY email
            HAVING COUNT(*) > 1
        `);
        
        if (duplicates.rows.length > 0) {
            console.log(`   ❌ Found ${duplicates.rows.length} duplicate email(s):`);
            duplicates.rows.forEach(d => {
                console.log(`      Email "${d.email}": used by ${d.count} user(s) - IDs: ${d.user_ids.join(', ')}`);
                d.user_ids.forEach(userId => {
                    this.issues.push({
                        type: 'duplicate_email',
                        severity: 'high',
                        user_id: userId,
                        email: d.email,
                        issue: `Duplicate email: ${d.email} (${d.count} users)`
                    });
                });
            });
        } else {
            console.log('   ✅ No duplicate emails found');
        }
    }

    async checkInvalidGenderValues() {
        console.log('\n6️⃣ Checking for invalid gender values...');
        console.log('-'.repeat(80));
        
        // Check for unexpected gender values
        const invalidGenders = await query(`
            SELECT id, email, real_name, gender
            FROM users
            WHERE gender IS NOT NULL
            AND LOWER(gender) NOT IN ('m', 'male', 'f', 'female', 'other', 'non-binary')
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = users.id)
        `);
        
        if (invalidGenders.rows.length > 0) {
            console.log(`   ⚠️  Found ${invalidGenders.rows.length} user(s) with unexpected gender values:`);
            invalidGenders.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): gender="${u.gender}"`);
                this.issues.push({
                    type: 'invalid_gender',
                    severity: 'low',
                    user_id: u.id,
                    email: u.email,
                    issue: `Unexpected gender value: "${u.gender}"`
                });
            });
        } else {
            console.log('   ✅ All gender values are valid');
        }
    }

    async checkOrphanedUserAttributes() {
        console.log('\n7️⃣ Checking for orphaned user_attributes records...');
        console.log('-'.repeat(80));
        
        const orphaned = await query(`
            SELECT ua.user_id
            FROM user_attributes ua
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ua.user_id)
        `);
        
        if (orphaned.rows.length > 0) {
            console.log(`   ❌ Found ${orphaned.rows.length} orphaned user_attributes record(s):`);
            orphaned.rows.forEach(r => {
                console.log(`      user_id=${r.user_id} (user does not exist)`);
                this.issues.push({
                    type: 'orphaned_record',
                    severity: 'medium',
                    user_id: r.user_id,
                    email: 'N/A',
                    issue: 'Orphaned user_attributes record'
                });
            });
        } else {
            console.log('   ✅ No orphaned user_attributes records');
        }
    }

    async checkOrphanedUserPreferences() {
        console.log('\n8️⃣ Checking for orphaned user_preferences records...');
        console.log('-'.repeat(80));
        
        const orphaned = await query(`
            SELECT up.user_id
            FROM user_preferences up
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = up.user_id)
        `);
        
        if (orphaned.rows.length > 0) {
            console.log(`   ❌ Found ${orphaned.rows.length} orphaned user_preferences record(s):`);
            orphaned.rows.forEach(r => {
                console.log(`      user_id=${r.user_id} (user does not exist)`);
                this.issues.push({
                    type: 'orphaned_record',
                    severity: 'medium',
                    user_id: r.user_id,
                    email: 'N/A',
                    issue: 'Orphaned user_preferences record'
                });
            });
        } else {
            console.log('   ✅ No orphaned user_preferences records');
        }
    }

    async checkOrphanedUserRelatedTables() {
        console.log('\n8️⃣ Checking for orphaned records in user-related tables...');
        console.log('-'.repeat(80));
        
        // Check user_images
        const orphanedImages = await query(`
            SELECT ui.user_id
            FROM user_images ui
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ui.user_id)
        `);
        
        if (orphanedImages.rows.length > 0) {
            console.log(`   ❌ Found ${orphanedImages.rows.length} orphaned user_images record(s)`);
            orphanedImages.rows.forEach(r => {
                this.issues.push({
                    type: 'orphaned_record',
                    severity: 'medium',
                    user_id: r.user_id,
                    email: 'N/A',
                    issue: 'Orphaned user_images record'
                });
            });
        }
        
        // Check user_matches
        const orphanedMatches = await query(`
            SELECT DISTINCT user_id
            FROM (
                SELECT user1_id as user_id FROM user_matches
                UNION
                SELECT user2_id as user_id FROM user_matches
            ) all_user_ids
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = all_user_ids.user_id)
        `);
        
        if (orphanedMatches.rows.length > 0) {
            console.log(`   ❌ Found ${orphanedMatches.rows.length} orphaned user_matches record(s)`);
            orphanedMatches.rows.forEach(r => {
                this.issues.push({
                    type: 'orphaned_record',
                    severity: 'medium',
                    user_id: r.user_id,
                    email: 'N/A',
                    issue: 'Orphaned user_matches record'
                });
            });
        }
        
        // Check user_compatibility_cache
        const orphanedCompatibility = await query(`
            SELECT DISTINCT user_id
            FROM (
                SELECT user_id FROM user_compatibility_cache
                UNION
                SELECT target_user_id as user_id FROM user_compatibility_cache
            ) all_user_ids
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = all_user_ids.user_id)
        `);
        
        if (orphanedCompatibility.rows.length > 0) {
            console.log(`   ❌ Found ${orphanedCompatibility.rows.length} orphaned user_compatibility_cache record(s)`);
            orphanedCompatibility.rows.forEach(r => {
                this.issues.push({
                    type: 'orphaned_record',
                    severity: 'low',
                    user_id: r.user_id,
                    email: 'N/A',
                    issue: 'Orphaned user_compatibility_cache record'
                });
            });
        }
        
        // Check user_conversation_removals
        const orphanedRemovals = await query(`
            SELECT DISTINCT user_id
            FROM (
                SELECT remover_id as user_id FROM user_conversation_removals
                UNION
                SELECT removed_user_id as user_id FROM user_conversation_removals
            ) all_user_ids
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = all_user_ids.user_id)
        `);
        
        if (orphanedRemovals.rows.length > 0) {
            console.log(`   ❌ Found ${orphanedRemovals.rows.length} orphaned user_conversation_removals record(s)`);
            orphanedRemovals.rows.forEach(r => {
                this.issues.push({
                    type: 'orphaned_record',
                    severity: 'low',
                    user_id: r.user_id,
                    email: 'N/A',
                    issue: 'Orphaned user_conversation_removals record'
                });
            });
        }
        
        // Check user_reports
        const orphanedReports = await query(`
            SELECT DISTINCT user_id
            FROM (
                SELECT reporter_id as user_id FROM user_reports
                UNION
                SELECT reported_user_id as user_id FROM user_reports
            ) all_user_ids
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = all_user_ids.user_id)
        `);
        
        if (orphanedReports.rows.length > 0) {
            console.log(`   ❌ Found ${orphanedReports.rows.length} orphaned user_reports record(s)`);
            orphanedReports.rows.forEach(r => {
                this.issues.push({
                    type: 'orphaned_record',
                    severity: 'medium',
                    user_id: r.user_id,
                    email: 'N/A',
                    issue: 'Orphaned user_reports record'
                });
            });
        }
        
        // Check user_name_change_history
        const orphanedNameHistory = await query(`
            SELECT uchn.user_id
            FROM user_name_change_history uchn
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = uchn.user_id)
        `);
        
        if (orphanedNameHistory.rows.length > 0) {
            console.log(`   ❌ Found ${orphanedNameHistory.rows.length} orphaned user_name_change_history record(s)`);
            orphanedNameHistory.rows.forEach(r => {
                this.issues.push({
                    type: 'orphaned_record',
                    severity: 'low',
                    user_id: r.user_id,
                    email: 'N/A',
                    issue: 'Orphaned user_name_change_history record'
                });
            });
        }
        
        // Check admin_blacklisted_users
        const orphanedBlacklisted = await query(`
            SELECT abu.user_id
            FROM admin_blacklisted_users abu
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = abu.user_id)
        `);
        
        if (orphanedBlacklisted.rows.length > 0) {
            console.log(`   ❌ Found ${orphanedBlacklisted.rows.length} orphaned admin_blacklisted_users record(s)`);
            orphanedBlacklisted.rows.forEach(r => {
                this.issues.push({
                    type: 'orphaned_record',
                    severity: 'medium',
                    user_id: r.user_id,
                    email: 'N/A',
                    issue: 'Orphaned admin_blacklisted_users record'
                });
            });
        }
        
        if (orphanedImages.rows.length === 0 && orphanedMatches.rows.length === 0 && 
            orphanedCompatibility.rows.length === 0 && orphanedRemovals.rows.length === 0 &&
            orphanedReports.rows.length === 0 && orphanedNameHistory.rows.length === 0 &&
            orphanedBlacklisted.rows.length === 0) {
            console.log('   ✅ No orphaned records in user-related tables');
        }
    }

    async checkInvalidLocationReferences() {
        console.log('\n9️⃣ Checking for invalid location references...');
        console.log('-'.repeat(80));
        
        // Check state_id that doesn't belong to country_id
        const invalidStateCountry = await query(`
            SELECT u.id, u.email, u.real_name, u.country_id, u.state_id, s.country_id as state_country_id
            FROM users u
            JOIN state s ON u.state_id = s.id
            WHERE u.country_id IS NOT NULL
            AND u.state_id IS NOT NULL
            AND u.country_id != s.country_id
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        if (invalidStateCountry.rows.length > 0) {
            console.log(`   ❌ Found ${invalidStateCountry.rows.length} user(s) with state_id not matching country_id:`);
            invalidStateCountry.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): country_id=${u.country_id}, state_id=${u.state_id} (state belongs to country ${u.state_country_id})`);
                this.issues.push({
                    type: 'invalid_location_reference',
                    severity: 'high',
                    user_id: u.id,
                    email: u.email,
                    issue: `State ${u.state_id} does not belong to country ${u.country_id}`
                });
            });
        } else {
            console.log('   ✅ No invalid state-country references');
        }
        
        // Check city_id that doesn't belong to state_id
        const invalidCityState = await query(`
            SELECT u.id, u.email, u.real_name, u.state_id, u.city_id, c.state_id as city_state_id
            FROM users u
            JOIN city c ON u.city_id = c.id
            WHERE u.state_id IS NOT NULL
            AND u.city_id IS NOT NULL
            AND u.state_id != c.state_id
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        if (invalidCityState.rows.length > 0) {
            console.log(`   ❌ Found ${invalidCityState.rows.length} user(s) with city_id not matching state_id:`);
            invalidCityState.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): state_id=${u.state_id}, city_id=${u.city_id} (city belongs to state ${u.city_state_id})`);
                this.issues.push({
                    type: 'invalid_location_reference',
                    severity: 'high',
                    user_id: u.id,
                    email: u.email,
                    issue: `City ${u.city_id} does not belong to state ${u.state_id}`
                });
            });
        } else {
            console.log('   ✅ No invalid city-state references');
        }
    }

    async checkInconsistentData() {
        console.log('\n🔟 Checking for inconsistent data...');
        console.log('-'.repeat(80));
        
        // Check users with user_attributes but missing user_preferences
        const missingPrefs = await query(`
            SELECT u.id, u.email, u.real_name
            FROM users u
            WHERE EXISTS (SELECT 1 FROM user_attributes ua WHERE ua.user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM user_preferences up WHERE up.user_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
        `);
        
        if (missingPrefs.rows.length > 0) {
            console.log(`   ⚠️  Found ${missingPrefs.rows.length} user(s) with attributes but no preferences:`);
            missingPrefs.rows.forEach(u => {
                console.log(`      User ${u.id} (${u.email}): has attributes but no preferences`);
                this.issues.push({
                    type: 'inconsistent_data',
                    severity: 'low',
                    user_id: u.id,
                    email: u.email,
                    issue: 'Has user_attributes but no user_preferences'
                });
            });
        } else {
            console.log('   ✅ No inconsistent attribute/preference data');
        }
        
        // Check for users with invalid age preferences (min > max)
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
            console.log(`   ❌ Found ${invalidAgePrefs.rows.length} user(s) with invalid age preferences (min > max):`);
            invalidAgePrefs.rows.forEach(u => {
                console.log(`      User ${u.user_id} (${u.email}): age_min=${u.age_min} > age_max=${u.age_max}`);
                this.issues.push({
                    type: 'invalid_age_preferences',
                    severity: 'medium',
                    user_id: u.user_id,
                    email: u.email,
                    issue: `Invalid age range: min=${u.age_min} > max=${u.age_max}`
                });
            });
        } else {
            console.log('   ✅ No invalid age preferences');
        }
    }

    printSummary() {
        console.log('\n' + '='.repeat(80));
        console.log('\n📊 CORRUPTION SUMMARY\n');
        console.log(`   Total Issues Found: ${this.issues.length}`);
        
        const bySeverity = {
            high: this.issues.filter(i => i.severity === 'high').length,
            medium: this.issues.filter(i => i.severity === 'medium').length,
            low: this.issues.filter(i => i.severity === 'low').length
        };
        
        console.log(`   High Severity: ${bySeverity.high}`);
        console.log(`   Medium Severity: ${bySeverity.medium}`);
        console.log(`   Low Severity: ${bySeverity.low}`);
        
        const byType = {};
        this.issues.forEach(issue => {
            byType[issue.type] = (byType[issue.type] || 0) + 1;
        });
        
        console.log(`\n   Issues by Type:`);
        Object.entries(byType).forEach(([type, count]) => {
            console.log(`      ${type}: ${count}`);
        });
        
        if (this.issues.length > 0) {
            console.log(`\n   Affected Users: ${new Set(this.issues.map(i => i.user_id)).size}`);
            
            console.log(`\n📋 DETAILED ISSUE LIST:\n`);
            const groupedByUser = {};
            this.issues.forEach(issue => {
                if (!groupedByUser[issue.user_id]) {
                    groupedByUser[issue.user_id] = [];
                }
                groupedByUser[issue.user_id].push(issue);
            });
            
            Object.entries(groupedByUser).forEach(([userId, userIssues]) => {
                const user = userIssues[0];
                console.log(`   User ${userId} (${user.email || 'N/A'}):`);
                userIssues.forEach(issue => {
                    console.log(`      [${issue.severity.toUpperCase()}] ${issue.issue}`);
                });
                console.log('');
            });
        } else {
            console.log(`\n   ✅ No corruption found! Database is clean.`);
        }
        
        console.log('='.repeat(80));
    }
}

async function findCorruptedUsers() {
    try {
        const checker = new CorruptionChecker();
        await checker.checkAll();
        return checker;
    } catch (error) {
        console.error('❌ Error:', error);
        console.error('Stack:', error.stack);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    findCorruptedUsers()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            process.exit(1);
        });
}

module.exports = { CorruptionChecker, findCorruptedUsers };

