/**
 * Block Check Utility
 * Centralized functions for checking block relationships between users
 */

class BlockCheck {
    constructor(db) {
        this.db = db;
    }

    /**
     * Check if two users have a block relationship (bidirectional)
     * @param {number} userId1 - First user ID
     * @param {number} userId2 - Second user ID
     * @returns {Promise<boolean>} - True if either user has blocked the other
     */
    async isBlocked(userId1, userId2) {
        try {
            const result = await this.db.query(
                'SELECT id FROM users_blocked_by_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
                [userId1, userId2]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('Error checking block status:', error);
            // Fail open - if check fails, assume not blocked to prevent false positives
            return false;
        }
    }

    /**
     * Get block relationship details
     * @param {number} userId1 - First user ID
     * @param {number} userId2 - Second user ID
     * @returns {Promise<Object|null>} - Block record or null if not blocked
     */
    async getBlockDetails(userId1, userId2) {
        try {
            const result = await this.db.query(
                'SELECT id, blocker_id, blocked_id, reason, created_at FROM users_blocked_by_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
                [userId1, userId2]
            );
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('Error getting block details:', error);
            return null;
        }
    }

    /**
     * Check if userId1 has blocked userId2 (one-way check)
     * @param {number} userId1 - Blocker ID
     * @param {number} userId2 - Blocked ID
     * @returns {Promise<boolean>} - True if userId1 has blocked userId2
     */
    async hasBlocked(userId1, userId2) {
        try {
            const result = await this.db.query(
                'SELECT id FROM users_blocked_by_users WHERE blocker_id = $1 AND blocked_id = $2',
                [userId1, userId2]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('Error checking one-way block:', error);
            return false;
        }
    }

    /**
     * Get all users blocked by a specific user
     * @param {number} userId - User ID
     * @returns {Promise<Array>} - Array of blocked user IDs
     */
    async getBlockedUsers(userId) {
        try {
            const result = await this.db.query(
                'SELECT blocked_id FROM users_blocked_by_users WHERE blocker_id = $1',
                [userId]
            );
            return result.rows.map(row => row.blocked_id);
        } catch (error) {
            console.error('Error getting blocked users:', error);
            return [];
        }
    }

    /**
     * Get all users who have blocked a specific user
     * @param {number} userId - User ID
     * @returns {Promise<Array>} - Array of blocker user IDs
     */
    async getBlockedByUsers(userId) {
        try {
            const result = await this.db.query(
                'SELECT blocker_id FROM users_blocked_by_users WHERE blocked_id = $1',
                [userId]
            );
            return result.rows.map(row => row.blocker_id);
        } catch (error) {
            console.error('Error getting blocked by users:', error);
            return [];
        }
    }
}

module.exports = BlockCheck;






































