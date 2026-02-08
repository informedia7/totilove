/**
 * Authentication API Routes
 * Handles session checking and CSRF token generation
 */

const { createCSRFRateLimit } = require('../middleware');
const config = require('../../../config/config');
const SESSION_DURATION_MS = config.session.duration;

/**
 * Setup authentication-related routes
 * @param {Object} app - Express application instance
 * @param {Object} authMiddleware - Auth middleware instance
 * @param {Object} csrfMiddleware - CSRF middleware instance
 */
function setupAuthRoutes(app, authMiddleware, csrfMiddleware) {
    const csrfRateLimitMiddleware = createCSRFRateLimit();
    
    // Session check endpoint for authentication status
    // Cookie-based auth only (no URL tokens)
    app.get('/api/auth/check-session', (req, res) => {
        try {
            // Cookie-based auth only (no URL tokens for security)
            const token = req.cookies?.sessionToken || req.cookies?.session;
            
            if (!token) {
                return res.json({
                    success: false,
                    isAuthenticated: false,
                    message: 'No session token provided (must be in cookie)'
                });
            }

            const session = authMiddleware.sessions.get(token);
            
            if (session && session.expiresAt > Date.now()) {
                // Extend session
                session.expiresAt = Date.now() + SESSION_DURATION_MS;
                
                res.json({
                    success: true,
                    isAuthenticated: true,
                    user: {
                        id: session.user.id,
                        real_name: session.user.real_name || session.user.real_name || '',
                        email: session.user.email,
                        profile_image: session.user.profile_image
                    },
                    expiresAt: session.expiresAt
                });
            } else {
                res.json({
                    success: false,
                    isAuthenticated: false,
                    message: 'Session expired or invalid'
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                isAuthenticated: false,
                message: 'Internal server error'
            });
        }
    });
    
    // CSRF token generation endpoint (excluded from CSRF validation)
    // Industry standard: Cookie-based session + per-session CSRF token
    // NO URL TOKENS - cookies only
    app.get('/api/csrf-token', csrfRateLimitMiddleware, async (req, res) => {
        try {
            // Get session token from cookie ONLY (no URL tokens for security)
            const sessionToken = req.cookies?.sessionToken || 
                               req.cookies?.session;
            
            if (!sessionToken) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required (must be in cookie)'
                });
            }

            // Generate CSRF token for this session (async if using Redis)
            const csrfToken = await csrfMiddleware.generateToken(sessionToken);
            
            if (!csrfToken) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to generate CSRF token'
                });
            }
            
            res.json({
                success: true,
                csrfToken: csrfToken,
                expiresIn: SESSION_DURATION_MS
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to generate CSRF token'
            });
        }
    });
}

module.exports = { setupAuthRoutes };







