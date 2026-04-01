/**
 * Activity API Routes
 * Handles activity-related endpoints (favorites, likes, viewers, etc.)
 */

const { activityLimiter } = require('../../../routers/middleware/rateLimiter');

/**
 * Setup activity-related routes
 * @param {Object} app - Express application instance
 * @param {Object} activityController - Activity controller instance
 */
function setupActivityRoutes(app, activityController) {
    // Activity routes with rate limiting applied per route
    // Apply activity rate limiter to each GET endpoint individually to ensure proper order
    app.get('/api/activity/viewers', activityLimiter, (req, res) => {
        activityController.getViewers(req, res);
    });
    app.get('/api/activity/favorites', activityLimiter, (req, res) => {
        activityController.getFavorites(req, res);
    });
    app.get('/api/activity/messages', activityLimiter, (req, res) => {
        activityController.getMessages(req, res);
    });
    app.get('/api/activity/likes', activityLimiter, (req, res) => {
        activityController.getLikes(req, res);
    });
    app.get('/api/activity/who-liked-me', activityLimiter, (req, res) => {
        activityController.getWhoLikedMe(req, res);
    });
    app.get('/api/activity/who-i-like', activityLimiter, (req, res) => {
        activityController.getWhoILike(req, res);
    });
    app.post('/api/favorites', (req, res) => {
        activityController.addFavorite(req, res);
    });
    app.delete('/api/favorites/:userId', (req, res) => {
        activityController.removeFavorite(req, res);
    });
    app.post('/api/likes', (req, res) => {
        activityController.addLike(req, res);
    });
    app.delete('/api/likes/:userId', (req, res) => {
        activityController.removeLike(req, res);
    });
    app.post('/api/like-user', (req, res) => {
        activityController.addLike(req, res);
    });
    app.post('/api/reports', (req, res) => {
        activityController.reportUser(req, res);
    });
}

module.exports = { setupActivityRoutes };







