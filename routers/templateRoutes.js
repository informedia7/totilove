const express = require('express');
const path = require('path');
const router = express.Router();

class TemplateRoutes {
    constructor(templateController, authMiddleware) {
        this.templateController = templateController;
        this.authMiddleware = authMiddleware;
        this.setupRoutes();
    }

    setupRoutes() {
        // Homepage route - already handled by authRoutes, so we'll skip it here
        // router.get('/index', (req, res) => { ... });
        
        // Template API routes
        router.get('/api/render/:templateName', (req, res) => this.templateController.renderApiTemplate(req, res));
        
        // Special route for independent talk page (high-performance chat) - MUST come BEFORE the general template route
        router.get('/talk', (req, res) => {
            try {
                const authHeader = req.headers.authorization;
                const sessionToken = authHeader ? authHeader.replace('Bearer ', '') : 
                                     req.headers['x-session-token'] || 
                                     req.query.token ||
                                     req.cookies?.sessionToken;

                if (!sessionToken) {
                    return res.redirect('/login?message=' + encodeURIComponent('Please log in to access chat') + '&return=' + encodeURIComponent(req.originalUrl));
                }

                const session = this.authMiddleware.sessions.get(sessionToken);
                if (!session || session.expiresAt < Date.now()) {
                    if (session) {
                        this.authMiddleware.sessions.delete(sessionToken);
                    }
                    return res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.') + '&return=' + encodeURIComponent(req.originalUrl));
                }

                // Extend session
                session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                
                // Use the independent talk page renderer
                const userId = session.user.id;
                return this.templateController.renderTalkPage(req, res, userId, session.user, sessionToken);
                
            } catch (error) {
                console.error('Talk page render error:', error);
                res.status(500).send('<h1>Chat page rendering failed</h1>');
            }
        });
        
        // Template rendering with layout
        router.get('/:templateName', (req, res) => {
            try {
                const { templateName } = req.params;
                
                // Skip talk page - it has its own independent route
                if (templateName === 'talk') {
                    return res.status(404).send('<h1>Talk page not found - use independent route</h1>');
                }
                
                // Check for undefined template name
                if (!templateName || templateName === 'undefined') {
                    return res.status(400).send(`
                        <html>
                            <body style="font-family: Arial, sans-serif; padding: 2rem; text-align: center;">
                                <h1 style="color: #dc3545;">Invalid Template Request</h1>
                                <p>The requested template name is invalid or undefined.</p>
                                <p>Please check your browser's JavaScript console for errors.</p>
                                <a href="/" style="color: #007bff; text-decoration: none;">← Go Back Home</a>
                            </body>
                        </html>
                    `);
                }

                // Allow login page without authentication - redirect to standalone login
                if (templateName === 'login') {
                    return res.redirect('/login');
                }

                // Check authentication for all other templates
                const authHeader = req.headers.authorization;
                const sessionToken = authHeader ? authHeader.replace('Bearer ', '') : 
                                     req.headers['x-session-token'] || 
                                     req.query.token ||
                                     req.cookies?.sessionToken;

                if (!sessionToken) {
                    return res.redirect('/login?message=' + encodeURIComponent('Please log in to access this page') + '&return=' + encodeURIComponent(req.originalUrl));
                }

                const session = this.authMiddleware.sessions.get(sessionToken);
                if (!session || session.expiresAt < Date.now()) {
                    if (session) {
                        this.authMiddleware.sessions.delete(sessionToken);
                    }
                    return res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.') + '&return=' + encodeURIComponent(req.originalUrl));
                }

                // Extend session
                session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                
                // Use authenticated user's data
                const userId = session.user.id;
                return this.templateController.renderTemplate(req, res, templateName, userId, session.user, sessionToken);
                
            } catch (error) {
                console.error('Template render error:', error);
                res.status(500).send('<h1>Template rendering failed</h1>');
            }
        });
    }

    getRouter() {
        return router;
    }
}

module.exports = TemplateRoutes; 