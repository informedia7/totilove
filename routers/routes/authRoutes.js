/**
 * Authentication Routes
 * Handles authentication and session management endpoints
 * 
 * Routes:
 * - POST /login - Login endpoint
 * - POST /register - Register endpoint
 * - POST /logout - Logout endpoint
 * - GET /api/verify-email - Email verification
 * - POST /api/resend-verification - Resend verification email
 * - POST /api/verify-email-code - Verify email by code
 * - POST /api/heartbeat - Session heartbeat
 * - GET /api/auth/check-session - Check session status
 * - GET /api/auth/get-user-id - Get current user ID
 */

const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiter');
const { requestLogger } = require('../middleware/requestLogger');
const { extractSessionToken, validateSession } = require('../middleware/authMiddleware');
const config = require('../../config/config');
const SESSION_DURATION_MS = config.session?.duration || (2 * 60 * 60 * 1000);

/**
 * Create authentication routes
 * @param {Object} authController - AuthController instance
 * @param {Object} authMiddleware - AuthMiddleware instance
 * @returns {express.Router} Express router
 */
function createAuthRoutes(authController, authMiddleware) {
    if (!authController) {
        throw new Error('AuthController is required for authentication routes');
    }

    // Apply logging to all routes
    router.use(requestLogger);

    /**
     * POST /login - Login endpoint
     * Apply auth limiter only to login endpoint
     */
    router.post('/login', authLimiter, async (req, res) => {
        try {
            await authController.login(req, res);
        } catch (error) {
            console.error('[AuthRoutes] Error in login:', error);
            res.status(500).json({ success: false, error: 'Login failed' });
        }
    });

    /**
     * POST /register - Register endpoint
     * Apply auth limiter only to register endpoint
     */
    router.post('/register', authLimiter, async (req, res) => {
        try {
            await authController.register(req, res);
        } catch (error) {
            console.error('[AuthRoutes] Error in register:', error);
            res.status(500).json({ success: false, error: 'Registration failed' });
        }
    });

    /**
     * POST /logout - Logout endpoint
     */
    router.post('/logout', async (req, res) => {
        try {
            await authController.logout(req, res);
        } catch (error) {
            console.error('[AuthRoutes] Error in logout:', error);
            res.status(500).json({ success: false, error: 'Logout failed' });
        }
    });

    /**
     * GET /api/verify-email - Email verification
     */
    router.get('/api/verify-email', async (req, res) => {
        try {
            await authController.verifyEmail(req, res);
        } catch (error) {
            console.error('[AuthRoutes] Error in verifyEmail:', error);
            res.status(500).json({ success: false, error: 'Email verification failed' });
        }
    });

    /**
     * POST /api/resend-verification - Resend verification email
     */
    router.post('/api/resend-verification', async (req, res) => {
        try {
            await authController.resendVerificationEmail(req, res);
        } catch (error) {
            console.error('[AuthRoutes] Error in resendVerificationEmail:', error);
            res.status(500).json({ success: false, error: 'Failed to resend verification email' });
        }
    });

    /**
     * POST /api/verify-email-code - Verify email by code
     */
    router.post('/api/verify-email-code', async (req, res) => {
        try {
            await authController.verifyEmailByCode(req, res);
        } catch (error) {
            console.error('[AuthRoutes] Error in verifyEmailByCode:', error);
            res.status(500).json({ success: false, error: 'Email code verification failed' });
        }
    });

    /**
     * POST /api/heartbeat - Session heartbeat
     */
    router.post('/api/heartbeat', (req, res) => {
        res.json({
            success: true,
            timestamp: Date.now(),
            status: 'alive'
        });
    });

    /**
     * GET /api/auth/check-session - Check session status
     */
    router.get('/api/auth/check-session', (req, res) => {
        try {
            const token = extractSessionToken(req);
            
            if (!token || !authMiddleware) {
                return res.json({
                    success: false,
                    isAuthenticated: false,
                    message: 'No session token provided'
                });
            }

            const session = authMiddleware.sessions.get(token);
            
            if (!session || session.expiresAt <= Date.now()) {
                return res.json({
                    success: false,
                    isAuthenticated: false,
                    message: 'Session expired or invalid'
                });
            }

            // Extend session
            session.expiresAt = Date.now() + SESSION_DURATION_MS;
            
            res.json({
                success: true,
                isAuthenticated: true,
                user: {
                    id: session.user?.id || session.userId,
                    real_name: session.user?.real_name,
                    email: session.user?.email,
                    profile_image: session.user?.profile_image
                },
                expiresAt: session.expiresAt
            });
        } catch (error) {
            console.error('[AuthRoutes] Error checking session:', error);
            res.status(500).json({
                success: false,
                isAuthenticated: false,
                message: 'Internal server error'
            });
        }
    });

    /**
     * GET /api/auth/get-user-id - Get current user ID
     */
    router.get('/api/auth/get-user-id', (req, res) => {
        try {
            const token = extractSessionToken(req);
            
            if (!token || !authMiddleware) {
                return res.json({
                    success: false,
                    userId: null,
                    message: 'No session token provided'
                });
            }

            const session = validateSession(token, authMiddleware?.sessions);
            
            if (!session) {
                return res.json({
                    success: false,
                    userId: null,
                    message: 'Invalid or expired session'
                });
            }

            const userId = session.user?.id || session.userId;
            
            res.json({
                success: true,
                userId: userId,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('[AuthRoutes] Error getting user ID:', error);
            res.status(500).json({
                success: false,
                userId: null,
                error: 'Failed to get user ID'
            });
        }
    });

    return router;
}

module.exports = createAuthRoutes;

