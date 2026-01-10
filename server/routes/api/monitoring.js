/**
 * Monitoring API Routes
 * Handles health check and metrics endpoints
 */

/**
 * Setup monitoring-related routes
 * @param {Object} app - Express application instance
 * @param {Object} monitoringUtils - Monitoring utilities instance
 */
function setupMonitoringRoutes(app, monitoringUtils) {
    // Monitoring endpoints
    app.get('/health', (req, res) => {
        res.json(monitoringUtils.getMetrics());
    });

    app.get('/metrics', (req, res) => {
        res.json(monitoringUtils.getMetrics());
    });
}

module.exports = { setupMonitoringRoutes };







