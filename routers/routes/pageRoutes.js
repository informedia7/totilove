/**
 * Page Routes
 * Handles HTML page serving routes
 * 
 * Routes:
 * - GET / - Homepage
 * - GET /index, /index.html - Homepage aliases
 * - GET /login - Login page
 * - GET /register - Register page
 * - GET /logout - Logout page
 * - GET /billing, /billing.html - Billing page
 * - GET /profile-full - Profile full page
 * - GET /profile-basic - Profile basic page
 * - GET /profile-edit - Profile edit page
 * - GET /profile-photos - Profile photos page
 * - GET /search - Search page
 * - GET /results - Results page
 * - GET /activity - Activity page
 * - GET /profile/:userId - View other user's profile
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { requestLogger } = require('../middleware/requestLogger');
const { optionalAuth } = require('../middleware/authMiddleware');

/**
 * Create page routes
 * @param {Object} templateController - TemplateController instance
 * @param {Object} authMiddleware - AuthMiddleware instance
 * @returns {express.Router} Express router
 */
function createPageRoutes(templateController, authMiddleware) {
    // Apply logging to all routes
    router.use(requestLogger);

    /**
     * GET / - Homepage
     */
    router.get('/', (req, res) => {
        try {
            const indexPath = path.join(__dirname, '..', '..', 'app', 'pages', 'index.html');
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                res.redirect('/login');
            }
        } catch (error) {
            res.status(500).send('<h1>Homepage not available</h1>');
        }
    });

    /**
     * GET /index, /index.html - Homepage aliases
     */
    router.get(['/index', '/index.html'], (req, res) => {
        res.redirect('/');
    });

    /**
     * GET /login - Login page
     */
    router.get('/login', (req, res) => {
        try {
            const loginPath = path.join(__dirname, '..', '..', 'app', 'pages', 'login.html');
            if (fs.existsSync(loginPath)) {
                res.sendFile(loginPath);
            } else {
                res.redirect('/login');
            }
        } catch (error) {
            res.status(500).send('<h1>Login page not available</h1>');
        }
    });

    /**
     * GET /register - Register page
     */
    router.get('/register', (req, res) => {
        try {
            const registerPath = path.join(__dirname, '..', '..', 'app', 'pages', 'register.html');
            if (fs.existsSync(registerPath)) {
                res.sendFile(registerPath);
            } else {
                res.redirect('/register');
            }
        } catch (error) {
            res.status(500).send('<h1>Register page not available</h1>');
        }
    });

    /**
     * GET /logout - Logout page
     */
    router.get('/logout', (req, res) => {
        try {
            const logoutPath = path.join(__dirname, '..', '..', 'templates', 'logout.html');
            if (fs.existsSync(logoutPath)) {
                res.sendFile(logoutPath);
            } else {
                res.redirect('/login');
            }
        } catch (error) {
            res.redirect('/login');
        }
    });

    /**
     * Helper function to render template with authentication
     */
    async function renderTemplatePage(req, res, templateName, sessionDuration = 60 * 60 * 1000) {
        const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
        
        if (token && templateController && authMiddleware) {
            const session = authMiddleware.sessions.get(token);
            if (session && session.expiresAt > Date.now()) {
                // Extend session
                session.expiresAt = Date.now() + sessionDuration;
                await templateController.renderTemplate(req, res, templateName, session.user.id, session.user, token);
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
            }
        } else {
            const pageNames = {
                'billing': 'billing',
                'profile-full': 'your profile',
                'profile-basic': 'your profile',
                'profile-edit': 'your profile',
                'profile-photos': 'your profile',
                'search': 'search',
                'results': 'results',
                'activity': 'activity',
                'settings': 'settings',
                'account': 'account'
            };
            const pageName = pageNames[templateName] || 'this page';
            res.redirect('/login?message=' + encodeURIComponent(`Please log in to access ${pageName}`));
        }
    }

    /**
     * GET /billing, /billing.html - Billing page
     */
    router.get(['/billing', '/billing.html'], asyncHandler(async (req, res) => {
        await renderTemplatePage(req, res, 'billing', 24 * 60 * 60 * 1000); // 24 hours
    }));

    /**
     * GET /profile-full - Profile full page
     */
    router.get('/profile-full', asyncHandler(async (req, res) => {
        await renderTemplatePage(req, res, 'profile-full');
    }));

    /**
     * GET /profile-basic - Profile basic page
     */
    router.get('/profile-basic', asyncHandler(async (req, res) => {
        await renderTemplatePage(req, res, 'profile-basic');
    }));

    /**
     * GET /profile-edit - Profile edit page
     */
    router.get('/profile-edit', asyncHandler(async (req, res) => {
        await renderTemplatePage(req, res, 'profile-edit');
    }));

    /**
     * GET /profile-photos - Profile photos page
     */
    router.get('/profile-photos', asyncHandler(async (req, res) => {
        await renderTemplatePage(req, res, 'profile-photos');
    }));

    /**
     * GET /search - Search page
     */
    router.get('/search', asyncHandler(async (req, res) => {
        await renderTemplatePage(req, res, 'search');
    }));

    /**
     * GET /results - Results page
     */
    router.get('/results', asyncHandler(async (req, res) => {
        await renderTemplatePage(req, res, 'results');
    }));

    /**
     * GET /activity - Activity page
     */
    router.get('/activity', asyncHandler(async (req, res) => {
        await renderTemplatePage(req, res, 'activity');
    }));

    /**
     * GET /settings - Settings page
     */
    router.get('/settings', asyncHandler(async (req, res) => {
        await renderTemplatePage(req, res, 'settings');
    }));

    /**
     * GET /account - Account page
     */
    router.get('/account', asyncHandler(async (req, res) => {
        await renderTemplatePage(req, res, 'account');
    }));

    /**
     * GET /profile/:userId - View other user's profile
     */
    router.get('/profile/:userId', asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
        
        if (!token || !templateController || !authMiddleware) {
            return res.redirect('/login?message=' + encodeURIComponent('Please log in to view profiles'));
        }

        const session = authMiddleware.sessions.get(token);
        if (!session || session.expiresAt <= Date.now()) {
            return res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
        }

        // Extend session
        session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
        
        // Render profile-basic template for viewing other users
        // Note: renderTemplate signature is (req, res, templateName, userId, user, token)
        await templateController.renderTemplate(req, res, 'profile-basic', userId, session.user, token);
    }));

    return router;
}

module.exports = createPageRoutes;

