const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Import route modules
const createLocationRoutes = require('./routes/locationRoutes');
const createValidationRoutes = require('./routes/validationRoutes');
const createStatusRoutes = require('./routes/statusRoutes');
const createLanguageRoutes = require('./routes/languageRoutes');
const createPageRoutes = require('./routes/pageRoutes');
const createAuthRoutes = require('./routes/authRoutes');
const createAccountRoutes = require('./routes/accountRoutes');
const createUserRoutes = require('./routes/userRoutes');
const createImageRoutes = require('./routes/imageRoutes');
const createLookupDataRoutes = require('./routes/lookupDataRoutes');
const createProfileRoutes = require('./routes/profileRoutes');

class AuthRoutes {
    constructor(authController, templateController = null, authMiddleware = null, io = null, redis = null) {
        this.authController = authController;
        this.templateController = templateController;
        this.authMiddleware = authMiddleware;
        this.io = io;
        this.redis = redis;
        this.setupRoutes();
    }

    extractSessionToken(req) {
        const authHeader = req.headers.authorization;
        return authHeader ? authHeader.replace('Bearer ', '') : 
               req.headers['x-session-token'] || 
               req.cookies?.sessionToken ||
               req.cookies?.session ||
               req.query.token ||
               req.body?.sessionToken;
    }

    validateSession(sessionToken, res) {
        if (!sessionToken || !this.authMiddleware) {
            if (res) {
                res.status(401).json({
                    success: false,
                    error: 'Session token is required'
                });
            }
            return null;
        }

        const session = this.authMiddleware.sessions.get(sessionToken);
        
        if (!session || session.expiresAt <= Date.now()) {
            if (session) {
                this.authMiddleware.sessions.delete(sessionToken);
            }
            if (res) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }
            return null;
        }

        session.expiresAt = Date.now() + (60 * 60 * 1000);
        return session;
    }

    setupRoutes() {
        // Mount modular routes (order matters - more specific routes first)
        const pageRouter = createPageRoutes(this.templateController, this.authMiddleware);
        router.use(pageRouter);
        
        const authRouter = createAuthRoutes(this.authController, this.authMiddleware);
        router.use(authRouter);
        
        // Public lookup routes must be mounted before auth-protected routers
        const locationRouter = createLocationRoutes(this.authController.db);
        router.use(locationRouter);
        
        const validationRouter = createValidationRoutes(this.authController.db);
        router.use(validationRouter);
        
        // Lookup data routes - MUST be before accountRoutes to avoid apiLimiter conflict
        const lookupDataRouter = createLookupDataRoutes(this.authController, this.authMiddleware);
        router.use(lookupDataRouter);
        
        const languageRouter = createLanguageRoutes(this.authController.db, this.authMiddleware);
        router.use(languageRouter);
        
        const accountRouter = createAccountRoutes(this.authController, this.authMiddleware);
        router.use(accountRouter);
        
        const userRouter = createUserRoutes(this.authController, this.templateController, this.authMiddleware);
        router.use(userRouter);
        
        const imageRouter = createImageRoutes(this.authController.db, this.authMiddleware, path.join(__dirname, '..'));
        router.use(imageRouter);
        
        const statusRouter = createStatusRoutes(this.authController, this.authMiddleware);
        router.use(statusRouter);

        const profileRouter = createProfileRoutes(this.authController, this.authMiddleware, this.io, this.redis);
        router.use(profileRouter);

        // Page routes
        router.get('/', (req, res) => {
            try {
                const indexPath = path.join(__dirname, '..', 'app', 'pages', 'index.html');
                if (fs.existsSync(indexPath)) {
                    res.sendFile(indexPath);
                } else {
                    res.redirect('/login');
                }
            } catch (error) {
                res.status(500).send('<h1>Homepage not available</h1>');
            }
        });

        router.get(['/index', '/index.html'], (req, res) => {
            res.redirect('/');
        });

        router.get('/login', (req, res) => {
            try {
                const loginPath = path.join(__dirname, '..', 'app', 'pages', 'login.html');
                if (fs.existsSync(loginPath)) {
                    res.sendFile(loginPath);
                } else {
                    res.redirect('/login');
                }
            } catch (error) {
                res.status(500).send('<h1>Login page not available</h1>');
            }
        });

        router.get('/register', (req, res) => {
            try {
                const registerPath = path.join(__dirname, '..', 'app', 'pages', 'register.html');
                if (fs.existsSync(registerPath)) {
                    res.sendFile(registerPath);
                } else {
                    res.redirect('/register');
                }
            } catch (error) {
                res.status(500).send('<h1>Register page not available</h1>');
            }
        });

        // Template-based routes
        const templateRoutes = ['billing', 'profile-full', 'profile-basic', 'profile-edit', 'profile-photos', 'search', 'results', 'activity'];
        templateRoutes.forEach(routeName => {
            router.get(`/${routeName}`, async (req, res) => {
                const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
                if (token && this.templateController && this.authMiddleware) {
                    const session = this.authMiddleware.sessions.get(token);
                    if (session && session.expiresAt > Date.now()) {
                        session.expiresAt = Date.now() + (60 * 60 * 1000);
                        await this.templateController.renderTemplate(req, res, routeName, session.user.id, session.user, token);
                    } else {
                        res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                    }
                } else {
                    res.redirect('/login?message=' + encodeURIComponent(`Please log in to access ${routeName}`));
                }
            });
        });

        router.get('/billing.html', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    session.expiresAt = Date.now() + (24 * 60 * 60 * 1000);
                    await this.templateController.renderTemplate(req, res, 'billing', session.user.id, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to access billing'));
            }
        });

        router.get('/logout', (req, res) => {
            try {
                const logoutPath = path.join(__dirname, '..', 'templates', 'logout.html');
                if (fs.existsSync(logoutPath)) {
                    res.sendFile(logoutPath);
                } else {
                    res.redirect('/login');
                }
            } catch (error) {
                res.redirect('/login');
            }
        });

        router.get('/profile/:userId', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            const userId = req.params.userId;
            
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    session.expiresAt = Date.now() + (60 * 60 * 1000);
                    await this.templateController.renderTemplate(req, res, 'profile-basic', userId, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to view profiles'));
            }
        });
    }

    getRouter() {
        return router;
    }
}

module.exports = AuthRoutes;
