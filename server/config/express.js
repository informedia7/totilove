/**
 * Express Configuration Module
 * Handles Express app middleware and security setup
 */

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const { resolveUploadsRoot } = require('../../utils/uploads');
const {
    createPerRequestCorsMiddleware,
    warnProductionWithoutExplicitOrigins,
    isOriginAllowed
} = require('./corsOrigins');

/**
 * Configure Express app with middleware and security headers
 * @param {Object} app - Express application instance
 */
function configureExpress(app) {
    // Ensure Express trusts upstream proxies (needed for accurate req.ip)
    const trustProxyValue = process.env.TRUST_PROXY;
    if (trustProxyValue !== undefined) {
        const normalized = trustProxyValue === 'true'
            ? true
            : trustProxyValue === 'false'
                ? false
                : Number(trustProxyValue);
        app.set('trust proxy', Number.isNaN(normalized) ? trustProxyValue : normalized);
    } else {
        app.set('trust proxy', 1);
    }

    warnProductionWithoutExplicitOrigins();

    app.use(
        helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false,
            // Default same-origin blocks cross-origin <img> embeds (admin dashboard on another host).
            crossOriginResourcePolicy: false,
            ...(process.env.NODE_ENV === 'production' && process.env.HELMET_DISABLE_HSTS !== 'true'
                ? {
                      strictTransportSecurity: {
                          maxAge: 63072000,
                          includeSubDomains: true
                      }
                  }
                : {})
        })
    );

    app.use(createPerRequestCorsMiddleware());
    
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
    // Allow embedding uploads from other origins (admin UI, etc.). Helmet would send CORP: same-origin otherwise.
    app.use('/uploads', (req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
    });
    app.use('/uploads', express.static(resolveUploadsRoot()));
    app.use('/js', express.static(path.join(__dirname, '../../app', 'js')));
    app.use('/components', express.static(path.join(__dirname, '../../app', 'components')));
    
    // Ensure chat images are served from the correct path
    app.use('/uploads/chat_images', express.static(path.join(resolveUploadsRoot(), 'chat_images')));

    const { pageLocaleMiddleware } = require('../middleware/footerPageLocale');
    app.use(pageLocaleMiddleware);

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
        const connectSrc = [
            "'self'",
            'ws:',
            'wss:',
            'https://static.cloudflareinsights.com',
            'https://cloudflareinsights.com'
        ];

        (process.env.CSP_EXTRA_CONNECT_SRC || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((origin) => {
                if (!connectSrc.includes(origin)) {
                    connectSrc.push(origin);
                }
            });

        // Allow local diagnostics collector in development only.
        if (process.env.NODE_ENV !== 'production') {
            connectSrc.push('http://127.0.0.1:5057', 'http://localhost:5057');
        }

        const allowUnsafeEval =
            process.env.NODE_ENV !== 'production' || process.env.CSP_ALLOW_UNSAFE_EVAL === 'true';
        const scriptSrcEval = allowUnsafeEval ? " 'unsafe-eval'" : '';

        const cspPolicy = [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline'${scriptSrcEval} https://static.cloudflareinsights.com`,
            "script-src-elem 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Google Fonts stylesheet
            "img-src 'self' data: https: blob:", // Allow blob: URLs for image previews/uploads
            "font-src 'self' data: https://fonts.gstatic.com",
            `connect-src ${connectSrc.join(' ')}`, // allow analytics and local debug transport
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

            if (!origin) {
                return next();
            }

            const protocol = req.protocol || (req.secure ? 'https' : 'http');
            if (
                !isOriginAllowed(origin, {
                    host: req.headers.host,
                    protocol
                })
            ) {
                console.warn(`⚠️ Origin validation failed: ${origin} not in allowed list`);
                return res.status(403).json({
                    success: false,
                    error: 'Origin validation failed'
                });
            }
        }
        next();
    });
    
}

module.exports = { configureExpress };






