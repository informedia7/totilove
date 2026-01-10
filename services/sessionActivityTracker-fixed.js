// Session Activity Tracker
// This module provides functions to track user activity and update session status

class SessionActivityTracker {
    constructor(db) {
        this.db = db;
        this.updateInterval = 30000; // Update every 30 seconds
        this.activityTimeout = 2 * 60 * 1000; // 2 minutes timeout
    }

    // Update user's last activity in the session
    async updateUserActivity(userId, req = null) {
        try {
            const ipAddress = req ? (req.ip || req.connection.remoteAddress) : null;
            const userAgent = req ? req.get('User-Agent') : null;

            // Check if user has an active session
            const existingSession = await this.db.query(`
                SELECT id FROM user_sessions 
                WHERE user_id = $1 AND is_active = true
                ORDER BY last_activity DESC LIMIT 1
            `, [userId]);

            if (existingSession.rows.length > 0) {
                // Update existing session
                await this.db.query(`
                    UPDATE user_sessions 
                    SET last_activity = NOW(),
                        ip_address = COALESCE($2, ip_address),
                        user_agent = COALESCE($3, user_agent)
                    WHERE id = $1
                `, [existingSession.rows[0].id, ipAddress, userAgent]);
            } else {
                // Create new session
                await this.createUserSession(userId, ipAddress, userAgent);
            }

            // Also update user's last_login for compatibility
            await this.db.query(`
                UPDATE users SET last_login = NOW() WHERE id = $1
            `, [userId]);

            return true;
        } catch (error) {
            console.error('❌ Error updating user activity:', error);
            return false;
        }
    }

    // Create a new user session
    async createUserSession(userId, ipAddress = null, userAgent = null) {
        try {
            // Deactivate any existing sessions for this user
            await this.db.query(`
                UPDATE user_sessions 
                SET is_active = false 
                WHERE user_id = $1
            `, [userId]);

            // Create new active session
            const result = await this.db.query(`
                INSERT INTO user_sessions (user_id, session_start, last_activity, is_active, ip_address, user_agent)
                VALUES ($1, NOW(), NOW(), true, $2, $3)
                RETURNING id
            `, [userId, ipAddress, userAgent]);

            console.log(`🟢 Created new session for user ${userId}`);
            return result.rows[0].id;
        } catch (error) {
            console.error('❌ Error creating user session:', error);
            return null;
        }
    }

    // Set user as offline
    async setUserOffline(userId) {
        try {
            // Deactivate all sessions for the user
            await this.db.query(`
                UPDATE user_sessions 
                SET is_active = false, 
                    session_end = NOW()
                WHERE user_id = $1 AND is_active = true
            `, [userId]);

            // Set last_login to a past time to ensure offline status
            const offlineTime = new Date(Date.now() - (10 * 60 * 1000)); // 10 minutes ago
            await this.db.query(`
                UPDATE users SET last_login = $1 WHERE id = $2
            `, [offlineTime, userId]);

            console.log(`🔴 Set user ${userId} offline`);
            return true;
        } catch (error) {
            console.error('❌ Error setting user offline:', error);
            return false;
        }
    }

    // Clean up expired sessions
    async cleanupExpiredSessions() {
        try {
            const result = await this.db.query(`
                UPDATE user_sessions 
                SET is_active = false, 
                    session_end = NOW()
                WHERE is_active = true 
                AND last_activity < NOW() - INTERVAL '2 minutes'
                RETURNING user_id
            `);

            if (result.rows.length > 0) {
                console.log(`🧹 Cleaned up ${result.rows.length} expired sessions`);
                
                // Also update last_login for these users to reflect offline status
                const userIds = result.rows.map(row => row.user_id);
                const offlineTime = new Date(Date.now() - (10 * 60 * 1000)); // 10 minutes ago
                
                for (const userId of userIds) {
                    await this.db.query(`
                        UPDATE users SET last_login = $1 WHERE id = $2
                    `, [offlineTime, userId]);
                }
            }

            return result.rows.length;
        } catch (error) {
            console.error('❌ Error cleaning up expired sessions:', error);
            return 0;
        }
    }

    // Start periodic cleanup of expired sessions
    startPeriodicCleanup() {
        console.log('🔄 Starting periodic session cleanup...');
        
        // Clean up immediately
        this.cleanupExpiredSessions();
        
        // Then clean up every 30 seconds
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, this.updateInterval);
    }

    // Get online users count
    async getOnlineUsersCount() {
        try {
            const result = await this.db.query(`
                SELECT COUNT(DISTINCT user_id) as count
                FROM user_sessions 
                WHERE is_active = true 
                AND last_activity > NOW() - INTERVAL '2 minutes'
            `);
            return parseInt(result.rows[0].count) || 0;
        } catch (error) {
            console.error('❌ Error getting online users count:', error);
            return 0;
        }
    }

    // Check if a specific user is online
    async isUserOnline(userId) {
        try {
            const result = await this.db.query(`
                SELECT EXISTS(
                    SELECT 1 FROM user_sessions 
                    WHERE user_id = $1 
                    AND is_active = true 
                    AND last_activity > NOW() - INTERVAL '2 minutes'
                ) as is_online
            `, [userId]);
            return result.rows[0].is_online;
        } catch (error) {
            console.error('❌ Error checking if user is online:', error);
            return false;
        }
    }
}

module.exports = SessionActivityTracker;
