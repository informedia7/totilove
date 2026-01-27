/**
 * Rate Limiting Middleware
 * Provides rate limiting configurations for different endpoints
 */

let rateLimit = null;
let RedisStore = null;
let rateLimiterRedisClient = null;
let rateLimiterStoreFactory = null;
let createRedisClient = null;

function toNumber(value, fallback) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

try {
    rateLimit = require('express-rate-limit');
} catch (e) {
    console.warn('[RateLimiter] express-rate-limit not installed. Install with: npm install express-rate-limit');
}

try {
    ({ RedisStore } = require('rate-limit-redis'));
} catch (e) {
    console.warn('[RateLimiter] rate-limit-redis not installed. Install with: npm install rate-limit-redis');
}

try {
    ({ createClient: createRedisClient } = require('redis'));
} catch (e) {
    console.warn('[RateLimiter] redis client not available. Install redis >= 5 to enable shared stores.');
}

const healthPathList = (process.env.RATE_LIMIT_HEALTH_PATHS || '/health,/status,/healthz')
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean);
const extraSkipPaths = (process.env.RATE_LIMIT_SKIP_PATHS || '')
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean);
const RATE_LIMIT_SKIP_PATHS = [...new Set([...healthPathList, ...extraSkipPaths])];
const baseTrustedIps = process.env.NODE_ENV === 'production' ? [] : ['127.0.0.1', '::1'];
const configuredTrustedIps = (process.env.RATE_LIMIT_TRUSTED_IPS || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
const TRUSTED_IPS = [...new Set([...baseTrustedIps, ...configuredTrustedIps])];
const INTERNAL_REQUEST_HEADER = 'x-internal-request';

function normalizeIp(ip = '') {
    if (!ip) {
        return 'unknown';
    }
    return ip.startsWith('::ffff:') ? ip.substring(7) : ip;
}

function shouldSkipRateLimit(req) {
    if (!req) {
        return false;
    }

    const reqPath = req.path || req.originalUrl || '';
    if (RATE_LIMIT_SKIP_PATHS.some((path) => path && reqPath.startsWith(path))) {
        return true;
    }

    if (req.headers && req.headers[INTERNAL_REQUEST_HEADER] === 'true') {
        return true;
    }

    if (TRUSTED_IPS.length > 0) {
        const normalizedIp = normalizeIp(req.ip);
        if (TRUSTED_IPS.includes(normalizedIp)) {
            return true;
        }
    }

    return false;
}

function defaultRateLimitHandler(req, res, _next, options) {
    const payload = {
        success: false,
        error: 'rate_limit_exceeded',
        message: options.message || 'Too many requests, please try again later'
    };

    if (options.windowMs) {
        payload.windowMs = options.windowMs;
    }

    if (typeof options.max === 'number') {
        payload.limit = options.max;
    }

    const retryAfter = res.getHeader('Retry-After');
    if (retryAfter) {
        payload.retryAfter = retryAfter;
    }

    res.status(options.statusCode || 429).json(payload);
}

const userScopedKeyGenerator = (req) => {
    const candidate =
        req.user?.id ||
        req.user?.user_id ||
        req.session?.userId ||
        req.headers?.['x-user-id'] ||
        req.body?.userId ||
        req.params?.userId ||
        req.query?.userId;

    if (candidate !== undefined && candidate !== null && candidate !== '') {
        return `user:${String(candidate)}`;
    }

    return `ip:${normalizeIp(req.ip)}`;
};

function initializeRateLimitStore() {
    if (!RedisStore || !createRedisClient || process.env.RATE_LIMIT_STORE_DISABLED === 'true') {
        return null;
    }

    try {
        const redisUrl = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL;
        const redisPassword = process.env.RATE_LIMIT_REDIS_PASSWORD || process.env.REDIS_PASSWORD;
        const redisUsername = process.env.RATE_LIMIT_REDIS_USER || process.env.REDIS_USER;
        const redisOptions = redisUrl
            ? { url: redisUrl }
            : {
                  socket: {
                      host: process.env.RATE_LIMIT_REDIS_HOST || process.env.REDIS_HOST || '127.0.0.1',
                      port: Number(process.env.RATE_LIMIT_REDIS_PORT || process.env.REDIS_PORT) || 6379
                  },
                  password: redisPassword || undefined,
                  username: redisUsername || undefined
              };

        if (redisUrl && (redisPassword || redisUsername)) {
            redisOptions.password = redisPassword || undefined;
            redisOptions.username = redisUsername || undefined;
        }

        if (!rateLimiterRedisClient) {
            const client = createRedisClient(redisOptions);

            client.on('error', (err) => {
                console.warn('[RateLimiter] Redis store error:', err.message);
            });

            client.connect().catch((err) => {
                console.warn('[RateLimiter] Redis store connection failed:', err.message);
            });

            rateLimiterRedisClient = client;
        }

        const basePrefix = process.env.RATE_LIMIT_REDIS_PREFIX || 'rate-limit:';

        return (prefixSuffix = '') => {
            const computedPrefix = prefixSuffix ? `${basePrefix}${prefixSuffix}:` : basePrefix;
            return new RedisStore({
                sendCommand: (...args) => rateLimiterRedisClient.sendCommand(args),
                prefix: computedPrefix
            });
        };
    } catch (error) {
        console.warn('[RateLimiter] Failed to initialize Redis store:', error.message);
        rateLimiterRedisClient = null;
        return null;
    }
}

rateLimiterStoreFactory = initializeRateLimitStore();

/**
 * Create rate limiter with custom options
 * @param {Object} options - Rate limit options
 * @returns {Function} Express middleware
 */
let limiterInstanceCounter = 0;

function createLimiter(options = {}) {
    if (!rateLimit) {
        // Fallback: no rate limiting if library not installed
        return (req, res, next) => next();
    }

    const baseOptions = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each identity (user fallback to IP) per window
        message: 'Too many requests from this IP, please try again later',
        standardHeaders: true,
        legacyHeaders: false,
        handler: defaultRateLimitHandler,
        skip: shouldSkipRateLimit,
        keyGenerator: userScopedKeyGenerator
    };

    const merged = {
        ...baseOptions,
        ...options
    };

    merged.handler = options.handler || defaultRateLimitHandler;
    merged.skip = options.skip || shouldSkipRateLimit;
    merged.keyGenerator = options.keyGenerator || userScopedKeyGenerator;

    if (options.store) {
        merged.store = options.store;
    } else if (rateLimiterStoreFactory) {
        let storePrefix = options.storePrefix;
        if (!storePrefix) {
            limiterInstanceCounter += 1;
            storePrefix = `limiter:${limiterInstanceCounter}`;
        }
        merged.store = rateLimiterStoreFactory(storePrefix);
    }

    if ('storePrefix' in merged) {
        delete merged.storePrefix;
    }

    return rateLimit(merged);
}

/**
 * Profile update rate limiter
 * Limits profile updates to prevent abuse
 */
const profileUpdateLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // allow up to 50 profile updates per 15 minutes
    message: 'Too many profile update requests, please try again later',
    keyGenerator: userScopedKeyGenerator
});

/**
 * Image upload rate limiter
 * Limits image uploads to prevent abuse
 * More lenient to allow users to upload multiple images in a session
 */
const imageUploadLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each identity to 50 uploads per 15 minutes
    message: 'Too many image upload requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Authentication rate limiter
 * Limits login/register attempts to prevent brute force
 */
const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each identity to 5 auth attempts per 15 minutes
    message: 'Too many authentication attempts, please try again later',
    skipSuccessfulRequests: true // Don't count successful requests
});

/**
 * API rate limiter (general)
 * General rate limit for API endpoints
 */
const apiLimiterWindowMs = toNumber(process.env.API_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000); // default 5 minutes
const apiLimiterMax = toNumber(process.env.API_RATE_LIMIT_MAX, 600);

const apiLimiter = createLimiter({
    windowMs: apiLimiterWindowMs,
    max: apiLimiterMax,
    message: 'Too many API requests, please try again later'
});

/**
 * Account dashboard limiter
 * Allows higher burst traffic for widgets that fire multiple parallel requests
 */
const accountLimiterWindowMs = toNumber(process.env.ACCOUNT_RATE_LIMIT_WINDOW_MS, 60 * 1000);
const accountLimiterMax = toNumber(process.env.ACCOUNT_RATE_LIMIT_MAX, 900);

const accountLimiter = createLimiter({
    windowMs: accountLimiterWindowMs,
    max: accountLimiterMax,
    message: 'Too many account requests, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userScopedKeyGenerator
});

/**
 * Strict rate limiter
 * Very strict limits for sensitive operations
 */
const strictLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each identity to 5 requests per hour
    message: 'Too many requests, please try again later'
});

/**
 * Validation endpoint rate limiter
 * Limits validation requests (email/username checks)
 */
const validationLimiter = createLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // limit each identity to 10 validation requests per minute
    message: 'Too many validation requests, please try again later'
});

/**
 * Activity endpoint rate limiter
 * More lenient limits for activity endpoints (viewers, favorites, likes, etc.)
 */
const activityLimiter = createLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // limit each identity to 60 requests per minute (allows for multiple activity endpoints)
    message: 'Too many activity requests, please try again later'
});

/**
 * Message count rate limiter
 * Very lenient limits for message count endpoints (frequently called for badges/notifications via socket events)
 */
const messageCountLimiter = createLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 300, // limit each identity to 300 requests per minute (allows frequent badge updates)
    message: 'Too many message count requests, please try again later',
    skipSuccessfulRequests: false, // Count all requests
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userScopedKeyGenerator
});

/**
 * Read-only lookup rate limiter
 * Lenient limits for read-only lookup endpoints (countries, states, cities, languages, etc.)
 * These endpoints are frequently called during page initialization and form interactions
 */
const lookupLimiter = createLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // limit each identity to 200 requests per minute (allows frequent lookups during form interactions)
    message: 'Too many lookup requests, please try again later',
    skipSuccessfulRequests: false, // Count all requests
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Presence status read limiter
 * Protects frequently polled status endpoints
 */
const statusReadLimiter = createLimiter({
    windowMs: 30 * 1000, // 30 seconds window
    max: 90, // allow up to 90 read calls per 30 seconds
    message: 'Too many status lookups, please slow down',
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Presence status mutation limiter
 * Protects write/heartbeat endpoints from abuse
 */
const statusWriteLimiter = createLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes window
    max: 40, // limit status mutations per identity
    message: 'Too many status updates, please slow down',
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Presence heartbeat limiter
 * Dedicated limiter for high-frequency heartbeat pings
 */
const presenceHeartbeatLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minute window
    max: 30, // allow up to 30 heartbeat posts per minute (multi-tab safe)
    message: 'Too many heartbeat requests, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userScopedKeyGenerator
});

module.exports = {
    createLimiter,
    profileUpdateLimiter,
    imageUploadLimiter,
    authLimiter,
    apiLimiter,
    strictLimiter,
    validationLimiter,
    activityLimiter,
    messageCountLimiter,
    lookupLimiter,
    accountLimiter,
    statusReadLimiter,
    statusWriteLimiter,
    presenceHeartbeatLimiter,
    hasRateLimit: !!rateLimit
};

