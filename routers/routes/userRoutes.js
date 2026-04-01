/**
 * User Routes
 * Handles user data endpoints
 * 
 * Routes:
 * - GET /api/user/:userId - Get user data
 * - GET /api/user/:userId/images - Get user images
 * - GET /api/users/:userId/profile - Get user profile
 * - GET /api/users/:userId/profile-completion - Get profile completion %
 * - GET /api/online-users - Get online users list
 */

const express = require('express');
const router = express.Router();
const { apiLimiter, accountLimiter } = require('../middleware/rateLimiter');
const { requestLogger } = require('../middleware/requestLogger');
const { optionalAuth } = require('../middleware/authMiddleware');

/**
 * Create user routes
 * @param {Object} authController - AuthController instance
 * @param {Object} templateController - TemplateController instance (for profile completion)
 * @param {Object} authMiddleware - AuthMiddleware instance (optional)
 * @returns {express.Router} Express router
 */
function createUserRoutes(authController, templateController = null, authMiddleware = null) {
    if (!authController) {
        throw new Error('AuthController is required for user routes');
    }

    // Apply rate limiting and logging to all routes
    router.use(accountLimiter || apiLimiter);
    router.use(requestLogger);

    // Apply optional auth (some endpoints may need it)
    if (authMiddleware) {
        router.use(optionalAuth(authMiddleware));
    }

    /**
     * GET /api/user/:userId - Get user data
     */
    router.get('/api/user/:userId', async (req, res) => {
        const { userId } = req.params;
        const { public: isPublic } = req.query;
        
        try {
            const result = await authController.db.query(`
                SELECT u.id, u.real_name, u.email, u.birthdate, u.gender, 
                       u.country_id, u.state_id, u.city_id, u.date_joined, u.last_login,
                       COALESCE(u.email_verified, false) as email_verified,
                       c.name as country_name, s.name as state_name, ci.name as city_name
                FROM users u
                LEFT JOIN country c ON u.country_id = c.id
                LEFT JOIN state s ON u.state_id = s.id
                LEFT JOIN city ci ON u.city_id = ci.id
                WHERE u.id = $1
            `, [userId]);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const user = result.rows[0];
            
            // If public profile, remove sensitive data
            if (isPublic === '1') {
                delete user.email;
                delete user.last_login;
            }

            res.json({
                success: true,
                user: user
            });
        } catch (error) {
            console.error('[UserRoutes] Error getting user data:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get user data'
            });
        }
    });

    /**
     * GET /api/user/:userId/images - Get user images
     */
    router.get('/api/user/:userId/images', async (req, res) => {
        const { userId } = req.params;
        
        if (!userId || isNaN(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID'
            });
        }
        
        try {
            const result = await authController.db.query(`
                SELECT id, file_name, is_profile, featured, uploaded_at, thumbnail_path
                FROM user_images 
                WHERE user_id = $1 
                ORDER BY is_profile DESC, featured DESC, uploaded_at DESC
            `, [userId]);

            const images = result.rows.map(row => ({
                id: row.id,
                file_name: row.file_name,
                is_profile: row.is_profile === true || row.is_profile === 1 || row.is_profile === '1' || row.is_profile === 'true',
                featured: row.featured === true || row.featured === 1 || row.featured === '1' || row.featured === 'true',
                uploaded_at: row.uploaded_at,
                thumbnail_path: row.thumbnail_path || null
            }));

            res.json({
                success: true,
                images: images
            });
        } catch (error) {
            console.error('[UserRoutes] Error getting user images:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get user images'
            });
        }
    });

    /**
     * GET /api/users/:userId/profile - Get user profile
     */
    router.get('/api/users/:userId/profile', async (req, res) => {
        try {
            await authController.getUserProfile(req, res);
        } catch (error) {
            console.error('[UserRoutes] Error in getUserProfile:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get user profile'
            });
        }
    });

    /**
     * GET /api/users/:userId/profile-completion - Get profile completion %
     */
    router.get('/api/users/:userId/profile-completion', async (req, res) => {
        try {
            const userId = parseInt(req.params.userId);
            
            if (!templateController) {
                return res.status(500).json({
                    success: false,
                    error: 'Template controller not available'
                });
            }

            // Use templateController to calculate profile completion
            const completionResult = await templateController.calculateProfileCompletion(userId);
            const hasCompletionObject = completionResult && typeof completionResult === 'object';
            const percentage = typeof completionResult === 'number'
                ? completionResult
                : (hasCompletionObject && typeof completionResult.percentage === 'number' ? completionResult.percentage : 0);
            const details = hasCompletionObject && completionResult.details ? completionResult.details : {};
            
            res.json({
                success: true,
                userId: userId,
                percentage,
                completion: percentage,
                details
            });
        } catch (error) {
            console.error('[UserRoutes] Error getting profile completion:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get profile completion'
            });
        }
    });

    /**
     * GET /api/online-users - Get online users list
     */
    router.get('/api/online-users', async (req, res) => {
        try {
            // Query users who were active in the last 10 minutes
            const result = await authController.db.query(`
                SELECT id, real_name, last_login 
                FROM users 
                WHERE last_login > NOW() - INTERVAL '10 minutes'
                ORDER BY last_login DESC
            `);

            res.json({
                success: true,
                onlineUsers: result.rows,
                count: result.rows.length
            });
        } catch (error) {
            console.error('[UserRoutes] Error getting online users:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get online users'
            });
        }
    });

    return router;
}

module.exports = createUserRoutes;

