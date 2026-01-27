/**
 * Status Routes
 * Handles online status management endpoints
 * 
 * Routes:
 * - GET /api/user-status/:userId - Get user online status
 * - GET /api/user-lastseen/:userId - Get user last seen timestamp
 * - POST /api/user-offline - Set user offline
 * - POST /api/user-online - Deprecated (use /api/presence/heartbeat)
 * - POST /api/user-logout - Handle user logout
 *
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requestLogger } = require('../middleware/requestLogger');
const { optionalAuth, requireUserId } = require('../middleware/authMiddleware');
const {
    statusReadLimiter,
    bulkStatusLimiter,
    statusWriteLimiter,
    presenceHeartbeatLimiter
} = require('../middleware/rateLimiter');

/**
 * Create status routes
 * @param {Object} authController - AuthController instance
 * @param {Object} authMiddleware - AuthMiddleware instance (optional)
 * @returns {express.Router} Express router
 */
function createStatusRoutes(authController, authMiddleware = null) {
    if (!authController) {
        throw new Error('AuthController is required for status routes');
    }

    // Apply logging to status endpoints
    router.use(requestLogger);

    // Apply optional auth (some endpoints may need it)
    if (authMiddleware) {
        router.use(optionalAuth(authMiddleware));
    }

    const enforceHeartbeatAuth = authMiddleware
        ? requireUserId(authMiddleware)
        : ((req, res) => res.status(401).json({ success: false, error: 'Authentication required' }));

    /**
     * GET /api/user-status/:userId
     * Get user online status
     */
    router.get('/api/user-status/:userId', statusReadLimiter, asyncHandler(async (req, res) => {
        await authController.getUserStatus(req, res);
    }));

    /**
     * GET /api/user-lastseen/:userId
     * Get user last seen timestamp
     */
    router.get('/api/user-lastseen/:userId', statusReadLimiter, asyncHandler(async (req, res) => {
        await authController.getUserLastSeen(req, res);
    }));

    /**
     * POST /api/users-online-status
     * Bulk get online status for multiple users
     */
    router.post('/api/users-online-status', bulkStatusLimiter || statusReadLimiter, asyncHandler(async (req, res) => {
        await authController.getUsersOnlineStatus(req, res);
    }));

    /**
     * POST /api/user-offline
     * Set user offline
     */
    router.post('/api/user-offline', statusWriteLimiter, asyncHandler(async (req, res) => {
        await authController.updateUserOffline(req, res);
    }));

    /**
     * POST /api/user-online (deprecated)
     * Endpoint removed in favor of /api/presence/heartbeat
     */
    router.post('/api/user-online', statusWriteLimiter, asyncHandler(async (req, res) => {
        console.warn('⚠️  Deprecated endpoint /api/user-online invoked');
        res.status(410).json({
            success: false,
            error: 'DEPRECATED_ENDPOINT',
            message: '/api/user-online has been removed. Use /api/presence/heartbeat instead.',
            deprecatedEndpoint: true,
            replacement: '/api/presence/heartbeat'
        });
    }));

    /**
     * POST /api/presence/heartbeat
     * Redis-backed heartbeat endpoint (session required)
     */
    router.post(
        '/api/presence/heartbeat',
        enforceHeartbeatAuth,
        presenceHeartbeatLimiter,
        asyncHandler(async (req, res) => {
            await authController.handlePresenceHeartbeat(req, res);
        })
    );

    /**
     * POST /api/user-logout
     * Handle user logout for real-time status updates
     */
    router.post('/api/user-logout', statusWriteLimiter, asyncHandler(async (req, res) => {
        await authController.handleUserLogout(req, res);
    }));

    /**
    */

    return router;
}

module.exports = createStatusRoutes;


