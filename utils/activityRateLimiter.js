/**
 * Rate limiter for user_activity logging
 * Prevents rapid-fire duplicate activity entries
 */
class ActivityRateLimiter {
    constructor(db) {
        this.db = db;
        // Cache for in-memory rate limiting (optional, for faster checks)
        this.memoryCache = new Map();
        this.cacheTimeout = 5000; // 5 seconds
    }

    /**
     * Check if activity should be logged (rate limiting)
     * @param {number} userId - User performing the activity
     * @param {string} activityType - Type of activity (e.g., 'profile_view', 'like', 'favorite')
     * @param {number|null} targetUserId - Target user ID (if applicable)
     * @param {number} timeWindowSeconds - Time window in seconds (default: 5)
     * @returns {Promise<boolean>} - true if activity should be logged, false if rate limited
     */
    async shouldLogActivity(userId, activityType, targetUserId = null, timeWindowSeconds = 5) {
        try {
            // Check database for recent activity
            const recentActivityQuery = `
                SELECT id, created_at
                FROM user_activity
                WHERE user_id = $1
                    AND activity_type = $2
                    AND COALESCE(target_user_id, 0) = COALESCE($3, 0)
                    AND created_at > NOW() - INTERVAL '${timeWindowSeconds} seconds'
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await this.db.query(recentActivityQuery, [userId, activityType, targetUserId]);

            if (result.rows.length > 0) {
                const lastActivity = result.rows[0];
                const timeDiff = (Date.now() - new Date(lastActivity.created_at).getTime()) / 1000;
                
                if (timeDiff < timeWindowSeconds) {
                    console.log(`⏱️  Rate limited: User ${userId} ${activityType} activity (last ${timeDiff.toFixed(2)}s ago)`);
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('❌ Error checking activity rate limit:', error);
            // On error, allow logging (fail open)
            return true;
        }
    }

    /**
     * Log activity with rate limiting
     * @param {number} userId - User performing the activity
     * @param {string} activityType - Type of activity
     * @param {number|null} targetUserId - Target user ID
     * @param {string} description - Activity description
     * @param {number} timeWindowSeconds - Rate limit window in seconds
     * @returns {Promise<boolean>} - true if logged, false if rate limited
     */
    async logActivity(userId, activityType, targetUserId = null, description = null, timeWindowSeconds = 5) {
        try {
            // Check rate limit
            const shouldLog = await this.shouldLogActivity(userId, activityType, targetUserId, timeWindowSeconds);
            
            if (!shouldLog) {
                return false;
            }

            // Log the activity
            await this.db.query(`
                INSERT INTO user_activity (user_id, activity_type, target_user_id, description, created_at)
                VALUES ($1, $2, $3, $4, NOW())
            `, [userId, activityType, targetUserId, description]);

            return true;
        } catch (error) {
            console.error(`❌ Error logging activity:`, error);
            return false;
        }
    }

    /**
     * Clear memory cache (useful for testing or cleanup)
     */
    clearCache() {
        this.memoryCache.clear();
    }
}

module.exports = ActivityRateLimiter;


























