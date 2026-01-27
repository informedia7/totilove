/**
 * Language Routes
 * Handles user language management endpoints
 * 
 * Routes:
 * - GET /api/profile/languages - Get user languages
 * - POST /api/profile/languages - Update user languages
 */

const express = require('express');
const router = express.Router();
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { lookupLimiter, apiLimiter } = require('../middleware/rateLimiter');
const { requestLogger } = require('../middleware/requestLogger');
const { requireAuth } = require('../middleware/authMiddleware');

/**
 * Create language routes
 * @param {Object} db - Database connection object
 * @param {Object} authMiddleware - AuthMiddleware instance
 * @returns {express.Router} Express router
 */
function createLanguageRoutes(db, authMiddleware) {
    if (!db) {
        throw new Error('Database connection is required for language routes');
    }

    // Apply logging to all routes
    router.use(requestLogger);

    // Require authentication for all language routes
    if (authMiddleware) {
        router.use(requireAuth(authMiddleware));
    }

    /**
     * GET /api/profile/languages
     * Get user languages
     * Query params: userId (optional, defaults to authenticated user)
     * Uses lenient rate limiter for read-only lookups
     */
    router.get('/api/profile/languages', lookupLimiter, asyncHandler(async (req, res) => {
        const { userId } = req.query;
        const authenticatedUserId = req.user?.id || req.userId;
        const userIdToQuery = userId || authenticatedUserId;

        if (!userIdToQuery) {
            throw new ApiError(400, 'User ID is required', {
                field: 'userId',
                message: 'userId is required'
            });
        }

        try {
            // Get user's languages
            const result = await db.query(`
                SELECT 
                    ul.id,
                    ul.user_id,
                    ul.language_id,
                    ul.fluency_level_id,
                    ul.is_primary,
                    ul.can_read,
                    ul.can_write,
                    ul.can_speak,
                    ul.can_understand,
                    ul.created_at,
                    ul.updated_at,
                    l.name as language_name,
                    l.native_name,
                    l.iso_code,
                    fl.name as fluency_level_name
                FROM user_languages ul
                INNER JOIN languages l ON ul.language_id = l.id
                LEFT JOIN user_language_fluency_levels fl ON ul.fluency_level_id = fl.id
                WHERE ul.user_id = $1
                AND l.is_active = true
                ORDER BY ul.is_primary DESC, l.name ASC
            `, [userIdToQuery]);

            res.json({
                success: true,
                languages: result.rows
            });
        } catch (error) {
            console.error('[LanguageRoutes] Error getting user languages:', error);
            throw new ApiError(500, 'Failed to get user languages');
        }
    }));

    /**
     * POST /api/profile/languages
     * Update user languages
     * Body: { userId?: number, languages: Array }
     * Uses standard API rate limiter for write operations
     */
    router.post('/api/profile/languages', apiLimiter, asyncHandler(async (req, res) => {
        const { userId, languages } = req.body;
        const authenticatedUserId = req.user?.id || req.userId;
        const userIdToUpdate = userId || authenticatedUserId;

        if (!userIdToUpdate) {
            throw new ApiError(400, 'User ID is required', {
                field: 'userId',
                message: 'userId is required'
            });
        }

        if (!Array.isArray(languages)) {
            throw new ApiError(400, 'Languages must be an array', {
                field: 'languages',
                message: 'languages must be an array'
            });
        }

        try {
            // Start transaction
            await db.query('BEGIN');

            // Delete existing languages for user
            await db.query('DELETE FROM user_languages WHERE user_id = $1', [userIdToUpdate]);

            // Insert new languages
            if (languages.length > 0) {
                for (const lang of languages) {
                    const {
                        language_id,
                        fluency_level_id,
                        is_primary = false,
                        can_read = false,
                        can_write = false,
                        can_speak = false,
                        can_understand = false
                    } = lang;

                    if (!language_id) {
                        await db.query('ROLLBACK');
                        throw new ApiError(400, 'language_id is required for each language');
                    }

                    await db.query(`
                        INSERT INTO user_languages 
                        (user_id, language_id, fluency_level_id, is_primary, can_read, can_write, can_speak, can_understand)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [
                        userIdToUpdate,
                        language_id,
                        fluency_level_id || null,
                        is_primary,
                        can_read,
                        can_write,
                        can_speak,
                        can_understand
                    ]);
                }
            }

            // Commit transaction
            await db.query('COMMIT');

            res.json({
                success: true,
                message: 'Languages updated successfully',
                userId: userIdToUpdate,
                languagesCount: languages.length
            });
        } catch (error) {
            // Rollback on error
            try {
                await db.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('[LanguageRoutes] Error rolling back transaction:', rollbackError);
            }

            if (error instanceof ApiError) {
                throw error;
            }

            console.error('[LanguageRoutes] Error updating user languages:', error);
            throw new ApiError(500, 'Failed to update user languages');
        }
    }));

    return router;
}

module.exports = createLanguageRoutes;




















