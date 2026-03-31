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

function loadOptionalModule(modulePath, label) {
    try {
        return require(modulePath);
    } catch (error) {
        console.warn(`⚠️ Optional ${label} unavailable, skipping legacy route mount`);
        return null;
    }
}

// Route modules
const AuthRoutes = loadOptionalModule('../../routers/authRoutes', 'AuthRoutes');
const MessageRoutes = loadOptionalModule('../../routers/messageRoutes', 'MessageRoutes');
const TemplateRoutes = loadOptionalModule('../../routers/templateRoutes', 'TemplateRoutes');
const MatchesRoutes = loadOptionalModule('../../routers/matchesRoutes', 'MatchesRoutes');
const adminRoutes = loadOptionalModule('../../admin/routes/adminRoutes', 'adminRoutes');

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
    
    // Redirect expired sessions for full page refreshes before any HTML route logic runs
    if (authMiddleware?.sessions) {
        app.use(createSessionExpiryRedirect(authMiddleware));
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
    const authRoutes = AuthRoutes
        ? new AuthRoutes(controllers.authController, controllers.templateController, authMiddleware, io, redis)
        : null;
    const messageRoutes = MessageRoutes
        ? new MessageRoutes(controllers.messageController, authMiddleware)
        : null;
    const templateRoutes = TemplateRoutes
        ? new TemplateRoutes(controllers.templateController, authMiddleware)
        : null;
    const matchesRoutes = MatchesRoutes
        ? new MatchesRoutes(controllers.matchesController, authMiddleware)
        : null;

    // Mount routes - ORDER MATTERS!
    // Mount message routes BEFORE authRoutes to ensure messageCountLimiter is applied first
    if (messageRoutes?.getRouter) {
        app.use('/api/messages', messageRoutes.getRouter());
    }
    
    // Mount authRoutes (which includes accountRoutes with apiLimiter)
    if (authRoutes?.getRouter) {
        app.use('/', authRoutes.getRouter());
    }
    
    // Mount other routes
    if (matchesRoutes?.getRouter) {
        app.use('/api/matches', matchesRoutes.getRouter());
    }
    if (matchesRoutes?.setupStatsRoutes) {
        app.use('/api/stats', matchesRoutes.setupStatsRoutes());
    }
    if (adminRoutes) {
        app.use('/admin', adminRoutes);
    }
    setupSearchRoutes(app, controllers.searchController);
    setupMonitoringRoutes(app, monitoringUtils);
    setupStateRoutes(app, { stateService, authMiddleware });
    setupPresenceRoutes(app, { presenceService, authMiddleware, monitoringUtils });
    setupImageRoutes(app);
    
    // Template routes
    if (templateRoutes?.getRouter) {
        app.use('/', templateRoutes.getRouter());
    }
    
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

    // Health fallback endpoints for deployment platforms probing '/'.
    // If legacy page routers are unavailable, this still keeps the service healthy.
    app.get('/healthz', (req, res) => {
        res.status(200).json({ success: true, status: 'ok' });
    });

    app.get('/', (req, res) => {
        res.status(200).json({ success: true, status: 'ok' });
    });
}

function createSessionExpiryRedirect(authMiddleware) {
    const publicPaths = new Set([
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







