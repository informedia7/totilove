/**
 * Validation Routes
 * Handles validation endpoints for email and username availability
 * 
 * Routes:
 * - GET /api/check-email - Check if email is available
 * - GET /api/check-real_name - Check if real_name is available (deprecated)
 */

const express = require('express');
const router = express.Router();
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { validationLimiter } = require('../middleware/rateLimiter');
const { requestLogger } = require('../middleware/requestLogger');
const { isValidEmail } = require('../middleware/validationMiddleware');

/**
 * Create validation routes
 * @param {Object} db - Database connection object
 * @returns {express.Router} Express router
 */
function createValidationRoutes(db) {
    if (!db) {
        throw new Error('Database connection is required for validation routes');
    }

    // Apply rate limiting and logging to all routes
    router.use(validationLimiter);
    router.use(requestLogger);

    /**
     * GET /api/check-email
     * Check if email is available for registration
     * Query params: email (required)
     */
    router.get('/api/check-email', asyncHandler(async (req, res) => {
        const { email } = req.query;

        if (!email) {
            throw new ApiError(400, 'Email parameter is required', {
                field: 'email',
                message: 'email is required'
            });
        }

        // Validate email format
        if (!isValidEmail(email)) {
            throw new ApiError(400, 'Invalid email format', {
                field: 'email',
                message: 'email must be a valid email address'
            });
        }

        try {
            // Check if email exists in database
            const result = await db.query(
                'SELECT id FROM users WHERE email = $1',
                [email.toLowerCase().trim()]
            );

            const isAvailable = result.rows.length === 0;

            res.json({
                success: true,
                available: isAvailable,
                email: email
            });
        } catch (error) {
            console.error('[ValidationRoutes] Error checking email:', error);
            throw new ApiError(500, 'Failed to check email availability');
        }
    }));

    /**
     * GET /api/check-real_name
     * Check if real_name is available (deprecated - real names don't need to be unique)
     * Query params: real_name (optional)
     * 
     * Note: This endpoint is kept for backward compatibility.
     * Real names do not need to be unique, so it always returns available.
     */
    router.get('/api/check-real_name', asyncHandler(async (req, res) => {
        const { real_name } = req.query;

        // Note: real_name doesn't need uniqueness checking, so this endpoint is deprecated
        // Keeping for backward compatibility but always returns available
        res.json({
            success: true,
            available: true,
            real_name: real_name || '',
            message: 'Real names do not need to be unique'
        });
    }));

    return router;
}

module.exports = createValidationRoutes;





























