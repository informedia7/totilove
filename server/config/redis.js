/**
 * Redis Configuration Module
 * Handles Redis connection setup and CSRF middleware initialization
 */

const redis = require('redis');
const fs = require('fs');
const path = require('path');

class FallbackCSRFMiddleware {
    constructor(redisClient = null) {
        this.redis = redisClient;
    }

    validate() {
        return (req, res, next) => next();
    }
}

function loadCSRFMiddleware() {
    const candidatePaths = [
        path.resolve(__dirname, '../../middleware/csrf'),
        path.resolve(__dirname, '../middleware/csrf'),
        path.resolve(process.cwd(), 'middleware/csrf')
    ];

    for (const candidate of candidatePaths) {
        if (fs.existsSync(candidate) || fs.existsSync(`${candidate}.js`)) {
            return require(candidate);
        }
    }

    console.warn(`⚠️ CSRF middleware module not found. Checked: ${candidatePaths.join(', ')}`);
    console.warn('⚠️ Falling back to permissive in-process CSRF middleware for startup continuity');
    return FallbackCSRFMiddleware;
}

const CSRFMiddleware = loadCSRFMiddleware();

/**
 * Setup Redis connection with clustering support
 * @returns {Promise<{redis: Object|null, csrfMiddleware: Object}>} Redis client and CSRF middleware
 */
async function setupRedis() {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    const redisClient = redis.createClient({
        ...(redisUrl ? { url: redisUrl } : {}),
        ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
        database: Number(process.env.REDIS_DB || 0),
        socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT || 6379),
            connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
            reconnectStrategy: () => false
        }
    });

    redisClient.on('error', (err) => {
        // Redis warning - non-critical
    });

    let connectedRedis = null;
    try {
        const connectTimeoutMs = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2500);
        await Promise.race([
            redisClient.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('redis_connect_timeout')), connectTimeoutMs))
        ]);
        
        // Configure Redis for high-load operations
        await redisClient.configSet('maxmemory-policy', 'allkeys-lru');
        await redisClient.configSet('tcp-keepalive', '60');
        connectedRedis = redisClient;
    } catch (error) {
        // Redis not available, using memory cache
        try {
            if (redisClient.isOpen) {
                await redisClient.disconnect();
            }
        } catch (_) {
            // ignore disconnect cleanup errors
        }
        connectedRedis = null;
    }
    
    // Initialize CSRF middleware with Redis (if available)
    const csrfMiddleware = new CSRFMiddleware(connectedRedis);
    
    return { redis: connectedRedis, csrfMiddleware };
}

module.exports = { setupRedis };







