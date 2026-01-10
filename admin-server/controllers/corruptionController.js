const { CorruptionChecker } = require('../scripts/find-corrupted-users');
const { fixCorruptedUsers } = require('../scripts/fix-corrupted-users');
const { query } = require('../config/database');
const logger = require('../utils/logger');

class CorruptionController {
    /**
     * Check for database corruption
     */
    async checkCorruption(req, res) {
        try {
            logger.info('Admin corruption check requested');
            
            const checker = new CorruptionChecker();
            await checker.checkAll();
            
            const summary = {
                totalIssues: checker.issues.length,
                highSeverity: checker.issues.filter(i => i.severity === 'high').length,
                mediumSeverity: checker.issues.filter(i => i.severity === 'medium').length,
                lowSeverity: checker.issues.filter(i => i.severity === 'low').length,
                affectedUsers: new Set(checker.issues.map(i => i.user_id)).size,
                issues: checker.issues
            };
            
            res.json({
                success: true,
                summary: summary,
                isClean: checker.issues.length === 0
            });
        } catch (error) {
            logger.error('Error checking corruption:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to check database corruption',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Fix database corruption
     */
    async fixCorruption(req, res) {
        try {
            logger.info('Admin corruption fix requested');
            
            // Fix 1: Invalid location references
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
            
            for (const user of invalidLocations.rows) {
                let updates = [];
                if (user.state_id && user.state_country_id && user.country_id != user.state_country_id) {
                    updates.push(`state_id = NULL`);
                }
                if (user.city_id && user.city_state_id && user.state_id != user.city_state_id) {
                    updates.push(`city_id = NULL`);
                }
                if (updates.length > 0) {
                    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, [user.id]);
                }
            }
            
            // Fix 2: Invalid age preferences
            const invalidAgePrefs = await query(`
                SELECT up.user_id, up.age_min, up.age_max
                FROM user_preferences up
                JOIN users u ON up.user_id = u.id
                WHERE up.age_min IS NOT NULL
                AND up.age_max IS NOT NULL
                AND up.age_min > up.age_max
                AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
            `);
            
            for (const user of invalidAgePrefs.rows) {
                const fixedMin = Math.min(user.age_min, user.age_max);
                const fixedMax = Math.max(user.age_min, user.age_max);
                await query(`UPDATE user_preferences SET age_min = $1, age_max = $2 WHERE user_id = $3`, 
                    [fixedMin, fixedMax, user.user_id]);
            }
            
            // Fix 3: Create missing user_preferences
            const missingPrefs = await query(`
                SELECT u.id
                FROM users u
                WHERE EXISTS (SELECT 1 FROM user_attributes ua WHERE ua.user_id = u.id)
                AND NOT EXISTS (SELECT 1 FROM user_preferences up WHERE up.user_id = u.id)
                AND NOT EXISTS (SELECT 1 FROM users_deleted ud WHERE ud.deleted_user_id = u.id)
            `);
            
            for (const user of missingPrefs.rows) {
                await query(`INSERT INTO user_preferences (user_id, age_min, age_max, preferred_gender, location_radius) VALUES ($1, 18, 65, NULL, 0)`, [user.id]);
            }
            
            // Re-check to verify fixes
            const checker = new CorruptionChecker();
            await checker.checkAll();
            
            const summary = {
                totalIssues: checker.issues.length,
                highSeverity: checker.issues.filter(i => i.severity === 'high').length,
                mediumSeverity: checker.issues.filter(i => i.severity === 'medium').length,
                lowSeverity: checker.issues.filter(i => i.severity === 'low').length,
                affectedUsers: new Set(checker.issues.map(i => i.user_id)).size,
                issues: checker.issues
            };
            
            res.json({
                success: true,
                message: 'Corruption fixes applied',
                summary: summary,
                isClean: checker.issues.length === 0
            });
        } catch (error) {
            logger.error('Error fixing corruption:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fix database corruption',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get database table statistics
     */
    async getTableStatistics(req, res) {
        try {
            logger.info('Admin table statistics requested');
            
            const { query } = require('../config/database');
            
            // Get all user-related tables
            const userTables = [
                'users',
                'users_likes',
                'users_favorites',
                'users_profile_views',
                'users_blocked_by_users',
                'user_messages',
                'user_message_attachments',
                'user_images',
                'user_attributes',
                'user_preferences',
                'user_sessions',
                'user_matches',
                'user_activity',
                'user_reports',
                'user_compatibility_cache',
                'user_conversation_removals',
                'user_name_change_history',
                'users_deleted',
                'users_deleted_receivers',
                'email_verification_tokens',
                'admin_blacklisted_users'
            ];
            
            const tables = [];
            
            for (const tableName of userTables) {
                try {
                    const result = await query(`
                        SELECT COUNT(*) as row_count
                        FROM ${tableName}
                    `);
                    
                    tables.push({
                        table_name: tableName,
                        row_count: parseInt(result.rows[0].row_count)
                    });
                } catch (error) {
                    // Table might not exist, skip it
                    if (error.code !== '42P01') { // 42P01 = relation does not exist
                        logger.warn(`Error getting stats for table ${tableName}:`, error.message);
                    }
                }
            }
            
            // Sort by row count descending
            tables.sort((a, b) => b.row_count - a.row_count);
            
            res.json({
                success: true,
                tables: tables
            });
        } catch (error) {
            logger.error('Error getting table statistics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get table statistics',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = new CorruptionController();

