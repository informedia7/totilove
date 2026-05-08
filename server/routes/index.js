/**
 * Main Routes Aggregator
 * Imports and mounts all route modules
 */

const { setupAuthRoutes } = require('./api/auth');
const {
    userStatusBurstLimiter,
    globalApiLimiter
} = require('../../routers/middleware/rateLimiter');
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

    app.locals.redis = redis || null;
    
    // Add CSRF validation middleware (must be before routes that need protection)
    app.use(csrfMiddleware.validate());

    // Attach optional auth early so downstream middleware can read req.user when a session exists
    if (authMiddleware?.optionalAuth) {
        app.use(authMiddleware.optionalAuth.bind(authMiddleware));
    }

    if (globalApiLimiter) {
        app.use('/api', globalApiLimiter);
    }
    
    // Redirect expired sessions for full page refreshes before any HTML route logic runs
    if (authMiddleware?.sessions) {
        app.use(createSessionExpiryRedirect(authMiddleware));
    }

    if (userStatusBurstLimiter) {
        app.use('/api/user-status', userStatusBurstLimiter);
    }
    
    if (process.env.NODE_ENV !== 'production') {
        app.use((req, res, next) => {
            if (req.path.startsWith('/api/user')) {
                console.log(`[ROUTE DEBUG] ${req.method} ${req.path} - Route matching...`);
            }
            next();
        });
    }
    
    // Setup API routes FIRST (before other route modules to ensure proper route matching)
    setupAuthRoutes(app, authMiddleware, csrfMiddleware);
    setupUserRoutes(app, db, redis, io, blockRateLimiter);
    
    // Setup activity routes BEFORE authRoutes to avoid rate limiting conflicts
    // Activity routes need their own lenient rate limiter
    setupActivityRoutes(app, controllers.activityController);
    
    if (process.env.NODE_ENV !== 'production') {
        console.log('[ROUTE DEBUG] setupUserRoutes completed');
    }
    
    // Setup route modules
    const authRoutes = new AuthRoutes(controllers.authController, controllers.templateController, authMiddleware, io, redis);
    const messageRoutes = new MessageRoutes(controllers.messageController, authMiddleware);
    const templateRoutes = new TemplateRoutes(controllers.templateController, authMiddleware);
    const matchesRoutes = new MatchesRoutes(controllers.matchesController, authMiddleware);

    // Admin routes (no authentication required for demo purposes)
    const adminRoutes = require('../../admin/routes/adminRoutes');

    // Mount routes - ORDER MATTERS!
    // Mount message routes BEFORE authRoutes to ensure messageCountLimiter is applied first
    app.use('/api/messages', messageRoutes.getRouter());
    
    // Mount authRoutes (which includes accountRoutes with apiLimiter)
    app.use('/', authRoutes.getRouter());
    
    // Mount other routes
    app.use('/api/matches', matchesRoutes.getRouter());
    app.use('/api/stats', matchesRoutes.setupStatsRoutes());
    app.use('/admin', adminRoutes);
    setupSearchRoutes(app, controllers.searchController);
    setupMonitoringRoutes(app, monitoringUtils, { db, redis });
    setupStateRoutes(app, { stateService, authMiddleware });
    setupPresenceRoutes(app, { presenceService, authMiddleware, monitoringUtils });
    setupImageRoutes(app);

    // Analytics event sink - accepts client-side analytics batches, no-op response
    app.post('/api/analytics/events', (req, res) => {
        res.json({ success: true });
    });
    
    // Template routes
    app.use('/', templateRoutes.getRouter());
    
    const devToolRoutesEnabled =
        process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_TOOL_ROUTES === 'true';
    if (devToolRoutesEnabled) {
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
}

function createSessionExpiryRedirect(authMiddleware) {
    const publicPaths = new Set([
        '/',
        '/index',
        '/index.html',
        '/login',
        '/register',
        '/logout'
    ]);

    const ignoredPrefixes = [
        '/api',
        '/assets',
        '/uploads',
        '/js',
        '/components',
        '/css',
        '/fonts',
        '/images',
        '/img',
        '/socket.io',
        '/admin'
    ];

    const getSessionToken = (req) => {
        return req.cookies?.sessionToken ||
            req.cookies?.session ||
            req.headers.authorization?.replace('Bearer ', '') ||
            req.headers['x-session-token'] ||
            req.query?.token;
    };

    return function expiredSessionRedirect(req, res, next) {
        if (req.method !== 'GET') {
            return next();
        }

        const path = req.path || '/';

        if (publicPaths.has(path) || ignoredPrefixes.some(prefix => path.startsWith(prefix))) {
            return next();
        }

        const accept = req.headers.accept || '';
        const fetchDest = req.headers['sec-fetch-dest'] || '';
        const fetchMode = req.headers['sec-fetch-mode'] || '';
        const isDocumentRequest = fetchDest === 'document' || fetchMode === 'navigate' || accept.includes('text/html');

        if (!isDocumentRequest) {
            return next();
        }

        const sessionToken = getSessionToken(req);

        if (!sessionToken) {
            return next();
        }

        const session = authMiddleware.sessions.get(sessionToken);

        if (session && session.expiresAt > Date.now()) {
            return next();
        }

        if (session) {
            authMiddleware.sessions.delete(sessionToken);
        }

        const message = encodeURIComponent('Your session has expired. Please log in again.');
        const returnTo = encodeURIComponent(req.originalUrl || req.url || '/');
        return res.redirect(302, `/login?message=${message}&return=${returnTo}`);
    };
}

module.exports = { setupRoutes };







