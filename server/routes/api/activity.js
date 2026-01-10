/**
 * Activity API Routes
 * Handles activity-related endpoints (favorites, likes, viewers, etc.)
 */

/**
 * Setup activity-related routes
 * @param {Object} app - Express application instance
 * @param {Object} activityController - Activity controller instance
 */
function setupActivityRoutes(app, activityController) {
    // Activity routes
    app.get('/api/activity/viewers', (req, res) => {
        activityController.getViewers(req, res);
    });
    app.get('/api/activity/favorites', (req, res) => {
        activityController.getFavorites(req, res);
    });
    app.get('/api/activity/messages', (req, res) => {
        activityController.getMessages(req, res);
    });
    app.get('/api/activity/likes', (req, res) => {
        activityController.getLikes(req, res);
    });
    app.get('/api/activity/who-liked-me', (req, res) => {
        activityController.getWhoLikedMe(req, res);
    });
    app.get('/api/activity/who-i-like', (req, res) => {
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







