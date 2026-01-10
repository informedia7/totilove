/**
 * Services Configuration Module
 * Initializes all application services
 */

const MessageService = require('../../services/messageService');
const sessionService = require('../../services/sessionService');
const ActivityTracker = require('../../middleware/activityTracker');
const BlockRateLimiter = require('../../utils/blockRateLimiter');

/**
 * Setup all application services
 * @param {Object} db - Database pool instance
 * @param {Object} redis - Redis client instance (can be null)
 * @returns {Object} Services object with all initialized services
 */
function setupServices(db, redis) {
    const messageService = new MessageService(db, redis);
    
    // Initialize activity tracker
    const activityTracker = new ActivityTracker(db);
    
    // Replace mocked session tracker with real activity tracker
    const sessionTracker = {
        updateUserActivity: (userId) => activityTracker.updateUserActivity(userId),
        cleanupExpiredSessions: () => activityTracker.cleanupSessions(),
        startPeriodicCleanup: () => {}, // Cleanup interval removed
        isUserOnline: async (userId) => {
            const result = await db.query(`
                SELECT is_active, last_activity 
                FROM user_sessions 
                WHERE user_id = $1 
                AND is_active = true 
                AND last_activity > NOW() - INTERVAL '1 minute'
                ORDER BY last_activity DESC 
                LIMIT 1
            `, [userId]);
            
            if (result.rows.length > 0) {
                const lastActivity = result.rows[0].last_activity;
                const timeDiff = Date.now() - new Date(lastActivity).getTime();
                const minutesDiff = Math.floor(timeDiff / (1000 * 60));
                
                // User is only considered online if they had activity in the last minute
                return minutesDiff < 1;
            }
            return false;
        }
    };
    
    // Start automatic session cleanup
    sessionTracker.startPeriodicCleanup();
    
    // Initialize block rate limiter
    const blockRateLimiter = new BlockRateLimiter(db, redis);
    
    return {
        messageService,
        sessionService,
        activityTracker,
        sessionTracker,
        blockRateLimiter
    };
}

module.exports = { setupServices };

