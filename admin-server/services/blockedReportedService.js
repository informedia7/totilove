const { query } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class BlockedReportedService {
    constructor() {
        this.cacheExpiry = 300; // 5 minutes
    }

    /**
     * Get blocked users with statistics
     */
    async getBlockedUsers(options = {}) {
        const {
            page = 1,
            limit = 20,
            search = '',
            blockedUserId = null,
            blockerUserId = null,
            sortBy = 'created_at',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;

        try {
            // Build WHERE clause
            let whereConditions = ['1=1'];
            const params = [];
            let paramIndex = 1;

            if (search) {
                whereConditions.push(`(
                    u_blocked.real_name ILIKE $${paramIndex} OR 
                    u_blocker.real_name ILIKE $${paramIndex} OR
                    CAST(bu.blocked_id AS TEXT) = $${paramIndex} OR
                    CAST(bu.blocker_id AS TEXT) = $${paramIndex}
                )`);
                params.push(`%${search}%`);
                paramIndex++;
            }

            if (blockedUserId) {
                whereConditions.push(`bu.blocked_id = $${paramIndex}`);
                params.push(blockedUserId);
                paramIndex++;
            }

            if (blockerUserId) {
                whereConditions.push(`bu.blocker_id = $${paramIndex}`);
                params.push(blockerUserId);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Get blocked users with user info and block count
            const result = await query(
                `SELECT 
                    bu.id,
                    bu.blocker_id,
                    bu.blocked_id,
                    bu.reason,
                    bu.created_at,
                    u_blocker.real_name as blocker_username,
                    u_blocker.email as blocker_email,
                    u_blocked.real_name as blocked_username,
                    u_blocked.email as blocked_email,
                    (SELECT COUNT(*) FROM users_blocked_by_users WHERE blocked_id = bu.blocked_id) as total_blocks_received,
                    (SELECT COUNT(*) FROM users_blocked_by_users WHERE blocker_id = bu.blocker_id) as total_blocks_given
                FROM users_blocked_by_users bu
                JOIN users u_blocker ON bu.blocker_id = u_blocker.id
                JOIN users u_blocked ON bu.blocked_id = u_blocked.id
                WHERE ${whereClause}
                ORDER BY bu.${safeSortBy} ${safeSortOrder}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                [...params, limit, offset]
            );

            // Get total count
            const countResult = await query(
                `SELECT COUNT(*) as total
                 FROM users_blocked_by_users bu
                 JOIN users u_blocker ON bu.blocker_id = u_blocker.id
                 JOIN users u_blocked ON bu.blocked_id = u_blocked.id
                 WHERE ${whereClause}`,
                params
            );

            const total = parseInt(countResult.rows[0]?.total || 0);

            return {
                data: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('Error fetching blocked users:', error);
            throw error;
        }
    }

    /**
     * Get reported users with statistics
     */
    async getReportedUsers(options = {}) {
        const {
            page = 1,
            limit = 20,
            search = '',
            reportedUserId = null,
            reporterUserId = null,
            status = '',
            sortBy = 'report_date',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;

        try {
            // Build WHERE clause
            let whereConditions = ['1=1'];
            const params = [];
            let paramIndex = 1;

            if (search) {
                whereConditions.push(`(
                    u_reported.real_name ILIKE $${paramIndex} OR 
                    u_reporter.real_name ILIKE $${paramIndex} OR
                    CAST(r.reported_user_id AS TEXT) = $${paramIndex} OR
                    CAST(r.reporter_id AS TEXT) = $${paramIndex} OR
                    r.reason ILIKE $${paramIndex}
                )`);
                params.push(`%${search}%`);
                paramIndex++;
            }

            if (reportedUserId) {
                whereConditions.push(`r.reported_user_id = $${paramIndex}`);
                params.push(reportedUserId);
                paramIndex++;
            }

            if (reporterUserId) {
                whereConditions.push(`r.reporter_id = $${paramIndex}`);
                params.push(reporterUserId);
                paramIndex++;
            }

            if (status) {
                whereConditions.push(`r.status = $${paramIndex}`);
                params.push(status);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Get reported users with user info and report count
            // Try reports table first, then user_reports
            let result;
            let countResult;

            // Validate sortBy and sortOrder to prevent SQL injection
            const allowedSortFields = ['created_at', 'report_date', 'reporter_username', 'reported_username', 'id'];
            let actualSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'report_date';
            const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
            
            // Normalize sortBy for reports table
            if (actualSortBy === 'created_at') {
                actualSortBy = 'report_date';
            }

            try {
                result = await query(
                    `SELECT 
                        r.id,
                        r.reporter_id,
                        r.reported_user_id,
                        r.reason,
                        r.report_date as created_at,
                        r.status,
                        u_reporter.real_name as reporter_username,
                        u_reporter.email as reporter_email,
                        u_reported.real_name as reported_username,
                        u_reported.email as reported_email,
                        (SELECT COUNT(*) FROM reports WHERE reported_user_id = r.reported_user_id) as total_reports_received,
                        (SELECT COUNT(*) FROM reports WHERE reporter_id = r.reporter_id) as total_reports_given
                    FROM reports r
                    JOIN users u_reporter ON r.reporter_id = u_reporter.id
                    JOIN users u_reported ON r.reported_user_id = u_reported.id
                    WHERE ${whereClause}
                    ORDER BY r.${actualSortBy} ${safeSortOrder}
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                    [...params, limit, offset]
                );

                countResult = await query(
                    `SELECT COUNT(*) as total
                     FROM reports r
                     JOIN users u_reporter ON r.reporter_id = u_reporter.id
                     JOIN users u_reported ON r.reported_user_id = u_reported.id
                     WHERE ${whereClause}`,
                    params
                );
            } catch (error) {
                // Try user_reports table if reports doesn't exist
                logger.warn('reports table not found, trying user_reports');
                result = await query(
                    `SELECT 
                        ur.id,
                        ur.reporter_id,
                        ur.reported_user_id,
                        ur.description as reason,
                        ur.created_at,
                        'pending' as status,
                        u_reporter.real_name as reporter_username,
                        u_reporter.email as reporter_email,
                        u_reported.real_name as reported_username,
                        u_reported.email as reported_email,
                        (SELECT COUNT(*) FROM user_reports WHERE reported_user_id = ur.reported_user_id) as total_reports_received,
                        (SELECT COUNT(*) FROM user_reports WHERE reporter_id = ur.reporter_id) as total_reports_given
                    FROM user_reports ur
                    JOIN users u_reporter ON ur.reporter_id = u_reporter.id
                    JOIN users u_reported ON ur.reported_user_id = u_reported.id
                    WHERE ${whereClause}
                    ORDER BY ur.${actualSortBy === 'report_date' ? 'created_at' : actualSortBy} ${safeSortOrder}
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                    [...params, limit, offset]
                );

                countResult = await query(
                    `SELECT COUNT(*) as total
                     FROM user_reports ur
                     JOIN users u_reporter ON ur.reporter_id = u_reporter.id
                     JOIN users u_reported ON ur.reported_user_id = u_reported.id
                     WHERE ${whereClause}`,
                    params
                );
            }

            const total = parseInt(countResult.rows[0]?.total || 0);

            return {
                data: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('Error fetching reported users:', error);
            throw error;
        }
    }

    /**
     * Get messages between users (for context)
     */
    async getMessagesBetweenUsers(userId1, userId2, limit = 10) {
        try {
            const result = await query(
                `SELECT 
                    m.id,
                    m.sender_id,
                    m.receiver_id,
                    m.message,
                    m.timestamp,
                    m.is_image,
                    u_sender.real_name as sender_username,
                    u_receiver.real_name as receiver_username
                FROM user_messages m
                JOIN users u_sender ON m.sender_id = u_sender.id
                JOIN users u_receiver ON m.receiver_id = u_receiver.id
                WHERE (m.sender_id = $1 AND m.receiver_id = $2)
                   OR (m.sender_id = $2 AND m.receiver_id = $1)
                ORDER BY m.timestamp DESC
                LIMIT $3`,
                [userId1, userId2, limit]
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching messages between users:', error);
            return [];
        }
    }

    /**
     * Get statistics for blocked/reported users
     */
    async getStatistics() {
        try {
            // Blocked users stats
            const blockedStats = await query(`
                SELECT 
                    COUNT(*) as total_blocks,
                    COUNT(DISTINCT blocker_id) as unique_blockers,
                    COUNT(DISTINCT blocked_id) as unique_users_blocked_by_users,
                    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as blocks_last_7_days,
                    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as blocks_last_30_days
                FROM users_blocked_by_users
            `);

            // Reported users stats
            let reportedStats;
            try {
                reportedStats = await query(`
                    SELECT 
                        COUNT(*) as total_reports,
                        COUNT(DISTINCT reporter_id) as unique_reporters,
                        COUNT(DISTINCT reported_user_id) as unique_reported_users,
                        COUNT(*) FILTER (WHERE report_date >= NOW() - INTERVAL '7 days') as reports_last_7_days,
                        COUNT(*) FILTER (WHERE report_date >= NOW() - INTERVAL '30 days') as reports_last_30_days,
                        COUNT(*) FILTER (WHERE status = 'pending') as pending_reports,
                        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_reports
                    FROM reports
                `);
            } catch (error) {
                // Try user_reports table
                reportedStats = await query(`
                    SELECT 
                        COUNT(*) as total_reports,
                        COUNT(DISTINCT reporter_id) as unique_reporters,
                        COUNT(DISTINCT reported_user_id) as unique_reported_users,
                        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as reports_last_7_days,
                        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as reports_last_30_days,
                        COUNT(*) as pending_reports,
                        0 as resolved_reports
                    FROM user_reports
                `);
            }

            // Most blocked users
            const mostBlocked = await query(`
                SELECT 
                    blocked_id,
                    COUNT(*) as block_count,
                    u.real_name,
                    u.email
                FROM users_blocked_by_users
                JOIN users u ON blocked_id = u.id
                GROUP BY blocked_id, u.real_name, u.email
                ORDER BY block_count DESC
                LIMIT 10
            `);

            // Most reported users
            let mostReported;
            try {
                mostReported = await query(`
                    SELECT 
                        reported_user_id,
                        COUNT(*) as report_count,
                        u.real_name,
                        u.email
                    FROM reports
                    JOIN users u ON reported_user_id = u.id
                    GROUP BY reported_user_id, u.real_name, u.email
                    ORDER BY report_count DESC
                    LIMIT 10
                `);
            } catch (error) {
                mostReported = await query(`
                    SELECT 
                        reported_user_id,
                        COUNT(*) as report_count,
                        u.real_name,
                        u.email
                    FROM user_reports
                    JOIN users u ON reported_user_id = u.id
                    GROUP BY reported_user_id, u.real_name, u.email
                    ORDER BY report_count DESC
                    LIMIT 10
                `);
            }

            return {
                blocked: blockedStats.rows[0] || {},
                reported: reportedStats.rows[0] || {},
                mostBlocked: mostBlocked.rows || [],
                mostReported: mostReported.rows || []
            };
        } catch (error) {
            logger.error('Error fetching statistics:', error);
            throw error;
        }
    }

    /**
     * Update report status
     */
    async updateReportStatus(reportId, status) {
        try {
            // Try reports table first
            let result;
            try {
                result = await query(
                    `UPDATE reports 
                     SET status = $1 
                     WHERE id = $2
                     RETURNING *`,
                    [status, reportId]
                );
            } catch (error) {
                // If reports table doesn't exist, we can't update status
                // (user_reports doesn't have status column)
                throw new Error('Cannot update report status - table does not support it');
            }

            if (result.rows.length === 0) {
                throw new Error('Report not found');
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Error updating report status:', error);
            throw error;
        }
    }

    /**
     * Delete a block (unblock)
     */
    async deleteBlock(blockId) {
        try {
            const result = await query(
                `DELETE FROM users_blocked_by_users 
                 WHERE id = $1
                 RETURNING *`,
                [blockId]
            );

            if (result.rows.length === 0) {
                throw new Error('Block not found');
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Error deleting block:', error);
            throw error;
        }
    }
}

module.exports = new BlockedReportedService();




















































