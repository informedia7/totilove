/**
 * Route Middleware Module
 * Creates route-specific middleware (rate limiting, etc.)
 */

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
    createCSRFRateLimit
};







