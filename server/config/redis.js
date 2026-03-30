/**
 * Redis Configuration Module
 * Handles Redis connection setup and CSRF middleware initialization
 */

const redis = require('redis');
const CSRFMiddleware = require('../../middleware/csrf');

/**
 * Setup Redis connection with clustering support
 * @returns {Promise<{redis: Object|null, csrfMiddleware: Object}>} Redis client and CSRF middleware
 */
async function setupRedis() {
    const redisClient = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryDelayOnFailover: 50,
        enableReadyCheck: false,
        maxLoadingTimeout: 2000,
        connectTimeout: 2000,
        commandTimeout: 1000,
        family: 4,
        keepAlive: true,
        noDelay: true
    });

    redisClient.on('error', (err) => {
        // Redis warning - non-critical
    });

    let connectedRedis = null;
    try {
        await redisClient.connect();
        
        // Configure Redis for high-load operations
        await redisClient.configSet('maxmemory-policy', 'allkeys-lru');
        await redisClient.configSet('tcp-keepalive', '60');
        connectedRedis = redisClient;
    } catch (error) {
        // Redis not available, using memory cache
        connectedRedis = null;
    }
    
    // Initialize CSRF middleware with Redis (if available)
    const csrfMiddleware = new CSRFMiddleware(connectedRedis);
    
    return { redis: connectedRedis, csrfMiddleware };
}

module.exports = { setupRedis };







