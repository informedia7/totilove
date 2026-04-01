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
 * - GET /profile-edit - Profile edit page
 * - GET /profile-photos - Profile photos page
 * - GET /search - Search page
 * - GET /results - Results page
 * - GET /activity - Activity page
 * - GET /matches - Matches page
 * - GET /profile/:userId - View other user's profile
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requestLogger } = require('../middleware/requestLogger');
const { optionalAuth } = require('../middleware/authMiddleware');
const config = require('../../config/config');
const SESSION_DURATION_MS = config.session?.duration || (2 * 60 * 60 * 1000);

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
    async function renderTemplatePage(req, res, templateName, sessionDuration = SESSION_DURATION_MS) {
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
                'profile-edit': 'your profile',
                'profile-photos': 'your profile',
                'search': 'search',
                'results': 'results',
                'activity': 'activity',
                'matches': 'matches',
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
    router.get(['/billing', '/billing.html'], async (req, res) => {
        try {
            await renderTemplatePage(req, res, 'billing', 24 * 60 * 60 * 1000); // 24 hours
        } catch (error) {
            console.error('[PageRoutes] Error rendering billing page:', error);
            res.status(500).send('<h1>Billing page not available</h1>');
        }
    });

    /**
     * GET /profile-full - Profile full page
     */
    router.get('/profile-full', async (req, res) => {
        try {
            await renderTemplatePage(req, res, 'profile-full');
        } catch (error) {
            console.error('[PageRoutes] Error rendering profile-full page:', error);
            res.status(500).send('<h1>Profile page not available</h1>');
        }
    });

    /**
     * GET /profile-edit - Profile edit page
     */
    router.get('/profile-edit', async (req, res) => {
        try {
            await renderTemplatePage(req, res, 'profile-edit');
        } catch (error) {
            console.error('[PageRoutes] Error rendering profile-edit page:', error);
            res.status(500).send('<h1>Profile edit page not available</h1>');
        }
    });

    /**
     * GET /profile-photos - Profile photos page
     */
    router.get('/profile-photos', async (req, res) => {
        try {
            await renderTemplatePage(req, res, 'profile-photos');
        } catch (error) {
            console.error('[PageRoutes] Error rendering profile-photos page:', error);
            res.status(500).send('<h1>Photos page not available</h1>');
        }
    });

    /**
     * GET /search - Search page
     */
    router.get('/search', async (req, res) => {
        try {
            await renderTemplatePage(req, res, 'search');
        } catch (error) {
            console.error('[PageRoutes] Error rendering search page:', error);
            res.status(500).send('<h1>Search page not available</h1>');
        }
    });

    /**
     * GET /results - Results page
     */
    router.get('/results', async (req, res) => {
        try {
            await renderTemplatePage(req, res, 'results');
        } catch (error) {
            console.error('[PageRoutes] Error rendering results page:', error);
            res.status(500).send('<h1>Results page not available</h1>');
        }
    });

    /**
     * GET /activity - Activity page
     */
    router.get('/activity', async (req, res) => {
        try {
            await renderTemplatePage(req, res, 'activity');
        } catch (error) {
            console.error('[PageRoutes] Error rendering activity page:', error);
            res.status(500).send('<h1>Activity page not available</h1>');
        }
    });

    /**
     * GET /matches, /matches.html - Matches page
     */
    router.get(['/matches', '/matches.html'], async (req, res) => {
        try {
            await renderTemplatePage(req, res, 'matches');
        } catch (error) {
            console.error('[PageRoutes] Error rendering matches page:', error);
            res.status(500).send('<h1>Matches page not available</h1>');
        }
    });

    /**
     * GET /settings - Settings page
     */
    router.get('/settings', async (req, res) => {
        try {
            await renderTemplatePage(req, res, 'settings');
        } catch (error) {
            console.error('[PageRoutes] Error rendering settings page:', error);
            res.status(500).send('<h1>Settings page not available</h1>');
        }
    });

    /**
     * GET /account - Account page
     */
    router.get('/account', async (req, res) => {
        try {
            await renderTemplatePage(req, res, 'account');
        } catch (error) {
            console.error('[PageRoutes] Error rendering account page:', error);
            res.status(500).send('<h1>Account page not available</h1>');
        }
    });

    /**
     * GET /profile/:userId - View other user's profile
     */
    router.get('/profile/:userId', async (req, res) => {
        try {
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
            session.expiresAt = Date.now() + SESSION_DURATION_MS;
            
            // Render profile-full template for viewing other users now that profile-basic is retired
            // Note: renderTemplate signature is (req, res, templateName, userId, user, token)
            await templateController.renderTemplate(req, res, 'profile-full', userId, session.user, token);
        } catch (error) {
            console.error('[PageRoutes] Error rendering user profile:', error);
            res.status(500).send('<h1>Profile not available</h1>');
        }
    });

    return router;
}

module.exports = createPageRoutes;

