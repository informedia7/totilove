/**
 * Rate Limiter for Block/Unblock Actions
 * Prevents abuse by limiting block/unblock actions per user
 */
class BlockRateLimiter {
    constructor(db, redis = null) {
        this.db = db;
        this.redis = redis;
        // In-memory fallback if Redis unavailable
        this.memoryCache = new Map();
        this.cacheTimeout = 3600000; // 1 hour
    }

    /**
     * Check if user can perform block/unblock action
     * @param {number} userId - User ID
     * @param {string} action - 'block' or 'unblock'
     * @param {number} maxActions - Maximum actions per hour (default: 10)
     * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
     */
    async checkRateLimit(userId, action = 'block', maxActions = 10) {
        try {
            const key = `block_rate_limit:${userId}:${action}`;
            const now = Date.now();
            const windowMs = 3600000; // 1 hour window

            // Try Redis first
            if (this.redis) {
                try {
                    const count = await this.redis.incr(key);
                    if (count === 1) {
                        // First request in window, set expiration
                        await this.redis.expire(key, 3600); // 1 hour
                    }

                    const ttl = await this.redis.ttl(key);
                    const resetAt = now + (ttl * 1000);

                    if (count > maxActions) {
                        return {
                            allowed: false,
                            remaining: 0,
                            resetAt: resetAt,
                            error: `Rate limit exceeded. Maximum ${maxActions} ${action} actions per hour.`
                        };
                    }

                    return {
                        allowed: true,
                        remaining: maxActions - count,
                        resetAt: resetAt
                    };
                } catch (redisError) {
                    console.warn('Redis rate limit check failed, using memory cache:', redisError.message);
                    // Fall through to memory cache
                }
            }

            // Fallback to memory cache
            if (!this.memoryCache.has(key)) {
                this.memoryCache.set(key, { count: 0, resetAt: now + windowMs });
            }

            const cacheEntry = this.memoryCache.get(key);
            
            // Reset if window expired
            if (now > cacheEntry.resetAt) {
                cacheEntry.count = 0;
                cacheEntry.resetAt = now + windowMs;
            }

            cacheEntry.count++;

            if (cacheEntry.count > maxActions) {
                return {
                    allowed: false,
                    remaining: 0,
                    resetAt: cacheEntry.resetAt,
                    error: `Rate limit exceeded. Maximum ${maxActions} ${action} actions per hour.`
                };
            }

            return {
                allowed: true,
                remaining: maxActions - cacheEntry.count,
                resetAt: cacheEntry.resetAt
            };

        } catch (error) {
            console.error('Error checking block rate limit:', error);
            // Fail open - allow action if rate limit check fails
            return {
                allowed: true,
                remaining: maxActions,
                resetAt: Date.now() + 3600000
            };
        }
    }

    /**
     * Reset rate limit for a user (admin function)
     * @param {number} userId - User ID
     * @param {string} action - 'block' or 'unblock'
     */
    async resetRateLimit(userId, action = 'block') {
        const key = `block_rate_limit:${userId}:${action}`;
        
        if (this.redis) {
            try {
                await this.redis.del(key);
            } catch (error) {
                console.error('Error resetting Redis rate limit:', error);
            }
        }
        
        this.memoryCache.delete(key);
    }
}

module.exports = BlockRateLimiter;






































