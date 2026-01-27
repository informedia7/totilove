/**
 * Location Routes
 * Handles countries, states, and cities endpoints
 * 
 * Routes:
 * - GET /api/countries - Get all countries
 * - GET /api/states - Get states/provinces for a country
 * - GET /api/cities - Get cities for a state
 */

const express = require('express');
const router = express.Router();
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { validate } = require('../middleware/validationMiddleware');
const { lookupLimiter } = require('../middleware/rateLimiter');
const { requestLogger } = require('../middleware/requestLogger');

/**
 * Create location routes
 * @param {Object} db - Database connection object
 * @returns {express.Router} Express router
 */
function createLocationRoutes(db) {
    if (!db) {
        throw new Error('Database connection is required for location routes');
    }

    // Apply lenient rate limiting for read-only lookup endpoints
    router.use(lookupLimiter);
    router.use(requestLogger);

    /**
     * GET /api/countries
     * Get all countries
     */
    router.get('/api/countries', asyncHandler(async (req, res) => {
        try {
            const result = await db.query(
                'SELECT id, name, emoji FROM country ORDER BY name ASC'
            );

            res.json({
                success: true,
                countries: result.rows,
                count: result.rows.length
            });
        } catch (error) {
            console.error('[LocationRoutes] Error fetching countries:', error);
            throw new ApiError(500, 'Failed to fetch countries');
        }
    }));

    /**
     * GET /api/states
     * Get states/provinces for a country
     * Query params: country_id (required)
     */
    router.get('/api/states', asyncHandler(async (req, res) => {
        const { country_id } = req.query;

        if (!country_id) {
            throw new ApiError(400, 'Country ID parameter is required', {
                field: 'country_id',
                message: 'country_id is required'
            });
        }

        // Validate country_id is a number
        const countryIdNum = parseInt(country_id);
        if (isNaN(countryIdNum) || countryIdNum <= 0) {
            throw new ApiError(400, 'Invalid country ID', {
                field: 'country_id',
                message: 'country_id must be a positive number'
            });
        }

        try {
            const result = await db.query(
                'SELECT id, name FROM state WHERE country_id = $1 ORDER BY name',
                [countryIdNum]
            );

            res.json({
                success: true,
                states: result.rows,
                country_id: countryIdNum,
                count: result.rows.length
            });
        } catch (error) {
            console.error('[LocationRoutes] Error fetching states:', error);
            throw new ApiError(500, 'Failed to fetch states');
        }
    }));

    /**
     * GET /api/cities
     * Get cities for a state
     * Query params: state_id (required)
     */
    router.get('/api/cities', asyncHandler(async (req, res) => {
        const { state_id } = req.query;

        if (!state_id) {
            throw new ApiError(400, 'State ID parameter is required', {
                field: 'state_id',
                message: 'state_id is required'
            });
        }

        // Validate state_id is a number
        const stateIdNum = parseInt(state_id);
        if (isNaN(stateIdNum) || stateIdNum <= 0) {
            throw new ApiError(400, 'Invalid state ID', {
                field: 'state_id',
                message: 'state_id must be a positive number'
            });
        }

        try {
            const result = await db.query(
                'SELECT id, name FROM city WHERE state_id = $1 ORDER BY name',
                [stateIdNum]
            );

            res.json({
                success: true,
                cities: result.rows,
                state_id: stateIdNum,
                count: result.rows.length
            });
        } catch (error) {
            console.error('[LocationRoutes] Error fetching cities:', error);
            throw new ApiError(500, 'Failed to fetch cities');
        }
    }));

    return router;
}

module.exports = createLocationRoutes;

