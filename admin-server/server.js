const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const cors = require('cors');

// Load configuration
require('dotenv').config();
const serverConfig = require('./config/server');
const { healthCheck } = require('./config/database');
const redis = require('./config/redis');
const logger = require('./utils/logger');

// Import routes
const routes = require('./routes');

const app = express();
const PORT = serverConfig.port;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
            connectSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    }
}));

// CORS configuration
if (serverConfig.cors.origin) {
    app.use(cors({
        origin: serverConfig.cors.origin,
        credentials: serverConfig.cors.credentials
    }));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (serverConfig.environment === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Rate limiting - more lenient for admin operations
// Standard limiter for general API routes
const limiter = rateLimit({
    windowMs: serverConfig.security.rateLimit.windowMs,
    max: serverConfig.security.rateLimit.max,
    message: {
        success: false,
        error: 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// More lenient limiter for admin API routes (5x the limit)
const adminLimiter = rateLimit({
    windowMs: serverConfig.security.rateLimit.windowMs,
    max: serverConfig.security.rateLimit.max * 5, // 5x more requests for admin routes
    message: {
        success: false,
        error: 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply more lenient rate limiting to admin API routes
app.use('/api/users', adminLimiter);
app.use('/api/stats', adminLimiter);
app.use('/api/config', adminLimiter);
app.use('/api/payments', adminLimiter);
app.use('/api/subscription-control', adminLimiter);
app.use('/api/blocked-reported', adminLimiter);
app.use('/api/image-approval', adminLimiter);
app.use('/api/export-import', adminLimiter);
app.use('/api/messages', adminLimiter);
app.use('/api/backup', adminLimiter);

// Apply standard rate limiting to other API routes
app.use('/api/', limiter);

// Session configuration
let sessionStore;
if (redis.enabled && redis.client) {
    sessionStore = new RedisStore({
        client: redis.client,
        prefix: 'admin_session:'
    });
} else {
    // Fallback to memory store if Redis not available
    const MemoryStore = require('express-session').MemoryStore;
    sessionStore = new MemoryStore();
    logger.warn('Using memory store for sessions (Redis not available)');
}

app.use(session({
    store: sessionStore,
    secret: serverConfig.session.secret,
    name: serverConfig.session.name,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: serverConfig.environment === 'production',
        httpOnly: true,
        maxAge: serverConfig.session.expiry,
        sameSite: 'strict'
    }
}));

// Trust proxy (if behind reverse proxy)
app.set('trust proxy', 1);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve user uploaded images
// Try multiple possible locations for uploads directory
const possibleUploadPaths = [
    process.env.UPLOADS_PATH,
    path.join(__dirname, '..', 'app', 'uploads', 'profile_images'), // Direct profile_images path
    path.join(__dirname, '..', 'app', 'uploads'), // ../app/uploads
    path.join(__dirname, '..', 'uploads'),
    path.join(__dirname, '..', '..', 'uploads'),
    path.join(__dirname, 'uploads'),
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), '..', 'uploads'),
    path.join(process.cwd(), '..', 'app', 'uploads'),
    path.join(process.cwd(), '..', '..', 'uploads')
]
    .filter(Boolean)
    .map(p => path.resolve(p)); // Normalize all paths to absolute paths

let uploadsPath = null;
let profileImagesPath = null;

for (const uploadPath of possibleUploadPaths) {
    if (!uploadPath) continue;
    
    // Check if uploadPath itself is the profile_images directory
    if (path.basename(uploadPath) === 'profile_images' && fs.existsSync(uploadPath)) {
        uploadsPath = path.dirname(uploadPath);
        profileImagesPath = uploadPath;
        logger.info(`Found profile_images directory directly: ${profileImagesPath}`);
        break;
    }
    
    // Check for profile_images subdirectory
    const testProfileImagesPath = path.join(uploadPath, 'profile_images');
    if (fs.existsSync(testProfileImagesPath)) {
        uploadsPath = uploadPath;
        profileImagesPath = testProfileImagesPath;
        logger.info(`Found uploads directory: ${uploadsPath}`);
        logger.info(`Found profile_images directory: ${profileImagesPath}`);
        break;
    } else if (fs.existsSync(uploadPath)) {
        uploadsPath = uploadPath;
        logger.info(`Found uploads directory: ${uploadsPath} (profile_images subdirectory not found)`);
        break;
    }
}

if (uploadsPath) {
    // Serve uploads directory (will serve /uploads/profile_images/... automatically)
    app.use('/uploads', express.static(uploadsPath));
    logger.info(`Uploads static serving enabled at /uploads`);
    
    // Also serve profile_images directly if found
    if (profileImagesPath) {
        app.use('/uploads/profile_images', express.static(profileImagesPath));
        logger.info(`Profile images static serving enabled at /uploads/profile_images`);
    }
} else {
    logger.warn('Uploads directory not found. Image serving may not work.');
    logger.warn('Set UPLOADS_PATH environment variable or ensure uploads directory exists.');
    logger.warn('Expected locations: ../uploads, ../../uploads, ./uploads, or process.cwd()/uploads');
    logger.warn('Searched paths:', possibleUploadPaths);
}

// View engine setup (for HTML pages)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);

// Routes
app.use('/', routes);

// Health check endpoint (no auth required)
app.get('/health', async (req, res) => {
    const dbHealth = await healthCheck();
    res.json({
        status: 'ok',
        server: 'admin-server',
        port: PORT,
        database: dbHealth.status,
        redis: redis.enabled ? (redis.client ? 'connected' : 'disconnected') : 'disabled',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'Endpoint not found'
        });
    }
    res.status(404).send('Page not found');
});

// Error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    
    if (req.path.startsWith('/api/')) {
        return res.status(err.status || 500).json({
            success: false,
            error: serverConfig.environment === 'production' 
                ? 'Internal server error' 
                : err.message,
            ...(serverConfig.environment === 'development' && { stack: err.stack })
        });
    }
    
    res.status(err.status || 500).send(
        serverConfig.environment === 'production' 
            ? 'Internal server error' 
            : err.message
    );
});

// Start server
const startServer = async () => {
    try {
        // Test database connection
        const dbHealth = await healthCheck();
        if (dbHealth.status !== 'healthy') {
            logger.error('Database health check failed:', dbHealth);
            process.exit(1);
        }

        app.listen(PORT, serverConfig.host, () => {
            logger.info(`Admin Server running on http://${serverConfig.host}:${PORT}`);
            logger.info(`Environment: ${serverConfig.environment}`);
            logger.info(`Database: ${dbHealth.status}`);
            logger.info(`Redis: ${redis.enabled ? (redis.client ? 'enabled' : 'disabled') : 'disabled'}`);
        });
    } catch (error) {
        logger.error('Failed to start admin server:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;










