// Centralized configuration for Lightning Server
require('dotenv').config();

module.exports = {
    // Server Configuration
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost',
        environment: process.env.NODE_ENV || 'development',
        cluster: process.env.ENABLE_CLUSTER === 'true',
        maxConcurrentUsers: 10000,
        loadThreshold: 8000
    },

    // Database Configuration
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'totilove',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    },

    // Redis Configuration
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || null,
        db: process.env.REDIS_DB || 0,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null
    },

    // WebSocket Configuration
    websocket: {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        pingTimeout: 30000,
        pingInterval: 12000,
        maxHttpBufferSize: 1e6,
        transports: ['websocket', 'polling'],
        perMessageDeflate: {
            zlibDeflateOptions: {
                level: 1,
                windowBits: 13,
            },
            threshold: 1024,
            concurrencyLimit: 20,
        },
        allowEIO3: true
    },

    // Session Configuration
    session: {
        secret: process.env.SESSION_SECRET || 'lightning-secret-key',
        duration: 60 * 60 * 1000, // 1 hour
        cleanupInterval: 5 * 60 * 1000 // 5 minutes
    },

    // Rate Limiting Configuration
    rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 200,
        highLoadMaxRequests: 100,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
    },

    // Template Configuration
    template: {
        basePath: './templates',
        pagesPath: './app/pages',
        layoutsPath: './templates/layouts',
        componentsPath: './templates/components',
        cacheEnabled: true,
        cacheDuration: 5 * 60 * 1000 // 5 minutes
    },

    // Analytics Configuration
    analytics: {
        enabled: true,
        batchSize: 10,
        flushInterval: 30 * 1000, // 30 seconds
        tableName: 'analytics_events'
    },

    // Performance Monitoring
    monitoring: {
        enabled: true,
        metricsInterval: 10 * 1000, // 10 seconds
        memoryThreshold: 0.8, // 80% memory usage
        cpuThreshold: 0.7, // 70% CPU usage
        cleanupInterval: 60 * 1000 // 1 minute
    },

    // Security Configuration
    security: {
        bcryptRounds: 12,
        jwtSecret: process.env.JWT_SECRET || 'jwt-secret-key',
        jwtExpiresIn: '1h',
        corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*']
    },

    // File Upload Configuration
    upload: {
        maxFileSize: 5 * 1024 * 1024, // 5MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        uploadPath: './public/uploads/profile_images',
        tempPath: './temp'
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'combined',
        file: process.env.LOG_FILE || null,
        console: true
    },

    // Email Configuration
    email: {
        enabled: process.env.EMAIL_ENABLED === 'true',
        smtp: {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            user: process.env.SMTP_USER || '',
            password: process.env.SMTP_PASSWORD || '',
            fromName: process.env.SMTP_FROM_NAME || 'Totilove'
        },
        baseUrl: process.env.BASE_URL || 'http://localhost:3000',
        tokenExpiry: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    }
}; 