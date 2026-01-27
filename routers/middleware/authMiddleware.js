/**
 * Authentication Middleware
 * Handles session validation and user extraction
 */

/**
 * Extract session token from request
 * Checks multiple sources: cookies, headers, query params, body
 * @param {Object} req - Express request object
 * @returns {string|null} Session token or null
 */
function extractSessionToken(req) {
    // Priority order: cookie (most secure) > authorization header > custom header > query > body
    return req.cookies?.sessionToken || 
           req.cookies?.session ||
           req.headers.authorization?.replace('Bearer ', '') ||
           req.headers['x-session-token'] ||
           req.query.token ||
           req.body?.sessionToken;
}

/**
 * Validate session and extract user
 * @param {string} sessionToken - Session token to validate
 * @param {Map} sessions - Sessions map from authMiddleware
 * @returns {Object|null} Session object or null if invalid
 */
function validateSession(sessionToken, sessions) {
    if (!sessionToken || !sessions) {
        return null;
    }

    const session = sessions.get(sessionToken);
    
    if (!session || session.expiresAt <= Date.now()) {
        if (session) {
            sessions.delete(sessionToken);
        }
        return null;
    }

    // Extend session
    session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
    return session;
}

/**
 * Require authentication middleware
 * Validates session and attaches user to request
 * @param {Object} authMiddleware - AuthMiddleware instance with sessions map
 * @returns {Function} Express middleware function
 */
function requireAuth(authMiddleware) {
    return (req, res, next) => {
        const sessionToken = extractSessionToken(req);

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                error: 'Session token is required'
            });
        }

        const session = validateSession(sessionToken, authMiddleware?.sessions);

        if (!session) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired session'
            });
        }

        // Attach session and user to request
        req.session = session;
        req.user = session.user;
        req.userId = session.user?.id || session.userId;
        
        next();
    };
}

/**
 * Optional authentication middleware
 * Validates session if present, but doesn't fail if missing
 * @param {Object} authMiddleware - AuthMiddleware instance with sessions map
 * @returns {Function} Express middleware function
 */
function optionalAuth(authMiddleware) {
    return (req, res, next) => {
        const sessionToken = extractSessionToken(req);

        if (sessionToken) {
            const session = validateSession(sessionToken, authMiddleware?.sessions);
            if (session) {
                req.session = session;
                req.user = session.user;
                req.userId = session.user?.id || session.userId;
            }
        }

        next();
    };
}

/**
 * Require user ID middleware
 * Ensures user is authenticated and has a valid user ID
 * @param {Object} authMiddleware - AuthMiddleware instance with sessions map
 * @returns {Function} Express middleware function
 */
function requireUserId(authMiddleware) {
    return (req, res, next) => {
        const sessionToken = extractSessionToken(req);

        if (!sessionToken) {
            return res.status(401).json({
                success: false,
                error: 'Session token is required'
            });
        }

        const session = validateSession(sessionToken, authMiddleware?.sessions);

        if (!session) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired session'
            });
        }

        const userId = session.user?.id || session.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User ID not found in session'
            });
        }

        req.session = session;
        req.user = session.user;
        req.userId = userId;
        
        next();
    };
}

module.exports = {
    extractSessionToken,
    validateSession,
    requireAuth,
    optionalAuth,
    requireUserId
};



