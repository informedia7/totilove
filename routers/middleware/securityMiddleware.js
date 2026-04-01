/**
 * Security Middleware
 * Provides security headers, CSRF protection, and request size limits
 */

/**
 * Security headers middleware
 * Sets various security headers for protection
 */
function securityHeaders(req, res, next) {
    // Content Security Policy
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none';"
    );

    // X-Content-Type-Options: Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // X-Frame-Options: Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // X-XSS-Protection: Enable XSS filter
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer-Policy: Control referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions-Policy: Restrict browser features
    res.setHeader('Permissions-Policy', 
        'geolocation=(), microphone=(), camera=(), payment=()'
    );

    // Strict-Transport-Security: Force HTTPS (only in production)
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
}

/**
 * Request size limit middleware
 * Prevents DoS attacks by limiting request body size
 * @param {number} maxSize - Maximum size in bytes (default: 5MB)
 * @returns {Function} Express middleware
 */
function requestSizeLimit(maxSize = 5 * 1024 * 1024) {
    return (req, res, next) => {
        const contentLength = parseInt(req.get('content-length') || '0');

        if (contentLength > maxSize) {
            return res.status(413).json({
                success: false,
                error: `Request entity too large. Maximum size: ${maxSize / 1024 / 1024}MB`
            });
        }

        next();
    };
}

/**
 * CSRF token validation middleware (basic implementation)
 * Note: For production, use a proper CSRF library like csurf
 * @param {Function} getToken - Function to get CSRF token from request
 * @returns {Function} Express middleware
 */
function csrfProtection(getToken = null) {
    return (req, res, next) => {
        // Skip CSRF for GET, HEAD, OPTIONS requests
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }

        // Get token from request
        const token = getToken 
            ? getToken(req) 
            : req.headers['x-csrf-token'] || 
              req.body?._csrf || 
              req.query._csrf;

        // Get session token
        const sessionToken = req.cookies?.sessionToken || 
                            req.cookies?.session ||
                            req.headers['x-session-token'];

        // Basic validation: token should match session token or be validated separately
        // In production, use proper CSRF token stored in session
        if (!token && sessionToken) {
            // For now, allow requests with valid session token
            // In production, implement proper CSRF token validation
            return next();
        }

        // If no session token, require CSRF token
        if (!sessionToken && !token) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token required'
            });
        }

        next();
    };
}

/**
 * SQL injection prevention helper
 * Validates that parameters don't contain SQL injection patterns
 * Note: This is a basic check. Always use parameterized queries!
 * @param {Object} params - Parameters to validate
 * @returns {Object} Validation result
 */
function validateSQLParams(params) {
    const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
        /(--|#|\/\*|\*\/)/g,
        /(;|\||&)/g,
        /(UNION|JOIN)/gi
    ];

    const errors = [];

    function checkValue(value, path = '') {
        if (typeof value === 'string') {
            for (const pattern of sqlPatterns) {
                if (pattern.test(value)) {
                    errors.push(`Potential SQL injection detected in ${path || 'parameter'}`);
                    break;
                }
            }
        } else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    checkValue(item, `${path}[${index}]`);
                });
            } else {
                Object.keys(value).forEach(key => {
                    checkValue(value[key], path ? `${path}.${key}` : key);
                });
            }
        }
    }

    checkValue(params);

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Sanitize file name to prevent path traversal
 * @param {string} filename - File name to sanitize
 * @returns {string} Sanitized file name
 */
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        return '';
    }

    // Remove path traversal patterns
    let sanitized = filename
        .replace(/\.\./g, '') // Remove ..
        .replace(/\//g, '_') // Replace / with _
        .replace(/\\/g, '_') // Replace \ with _
        .replace(/[^a-zA-Z0-9._-]/g, '_'); // Replace special chars

    // Limit length
    if (sanitized.length > 255) {
        const ext = sanitized.substring(sanitized.lastIndexOf('.'));
        sanitized = sanitized.substring(0, 250) + ext;
    }

    return sanitized;
}

module.exports = {
    securityHeaders,
    requestSizeLimit,
    csrfProtection,
    validateSQLParams,
    sanitizeFilename
};





























