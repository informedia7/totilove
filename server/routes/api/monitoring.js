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

    app.post('/metrics/presence-client', (req, res) => {
        if (!monitoringUtils || typeof monitoringUtils.recordClientPresenceSamples !== 'function') {
            return res.status(503).json({
                success: false,
                error: 'Monitoring unavailable'
            });
        }

        const samples = req.body?.samples;
        if (!Array.isArray(samples) || samples.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'samples array required'
            });
        }

        const metadata = req.body?.metadata || {};
        monitoringUtils.recordClientPresenceSamples(samples, metadata, { ip: req.ip });
        res.status(202).json({ success: true });
    });
}

module.exports = { setupMonitoringRoutes };







