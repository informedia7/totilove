/**
 * Search API Routes
 * Handles search-related endpoints
 */

/**
 * Setup search-related routes
 * @param {Object} app - Express application instance
 * @param {Object} searchController - Search controller instance
 */
function setupSearchRoutes(app, searchController) {
    app.get('/api/search', (req, res) => {
        searchController.searchUsers(req, res);
    });
    app.get('/api/search/filters', (req, res) => {
        searchController.getSearchFilters(req, res);
    });
}

module.exports = { setupSearchRoutes };







