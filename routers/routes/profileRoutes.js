/**
 * Profile Routes
 * Handles profile update endpoints
 * 
 * Routes:
 * - POST /api/profile/update - Update user profile
 */

const express = require('express');
const router = express.Router();
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { apiLimiter } = require('../middleware/rateLimiter');
const { requestLogger } = require('../middleware/requestLogger');
const { requireAuth } = require('../middleware/authMiddleware');

/**
 * Create profile routes
 * @param {Object} authController - AuthController instance
 * @param {Object} authMiddleware - AuthMiddleware instance
 * @param {Object} io - Socket.IO instance (optional)
 * @param {Object} redis - Redis instance (optional)
 * @returns {express.Router} Express router
 */
function createProfileRoutes(authController, authMiddleware, io = null, redis = null) {
    if (!authController) {
        throw new Error('AuthController is required for profile routes');
    }

    // Apply rate limiting specifically to /api/profile endpoints
    router.use('/api/profile', apiLimiter);
    router.use(requestLogger);

    // Require authentication
    if (authMiddleware) {
        router.use(requireAuth(authMiddleware));
    }

    /**
     * POST /api/profile/update - Update user profile
     * Note: The actual implementation is in authController.updateProfile method
     * This route delegates to the controller for better separation of concerns
     */
    router.post('/api/profile/update', asyncHandler(async (req, res) => {
        // Delegate to controller method if it exists
        if (authController.updateProfile) {
            await authController.updateProfile(req, res);
        } else {
            throw new ApiError(500, 'Profile update functionality not available');
        }
    }));

    return router;
}

module.exports = createProfileRoutes;



