/**
 * Main Routes Aggregator
 * Imports and mounts all route modules
 */

const { createUserStatusRateLimit } = require('./middleware');
const { setupAuthRoutes } = require('./api/auth');
const { setupUserRoutes } = require('./api/users');
const { setupActivityRoutes } = require('./api/activity');
const { setupSearchRoutes } = require('./api/search');
const { setupMonitoringRoutes } = require('./api/monitoring');
const { setupImageRoutes } = require('./images');

// Route modules
const AuthRoutes = require('../../routers/authRoutes');
const MessageRoutes = require('../../routers/messageRoutes');
const TemplateRoutes = require('../../routers/templateRoutes');
const MatchesRoutes = require('../../routers/matchesRoutes');

/**
 * Setup all routes
 * @param {Object} app - Express application instance
 * @param {Object} dependencies - All dependencies needed for routes
 */
function setupRoutes(app, dependencies) {
    const {
        csrfMiddleware,
        activityTracker,
        authMiddleware,
        controllers,
        db,
        redis,
        io,
        monitoringUtils,
        blockRateLimiter
    } = dependencies;
    
    // Add CSRF validation middleware (must be before routes that need protection)
    app.use(csrfMiddleware.validate());
    
    // Add activity tracking middleware to all routes
    app.use(activityTracker.trackActivity());
    
    // Add heartbeat endpoint for activity tracking
    app.post('/api/heartbeat', activityTracker.heartbeat.bind(activityTracker));
    
    // Apply rate limiting to user status endpoints
    const rateLimitMiddleware = createUserStatusRateLimit();
    app.use('/api/user-status', rateLimitMiddleware);
    
    // Setup route modules
    const authRoutes = new AuthRoutes(controllers.authController, controllers.templateController, authMiddleware, io, redis);
    const messageRoutes = new MessageRoutes(controllers.messageController, authMiddleware);
    const templateRoutes = new TemplateRoutes(controllers.templateController, authMiddleware);
    const matchesRoutes = new MatchesRoutes(controllers.matchesController, authMiddleware);

    // Admin routes (no authentication required for demo purposes)
    const adminRoutes = require('../../admin/routes/adminRoutes');

    // Mount routes
    app.use('/', authRoutes.getRouter());
    app.use('/api/messages', messageRoutes.getRouter());
    app.use('/api/matches', matchesRoutes.getRouter());
    app.use('/api/stats', matchesRoutes.setupStatsRoutes());
    app.use('/admin', adminRoutes);
    
    // Setup API routes
    setupAuthRoutes(app, authMiddleware, csrfMiddleware);
    setupUserRoutes(app, db, redis, io, blockRateLimiter);
    setupActivityRoutes(app, controllers.activityController);
    setupSearchRoutes(app, controllers.searchController);
    setupMonitoringRoutes(app, monitoringUtils);
    setupImageRoutes(app);
    
    // Template routes
    app.use('/', templateRoutes.getRouter());
    
    // CSS Comparison Tool - serve from root directory
    app.get('/css-comparison-tool.html', (req, res) => {
        const fs = require('fs');
        const path = require('path');
        const toolPath = path.join(__dirname, '../../css-comparison-tool.html');
        if (fs.existsSync(toolPath)) {
            res.sendFile(toolPath);
        } else {
            res.status(404).send('<h1>CSS Comparison Tool not found</h1>');
        }
    });
    
    // CSS Test Dashboard - serve from root directory
    app.get('/css-test-dashboard.html', (req, res) => {
        const fs = require('fs');
        const path = require('path');
        const toolPath = path.join(__dirname, '../../css-test-dashboard.html');
        if (fs.existsSync(toolPath)) {
            res.sendFile(toolPath);
        } else {
            res.status(404).send('<h1>CSS Test Dashboard not found</h1>');
        }
    });
}

module.exports = { setupRoutes };







