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
    
    // Diagnostic callback route for troubleshooting
    app.get('/status', (req, res) => {
        res.json({
            status: 'running',
            app: 'Totilove Dating Platform',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            database: db ? 'connected' : 'not initialized',
            redis: redis ? 'available' : 'not initialized'
        });
    });
    
    // Add CSRF validation middleware (must be before routes that need protection)
    app.use(csrfMiddleware.validate());

    // Attach optional auth early so downstream middleware can read req.user when a session exists
    if (authMiddleware?.optionalAuth) {
        app.use(authMiddleware.optionalAuth.bind(authMiddleware));
    }
    
    // Redirect unauthenticated or expired sessions for full page refreshes before any HTML route logic runs
    if (authMiddleware?.sessions) {
        app.use(createDocumentAuthRedirect(authMiddleware));
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

    // Admin routes are optional in this runtime; don't block core app startup if missing.
    let adminRoutes = null;
    try {
        adminRoutes = require('../../admin/routes/adminRoutes');
    } catch (error) {
        console.warn('[Routes] Admin routes not mounted:', error.message);
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

    // Secure uploads-export endpoint (for admin-server to proxy-download)
    app.get('/uploads-export', (req, res) => {
        const archiver = require('archiver');
        const secret = process.env.EXPORT_SECRET;

        if (!secret) {
            return res.status(503).json({ error: 'EXPORT_SECRET not configured on this service' });
        }

        const provided = req.query.secret || req.headers['x-export-secret'];
        if (!provided || provided !== secret) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const uploadsRoot = process.env.UPLOADS_PATH
            ? require('path').resolve(process.env.UPLOADS_PATH)
            : require('path').join(__dirname, '..', '..', 'app', 'uploads');

        if (!require('fs').existsSync(uploadsRoot)) {
            return res.status(404).json({ error: `Uploads path does not exist: ${uploadsRoot}` });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `uploads_export_${timestamp}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.on('error', (err) => {
            console.error('[uploads-export] Archive error:', err);
            if (!res.headersSent) res.status(500).end();
        });
        archive.pipe(res);
        archive.directory(uploadsRoot, 'uploads');
        archive.finalize();
    });

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

function createDocumentAuthRedirect(authMiddleware) {
    const publicPaths = new Set([
        '/login',
        '/register',
        '/logout'
    ]);

    const protectedExactPaths = new Map([
        ['/billing', 'billing'],
        ['/billing.html', 'billing'],
        ['/profile-full', 'your profile'],
        ['/profile-edit', 'your profile'],
        ['/profile-photos', 'your profile photos'],
        ['/search', 'search'],
        ['/results', 'results'],
        ['/activity', 'activity'],
        ['/settings', 'settings'],
        ['/account', 'account'],
        ['/matches', 'matches'],
        ['/matches.html', 'matches'],
        ['/talk', 'chat']
    ]);

    const protectedPrefixes = [
        '/profile/'
    ];

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

    const getProtectedPageLabel = (path) => {
        if (protectedExactPaths.has(path)) {
            return protectedExactPaths.get(path);
        }

        if (protectedPrefixes.some(prefix => path.startsWith(prefix))) {
            return 'this page';
        }

        return null;
    };

    return function documentAuthRedirect(req, res, next) {
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

        const protectedPageLabel = getProtectedPageLabel(path);
        if (!protectedPageLabel) {
            return next();
        }

        const sessionToken = getSessionToken(req);

        if (!sessionToken) {
            const message = encodeURIComponent(`Please log in to access ${protectedPageLabel}`);
            const returnTo = encodeURIComponent(req.originalUrl || req.url || '/');
            return res.redirect(302, `/login?message=${message}&return=${returnTo}`);
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







