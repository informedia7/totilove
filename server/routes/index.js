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
const { setupPresenceRoutes } = require('./api/presence');
const { setupStateRoutes } = require('./api/state');
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
        authMiddleware,
        controllers,
        db,
        redis,
        io,
        monitoringUtils,
        blockRateLimiter,
        presenceService,
        stateService
    } = dependencies;
    
    // Add CSRF validation middleware (must be before routes that need protection)
    app.use(csrfMiddleware.validate());

    // Attach optional auth early so downstream middleware can read req.user when a session exists
    if (authMiddleware?.optionalAuth) {
        app.use(authMiddleware.optionalAuth.bind(authMiddleware));
    }
    
    // Apply rate limiting to user status endpoints
    const rateLimitMiddleware = createUserStatusRateLimit();
    app.use('/api/user-status', rateLimitMiddleware);
    
    // Debug middleware to log all requests
    app.use((req, res, next) => {
        if (req.path.startsWith('/api/user')) {
            console.log(`[ROUTE DEBUG] ${req.method} ${req.path} - Route matching...`);
        }
        next();
    });
    
    // Setup API routes FIRST (before other route modules to ensure proper route matching)
    setupAuthRoutes(app, authMiddleware, csrfMiddleware);
    setupUserRoutes(app, db, redis, io, blockRateLimiter);
    
    // Setup activity routes BEFORE authRoutes to avoid rate limiting conflicts
    // Activity routes need their own lenient rate limiter
    setupActivityRoutes(app, controllers.activityController);
    
    // Log after setupUserRoutes to verify it was called
    console.log('[ROUTE DEBUG] setupUserRoutes completed');
    
    // Setup route modules
    const authRoutes = new AuthRoutes(controllers.authController, controllers.templateController, authMiddleware, io, redis);
    const messageRoutes = new MessageRoutes(controllers.messageController, authMiddleware);
    const templateRoutes = new TemplateRoutes(controllers.templateController, authMiddleware);
    const matchesRoutes = new MatchesRoutes(controllers.matchesController, authMiddleware);

    // Admin routes (optional, only present in legacy monorepo layout)
    let adminRoutes = null;
    try {
        adminRoutes = require('../../admin/routes/adminRoutes');
    } catch (error) {
        console.warn('[Routes] Admin routes not loaded:', error.message);
    }

    // Mount routes - ORDER MATTERS!
    // Mount message routes BEFORE authRoutes to ensure messageCountLimiter is applied first
    app.use('/api/messages', messageRoutes.getRouter());
    
    // Mount authRoutes (which includes accountRoutes with apiLimiter)
    app.use('/', authRoutes.getRouter());
    
    // Mount other routes
    app.use('/api/matches', matchesRoutes.getRouter());
    app.use('/api/stats', matchesRoutes.setupStatsRoutes());
    if (adminRoutes) {
        app.use('/admin', adminRoutes);
    }
    setupSearchRoutes(app, controllers.searchController);
    setupMonitoringRoutes(app, monitoringUtils);
    setupStateRoutes(app, { stateService, authMiddleware });
    setupPresenceRoutes(app, { presenceService, authMiddleware, monitoringUtils });
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







