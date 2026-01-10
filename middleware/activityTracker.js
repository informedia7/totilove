// Activity tracking middleware to update user session activity
class ActivityTracker {
    constructor(db) {
        this.db = db;
    }

    // Middleware to track user activity
    trackActivity() {
        return async (req, res, next) => {
            try {
                // Extract user ID from various sources
                const userId = req.user?.id || 
                              req.headers['x-user-id'] || 
                              req.query.userId ||
                              req.body?.userId;

                if (userId && !isNaN(parseInt(userId))) {
                    // Update user session activity in background - don't block request
                    this.updateUserActivity(parseInt(userId)).catch(err => {
                        console.warn(`⚠️ Failed to update activity for user ${userId}:`, err.message);
                    });
                }
                
                next();
            } catch (error) {
                console.warn('⚠️ Activity tracking middleware error:', error.message);
                next(); // Don't block the request even if tracking fails
            }
        };
    }

    // Update user activity timestamp and ensure active session
    async updateUserActivity(userId) {
        try {
            // First, try to update existing session
            const updateResult = await this.db.query(`
                UPDATE user_sessions 
                SET last_activity = NOW(), is_active = true
                WHERE user_id = $1
                RETURNING id
            `, [userId]);

            // If no session exists, create one
            if (updateResult.rows.length === 0) {
                const sessionToken = `activity_${userId}_${Date.now()}`;
                const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24 hours from now
                
                await this.db.query(`
                    INSERT INTO user_sessions (user_id, session_token, is_active, last_activity, created_at, expires_at)
                    VALUES ($1, $2, true, NOW(), NOW(), $3)
                `, [userId, sessionToken, expiresAt]);
                
                console.log(`📱 Created new session for user ${userId}`);
            } else {
                console.log(`⏰ Updated activity for user ${userId}`);
            }

        } catch (error) {
            console.error(`❌ Failed to update activity for user ${userId}:`, error);
            throw error;
        }
    }

    // Heartbeat endpoint for real-time activity tracking
    async heartbeat(req, res) {
        try {
            const userId = req.user?.id || req.headers['x-user-id'] || req.body?.userId;
            
            if (!userId || isNaN(parseInt(userId))) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid user ID required'
                });
            }

            await this.updateUserActivity(parseInt(userId));
            
            res.json({
                success: true,
                message: 'Activity updated',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Heartbeat error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update activity',
                details: error.message
            });
        }
    }

    // Cleanup inactive sessions
    async cleanupSessions() {
        try {
            const result = await this.db.query(`
                UPDATE user_sessions 
                SET is_active = false 
                WHERE is_active = true 
                AND last_activity < NOW() - INTERVAL '2 minutes'
                RETURNING user_id
            `);

            if (result.rows.length > 0) {
                console.log(`🧹 Cleaned up ${result.rows.length} inactive sessions`);
            }

            return result.rows.length;
        } catch (error) {
            console.error('❌ Session cleanup error:', error);
            throw error;
        }
    }

    // Start automatic cleanup (disabled)
    startCleanupInterval(intervalMs = 60000) { // Default: 1 minute
        // Cleanup interval removed - no longer running automatically
        // setInterval(() => {
        //     this.cleanupSessions().catch(err => {
        //         console.warn('⚠️ Scheduled cleanup failed:', err.message);
        //     });
        // }, intervalMs);
        
        // console.log(`🕐 Started session cleanup interval (${intervalMs}ms)`);
    }
}

module.exports = ActivityTracker;
