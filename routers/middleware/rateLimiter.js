/**
 * Rate limiting (express-rate-limit)
 *
 * Policy matrix (HTTP):
 * - auth, validation: IP-only keys (never trust client-supplied user ids).
 * - All other presets: trusted session user id when present (req.user from auth middleware), else IP.
 * - User-status burst: IP, Redis-backed when store available (replaces per-process Map).
 * - Optional global /api cap: RATE_LIMIT_GLOBAL_PER_IP_PER_MINUTE + initFromRedis assigns globalApiLimiter.
 *
 * Call initFromRedis(sharedAppRedis) once after setupRedis() and before loading route modules that
 * destructure preset limiters from this module.
 */

let rateLimit = null;
let RedisStore = null;
let createRedisClient = null;

try {
    rateLimit = require('express-rate-limit');
} catch (e) {
    console.warn('[RateLimiter] express-rate-limit not installed.');
}

try {
    ({ RedisStore } = require('rate-limit-redis'));
} catch (e) {
    console.warn('[RateLimiter] rate-limit-redis not installed; using in-memory rate limit store.');
}

try {
    ({ createClient: createRedisClient } = require('redis'));
} catch (e) {
    console.warn('[RateLimiter] redis client not available.');
}

// Default skip paths include health + high-frequency presence/search polling endpoints
// so the UI doesn't DOS itself in production.
const healthPathList = (process.env.RATE_LIMIT_HEALTH_PATHS || '/health,/live,/status,/healthz,/api/search,/api/search/filters,/api/presence,/api/users-online-status,/presence/subscribe')
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

let rateLimiterStoreFactory = null;
let standaloneRateLimiterClient = null;
let usingSharedRedisClient = false;
let presetsInitialized = false;

function noopLimiter(_req, _res, next) {
    return next();
}

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

/** IP-only identity (login, register, validation, anonymous abuse). */
function ipKeyGenerator(req) {
    return `ip:${normalizeIp(req.ip)}`;
}

/**
 * Authenticated identity from server session only — never body/query/header user ids
 * (those are spoofable and allow burning another user's quota).
 */
function trustedUserKeyGenerator(req) {
    const id = req.user?.id ?? req.user?.user_id;
    if (id !== undefined && id !== null && id !== '') {
        return `user:${String(id)}`;
    }
    return `ip:${normalizeIp(req.ip)}`;
}

function defaultRateLimitHandler(req, res, _next, options) {
    const limitName = options.limitName || 'unknown';
    const key = typeof options.keyGenerator === 'function' ? options.keyGenerator(req) : undefined;
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

    try {
        console.warn(
            JSON.stringify({
                event: 'rate_limit_exceeded',
                limitName,
                method: req.method,
                path: req.originalUrl || req.url,
                keyType: key && String(key).startsWith('user:') ? 'user' : 'ip',
                statusCode: options.statusCode || 429
            })
        );
    } catch {
        // ignore logging failures
    }

    res.status(options.statusCode || 429).json(payload);
}

let limiterInstanceCounter = 0;

function buildRedisStoreFactory(redisClient) {
    if (!RedisStore || !redisClient || typeof redisClient.sendCommand !== 'function') {
        return null;
    }
    const basePrefix = process.env.RATE_LIMIT_REDIS_PREFIX || 'rate-limit:';
    return (prefixSuffix = '') => {
        const computedPrefix = prefixSuffix ? `${basePrefix}${prefixSuffix}:` : basePrefix;
        return new RedisStore({
            sendCommand: (...args) => redisClient.sendCommand(args),
            prefix: computedPrefix
        });
    };
}

async function openStandaloneRateLimiterClient() {
    if (!createRedisClient || process.env.RATE_LIMIT_STORE_DISABLED === 'true') {
        return null;
    }

    const redisUrl = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL;
    const explicitHost = process.env.RATE_LIMIT_REDIS_HOST || process.env.REDIS_HOST;
    if (!redisUrl && !explicitHost) {
        return null;
    }

    const redisOptions = redisUrl
        ? { url: redisUrl, socket: { connectTimeout: 3000 } }
        : {
              socket: {
                  host: explicitHost,
                  port: Number(process.env.RATE_LIMIT_REDIS_PORT || process.env.REDIS_PORT) || 6379,
                  connectTimeout: 3000
              }
          };

    const client = createRedisClient(redisOptions);
    client.on('error', (err) => {
        console.warn('[RateLimiter] Redis store error:', err.message);
    });

    await client.connect();
    standaloneRateLimiterClient = client;
    usingSharedRedisClient = false;
    return client;
}

function logProductionStoreStatus() {
    if (process.env.NODE_ENV !== 'production') {
        return;
    }
    if (rateLimiterStoreFactory) {
        return;
    }
    console.warn(
        '[RateLimiter] Production is using the default in-memory rate limit store (not shared across workers). ' +
            'Provide Redis (app Redis or RATE_LIMIT_REDIS_URL / REDIS_URL) and install rate-limit-redis, ' +
            'or set RATE_LIMIT_REDIS_REQUIRED=true to fail startup.'
    );
}

function enforceRedisRequiredIfConfigured() {
    if (process.env.RATE_LIMIT_REDIS_REQUIRED !== 'true' || process.env.NODE_ENV !== 'production') {
        return;
    }
    if (rateLimiterStoreFactory) {
        return;
    }
    console.error('[RateLimiter] RATE_LIMIT_REDIS_REQUIRED=true but no Redis-backed store is available. Exiting.');
    process.exit(1);
}

/**
 * Wire Redis for all preset limiters. Must run once before route modules load preset exports.
 * @param {import('redis').RedisClientType|null} sharedAppRedis - Connected app Redis client (preferred).
 */
async function initFromRedis(sharedAppRedis = null) {
    if (presetsInitialized) {
        return;
    }

    if (process.env.RATE_LIMIT_STORE_DISABLED === 'true') {
        rateLimiterStoreFactory = null;
    } else if (sharedAppRedis && typeof sharedAppRedis.sendCommand === 'function') {
        rateLimiterStoreFactory = buildRedisStoreFactory(sharedAppRedis);
        usingSharedRedisClient = true;
        standaloneRateLimiterClient = null;
    } else {
        try {
            const client = await openStandaloneRateLimiterClient();
            rateLimiterStoreFactory = client ? buildRedisStoreFactory(client) : null;
        } catch (error) {
            console.warn('[RateLimiter] Standalone Redis for rate limits unavailable:', error.message);
            rateLimiterStoreFactory = null;
        }
    }

    logProductionStoreStatus();
    enforceRedisRequiredIfConfigured();

    Object.assign(module.exports, buildPresetLimiters());
    presetsInitialized = true;
}

async function shutdownStandaloneRateLimiterRedis() {
    if (usingSharedRedisClient || !standaloneRateLimiterClient?.quit) {
        return;
    }
    try {
        await standaloneRateLimiterClient.quit();
    } catch (e) {
        console.warn('[RateLimiter] Standalone Redis quit failed:', e.message);
    } finally {
        standaloneRateLimiterClient = null;
        rateLimiterStoreFactory = null;
    }
}

function hasRedisBackedStore() {
    return !!rateLimiterStoreFactory;
}

function createLimiter(options = {}) {
    if (process.env.ENABLE_RATE_LIMITING === 'false') {
        return (req, res, next) => next();
    }

    if (!rateLimit) {
        return (req, res, next) => next();
    }

    const baseOptions = {
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: 'Too many requests from this IP, please try again later',
        standardHeaders: true,
        legacyHeaders: false,
        validate: true,
        handler: defaultRateLimitHandler,
        skip: shouldSkipRateLimit,
        keyGenerator: trustedUserKeyGenerator
    };

    const merged = {
        ...baseOptions,
        ...options
    };

    merged.handler = options.handler !== undefined ? options.handler : defaultRateLimitHandler;
    merged.skip = options.skip !== undefined ? options.skip : shouldSkipRateLimit;
    merged.keyGenerator = options.keyGenerator !== undefined ? options.keyGenerator : trustedUserKeyGenerator;

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

function buildPresetLimiters() {
    const globalPerMin = parseInt(process.env.RATE_LIMIT_GLOBAL_PER_IP_PER_MINUTE || '', 10);
    const out = {
        profileUpdateLimiter: createLimiter({
            limitName: 'profile_update',
            windowMs: 15 * 60 * 1000,
            max: 50,
            message: 'Too many profile update requests, please try again later',
            keyGenerator: trustedUserKeyGenerator
        }),

        imageUploadLimiter: createLimiter({
            limitName: 'image_upload',
            windowMs: 15 * 60 * 1000,
            max: 50,
            message: 'Too many image upload requests, please try again later',
            keyGenerator: trustedUserKeyGenerator
        }),

        authLimiter: createLimiter({
            limitName: 'auth',
            windowMs: 15 * 60 * 1000,
            max: 5,
            message: 'Too many authentication attempts, please try again later',
            skipSuccessfulRequests: true,
            keyGenerator: ipKeyGenerator
        }),

        apiLimiter: createLimiter({
            limitName: 'api',
            windowMs: 15 * 60 * 1000,
            max: 100,
            message: 'Too many API requests, please try again later',
            keyGenerator: trustedUserKeyGenerator
        }),

        accountLimiter: createLimiter({
            limitName: 'account',
            windowMs: 60 * 1000,
            max: 400,
            message: 'Too many account requests, please slow down',
            keyGenerator: trustedUserKeyGenerator
        }),

        strictLimiter: createLimiter({
            limitName: 'strict',
            windowMs: 60 * 60 * 1000,
            max: 5,
            message: 'Too many requests, please try again later',
            keyGenerator: trustedUserKeyGenerator
        }),

        validationLimiter: createLimiter({
            limitName: 'validation',
            windowMs: 1 * 60 * 1000,
            max: 10,
            message: 'Too many validation requests, please try again later',
            keyGenerator: ipKeyGenerator
        }),

        activityLimiter: createLimiter({
            limitName: 'activity',
            windowMs: 1 * 60 * 1000,
            max: 60,
            message: 'Too many activity requests, please try again later',
            keyGenerator: trustedUserKeyGenerator
        }),

        messageCountLimiter: createLimiter({
            limitName: 'message_count',
            windowMs: 1 * 60 * 1000,
            max: 300,
            message: 'Too many message count requests, please try again later',
            skipSuccessfulRequests: false,
            keyGenerator: trustedUserKeyGenerator
        }),

        lookupLimiter: createLimiter({
            limitName: 'lookup',
            windowMs: 1 * 60 * 1000,
            max: 200,
            message: 'Too many lookup requests, please try again later',
            skipSuccessfulRequests: false,
            keyGenerator: trustedUserKeyGenerator
        }),

        statusReadLimiter: createLimiter({
            limitName: 'status_read',
            windowMs: 30 * 1000,
            max: 90,
            message: 'Too many status lookups, please slow down',
            keyGenerator: trustedUserKeyGenerator
        }),

        statusWriteLimiter: createLimiter({
            limitName: 'status_write',
            windowMs: 5 * 60 * 1000,
            max: 40,
            message: 'Too many status updates, please slow down',
            keyGenerator: trustedUserKeyGenerator
        }),

        presenceHeartbeatLimiter: createLimiter({
            limitName: 'presence_heartbeat',
            windowMs: 60 * 1000,
            max: 30,
            message: 'Too many heartbeat requests, please slow down',
            keyGenerator: trustedUserKeyGenerator
        }),

        userStatusBurstLimiter: createLimiter({
            limitName: 'user_status_burst',
            windowMs: 1000,
            max: 10,
            message: 'Too many user-status requests, please use bulk endpoints or reduce request frequency.',
            keyGenerator: ipKeyGenerator
        })
    };

    if (Number.isFinite(globalPerMin) && globalPerMin > 0) {
        out.globalApiLimiter = createLimiter({
            limitName: 'global_api',
            windowMs: 60 * 1000,
            max: globalPerMin,
            message: 'Too many API requests, please slow down',
            keyGenerator: ipKeyGenerator
        });
    } else {
        out.globalApiLimiter = null;
    }

    return out;
}

module.exports = {
    initFromRedis,
    shutdownStandaloneRateLimiterRedis,
    hasRedisBackedStore,
    createLimiter,
    ipKeyGenerator,
    trustedUserKeyGenerator,
    normalizeIp,
    hasRateLimit: !!rateLimit,
    globalApiLimiter: null,
    // Default to no-op middleware so route modules can safely destructure presets
    // before initFromRedis() runs (Server.init calls it before routes are registered).
    profileUpdateLimiter: noopLimiter,
    imageUploadLimiter: noopLimiter,
    authLimiter: noopLimiter,
    apiLimiter: noopLimiter,
    strictLimiter: noopLimiter,
    validationLimiter: noopLimiter,
    activityLimiter: noopLimiter,
    messageCountLimiter: noopLimiter,
    lookupLimiter: noopLimiter,
    accountLimiter: noopLimiter,
    statusReadLimiter: noopLimiter,
    statusWriteLimiter: noopLimiter,
    presenceHeartbeatLimiter: noopLimiter,
    userStatusBurstLimiter: noopLimiter
};
