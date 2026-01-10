/**
 * Express Configuration Module
 * Handles Express app middleware and security setup
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

/**
 * Configure Express app with middleware and security headers
 * @param {Object} app - Express application instance
 * @param {Object} sessionTracker - Session tracker instance
 */
function configureExpress(app, sessionTracker) {
    // High performance Express configuration
    app.use(cors({
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
        optionsSuccessStatus: 200
    }));
    
    // Cookie parser middleware
    app.use(cookieParser());
    
    app.use(express.json({ 
        limit: '5mb',
        type: 'application/json'
    }));
    app.use(express.urlencoded({ 
        extended: true, 
        limit: '5mb',
        parameterLimit: 1000
    }));
    
    // Static file serving - specific paths first
    app.use('/assets', express.static(path.join(__dirname, '../../app', 'assets')));
    app.use('/uploads', express.static(path.join(__dirname, '../../app', 'uploads')));
    app.use('/js', express.static(path.join(__dirname, '../../app', 'js')));
    app.use('/components', express.static(path.join(__dirname, '../../app', 'components')));
    
    // Ensure chat images are served from the correct path
    app.use('/uploads/chat_images', express.static(path.join(__dirname, '../../app', 'uploads', 'chat_images')));
    
    // Catch-all static file serving - MUST be before routes
    app.use('/', express.static(path.join(__dirname, '../../app')));
    
    // Security headers (including CSP for XSS protection)
    app.use((req, res, next) => {
        // Prevent MIME type sniffing
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        // Prevent clickjacking
        res.setHeader('X-Frame-Options', 'DENY');
        
        // Enable XSS filter (legacy browsers)
        res.setHeader('X-XSS-Protection', '1; mode=block');
        
        // Content Security Policy - allows same-origin scripts/styles, prevents inline scripts
        // Adjust based on your needs (you may need 'unsafe-inline' for some libraries)
        const cspPolicy = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval for some libraries
            "style-src 'self' 'unsafe-inline'", // unsafe-inline for inline styles
            "img-src 'self' data: https: blob:", // Allow blob: URLs for image previews/uploads
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'"
        ].join('; ');
        res.setHeader('Content-Security-Policy', cspPolicy);
        
        // Referrer Policy - control referrer information
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        
        // Permissions Policy (formerly Feature Policy)
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        
        next();
    });
    
    // Origin validation for state-changing requests (CSRF protection)
    // Only validates if origin header is present (CORS requests)
    app.use((req, res, next) => {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            const origin = req.headers.origin;
            
            // Allow requests without origin (same-origin, direct navigation, etc.)
            if (!origin) {
                return next();
            }
            
            // Validate origin matches expected origin
            const host = req.headers.host;
            const protocol = req.protocol || (req.secure ? 'https' : 'http');
            const expectedOrigins = [
                `${protocol}://${host}`,
                `http://${host}`,
                `https://${host}`
            ];
            
            // In development, also allow localhost variations
            if (process.env.NODE_ENV !== 'production') {
                expectedOrigins.push(
                    `http://localhost:${req.socket.localPort || 3000}`,
                    `http://127.0.0.1:${req.socket.localPort || 3000}`
                );
            }
            
            if (!expectedOrigins.includes(origin)) {
                console.warn(`⚠️ Origin validation failed: ${origin} not in allowed list`);
                return res.status(403).json({
                    success: false,
                    error: 'Origin validation failed'
                });
            }
        }
        next();
    });
    
    // Session activity tracking middleware
    app.use((req, res, next) => {
        // Track user activity if user is authenticated
        const userId = req.headers['x-user-id'] || req.session?.userId;
        if (userId && sessionTracker) {
            // Update user activity asynchronously to not block the request
            sessionTracker.updateUserActivity(userId, req).catch(() => {
                // Failed to update user activity - non-critical
            });
        }
        next();
    });
}

module.exports = { configureExpress };






