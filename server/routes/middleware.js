/**
 * Route Middleware Module
 * Creates route-specific middleware (rate limiting, etc.)
 */

/**
 * Create rate limiting middleware for user status endpoints
 * @returns {Function} Express middleware
 */
function createUserStatusRateLimit() {
    const userStatusRequests = new Map();
    
    const windowMs = parseInt(process.env.USER_STATUS_RATE_LIMIT_WINDOW_MS || '1000', 10);
    const maxRequests = parseInt(process.env.USER_STATUS_RATE_LIMIT_MAX || '50', 10);

    return (req, res, next) => {
        const clientId = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        
        if (!userStatusRequests.has(clientId)) {
            userStatusRequests.set(clientId, []);
        }
        
        const requests = userStatusRequests.get(clientId);
        const recentRequests = requests.filter(time => now - time < windowMs);
        
        if (recentRequests.length >= maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'Too many requests. Please use bulk endpoints or reduce request frequency.'
            });
        }
        
        recentRequests.push(now);
        userStatusRequests.set(clientId, recentRequests);
        next();
    };
}

/**
 * Create rate limiting middleware for CSRF token generation
 * @returns {Function} Express middleware
 */
function createCSRFRateLimit() {
    const csrfRateLimitMap = new Map();
    
    return (req, res, next) => {
        const clientId = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        const windowMs = 60 * 1000; // 1 minute window
        const maxRequests = 1000; // Max 1000 CSRF token requests per minute per IP (for scale)
        
        if (!csrfRateLimitMap.has(clientId)) {
            csrfRateLimitMap.set(clientId, []);
        }
        
        const requests = csrfRateLimitMap.get(clientId);
        const recentRequests = requests.filter(time => now - time < windowMs);
        
        if (recentRequests.length >= maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'Too many CSRF token requests. Please wait before trying again.',
                retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000) // seconds
            });
        }
        
        recentRequests.push(now);
        csrfRateLimitMap.set(clientId, recentRequests);
        next();
    };
}

module.exports = {
    createUserStatusRateLimit,
    createCSRFRateLimit
};







