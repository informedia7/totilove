const { query } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class StatisticsService {
    constructor() {
        this.cacheExpiry = 300; // 5 minutes
    }

    /**
     * Get dashboard statistics
     */
    async getDashboardStats(dateRange = '30d') {
        const cacheKey = `admin:stats:dashboard:${dateRange}`;

        try {
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            const { startDate, endDate } = this.getDateRange(dateRange);

            // User Statistics
            const userStats = await query(`
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(*) FILTER (WHERE date_joined >= $1 AND date_joined <= $2) as new_users_period,
                    COUNT(*) FILTER (WHERE last_login >= NOW() - INTERVAL '24 hours') as active_24h,
                    COUNT(*) FILTER (WHERE last_login >= NOW() - INTERVAL '7 days') as active_7d,
                    COUNT(*) FILTER (WHERE last_login >= NOW() - INTERVAL '30 days') as active_30d,
                    COUNT(*) FILTER (WHERE email_verified = true) as verified_users,
                    COUNT(*) FILTER (WHERE is_banned = true) as banned_users,
                    COUNT(*) FILTER (WHERE gender = 'male') as male_users,
                    COUNT(*) FILTER (WHERE gender = 'female') as female_users,
                    COUNT(*) FILTER (WHERE gender = 'other') as other_users
                FROM users
            `, [startDate, endDate]);

            // Activity Statistics (with error handling for missing tables)
            let activityStats;
            try {
                activityStats = await query(`
                    SELECT 
                        (SELECT COUNT(*) FROM user_messages WHERE timestamp >= $1 AND timestamp <= $2) as messages_period,
                        (SELECT COUNT(*) FROM user_messages WHERE timestamp >= NOW() - INTERVAL '24 hours') as messages_24h,
                        (SELECT COUNT(*) FROM user_messages WHERE timestamp >= NOW() - INTERVAL '7 days') as messages_7d,
                        (SELECT COUNT(*) FROM user_messages WHERE timestamp >= NOW() - INTERVAL '30 days') as messages_30d,
                        (SELECT COUNT(*) FROM users_likes WHERE created_at >= $1 AND created_at <= $2) as likes_period,
                        (SELECT COUNT(*) FROM users_likes WHERE created_at >= NOW() - INTERVAL '24 hours') as likes_24h,
                        (SELECT COUNT(*) FROM users_likes WHERE created_at >= NOW() - INTERVAL '7 days') as likes_7d,
                        (SELECT COUNT(*) FROM users_likes WHERE created_at >= NOW() - INTERVAL '30 days') as likes_30d,
                        (SELECT COUNT(*) FROM users_profile_views WHERE viewed_at >= $1 AND viewed_at <= $2) as views_period,
                        (SELECT COUNT(*) FROM users_profile_views WHERE viewed_at >= NOW() - INTERVAL '24 hours') as views_24h,
                        (SELECT COUNT(*) FROM users_profile_views WHERE viewed_at >= NOW() - INTERVAL '7 days') as views_7d,
                        (SELECT COUNT(*) FROM users_profile_views WHERE viewed_at >= NOW() - INTERVAL '30 days') as views_30d,
                        (SELECT COUNT(*) FROM user_images WHERE uploaded_at >= $1 AND uploaded_at <= $2) as images_period,
                        (SELECT COUNT(DISTINCT sender_id) FROM user_messages WHERE timestamp >= NOW() - INTERVAL '7 days') as active_conversations
                `, [startDate, endDate]);
            } catch (error) {
                // If users_profile_views table doesn't exist, use simplified query
                logger.warn('users_profile_views table might not exist, using simplified query');
                activityStats = await query(`
                    SELECT 
                        (SELECT COUNT(*) FROM user_messages WHERE timestamp >= $1 AND timestamp <= $2) as messages_period,
                        (SELECT COUNT(*) FROM user_messages WHERE timestamp >= NOW() - INTERVAL '24 hours') as messages_24h,
                        (SELECT COUNT(*) FROM user_messages WHERE timestamp >= NOW() - INTERVAL '7 days') as messages_7d,
                        (SELECT COUNT(*) FROM user_messages WHERE timestamp >= NOW() - INTERVAL '30 days') as messages_30d,
                        (SELECT COUNT(*) FROM users_likes WHERE created_at >= $1 AND created_at <= $2) as likes_period,
                        (SELECT COUNT(*) FROM users_likes WHERE created_at >= NOW() - INTERVAL '24 hours') as likes_24h,
                        (SELECT COUNT(*) FROM users_likes WHERE created_at >= NOW() - INTERVAL '7 days') as likes_7d,
                        (SELECT COUNT(*) FROM users_likes WHERE created_at >= NOW() - INTERVAL '30 days') as likes_30d,
                        0 as views_period,
                        0 as views_24h,
                        0 as views_7d,
                        0 as views_30d,
                        (SELECT COUNT(*) FROM user_images WHERE uploaded_at >= $1 AND uploaded_at <= $2) as images_period,
                        (SELECT COUNT(DISTINCT sender_id) FROM user_messages WHERE timestamp >= NOW() - INTERVAL '7 days') as active_conversations
                `, [startDate, endDate]);
            }

            // Geographic Distribution (Top 10 countries) - with error handling
            let geoStats;
            try {
                geoStats = await query(`
                    SELECT 
                        c.name as country,
                        COUNT(u.id) as user_count
                    FROM users u
                    LEFT JOIN country c ON u.country_id = c.id
                    WHERE c.name IS NOT NULL
                    GROUP BY c.name
                    ORDER BY user_count DESC
                    LIMIT 10
                `);
            } catch (error) {
                logger.warn('Geographic stats query failed, using simplified version:', error.message);
                // Fallback: try with just country_id
                try {
                    geoStats = await query(`
                        SELECT 
                            COALESCE(c.name, 'Unknown') as country,
                            COUNT(u.id) as user_count
                        FROM users u
                        LEFT JOIN country c ON u.country_id = c.id
                        GROUP BY c.name
                        ORDER BY user_count DESC
                        LIMIT 10
                    `);
                } catch (e2) {
                    logger.warn('Simplified geographic query also failed:', e2.message);
                    geoStats = { rows: [] };
                }
            }

            // Age Distribution - with error handling
            let ageStats;
            try {
                ageStats = await query(`
                    SELECT 
                        CASE 
                            WHEN EXTRACT(YEAR FROM AGE(birthdate)) BETWEEN 18 AND 24 THEN '18-24'
                            WHEN EXTRACT(YEAR FROM AGE(birthdate)) BETWEEN 25 AND 34 THEN '25-34'
                            WHEN EXTRACT(YEAR FROM AGE(birthdate)) BETWEEN 35 AND 44 THEN '35-44'
                            WHEN EXTRACT(YEAR FROM AGE(birthdate)) BETWEEN 45 AND 54 THEN '45-54'
                            WHEN EXTRACT(YEAR FROM AGE(birthdate)) >= 55 THEN '55+'
                            ELSE 'Unknown'
                        END as age_group,
                        COUNT(*) as count
                    FROM users
                    WHERE birthdate IS NOT NULL
                    GROUP BY age_group
                    ORDER BY 
                        CASE age_group
                            WHEN '18-24' THEN 1
                            WHEN '25-34' THEN 2
                            WHEN '35-44' THEN 3
                            WHEN '45-54' THEN 4
                            WHEN '55+' THEN 5
                            ELSE 6
                        END
                `);
            } catch (error) {
                logger.warn('Age distribution query failed:', error.message);
                ageStats = { rows: [] };
            }

            const stats = {
                users: userStats.rows[0] || {},
                activity: activityStats.rows[0] || {},
                geographic: (geoStats && geoStats.rows) ? geoStats.rows : [],
                ageDistribution: (ageStats && ageStats.rows) ? ageStats.rows : []
            };

            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(stats), this.cacheExpiry);
            }

            return stats;
        } catch (error) {
            logger.error('Error fetching dashboard stats:', error);
            throw error;
        }
    }

    /**
     * Get user statistics
     */
    async getUserStats() {
        const cacheKey = 'admin:stats:users';

        try {
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // User growth over time (with error handling)
            let growthStats;
            try {
                growthStats = await query(`
                    SELECT 
                        date_joined::date as date,
                        COUNT(*) as new_users
                    FROM users
                    WHERE date_joined >= NOW() - INTERVAL '90 days'
                    GROUP BY date_joined::date
                    ORDER BY date ASC
                `);
            } catch (error) {
                logger.warn('User growth query failed:', error.message);
                growthStats = { rows: [] };
            }

            // User activity distribution (with error handling)
            let activityDistribution;
            try {
                activityDistribution = await query(`
                    SELECT 
                        CASE 
                            WHEN last_login >= NOW() - INTERVAL '1 day' THEN 'Very Active'
                            WHEN last_login >= NOW() - INTERVAL '7 days' THEN 'Active'
                            WHEN last_login >= NOW() - INTERVAL '30 days' THEN 'Moderate'
                            WHEN last_login >= NOW() - INTERVAL '90 days' THEN 'Inactive'
                            ELSE 'Very Inactive'
                        END as activity_level,
                        COUNT(*) as count
                    FROM users
                    GROUP BY activity_level
                `);
            } catch (error) {
                logger.warn('Activity distribution query failed:', error.message);
                activityDistribution = { rows: [] };
            }

            // Profile completeness (with error handling)
            let completenessStats;
            try {
                completenessStats = await query(`
                    SELECT 
                        CASE 
                            WHEN (
                                (SELECT COUNT(*) FROM user_images WHERE user_id = u.id) >= 3
                                AND ua.about_me IS NOT NULL
                                AND ua.about_me != ''
                            ) THEN 'Complete'
                            WHEN (
                                (SELECT COUNT(*) FROM user_images WHERE user_id = u.id) >= 1
                                OR ua.about_me IS NOT NULL
                            ) THEN 'Partial'
                            ELSE 'Incomplete'
                        END as completeness,
                        COUNT(*) as count
                    FROM users u
                    LEFT JOIN user_attributes ua ON u.id = ua.user_id
                    GROUP BY completeness
                `);
            } catch (error) {
                logger.warn('Profile completeness query failed:', error.message);
                completenessStats = { rows: [] };
            }

            const stats = {
                growth: (growthStats && growthStats.rows) ? growthStats.rows : [],
                activityDistribution: (activityDistribution && activityDistribution.rows) ? activityDistribution.rows : [],
                completeness: (completenessStats && completenessStats.rows) ? completenessStats.rows : []
            };

            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(stats), this.cacheExpiry);
            }

            return stats;
        } catch (error) {
            logger.error('Error fetching user stats:', error);
            throw error;
        }
    }

    /**
     * Get activity statistics
     */
    async getActivityStats(dateRange = '30d') {
        const cacheKey = `admin:stats:activity:${dateRange}`;

        try {
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            const { startDate, endDate } = this.getDateRange(dateRange);

            // Daily activity breakdown (with error handling)
            let dailyActivity;
            try {
                dailyActivity = await query(`
                    SELECT 
                        timestamp::date as date,
                        COUNT(*) as message_count
                    FROM user_messages
                    WHERE timestamp >= $1 AND timestamp <= $2
                    GROUP BY timestamp::date
                    ORDER BY date ASC
                `, [startDate, endDate]);
            } catch (error) {
                logger.warn('Messages table query failed:', error.message);
                dailyActivity = { rows: [] };
            }

            // Daily likes (with error handling)
            let dailyLikes;
            try {
                dailyLikes = await query(`
                    SELECT 
                        created_at::date as date,
                        COUNT(*) as like_count
                    FROM users_likes
                    WHERE created_at >= $1 AND created_at <= $2
                    GROUP BY created_at::date
                    ORDER BY date ASC
                `, [startDate, endDate]);
            } catch (error) {
                logger.warn('Users likes table query failed:', error.message);
                dailyLikes = { rows: [] };
            }

            // Daily profile views (with error handling)
            let dailyViews;
            try {
                dailyViews = await query(`
                    SELECT 
                        viewed_at::date as date,
                        COUNT(*) as view_count
                    FROM users_profile_views
                    WHERE viewed_at >= $1 AND viewed_at <= $2
                    GROUP BY viewed_at::date
                    ORDER BY date ASC
                `, [startDate, endDate]);
            } catch (error) {
                logger.warn('users_profile_views table might not exist');
                dailyViews = { rows: [] };
            }

            // Top active users (with error handling for users_profile_views)
            let topActiveUsers;
            try {
                topActiveUsers = await query(`
                    SELECT 
                        u.id,
                        u.real_name,
                        u.email,
                        COUNT(DISTINCT m.id) as message_count,
                        COUNT(DISTINCT l.id) as like_count,
                        (SELECT COUNT(*) FROM users_profile_views WHERE viewer_id = u.id AND viewed_at >= $1 AND viewed_at <= $2) as view_count
                    FROM users u
                    LEFT JOIN user_messages m ON u.id = m.sender_id AND m.timestamp >= $1 AND m.timestamp <= $2
                    LEFT JOIN users_likes l ON u.id = l.liked_by AND l.created_at >= $1 AND l.created_at <= $2
                    GROUP BY u.id, u.real_name, u.email
                    ORDER BY (COUNT(DISTINCT m.id) + COUNT(DISTINCT l.id) + (SELECT COUNT(*) FROM users_profile_views WHERE viewer_id = u.id AND viewed_at >= $1 AND viewed_at <= $2)) DESC
                    LIMIT 20
                `, [startDate, endDate]);
            } catch (error) {
                logger.warn('Top active users query failed, using simplified query:', error.message);
                try {
                    topActiveUsers = await query(`
                        SELECT 
                            u.id,
                            u.real_name,
                            u.email,
                            COUNT(DISTINCT m.id) as message_count,
                            COUNT(DISTINCT l.id) as like_count,
                            0 as view_count
                        FROM users u
                        LEFT JOIN user_messages m ON u.id = m.sender_id AND m.timestamp >= $1 AND m.timestamp <= $2
                        LEFT JOIN users_likes l ON u.id = l.liked_by AND l.created_at >= $1 AND l.created_at <= $2
                        GROUP BY u.id, u.real_name, u.email
                        ORDER BY (COUNT(DISTINCT m.id) + COUNT(DISTINCT l.id)) DESC
                        LIMIT 20
                    `, [startDate, endDate]);
                } catch (e2) {
                    logger.warn('Simplified top active users query also failed:', e2.message);
                    // Last resort: return basic user list
                    topActiveUsers = await query(`
                        SELECT 
                            u.id,
                            u.real_name,
                            u.email,
                            0 as message_count,
                            0 as like_count,
                            0 as view_count
                        FROM users u
                        ORDER BY u.id DESC
                        LIMIT 20
                    `);
                }
            }

            const stats = {
                dailyMessages: (dailyActivity && dailyActivity.rows) ? dailyActivity.rows : [],
                dailyLikes: (dailyLikes && dailyLikes.rows) ? dailyLikes.rows : [],
                dailyViews: (dailyViews && dailyViews.rows) ? dailyViews.rows : [],
                topActiveUsers: (topActiveUsers && topActiveUsers.rows) ? topActiveUsers.rows : []
            };

            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(stats), this.cacheExpiry);
            }

            return stats;
        } catch (error) {
            logger.error('Error fetching activity stats:', error);
            throw error;
        }
    }

    /**
     * Get growth metrics
     */
    async getGrowthMetrics() {
        const cacheKey = 'admin:stats:growth';

        try {
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // User growth by period (with error handling)
            let userGrowth;
            try {
                userGrowth = await query(`
                    SELECT 
                        DATE_TRUNC('day', date_joined) as period,
                        COUNT(*) as new_users
                    FROM users
                    WHERE date_joined >= NOW() - INTERVAL '90 days'
                    GROUP BY DATE_TRUNC('day', date_joined)
                    ORDER BY period ASC
                `);
            } catch (error) {
                logger.warn('Daily growth query failed:', error.message);
                userGrowth = { rows: [] };
            }

            // Weekly growth (with error handling)
            let weeklyGrowth;
            try {
                weeklyGrowth = await query(`
                    SELECT 
                        DATE_TRUNC('week', date_joined) as period,
                        COUNT(*) as new_users
                    FROM users
                    WHERE date_joined >= NOW() - INTERVAL '12 weeks'
                    GROUP BY DATE_TRUNC('week', date_joined)
                    ORDER BY period ASC
                `);
            } catch (error) {
                logger.warn('Weekly growth query failed:', error.message);
                weeklyGrowth = { rows: [] };
            }

            // Monthly growth (with error handling)
            let monthlyGrowth;
            try {
                monthlyGrowth = await query(`
                    SELECT 
                        DATE_TRUNC('month', date_joined) as period,
                        COUNT(*) as new_users
                    FROM users
                    WHERE date_joined >= NOW() - INTERVAL '12 months'
                    GROUP BY DATE_TRUNC('month', date_joined)
                    ORDER BY period ASC
                `);
            } catch (error) {
                logger.warn('Monthly growth query failed:', error.message);
                monthlyGrowth = { rows: [] };
            }

            // Retention (users who logged in within 7 days of joining) - with error handling
            let retention;
            try {
                retention = await query(`
                    SELECT 
                        COUNT(*) FILTER (
                            WHERE EXISTS (
                                SELECT 1 FROM user_sessions 
                                WHERE user_id = u.id 
                                AND created_at >= u.date_joined 
                                AND created_at <= u.date_joined + INTERVAL '7 days'
                            )
                        ) as retained_7d,
                        COUNT(*) as total_new_users
                    FROM users u
                    WHERE u.date_joined >= NOW() - INTERVAL '30 days'
                `);
            } catch (error) {
                logger.warn('Retention query failed, using simplified version:', error.message);
                // Fallback: use last_login instead of sessions
                retention = await query(`
                    SELECT 
                        COUNT(*) FILTER (
                            WHERE last_login IS NOT NULL 
                            AND last_login >= date_joined 
                            AND last_login <= date_joined + INTERVAL '7 days'
                        ) as retained_7d,
                        COUNT(*) as total_new_users
                    FROM users u
                    WHERE u.date_joined >= NOW() - INTERVAL '30 days'
                `);
            }

            const stats = {
                daily: (userGrowth && userGrowth.rows) ? userGrowth.rows : [],
                weekly: (weeklyGrowth && weeklyGrowth.rows) ? weeklyGrowth.rows : [],
                monthly: (monthlyGrowth && monthlyGrowth.rows) ? monthlyGrowth.rows : [],
                retention: (retention && retention.rows && retention.rows[0]) ? retention.rows[0] : {}
            };

            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(stats), this.cacheExpiry);
            }

            return stats;
        } catch (error) {
            logger.error('Error fetching growth metrics:', error);
            throw error;
        }
    }

    /**
     * Get quality metrics
     */
    async getQualityMetrics() {
        const cacheKey = 'admin:stats:quality';

        try {
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // Profile completeness (with error handling)
            // Calculates average of 4 fields (about_me, images, height, body_type)
            // Each field is worth 1 point, so max is 4. Divide by 4 to get 0-1, then * 100 for percentage
            let completeness;
            try {
                completeness = await query(`
                    SELECT 
                        AVG(
                            CASE 
                                WHEN ua.about_me IS NOT NULL AND ua.about_me != '' THEN 1 ELSE 0 END +
                            CASE 
                                WHEN (SELECT COUNT(*) FROM user_images WHERE user_id = u.id) > 0 THEN 1 ELSE 0 END +
                            CASE 
                                WHEN ua.height_cm IS NOT NULL THEN 1 ELSE 0 END +
                            CASE 
                                WHEN ua.body_type_id IS NOT NULL THEN 1 ELSE 0 END
                        ) / 4.0 * 100 as avg_completeness
                    FROM users u
                    LEFT JOIN user_attributes ua ON u.id = ua.user_id
                `);
            } catch (error) {
                logger.warn('Profile completeness query failed:', error.message);
                completeness = { rows: [{ avg_completeness: 0 }] };
            }

            // Users with photos (with error handling)
            let photoStats;
            try {
                photoStats = await query(`
                    SELECT 
                        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_images WHERE user_id = u.id)) as with_photos,
                        COUNT(*) as total_users
                    FROM users u
                `);
            } catch (error) {
                logger.warn('Photo stats query failed:', error.message);
                photoStats = { rows: [{ with_photos: 0, total_users: 0 }] };
            }

            // Verified users percentage (with error handling)
            let verifiedStats;
            try {
                verifiedStats = await query(`
                    SELECT 
                        COUNT(*) FILTER (WHERE email_verified = true) as verified,
                        COUNT(*) as total_users
                    FROM users
                `);
            } catch (error) {
                logger.warn('Verified stats query failed:', error.message);
                verifiedStats = { rows: [{ verified: 0, total_users: 0 }] };
            }

            // Active vs inactive (with error handling)
            let activeStats;
            try {
                activeStats = await query(`
                    SELECT 
                        COUNT(*) FILTER (WHERE last_login >= NOW() - INTERVAL '30 days') as active_30d,
                        COUNT(*) FILTER (WHERE last_login < NOW() - INTERVAL '30 days' OR last_login IS NULL) as inactive_30d,
                        COUNT(*) as total_users
                    FROM users
                `);
            } catch (error) {
                logger.warn('Active stats query failed:', error.message);
                activeStats = { rows: [{ active_30d: 0, inactive_30d: 0, total_users: 0 }] };
            }

            const stats = {
                // Ensure completeness is capped at 100%
                avgCompleteness: Math.min(100, Math.max(0, parseFloat((completeness && completeness.rows && completeness.rows[0]) ? completeness.rows[0].avg_completeness : 0))),
                photoPercentage: (photoStats && photoStats.rows && photoStats.rows[0] && photoStats.rows[0].total_users > 0) ? 
                    (parseFloat(photoStats.rows[0].with_photos) / parseFloat(photoStats.rows[0].total_users) * 100) : 0,
                verifiedPercentage: (verifiedStats && verifiedStats.rows && verifiedStats.rows[0] && verifiedStats.rows[0].total_users > 0) ? 
                    (parseFloat(verifiedStats.rows[0].verified) / parseFloat(verifiedStats.rows[0].total_users) * 100) : 0,
                activeRatio: (activeStats && activeStats.rows && activeStats.rows[0] && activeStats.rows[0].total_users > 0) ? 
                    (parseFloat(activeStats.rows[0].active_30d) / parseFloat(activeStats.rows[0].total_users) * 100) : 0,
                ...((activeStats && activeStats.rows && activeStats.rows[0]) ? activeStats.rows[0] : {})
            };

            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(stats), this.cacheExpiry);
            }

            return stats;
        } catch (error) {
            logger.error('Error fetching quality metrics:', error);
            throw error;
        }
    }

    /**
     * Helper to get date range
     */
    getDateRange(range) {
        const now = new Date();
        let startDate;

        switch (range) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            case '1y':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        return {
            startDate: startDate.toISOString(),
            endDate: now.toISOString()
        };
    }
}

module.exports = new StatisticsService();










