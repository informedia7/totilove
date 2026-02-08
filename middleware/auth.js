const config = require('../config/config');

class AuthMiddleware {
    constructor(sessions) {
        this.sessions = sessions;
    }

    validateSession(req, res, next) {
        // Cookie-based auth first (industry standard), then fallback to headers for backward compatibility
        const sessionToken = req.cookies?.sessionToken || 
                             req.cookies?.session ||
                             req.headers.authorization?.replace('Bearer ', '') ||
                             req.headers['x-session-token'];

        if (!sessionToken) {
            return res.status(401).json({ 
                success: false, 
                error: 'No session token provided (must be in cookie)' 
            });
        }

        const session = this.sessions.get(sessionToken);
        if (!session || session.expiresAt < Date.now()) {
            if (session) {
                this.sessions.delete(sessionToken);
            }
            return res.status(401).json({ 
                success: false, 
                error: 'Session expired or invalid' 
            });
        }

        // Extend session
        const sessionDuration = config.session?.duration || (2 * 60 * 60 * 1000);
        session.expiresAt = Date.now() + sessionDuration;
        
        req.session = session;
        req.user = session.user;
        next();
    }

    requireAuth(req, res, next) {
        if (!req.user) {
            return res.redirect('/login?message=' + encodeURIComponent('Please log in to access this page') + '&return=' + encodeURIComponent(req.originalUrl));
        }
        next();
    }

    generateSessionToken() {
        return require('crypto').randomBytes(32).toString('hex');
    }

    createSession(user) {
        const sessionToken = this.generateSessionToken();
        this.sessions.set(sessionToken, {
            user: { ...user },
            createdAt: Date.now(),
            expiresAt: Date.now() + (config.session?.duration || (2 * 60 * 60 * 1000))
        });
        return sessionToken;
    }

    destroySession(sessionToken) {
        if (this.sessions.has(sessionToken)) {
            this.sessions.delete(sessionToken);
        }
    }

    // Optional authentication middleware
    optionalAuth(req, res, next) {
        // Cookie-based auth first (industry standard)
        const sessionToken = req.cookies?.sessionToken || 
                             req.cookies?.session ||
                             req.headers.authorization?.replace('Bearer ', '') ||
                             req.headers['x-session-token'];

        if (sessionToken) {
            const session = this.sessions.get(sessionToken);
            if (session && session.expiresAt > Date.now()) {
                req.user = session.user;
                req.sessionToken = sessionToken;
            }
        }
        next();
    }



    // Rate limiting middleware
    rateLimit(req, res, next) {
        // Simple rate limiting - just pass through for now
        next();
    }

    // CORS middleware
    cors(req, res, next) {
        const origin = req.headers.origin;
        const allowedOrigins = config.security.corsOrigins;
        
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin || '*');
        }
        
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Session-Token');
        res.header('Access-Control-Allow-Credentials', 'true');
        
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        
        next();
    }

    // Request logging middleware
    requestLogger(req, res, next) {
        const start = Date.now();
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            const method = req.method;
            const url = req.url;
            const status = res.statusCode;
            const userAgent = req.get('User-Agent');
            const ip = req.ip || req.connection.remoteAddress;
            const userId = req.user ? req.user.id : 'anonymous';
            
            console.log(`${method} ${url} ${status} ${duration}ms - User: ${userId} - IP: ${ip} - UA: ${userAgent}`);
        });
        
        next();
    }

    // Error handling middleware
    errorHandler(err, req, res, next) {
        console.error('❌ Error:', err);
        
        // Don't leak error details in production
        const isDevelopment = config.server.environment === 'development';
        
        res.status(err.status || 500).json({
            success: false,
            error: isDevelopment ? err.message : 'Internal server error',
            ...(isDevelopment && { stack: err.stack })
        });
    }

    // Not found middleware
    notFound(req, res, next) {
        res.status(404).json({
            success: false,
            error: 'Route not found'
        });
    }
}

module.exports = AuthMiddleware; 