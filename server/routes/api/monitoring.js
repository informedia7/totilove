/**
 * Monitoring API Routes
 * Handles health check and metrics endpoints
 */

/**
 * Setup monitoring-related routes
 * @param {Object} app - Express application instance
 * @param {Object} monitoringUtils - Monitoring utilities instance
 * @param {{ db?: object, redis?: object|null }} [deps]
 */
function setupMonitoringRoutes(app, monitoringUtils, deps = {}) {
    const { db, redis } = deps;

    app.get('/live', (req, res) => {
        res.status(200).json({
            status: 'live',
            uptime: process.uptime(),
            pid: process.pid
        });
    });

    app.get('/healthz', async (req, res) => {
        const checks = {};

        try {
            if (db && typeof db.query === 'function') {
                await db.query('SELECT 1 AS ok');
                checks.database = 'ok';
            } else {
                checks.database = 'skipped';
            }
        } catch (err) {
            checks.database = 'fail';
            return res.status(503).json({
                status: 'unhealthy',
                checks,
                error: err.message
            });
        }

        try {
            if (redis && typeof redis.ping === 'function') {
                await redis.ping();
                checks.redis = 'ok';
            } else {
                checks.redis = 'skipped';
            }
        } catch (err) {
            checks.redis = 'fail';
            return res.status(503).json({
                status: 'unhealthy',
                checks,
                error: err.message
            });
        }

        res.status(200).json({
            status: 'healthy',
            checks
        });
    });

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







