/**
 * Controllers Configuration Module
 * Initializes all application controllers
 */

const AuthController = require('../../database/controllers/authController');
const MessageController = require('../../database/controllers/messageController');
const TemplateController = require('../../controllers/templateController');
const SearchController = require('../../controllers/searchController');
const ActivityController = require('../../controllers/activityController');
const MatchesController = require('../../database/controllers/matchesController');

/**
 * Setup all application controllers
 * @param {Object} db - Database pool instance
 * @param {Object} redis - Redis client instance (can be null)
 * @param {Object} authMiddleware - Auth middleware instance
 * @param {Object} sessionTracker - Session tracker instance
 * @param {Object} messageService - Message service instance
 * @param {Object} io - Socket.IO instance
 * @returns {Object} Controllers object with all initialized controllers
 */
function setupControllers(
    db,
    redis,
    authMiddleware,
    sessionTracker = null,
    messageService,
    io,
    presenceService = null
) {
    const authController = new AuthController(db, authMiddleware, sessionTracker, presenceService);
    const messageController = new MessageController(db, messageService, io, presenceService);
    const templateController = new TemplateController(db);
    const searchController = new SearchController();
    const activityController = new ActivityController(db, presenceService);
    const matchesController = new MatchesController(db, redis || null);

    return {
        authController,
        messageController,
        templateController,
        searchController,
        activityController,
        matchesController
    };
}

module.exports = { setupControllers };







