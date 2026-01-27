/**
 * Request Logging Middleware
 * Logs all requests with timing and metadata
 */

const DEFAULT_SKIP_PATHS = [
    '/api/users-online-status',
    '/metrics/presence-client',
    '/api/heartbeat',
    '/api/profile/languages'
];

const configuredSkipPaths = (process.env.REQUEST_LOGGER_SKIP_PATHS || '')
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean);

const combinedSkipPaths = [...new Set([...DEFAULT_SKIP_PATHS, ...configuredSkipPaths])];

/**
 * Create request logger middleware
 * @param {Object} options - Logger options
 * @returns {Function} Express middleware
 */
function createRequestLogger(options = {}) {
    const {
        logLevel = 'info', // 'info', 'debug', 'error', 'none'
        logSlowRequests = true,
        slowRequestThreshold = 1000, // milliseconds
        logUserAgent = true,
        logIP = true,
        logUserId = true,
        skipPaths = [] // Array of paths to skip logging
    } = options;

    return (req, res, next) => {
        // Skip logging for specified paths
        if (skipPaths.some(path => req.path.startsWith(path))) {
            return next();
        }

        const start = Date.now();
        const originalEnd = res.end;

        // Override res.end to log after response
        res.end = function(chunk, encoding) {
            const duration = Date.now() - start;
            const method = req.method;
            const url = req.originalUrl || req.url;
            const status = res.statusCode;
            const userAgent = logUserAgent ? req.get('User-Agent') : undefined;
            const ip = logIP ? (req.ip || req.connection.remoteAddress) : undefined;
            const userId = logUserId && req.user ? req.user.id : 'anonymous';

            // Log slow requests
            if (logSlowRequests && duration > slowRequestThreshold) {
                console.warn(`[SLOW REQUEST] ${method} ${url} ${status} ${duration}ms - User: ${userId}${ip ? ` - IP: ${ip}` : ''}`);
            }

            // Log based on log level
            if (logLevel !== 'none') {
                const logData = {
                    method,
                    url,
                    status,
                    duration: `${duration}ms`,
                    ...(userId !== 'anonymous' && { userId }),
                    ...(ip && { ip }),
                    ...(userAgent && { userAgent })
                };

                if (logLevel === 'debug') {
                    console.log('[Request]', JSON.stringify(logData, null, 2));
                } else if (logLevel === 'info') {
                    console.log(`[Request] ${method} ${url} ${status} ${duration}ms${userId !== 'anonymous' ? ` - User: ${userId}` : ''}`);
                } else if (logLevel === 'error' && status >= 400) {
                    console.error(`[Request Error] ${method} ${url} ${status} ${duration}ms - User: ${userId}`);
                }
            }

            // Call original end method
            originalEnd.call(this, chunk, encoding);
        };

        next();
    };
}

/**
 * Default request logger
 * Uses sensible defaults for production
 */
const requestLogger = createRequestLogger({
    logLevel: 'info',
    logSlowRequests: true,
    slowRequestThreshold: 1000,
    skipPaths: combinedSkipPaths
});

/**
 * Development request logger
 * More verbose logging for development
 */
const devRequestLogger = createRequestLogger({
    logLevel: 'debug',
    logSlowRequests: true,
    slowRequestThreshold: 500,
    logUserAgent: true,
    logIP: true,
    logUserId: true
});

/**
 * Minimal request logger
 * Only logs errors and slow requests
 */
const minimalRequestLogger = createRequestLogger({
    logLevel: 'error',
    logSlowRequests: true,
    slowRequestThreshold: 2000
});

module.exports = {
    createRequestLogger,
    requestLogger,
    devRequestLogger,
    minimalRequestLogger
};





























