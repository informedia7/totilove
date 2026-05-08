const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;
const redisEnabled = process.env.REDIS_ENABLED === 'true' || process.env.REDIS_ENABLED === true;

if (redisEnabled) {
    try {
        redisClient = redis.createClient({
            url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
        });

        redisClient.on('connect', () => {
            logger.info('Redis client connecting...');
        });

        redisClient.on('error', (err) => {
            logger.error('Redis client error:', err);
        });

        redisClient.on('ready', () => {
            logger.info('Redis client ready');
        });

        redisClient.connect().catch((err) => {
            logger.error('Redis connect failed:', err);
            redisClient = null;
        });
    } catch (err) {
        logger.error('Redis initialization failed:', err);
        redisClient = null;
    }
}

async function get(key) {
    if (!redisClient) return null;
    try {
        return await redisClient.get(key);
    } catch (e) {
        logger.warn('Redis get error:', e.message);
        return null;
    }
}

async function set(key, value, expirySeconds) {
    if (!redisClient) return false;
    try {
        if (expirySeconds) {
            await redisClient.setEx(key, expirySeconds, value);
        } else {
            await redisClient.set(key, value);
        }
        return true;
    } catch (e) {
        logger.warn('Redis set error:', e.message);
        return false;
    }
}

async function del(key) {
    if (!redisClient) return false;
    try {
        await redisClient.del(key);
        return true;
    } catch (e) {
        logger.warn('Redis del error:', e.message);
        return false;
    }
}

/** Delete all keys matching prefix* (uses SCAN; safe for production). */
async function delPrefix(prefix) {
    if (!redisClient || !prefix) return false;
    try {
        const pattern = prefix.endsWith('*') ? prefix : `${prefix}*`;
        for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 200 })) {
            await redisClient.del(key);
        }
        return true;
    } catch (e) {
        logger.warn('Redis delPrefix error:', e.message);
        return false;
    }
}

async function exists(key) {
    if (!redisClient) return false;
    try {
        const result = await redisClient.exists(key);
        return result === 1;
    } catch (e) {
        return false;
    }
}

module.exports = {
    get,
    set,
    del,
    delPrefix,
    exists,
    get client() {
        return redisClient;
    },
    enabled: redisEnabled
};
