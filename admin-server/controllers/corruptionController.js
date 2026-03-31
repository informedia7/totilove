const path = require('path');
const fs = require('fs');
const { CorruptionChecker } = require('../scripts/find-corrupted-users');
const { fixCorruptedUsers } = require('../scripts/fix-corrupted-users');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const fsp = fs.promises;

// Orphaned table cleanup definitions (must stay in sync with account deletion flow)
const ORPHAN_CLEANUP_TARGETS = [
    {
        table: 'user_images',
        description: 'Profile images referencing users that no longer exist',
        query: `
            DELETE FROM user_images ui
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ui.user_id)
        `
    },
    {
        table: 'user_matches',
        description: 'Match pairs where one side is missing',
        query: `
            DELETE FROM user_matches um
            WHERE (um.user1_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = um.user1_id))
               OR (um.user2_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = um.user2_id))
        `
    },
    {
        table: 'user_compatibility_cache',
        description: 'Compatibility cache rows referencing removed users',
        query: `
            DELETE FROM user_compatibility_cache ucc
            WHERE (ucc.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ucc.user_id))
               OR (ucc.target_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ucc.target_user_id))
        `
    },
    {
        table: 'user_conversation_removals',
        description: 'Conversation removal markers linked to deleted users',
        query: `
            DELETE FROM user_conversation_removals ucr
            WHERE (ucr.remover_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ucr.remover_id))
               OR (ucr.removed_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ucr.removed_user_id))
        `
    },
    {
        table: 'user_reports',
        description: 'Reports where reporter or reported account has been removed',
        query: `
            DELETE FROM user_reports ur
            WHERE (ur.reporter_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.reporter_id))
               OR (ur.reported_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.reported_user_id))
        `
    },
    {
        table: 'user_name_change_history',
        description: 'Historical name changes for missing users',
        query: `
            DELETE FROM user_name_change_history unch
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = unch.user_id)
        `
    },
    {
        table: 'admin_blacklisted_users',
        description: 'Blacklist entries of users that no longer exist',
        query: `
            DELETE FROM admin_blacklisted_users abu
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = abu.user_id)
        `
    },
    {
        table: 'users_likes',
        description: 'Likes referencing deleted users',
        query: `
            DELETE FROM users_likes ul
            WHERE (ul.liked_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ul.liked_by))
               OR (ul.liked_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ul.liked_user_id))
        `
    },
    {
        table: 'users_favorites',
        description: 'Favorites referencing deleted users',
        query: `
            DELETE FROM users_favorites uf
            WHERE (uf.favorited_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = uf.favorited_by))
               OR (uf.favorited_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = uf.favorited_user_id))
        `
    },
    {
        table: 'users_profile_views',
        description: 'Profile view logs for missing viewers or profiles',
        query: `
            DELETE FROM users_profile_views upv
            WHERE (upv.viewer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = upv.viewer_id))
               OR (upv.viewed_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = upv.viewed_user_id))
        `
    },
    {
        table: 'user_preferences',
        description: 'Preference rows without an owning user',
        query: `
            DELETE FROM user_preferences up
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = up.user_id)
        `
    },
    {
        table: 'user_attributes',
        description: 'Attribute rows without an owning user',
        query: `
            DELETE FROM user_attributes ua
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ua.user_id)
        `
    },
    {
        table: 'user_activity',
        description: 'Activity feed rows referencing deleted users',
        query: `
            DELETE FROM user_activity ua
            WHERE (ua.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ua.user_id))
               OR (ua.target_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ua.target_user_id))
        `
    },
    {
        table: 'user_sessions',
        description: 'Stale sessions referencing deleted users',
        query: `
            DELETE FROM user_sessions us
            WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = us.user_id)
        `
    }
];

const ACCEPTED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.heic', '.heif']);
const MIN_ORPHAN_FILE_AGE_MS = 2 * 60 * 1000; // 2 minutes grace period for in-flight uploads
const MAX_SAMPLE_FILES = 10;
const UPLOAD_PATH_CANDIDATES = [
    process.env.UPLOADS_PATH,
    path.join(__dirname, '..', 'uploads'),
    path.join(__dirname, '..', '..', 'uploads'),
    path.join(__dirname, '..', '..', 'app', 'uploads'),
    path.join(__dirname, '..', '..', 'app', 'uploads', 'profile_images'),
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), '..', 'uploads'),
    path.join(process.cwd(), '..', 'app', 'uploads'),
    path.join(process.cwd(), '..', '..', 'uploads')
]
    .filter(Boolean)
    .map(p => path.resolve(p));

async function directoryExists(dir) {
    try {
        const stats = await fsp.stat(dir);
        return stats.isDirectory();
    } catch (error) {
        return false;
    }
}

async function resolveProfileImageDirectories() {
    const directories = new Set();

    for (const candidate of UPLOAD_PATH_CANDIDATES) {
        if (!candidate) {
            continue;
        }

        if (await directoryExists(candidate)) {
            directories.add(candidate);

            if (path.basename(candidate) !== 'profile_images') {
                const profileImagesPath = path.join(candidate, 'profile_images');
                if (await directoryExists(profileImagesPath)) {
                    directories.add(profileImagesPath);
                }
            }
        }
    }

    return Array.from(directories);
}

function looksLikeUserImage(fileName) {
    const normalized = fileName.toLowerCase();
    const ext = path.extname(normalized);
    return normalized.startsWith('user_') || ACCEPTED_IMAGE_EXTENSIONS.has(ext);
}

async function cleanupOrphanedFilesOnDisk(dbFileSet) {
    const directories = await resolveProfileImageDirectories();
    const summary = {
        directoriesScanned: directories,
        checkedFiles: 0,
        removedFiles: 0,
        skippedRecent: 0,
        sampleFilenames: [],
        dbReferenceCount: dbFileSet.size,
        failures: []
    };

    if (directories.length === 0) {
        summary.notes = ['No uploads/profile_images directory found'];
        return summary;
    }

    for (const dir of directories) {
        let files = [];
        try {
            files = await fsp.readdir(dir);
        } catch (error) {
            summary.failures.push({ directory: dir, error: error.message });
            continue;
        }

        for (const fileName of files) {
            const filePath = path.join(dir, fileName);
            let stats;

            try {
                stats = await fsp.stat(filePath);
            } catch (statError) {
                summary.failures.push({ file: filePath, error: statError.message });
                continue;
            }

            if (!stats.isFile() || !looksLikeUserImage(fileName)) {
                continue;
            }

            summary.checkedFiles += 1;
            const normalized = fileName.toLowerCase();

            if (dbFileSet.has(normalized)) {
                continue;
            }

            const ageMs = Date.now() - stats.mtimeMs;
            if (ageMs < MIN_ORPHAN_FILE_AGE_MS) {
                summary.skippedRecent += 1;
                continue;
            }

            try {
                await fsp.unlink(filePath);
                summary.removedFiles += 1;
                if (summary.sampleFilenames.length < MAX_SAMPLE_FILES) {
                    summary.sampleFilenames.push(fileName);
                }
            } catch (unlinkError) {
                summary.failures.push({ file: filePath, error: unlinkError.message });
            }
        }
    }

    if (summary.failures.length === 0) {
        delete summary.failures;
    }

    return summary;
}

async function loadImageFilenameSet() {
    try {
        const { rows } = await query('SELECT file_name FROM user_images');
        const set = new Set();
        rows.forEach(row => {
            if (row.file_name) {
                set.add(row.file_name.toLowerCase());
            }
        });
        return set;
    } catch (error) {
        if (error.code === '42P01') {
            logger.warn('user_images table not found while collecting filenames. Skipping file verification.');
            return new Set();
        }
        throw error;
    }
}

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

    /**
     * Clean orphaned records (database + file system)
     */
    async cleanupOrphanedRecords(req, res) {
        try {
            logger.info('Admin orphan cleanup requested');

            let totalDeleted = 0;
            const tableResults = [];
            const warnings = [];

            for (const target of ORPHAN_CLEANUP_TARGETS) {
                try {
                    const result = await query(target.query);
                    const deleted = result.rowCount || 0;
                    totalDeleted += deleted;
                    tableResults.push({
                        table: target.table,
                        description: target.description,
                        deleted
                    });
                } catch (error) {
                    if (error.code === '42P01') {
                        warnings.push(`Table ${target.table} does not exist. Skipping.`);
                        tableResults.push({
                            table: target.table,
                            description: target.description,
                            deleted: 0,
                            skipped: true
                        });
                        continue;
                    }

                    logger.error(`Failed to cleanup orphaned records for ${target.table}:`, error);
                    tableResults.push({
                        table: target.table,
                        description: target.description,
                        deleted: 0,
                        error: error.message
                    });
                    warnings.push(`Failed ${target.table}: ${error.message}`);
                }
            }

            const imageFilenameSet = await loadImageFilenameSet();
            const fileCleanup = await cleanupOrphanedFilesOnDisk(imageFilenameSet);

            const summary = {
                timestamp: new Date().toISOString(),
                totalDeletedRecords: totalDeleted,
                tableResults,
                fileCleanup,
                warnings
            };

            res.json({
                success: true,
                message: 'Orphaned records cleanup completed',
                summary
            });
        } catch (error) {
            logger.error('Error cleaning orphaned records:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to clean orphaned records',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = new CorruptionController();

