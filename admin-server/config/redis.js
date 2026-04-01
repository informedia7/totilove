const redis = require('redis');
require('dotenv').config();

let redisClient = null;
const redisEnabled = process.env.REDIS_ENABLED === 'true' || process.env.REDIS_ENABLED === true;

if (redisEnabled) {
    try {
        redisClient = redis.createClient({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || null,
            db: process.env.REDIS_DB || 0,
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxRetriesPerRequest: null
        });

        redisClient.on('connect', () => {
            console.log('Admin Server: Redis connection established');
        });

        redisClient.on('error', (err) => {
            console.error('Admin Server: Redis connection error:', err);
        });

        redisClient.on('ready', () => {
            console.log('Admin Server: Redis client ready');
        });

        // Connect to Redis
        redisClient.connect().catch(err => {
            console.error('Admin Server: Failed to connect to Redis:', err);
            redisClient = null;
        });
    } catch (error) {
        console.error('Admin Server: Redis initialization error:', error);
        redisClient = null;
    }
} else {
    console.log('Admin Server: Redis disabled');
}

// Helper functions
const get = async (key) => {
    if (!redisClient) return null;
    try {
        return await redisClient.get(key);
    } catch (error) {
        console.error('Admin Server: Redis GET error:', error);
        return null;
    }
};

const set = async (key, value, expirySeconds = null) => {
    if (!redisClient) return false;
    try {
        if (expirySeconds) {
            await redisClient.setEx(key, expirySeconds, value);
        } else {
            await redisClient.set(key, value);
        }
        return true;
    } catch (error) {
        console.error('Admin Server: Redis SET error:', error);
        return false;
    }
};

const del = async (key) => {
    if (!redisClient) return false;
    try {
        await redisClient.del(key);
        return true;
    } catch (error) {
        console.error('Admin Server: Redis DEL error:', error);
        return false;
    }
};

const exists = async (key) => {
    if (!redisClient) return false;
    try {
        const result = await redisClient.exists(key);
        return result === 1;
    } catch (error) {
        console.error('Admin Server: Redis EXISTS error:', error);
        return false;
    }
};

module.exports = {
    client: redisClient,
    enabled: redisEnabled,
    get,
    set,
    del,
    exists
};




















































