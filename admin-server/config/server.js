require('dotenv').config();

module.exports = {
    port: parseInt(process.env.ADMIN_PORT) || 3003,
    host: process.env.ADMIN_HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development',
    
    session: {
        secret: process.env.ADMIN_SESSION_SECRET || 'change_this_secret',
        expiry: parseInt(process.env.ADMIN_SESSION_EXPIRY) || 86400000, // 24 hours
        name: 'admin.sid'
    },
    
    security: {
        jwtSecret: process.env.JWT_SECRET || 'change_this_jwt_secret',
        ipWhitelist: process.env.ADMIN_IP_WHITELIST ? process.env.ADMIN_IP_WHITELIST.split(',') : null,
        rateLimit: {
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
            max: parseInt(process.env.RATE_LIMIT_MAX) || 100
        }
    },
    
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
        credentials: true
    },
    
    logging: {
        level: process.env.LOG_LEVEL || 'info'
    }
};




















































