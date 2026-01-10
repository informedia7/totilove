const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const sessionService = require('../services/sessionService');
const redisManager = require('../config/redis');

class AuthRoutes {
    constructor(authController, templateController = null, authMiddleware = null, io = null, redis = null) {
        this.authController = authController;
        this.templateController = templateController;
        this.authMiddleware = authMiddleware;
        this.io = io;
        this.redis = redis;
        this.setupRoutes();
    }

    // Helper method to extract session token from request
    extractSessionToken(req) {
        const authHeader = req.headers.authorization;
        return authHeader ? authHeader.replace('Bearer ', '') : 
               req.headers['x-session-token'] || 
               req.cookies?.sessionToken ||
               req.cookies?.session ||
               req.query.token ||
               req.body?.sessionToken;
    }

    // Helper method to validate session and get user
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

        // Extend session
        session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
        return session;
    }

    // Sanitize text to allow only text-related characters (prevent code injection)
    sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';
        
        let sanitized = text;
        
        // Remove HTML tags (but preserve text content)
        sanitized = sanitized.replace(/<[^>]*>/g, '');
        
        // Remove dangerous patterns
        const forbiddenPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
            /javascript:/gi, // JavaScript protocol
            /on\w+\s*=/gi, // Event handlers (onclick, onerror, etc.)
            /<iframe/gi, // Iframe tags
            /<object/gi, // Object tags
            /<embed/gi, // Embed tags
            /<link/gi, // Link tags
            /<meta/gi, // Meta tags
            /<style/gi, // Style tags
            /data:text\/html/gi, // Data URIs with HTML
            /vbscript:/gi, // VBScript protocol
            /expression\s*\(/gi // CSS expressions
        ];
        
        forbiddenPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '');
        });
        
        // Remove control characters (except newline, tab, carriage return)
        sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
        
        // Allow only: letters (a-z, A-Z), numbers (0-9), spaces, newlines, tabs, and basic text punctuation
        // Basic text punctuation: . , ! ? : ; - ' " ( ) [ ] /
        // Note: Removed special symbols like @ # $ % & * + = _ | ~ ` { } < > { } [ ] \ to allow only text-related characters
        const allowed = /^[a-zA-Z0-9\s\n\r\t.,!?:;'\-"()\[\]/]*$/;
        let cleaned = '';
        for (let i = 0; i < sanitized.length; i++) {
            const char = sanitized[i];
            // Allow alphanumeric, whitespace, newlines, and basic text punctuation only
            if (allowed.test(char)) {
                cleaned += char;
            }
        }
        
        return cleaned.trim();
    }

    setupRoutes() {
        // Root route - serve homepage or redirect to login
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

        // Route for /index and /index.html (alternative homepage routes)
        router.get(['/index', '/index.html'], (req, res) => {
            res.redirect('/');
        });

        // Standalone Login Route
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

        // Standalone Register Route
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

        // Billing Route - use template controller with layout
        router.get('/billing', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (24 * 60 * 60 * 1000);
                    await this.templateController.renderTemplate(req, res, 'billing', session.user.id, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to access billing'));
            }
        });

        // Also handle /billing.html route
        router.get('/billing.html', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (24 * 60 * 60 * 1000);
                    await this.templateController.renderTemplate(req, res, 'billing', session.user.id, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to access billing'));
            }
        });




        // Direct Profile Full Route (for convenience) - use template controller
        router.get('/profile-full', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                    await this.templateController.renderTemplate(req, res, 'profile-full', session.user.id, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to access your profile'));
            }
        });

        // Direct Profile Basic Route - use template controller
        router.get('/profile-basic', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                    await this.templateController.renderTemplate(req, res, 'profile-basic', session.user.id, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to access your profile'));
            }
        });

        // Direct Profile Edit Route - use template controller
        router.get('/profile-edit', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                    await this.templateController.renderTemplate(req, res, 'profile-edit', session.user.id, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to access your profile'));
            }
        });

        // Direct Profile Photos Route - use template controller
        router.get('/profile-photos', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                    await this.templateController.renderTemplate(req, res, 'profile-photos', session.user.id, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to access your profile'));
            }
        });

        // Search Route - use template controller with layout
        router.get('/search', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                    await this.templateController.renderTemplate(req, res, 'search', session.user.id, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to access search'));
            }
        });

        // Results Route - use template controller with layout
        router.get('/results', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                    await this.templateController.renderTemplate(req, res, 'results', session.user.id, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to access search results'));
            }
        });

        // Activity Route - use template controller with layout
        router.get('/activity', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                    await this.templateController.renderTemplate(req, res, 'activity', session.user.id, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to access activity'));
            }
        });

        // Standalone Logout Route
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

        // User Profile View Route - viewing other users' profiles
        router.get('/profile/:userId', async (req, res) => {
            const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
            const userId = req.params.userId;
            
            if (token && this.templateController && this.authMiddleware) {
                const session = this.authMiddleware.sessions.get(token);
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                    // Render profile-basic template for viewing other users
                    await this.templateController.renderTemplate(req, res, 'profile-basic', userId, session.user, token);
                } else {
                    res.redirect('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
                }
            } else {
                res.redirect('/login?message=' + encodeURIComponent('Please log in to view profiles'));
            }
        });



        // Authentication API routes
        router.post('/login', (req, res) => this.authController.login(req, res));
        router.post('/register', (req, res) => this.authController.register(req, res));
        router.post('/logout', (req, res) => this.authController.logout(req, res));
        
        // Email verification routes
        router.get('/api/verify-email', (req, res) => this.authController.verifyEmail(req, res));
        router.post('/api/resend-verification', (req, res) => this.authController.resendVerificationEmail(req, res));
        
        // Verify email by code
        router.post('/api/verify-email-code', (req, res) => this.authController.verifyEmailByCode(req, res));
        

        
        // Heartbeat endpoint for session management
        router.post('/api/heartbeat', (req, res) => {
            res.json({
                success: true,
                timestamp: Date.now(),
                status: 'alive'
            });
        });

        // Session check endpoint for authentication status
        router.get('/api/auth/check-session', (req, res) => {
            try {
                const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
                
                if (!token || !this.authMiddleware) {
                    return res.json({
                        success: false,
                        isAuthenticated: false,
                        message: 'No session token provided'
                    });
                }

                const session = this.authMiddleware.sessions.get(token);
                
                if (session && session.expiresAt > Date.now()) {
                    // Extend session
                    session.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
                    
                    res.json({
                        success: true,
                        isAuthenticated: true,
                        user: {
                            id: session.user.id,
                            real_name: session.user.real_name,
                            email: session.user.email,
                            profile_image: session.user.profile_image
                        },
                        expiresAt: session.expiresAt
                    });
                } else {
                    res.json({
                        success: false,
                        isAuthenticated: false,
                        message: 'Session expired or invalid'
                    });
                }
            } catch (error) {
                // Session check error
                res.status(500).json({
                    success: false,
                    isAuthenticated: false,
                    message: 'Internal server error'
                });
            }
        });

        // Get user ID from session token endpoint
        router.get('/api/auth/get-user-id', (req, res) => {
            try {
                const token = req.query.token || req.headers['x-session-token'] || req.cookies?.sessionToken;
                
                if (!token || !this.authMiddleware) {
                    return res.status(400).json({
                        success: false,
                        error: 'No session token provided'
                    });
                }

                const session = this.authMiddleware.sessions.get(token);
                
                if (session && session.expiresAt > Date.now()) {
                    res.json({
                        success: true,
                        userId: session.user.id
                    });
                } else {
                    res.status(401).json({
                        success: false,
                        error: 'Invalid or expired session'
                    });
                }
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // Search endpoint moved to dedicated search controller
        
        // Settings endpoints
        router.get('/api/settings', (req, res) => {
            this.authController.getSettings(req, res);
        });
        
        router.post('/api/settings', (req, res) => {
            this.authController.updateSettings(req, res);
        });
        
        router.post('/api/settings/bulk', (req, res) => {
            this.authController.updateSettingsBulk(req, res);
        });
        
        // Countries endpoint
        router.get('/api/countries', (req, res) => {
            this.authController.getCountries(req, res);
        });
        
        // Account endpoints
        router.get('/api/account/info', (req, res) => {
            this.authController.getAccountInfo(req, res);
        });
        
        router.get('/api/account/stats', (req, res) => {
            this.authController.getAccountStats(req, res);
        });
        
        router.get('/api/account/sessions', (req, res) => {
            this.authController.getActiveSessions(req, res);
        });
        
        router.delete('/api/account/sessions/:sessionId', (req, res) => {
            this.authController.revokeSession(req, res);
        });
        
        router.get('/api/account/export', (req, res) => {
            this.authController.exportAccountData(req, res);
        });
        
        router.delete('/api/account/delete', async (req, res) => {
            try {
                await this.authController.deleteAccount(req, res);
            } catch (error) {
                console.error('Route error in delete account:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: 'Internal server error'
                    });
                }
            }
        });
        
        router.post('/api/account/resend-verification', (req, res) => {
            this.authController.resendVerificationEmail(req, res);
        });

        router.get('/api/account/subscription', (req, res) => {
            this.authController.getSubscription(req, res);
        });

        router.get('/api/account/billing-history', (req, res) => {
            this.authController.getBillingHistory(req, res);
        });

        router.get('/api/billing/plans', (req, res) => {
            this.authController.getBillingPlans(req, res);
        });
        
        // User profile endpoint
        router.get('/api/users/:userId/profile', (req, res) => {
            this.authController.getUserProfile(req, res);
        });

        // Profile completion percentage endpoint
        router.get('/api/users/:userId/profile-completion', async (req, res) => {
            try {
                const userId = parseInt(req.params.userId);
                
                if (!userId || isNaN(userId)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid user ID'
                    });
                }

                if (!this.templateController) {
                    return res.status(500).json({
                        success: false,
                        error: 'Template controller not available'
                    });
                }

                const percentage = await this.templateController.calculateProfileCompletion(userId);
                
                res.json({
                    success: true,
                    percentage,
                    userId
                });
            } catch (error) {
                console.error('Error fetching profile completion:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to calculate profile completion'
                });
            }
        });

        // Profile lookup data endpoint for dropdowns
        router.get('/api/profile/lookup-data', async (req, res) => {
            try {
                const { sessionToken } = req.query;
                
                if (!sessionToken) {
                    return res.status(400).json({
                        success: false,
                        error: 'Session token is required'
                    });
                }

                // Verify session
                const session = this.authMiddleware.sessions.get(sessionToken);
                if (!session || session.expiresAt <= Date.now()) {
                    return res.status(401).json({
                        success: false,
                        error: 'Invalid or expired session'
                    });
                }

                // Query lookup data from database tables
                const lookupData = {};
                
                try {
                    // Get body types
                    const bodyTypesResult = await this.authController.db.query(
                        'SELECT id, name, description FROM user_body_types WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.bodyTypes = bodyTypesResult.rows;

                    // Get eye colors
                    const eyeColorsResult = await this.authController.db.query(
                        'SELECT id, name FROM user_eye_colors WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.eyeColors = eyeColorsResult.rows;

                    // Get hair colors
                    const hairColorsResult = await this.authController.db.query(
                        'SELECT id, name FROM user_hair_colors WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.hairColors = hairColorsResult.rows;

                    // Get ethnicities
                    const ethnicitiesResult = await this.authController.db.query(
                        'SELECT id, name FROM user_ethnicities WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.ethnicities = ethnicitiesResult.rows;

                    // Get education levels
                    const educationResult = await this.authController.db.query(
                        'SELECT id, name FROM user_education_levels WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.educationLevels = educationResult.rows;

                    // Get smoking preferences
                    const smokingResult = await this.authController.db.query(
                        'SELECT id, name FROM user_smoking_preferences WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.smokingPreferences = smokingResult.rows;

                    // Get drinking preferences
                    const drinkingResult = await this.authController.db.query(
                        'SELECT id, name FROM user_drinking_preferences WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.drinkingPreferences = drinkingResult.rows;

                    // Get exercise habits
                    const exerciseResult = await this.authController.db.query(
                        'SELECT id, name FROM user_exercise_habits WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.exerciseHabits = exerciseResult.rows;

                    // Get living situations (using user_living_situations table)
                    const livingResult = await this.authController.db.query(
                        'SELECT id, name FROM user_living_situations WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.livingSituations = livingResult.rows;
                    
                    // Get have-children statuses (for "About Me" section)
                    const haveChildrenResult = await this.authController.db.query(
                        'SELECT id, name FROM user_have_children_statuses WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.haveChildrenStatuses = haveChildrenResult.rows;
                    // Backward compatibility: keep childrenStatuses alias
                    lookupData.childrenStatuses = haveChildrenResult.rows;

                    // Get preferred-children statuses (for "What I'm Looking For" section)
                    const preferredChildrenResult = await this.authController.db.query(
                        'SELECT id, name FROM user_preferred_children_statuses WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.preferredChildrenStatuses = preferredChildrenResult.rows;

                    // Get religions
                    const religionsResult = await this.authController.db.query(
                        'SELECT id, name FROM user_religions WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.religions = religionsResult.rows;

                    // Get occupation categories
                    const occupationResult = await this.authController.db.query(
                        'SELECT id, name FROM user_occupation_categories WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.occupationCategories = occupationResult.rows;

                    // Get heights from user_height_reference table
                    // Include display_text column and handle special options (NULL height_cm)
                    const heightsResult = await this.authController.db.query(
                        `SELECT id, height_cm, display_text 
                         FROM user_height_reference 
                         ORDER BY 
                            display_order ASC,
                            CASE WHEN height_cm IS NULL THEN 1 ELSE 0 END,
                            height_cm ASC NULLS LAST`
                    );
                    lookupData.heights = heightsResult.rows.map(row => {
                        // If display_text exists (for special options like "Prefer not to say"), use it directly
                        if (row.display_text) {
                            return {
                                id: row.id,
                                height_cm: row.height_cm, // Will be NULL for special options
                                display_text: row.display_text
                            };
                        }
                        // Otherwise, format numeric height (convert cm to feet/inches)
                        if (row.height_cm !== null) {
                            const feet = Math.floor(row.height_cm / 30.48);
                            const inches = Math.round((row.height_cm / 2.54) % 12);
                            return {
                                id: row.id,
                                height_cm: row.height_cm,
                                display_text: `${row.height_cm} cm (${feet}' ${inches}")`
                            };
                        }
                        // Fallback for NULL height_cm without display_text
                        return {
                            id: row.id,
                            height_cm: row.height_cm,
                            display_text: 'N/A'
                        };
                    });

                    // Get weights from user_weight_reference table
                    // Include display_text column and handle special options (NULL weight_kg)
                    const weightsResult = await this.authController.db.query(
                        `SELECT id, weight_kg, display_text 
                         FROM user_weight_reference 
                         ORDER BY 
                            display_order ASC,
                            CASE WHEN weight_kg IS NULL THEN 1 ELSE 0 END,
                            weight_kg ASC NULLS LAST`
                    );
                    lookupData.weights = weightsResult.rows.map(row => {
                        // If display_text exists (for special options like "Prefer not to say"), use it directly
                        if (row.display_text) {
                            return {
                                id: row.id,
                                weight_kg: row.weight_kg, // Will be NULL for special options
                                display_text: row.display_text
                            };
                        }
                        // Otherwise, format numeric weight (convert kg to lbs)
                        if (row.weight_kg !== null) {
                            const lbs = Math.round(row.weight_kg * 2.20462);
                            return {
                                id: row.id,
                                weight_kg: row.weight_kg,
                                display_text: `${row.weight_kg} kg (${lbs} lbs)`
                            };
                        }
                        // Fallback for NULL weight_kg without display_text
                        return {
                            id: row.id,
                            weight_kg: row.weight_kg,
                            display_text: 'N/A'
                        };
                    });

                    // Get interest categories from user_interest_categories table
                    const interestCategoriesResult = await this.authController.db.query(
                        'SELECT id, name, description, icon, icon AS emoji, color FROM user_interest_categories WHERE is_active = true ORDER BY name ASC'
                    );
                    lookupData.interestCategories = interestCategoriesResult.rows;

                    // Get hobbies from user_hobbies_reference table (use available columns only)
                    try {
                        const hobbiesResult = await this.authController.db.query(
                            'SELECT id, name, icon, icon AS emoji FROM user_hobbies_reference WHERE is_active = true ORDER BY display_order ASC, name ASC'
                        );
                        lookupData.hobbies = hobbiesResult.rows;
                        // Backward-compatible aliases
                        lookupData.hobbies_reference = hobbiesResult.rows;
                        lookupData.hobbiesReference = hobbiesResult.rows;
                    } catch (hobbyErr) {
                        lookupData.hobbies = [];
                        lookupData.hobbies_reference = [];
                        lookupData.hobbiesReference = [];
                    }

                    // Get income ranges
                    const incomeResult = await this.authController.db.query(
                        'SELECT id, name FROM user_income_ranges WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.incomeRanges = incomeResult.rows;

                    // Get marital statuses
                    const maritalStatusResult = await this.authController.db.query(
                        'SELECT id, name FROM user_marital_statuses WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.maritalStatuses = maritalStatusResult.rows;

                    // Get lifestyle preferences
                    const lifestyleResult = await this.authController.db.query(
                        'SELECT id, name FROM user_lifestyle_preferences WHERE is_active = true ORDER BY display_order ASC, name ASC'
                    );
                    lookupData.lifestylePreferences = lifestyleResult.rows;

                    // Get relationship types
                    try {
                        const relationshipTypesResult = await this.authController.db.query(
                            'SELECT id, display_name, description FROM user_relationship_type_reference WHERE is_active = true ORDER BY display_order ASC, display_name ASC'
                        );
                        lookupData.relationshipTypes = relationshipTypesResult.rows;
                    } catch (err) {
                        console.warn('Relationship types table not found, using empty array');
                        lookupData.relationshipTypes = [];
                    }

                    // Get body art (try known table name variants)
                    try {
                        const bodyArtTables = [
                            'user_body_art',
                            'user_body_arts',
                            'user_body_art_types',
                            'body_art',
                            'body_art_types'
                        ];
                        let bodyArtRows = [];
                        for (const tableName of bodyArtTables) {
                            try {
                                const bodyArtResult = await this.authController.db.query(
                                    `SELECT id, name FROM ${tableName} WHERE is_active = true ORDER BY display_order ASC, name ASC`
                                );
                                bodyArtRows = bodyArtResult.rows;
                                if (bodyArtRows && bodyArtRows.length) break;
                            } catch (innerErr) {
                                // continue to next table name
                            }
                        }
                        lookupData.bodyArt = bodyArtRows || [];
                    } catch (err) {
                        lookupData.bodyArt = [];
                    }

                    // Get english ability (try known table name variants)
                    try {
                        const englishAbilityTables = [
                            'user_english_ability',
                            'user_english_abilities',
                            'english_ability',
                            'english_abilities',
                            'english_levels',
                            'language_ability'
                        ];
                        let englishRows = [];
                        for (const tableName of englishAbilityTables) {
                            try {
                                const englishAbilityResult = await this.authController.db.query(
                                    `SELECT id, name FROM ${tableName} WHERE is_active = true ORDER BY display_order ASC, name ASC`
                                );
                                englishRows = englishAbilityResult.rows;
                                if (englishRows && englishRows.length) break;
                            } catch (innerErr) {
                                // continue to next table name
                            }
                        }
                        lookupData.englishAbility = englishRows || [];
                    } catch (err) {
                        lookupData.englishAbility = [];
                    }

                    // Get relocation willingness (only if table exists)
                    try {
                        const relocationResult = await this.authController.db.query(
                            'SELECT id, name FROM user_relocation_willingness WHERE is_active = true ORDER BY display_order ASC, name ASC'
                        );
                        lookupData.relocationPreferences = relocationResult.rows;
                    } catch (err) {
                        lookupData.relocationPreferences = [];
                    }
                    
                    // Get countries for preferred countries dropdown
                    try {
                        const countriesResult = await this.authController.db.query(
                            'SELECT id, name, emoji FROM country ORDER BY name ASC'
                        );
                        lookupData.countries = countriesResult.rows;
                    } catch (err) {
                        lookupData.countries = [];
                    }

                    // Get user's preferred countries (like settings does with contact_countries)
                    const userId = session.user.id;
                    try {
                        const preferredCountriesResult = await this.authController.db.query(`
                            SELECT upc.country_id, c.name, c.emoji
                            FROM user_preferred_countries upc
                            JOIN country c ON upc.country_id = c.id
                            WHERE upc.user_id = $1
                            ORDER BY c.name ASC
                        `, [userId]);
                        lookupData.preferred_countries = preferredCountriesResult.rows.map(row => ({
                            id: row.country_id,
                            name: row.name,
                            emoji: row.emoji || ''
                        }));
                    } catch (err) {
                        lookupData.preferred_countries = [];
                    }

                    // Get number of children options
                    try {
                        const numberChildrenResult = await this.authController.db.query(
                            'SELECT id, name FROM user_number_of_children WHERE is_active = true ORDER BY display_order ASC, name ASC'
                        );
                        lookupData.numberOfChildren = numberChildrenResult.rows;
                    } catch (err) {
                        lookupData.numberOfChildren = [];
                    }

                    // Get genders (hardcoded since it's a simple list)
                    lookupData.genders = [
                        { name: 'Male' },
                        { name: 'Female' }
                    ];

                    // Get languages from languages table
                    try {
                        const languagesResult = await this.authController.db.query(
                            'SELECT id, name, native_name, iso_code FROM languages WHERE is_active = true ORDER BY display_order, name ASC'
                        );
                        lookupData.languages = languagesResult.rows;
                    } catch (err) {
                        lookupData.languages = [];
                    }

                    // Get fluency levels from user_language_fluency_levels table
                    try {
                        const fluencyResult = await this.authController.db.query(
                            'SELECT id, name, description, cefr_level FROM user_language_fluency_levels WHERE is_active = true ORDER BY display_order, name ASC'
                        );
                        lookupData.fluencyLevels = fluencyResult.rows;
                    } catch (err) {
                        lookupData.fluencyLevels = [];
                    }
                } catch (dbError) {
                    // Database error handled silently
                }

                res.json({
                    success: true,
                    data: lookupData
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // Profile update endpoint
        router.post('/api/profile/update', async (req, res) => {
            try {
                const sessionToken = this.extractSessionToken(req);
                const session = this.validateSession(sessionToken, res);
                if (!session) return;
                
                const { userId, ...profileData } = req.body;

                // Capture multi-select interests (interest_categories or interest_categories[])
                const rawInterests = req.body.interest_categories !== undefined
                    ? req.body.interest_categories
                    : req.body['interest_categories[]'];

                const interestCategories = Array.isArray(rawInterests)
                    ? rawInterests
                    : rawInterests ? [rawInterests] : [];

                // Remove keys so they don't get treated as columns
                delete profileData.interest_categories;
                delete profileData['interest_categories[]'];

                // Use first interest as legacy single selection
                const normalizedInterestIds = interestCategories
                    .map(v => {
                        const n = parseInt(v, 10);
                        return !isNaN(n) ? n : null;
                    })
                    .filter(v => v !== null);
                if (normalizedInterestIds.length > 0) {
                    profileData.interest_category = normalizedInterestIds[0];
                }

                // Capture hobbies (hobbies or hobbies[])
                // Only process hobbies if they are explicitly provided in the request
                const hasHobbiesInRequest = req.body.hobbies !== undefined || req.body['hobbies[]'] !== undefined;
                const rawHobbies = req.body.hobbies !== undefined ? req.body.hobbies : req.body['hobbies[]'];
                const hobbyList = hasHobbiesInRequest ? (Array.isArray(rawHobbies) ? rawHobbies : rawHobbies ? [rawHobbies] : []) : null;
                delete profileData.hobbies;
                delete profileData['hobbies[]'];
                const normalizedHobbyIds = hobbyList
                    ? hobbyList
                        .map(v => {
                            const n = parseInt(v, 10);
                            return !isNaN(n) ? n : null;
                        })
                        .filter(v => v !== null)
                    : null;
                
                // Sanitize text fields to prevent code injection
                if (profileData.aboutMe && typeof profileData.aboutMe === 'string') {
                    profileData.aboutMe = this.sanitizeText(profileData.aboutMe);
                }
                if (req.body.partner_preferences && typeof req.body.partner_preferences === 'string') {
                    profileData.partner_preferences = this.sanitizeText(req.body.partner_preferences);
                }
                
                // Use authenticated user's ID from session, not from request body
                const authenticatedUserId = session.user.id;
                
                if (!authenticatedUserId) {
                    return res.status(400).json({
                        success: false,
                        error: 'User ID is required',
                        details: {
                            sessionUser: session.user,
                            authenticatedUserId: authenticatedUserId
                        }
                    });
                }
                
                // Use authenticated user ID instead of request body userId for security
                const userIdToUpdate = authenticatedUserId;

                // Update profile in database - dynamic field mapping
                const attrUpdateFields = [];
                const attrUpdateValues = [];
                let attrParamCount = 1;

                // Separate fields that go to users table vs user_attributes table vs user_preferences table
                const userFields = [];
                const attrFields = [];
                const preferenceFields = [];
                
                // List of preference field names
                const preferenceFieldNames = [
                    'preferred_age_min', 'preferred_age_max', 'preferred_distance',
                    'preferred_gender', 'preferred_height', 'preferred_weight',
                    'preferred_body_type', 'preferred_education', 'preferred_religion', 
                    'preferred_smoking', 'preferred_drinking', 'preferred_children',
                    'preferred_number_of_children',
                    'preferred_exercise',
                    'preferred_eye_color', 'preferred_hair_color', 'preferred_ethnicity',
                    'preferred_occupation', 'preferred_income', 'preferred_marital_status',
                    'preferred_lifestyle', 'preferred_body_art', 'preferred_english_ability',
                    'partner_preferences', 'relationship_type'
                ];
                
                // Field mapping for user_attributes (form field name -> database column name)
                const attrFieldMap = {
                    'aboutMe': 'about_me',
                    'body_type': 'body_type_id',
                    'eye_color': 'eye_color_id',
                    'hair_color': 'hair_color_id',
                    'ethnicity': 'ethnicity_id',
                    'religion': 'religion_id',
                    'education': 'education_id',
                    'occupation': 'occupation_category_id',
                    'smoking': 'smoking_preference_id',
                    'drinking': 'drinking_preference_id',
                    'exercise': 'exercise_habits_id',
                    'children': 'living_situation_id',
                    'living_situation': 'living_situation_id',
                    'have_children': 'have_children',
                    'interest_category': 'interest_category_id',
                    'income': 'income_id',
                    'marital_status': 'marital_status_id',
                    'lifestyle': 'lifestyle_id',
                    'body_art': 'body_art_id',
                    'english_ability': 'english_ability_id',
                    'relocation': 'relocation_id',
                    'number_of_children': 'number_of_children_id'
                };
                
                // Check what fields exist in the database and map them dynamically
                // Handle height_reference_id conversion first
                if (profileData.height_reference_id) {
                    // Look up height_cm from user_height_reference table
                    const heightRefResult = await this.authController.db.query(
                        'SELECT height_cm FROM user_height_reference WHERE id = $1',
                        [profileData.height_reference_id]
                    );
                    if (heightRefResult.rows.length > 0) {
                        const heightCm = heightRefResult.rows[0].height_cm;
                        // Handle special options (NULL height_cm for "Prefer not to say", "Not important", "Other")
                        if (heightCm !== null) {
                            profileData.height_cm = heightCm;
                        } else {
                            // For special options, set height_cm to NULL (user doesn't want to specify)
                            profileData.height_cm = null;
                        }
                    }
                    // Remove height_reference_id from profileData since we've converted it
                    delete profileData.height_reference_id;
                }
                
                // Handle weight_reference_id conversion
                if (profileData.weight_reference_id) {
                    // Look up weight_kg from user_weight_reference table
                    const weightRefResult = await this.authController.db.query(
                        'SELECT weight_kg FROM user_weight_reference WHERE id = $1',
                        [profileData.weight_reference_id]
                    );
                    if (weightRefResult.rows.length > 0) {
                        const weightKg = weightRefResult.rows[0].weight_kg;
                        // Handle special options (NULL weight_kg for "Prefer not to say" and "Not important")
                        if (weightKg !== null) {
                            profileData.weight_kg = weightKg;
                        } else {
                            // For special options, set weight_kg to NULL (user doesn't want to specify)
                            profileData.weight_kg = null;
                        }
                    }
                    // Remove weight_reference_id from profileData since we've converted it
                    delete profileData.weight_reference_id;
                }
                
                // Handle preferred_height_reference_id conversion
                if (profileData.preferred_height_reference_id) {
                    // Look up height_cm from user_height_reference table
                    const preferredHeightRefResult = await this.authController.db.query(
                        'SELECT height_cm FROM user_height_reference WHERE id = $1',
                        [profileData.preferred_height_reference_id]
                    );
                    if (preferredHeightRefResult.rows.length > 0) {
                        const heightCm = preferredHeightRefResult.rows[0].height_cm;
                        // Handle special options (NULL height_cm for "Prefer not to say", "Not important", "Other")
                        // For preferences, use '0' for "Not important" (existing pattern)
                        if (heightCm !== null) {
                            profileData.preferred_height = String(heightCm);
                        } else {
                            // For special options with NULL height_cm, set to '0' for "Not important" pattern
                            // Or we could check display_text to determine which special option, but '0' works for now
                            profileData.preferred_height = '0';
                        }
                    }
                    // Remove preferred_height_reference_id from profileData since we've converted it
                    delete profileData.preferred_height_reference_id;
                }
                
                // Handle preferred_weight_reference_id conversion (similar to preferred_height_reference_id)
                if (profileData.preferred_weight_reference_id) {
                    // Look up weight_kg from user_weight_reference table
                    const preferredWeightRefResult = await this.authController.db.query(
                        'SELECT weight_kg FROM user_weight_reference WHERE id = $1',
                        [profileData.preferred_weight_reference_id]
                    );
                    if (preferredWeightRefResult.rows.length > 0) {
                        const weightKg = preferredWeightRefResult.rows[0].weight_kg;
                        // Handle special options (NULL weight_kg for "Prefer not to say", "Not important", "Other")
                        // For preferences, use '0' for "Not important" (existing pattern)
                        if (weightKg !== null) {
                            profileData.preferred_weight = String(weightKg);
                        } else {
                            // For special options with NULL weight_kg, set to '0' for "Not important" pattern
                            profileData.preferred_weight = '0';
                        }
                    }
                    // Remove preferred_weight_reference_id from profileData since we've converted it
                    delete profileData.preferred_weight_reference_id;
                }
                
                // Filter out "Not specified" and "Any" values from preference fields
                const preferenceFieldsToClean = [
                    'preferred_body_type', 'preferred_education', 'preferred_religion', 
                    'preferred_smoking', 'preferred_drinking', 'preferred_children',
                    'preferred_number_of_children',
                    'preferred_gender', 'preferred_eye_color', 'preferred_hair_color', 
                    'preferred_ethnicity', 'preferred_occupation', 'preferred_income', 
                    'preferred_marital_status', 'preferred_lifestyle', 'preferred_body_art', 
                    'preferred_english_ability', 'relationship_type'
                ];
                for (const fieldName of preferenceFieldsToClean) {
                    if (profileData[fieldName] === 'Not specified' || profileData[fieldName] === 'Any' || profileData[fieldName] === '') {
                        delete profileData[fieldName];
                    }
                }
                
                // Handle body_type_id if it comes in as a name (should be ID, but handle both)
                if (profileData.body_type_id && profileData.body_type_id !== '') {
                    const numericValue = parseInt(profileData.body_type_id);
                    if (isNaN(numericValue) || numericValue <= 0) {
                        // Value is a name, look up the ID
                        try {
                            const idResult = await this.authController.db.query(
                                'SELECT id FROM user_body_types WHERE name = $1',
                                [profileData.body_type_id]
                            );
                            if (idResult.rows.length > 0) {
                                profileData.body_type_id = idResult.rows[0].id;
                            } else {
                                delete profileData.body_type_id;
                            }
                        } catch (err) {
                            delete profileData.body_type_id;
                        }
                    }
                    // If it's already a valid number, keep it as is
                }
                
                // Handle name-based fields that need ID lookup (eye_color, hair_color, etc.)
                const nameToIdFields = ['body_type', 'eye_color', 'hair_color', 'ethnicity', 'religion', 'education', 'occupation', 'smoking', 'drinking', 'exercise', 'children', 'living_situation', 'have_children', 'number_of_children', 'interest_category', 'income', 'marital_status', 'lifestyle', 'body_art', 'english_ability', 'relocation'];
                for (const fieldName of nameToIdFields) {
                    if (profileData[fieldName] && profileData[fieldName] !== '' && profileData[fieldName] !== 'Not specified' && profileData[fieldName] !== 'Any') {
                        const dbTableMap = {
                            'body_type': 'user_body_types',
                            'eye_color': 'user_eye_colors',
                            'hair_color': 'user_hair_colors',
                            'ethnicity': 'user_ethnicities',
                            'religion': 'user_religions',
                            'education': 'user_education_levels',
                            'occupation': 'user_occupation_categories',
                            'smoking': 'user_smoking_preferences',
                            'drinking': 'user_drinking_preferences',
                            'exercise': 'user_exercise_habits',
                            'children': 'user_living_situations',
                            'living_situation': 'user_living_situations',
                            'have_children': 'user_have_children_statuses',
                            'interest_category': 'user_interest_categories',
                            'income': 'user_income_ranges',
                            'marital_status': 'user_marital_statuses',
                            'lifestyle': 'user_lifestyle_preferences',
                            'relocation': 'user_relocation_willingness',
                            'number_of_children': 'user_number_of_children'
                        };

                        // Resolve body_art and english_ability using flexible table names
                        const resolveTableName = async (field) => {
                            if (field === 'body_art') {
                                const candidates = [
                                    'user_body_art',
                                    'user_body_arts',
                                    'user_body_art_types',
                                    'body_art',
                                    'body_art_types'
                                ];
                                for (const candidate of candidates) {
                                    try {
                                        const probe = await this.authController.db.query(
                                            `SELECT id FROM ${candidate} LIMIT 1`
                                        );
                                        if (probe && probe.rows) {
                                            return candidate;
                                        }
                                    } catch (innerErr) {
                                        // try next
                                    }
                                }
                                return null;
                            }
                            if (field === 'english_ability') {
                                const candidates = [
                                    'user_english_ability',
                                    'user_english_abilities',
                                    'english_ability',
                                    'english_abilities',
                                    'english_levels',
                                    'language_ability'
                                ];
                                for (const candidate of candidates) {
                                    try {
                                        const probe = await this.authController.db.query(
                                            `SELECT id FROM ${candidate} LIMIT 1`
                                        );
                                        if (probe && probe.rows) {
                                            return candidate;
                                        }
                                    } catch (innerErr) {
                                        // try next
                                    }
                                }
                                return null;
                            }
                            return dbTableMap[field] || null;
                        };

                        const tableName = await resolveTableName(fieldName);
                        if (tableName) {
                            try {
                                // Check if value is already a number (ID), if so use it directly
                                const numericValue = parseInt(profileData[fieldName]);
                                if (!isNaN(numericValue) && numericValue > 0) {
                                    // Value is already an ID, use it directly
                                    const mappedField = attrFieldMap[fieldName] || `${fieldName}_id`;
                                    profileData[mappedField] = numericValue;
                                    // Only delete if mappedField is different from fieldName
                                    if (mappedField !== fieldName) {
                                        delete profileData[fieldName];
                                    }
                                } else {
                                    // Value is a name, look up the ID
                                    const idResult = await this.authController.db.query(
                                        `SELECT id FROM ${tableName} WHERE name = $1`,
                                        [profileData[fieldName]]
                                    );
                                    if (idResult.rows.length > 0) {
                                        const mappedField = attrFieldMap[fieldName] || `${fieldName}_id`;
                                        profileData[mappedField] = idResult.rows[0].id;
                                        // Only delete if mappedField is different from fieldName
                                        if (mappedField !== fieldName) {
                                            delete profileData[fieldName];
                                        }
                                    } else {
                                        delete profileData[fieldName];
                                    }
                                }
                            } catch (err) {
                                // Error looking up field name - log and skip this field
                                // Remove the field to prevent database errors
                                delete profileData[fieldName];
                            }
                        }
                    } else if (profileData[fieldName] === 'Not specified' || profileData[fieldName] === 'Any') {
                        // Remove "Not specified" and "Any" values
                        delete profileData[fieldName];
                    }
                }
                
                // Convert age to birthdate if age is provided
                if (profileData.age && profileData.age !== '') {
                    const age = parseInt(profileData.age);
                    if (!isNaN(age) && age > 0 && age <= 120) {
                        // Calculate birthdate: current year - age, default to January 1st
                        const currentYear = new Date().getFullYear();
                        const birthYear = currentYear - age;
                        profileData.birthdate = `${birthYear}-01-01`;
                        delete profileData.age; // Remove age, we'll use birthdate instead
                    }
                }
                
                for (const [formField, value] of Object.entries(profileData)) {
                    // Skip preferred_countries - it's handled separately in user_preferred_countries junction table
                    if (formField === 'preferred_countries') {
                        continue;
                    }
                    
                    // Handle geo fields (country, state, city) specially - allow null values to clear them
                    if (['country', 'state', 'city'].includes(formField)) {
                        if (value !== undefined && formField !== 'sessionToken' && formField !== 'userId') {
                            // Allow null values for state and city to clear them in database
                            // Country should not be null (skip if empty)
                            if (formField === 'country' && (value === '' || value === null)) {
                                continue; // Skip empty country
                            }
                            // Only add location fields if they have actual values (not empty strings)
                            // This prevents false positives when form is submitted with unchanged location fields
                            if (value !== '' && value !== null) {
                                userFields.push({ formField, dbField: formField, value: value === '' ? null : value });
                            }
                        }
                        continue; // Skip to next field
                    }
                    
                    if (value !== undefined && value !== '' && formField !== 'sessionToken' && formField !== 'userId') {
                        // Skip fields that should have been converted (safeguard)
                        if (formField === 'preferred_height_reference_id' || formField === 'preferred_weight_reference_id' || formField === 'height_reference_id' || formField === 'weight_reference_id') {
                            continue;
                        }
                        // Try to map to database column (convert camelCase to snake_case)
                        let dbField = formField.replace(/([A-Z])/g, '_$1').toLowerCase();
                        
                        // Apply field mapping if exists
                        if (attrFieldMap[formField]) {
                            dbField = attrFieldMap[formField];
                        }
                        
                        if (formField === 'real_name' || formField === 'realName') {
                            // Real name goes to users table - validate and sanitize
                            if (value && typeof value === 'string') {
                                const trimmedValue = value.trim();
                                // Validate length
                                if (trimmedValue.length < 2 || trimmedValue.length > 100) {
                                    continue; // Skip invalid real_name
                                }
                                // Validate format (letters only)
                                if (!/^[a-zA-Z]{2,100}$/.test(trimmedValue)) {
                                    continue; // Skip invalid format
                                }
                                userFields.push({ formField, dbField: 'real_name', value: trimmedValue });
                            }
                        } else if (formField === 'gender') {
                            // Gender goes to users table - normalize to lowercase 'male'/'female'
                            let dbGenderValue = value;
                            const genderLower = (value || '').toLowerCase().trim();
                            if (genderLower === 'male' || genderLower === 'm') {
                                dbGenderValue = 'male';
                            } else if (genderLower === 'female' || genderLower === 'f') {
                                dbGenderValue = 'female';
                            } else {
                                dbGenderValue = genderLower; // Keep other values but lowercase
                            }
                            userFields.push({ formField, dbField: 'gender', value: dbGenderValue });
                        } else if (formField === 'birthdate') {
                            // Birthdate goes to users table
                            userFields.push({ formField, dbField: 'birthdate', value });
                        } else if (preferenceFieldNames.includes(dbField)) {
                            // Preferences go to user_preferences table
                            // Safeguard: double-check that "About Me" fields (in attrFieldMap) don't go here
                            if (attrFieldMap[formField] && !formField.startsWith('preferred_')) {
                                // Sanitize text fields to prevent code injection
                                let sanitizedValue = value;
                                if (formField === 'aboutMe' && typeof value === 'string') {
                                    sanitizedValue = this.sanitizeText(value);
                                }
                                // This is an "About Me" field, route to attributes instead
                                attrFields.push({ formField, dbField: attrFieldMap[formField], value: sanitizedValue });
                            } else {
                                // Sanitize partner_preferences if it's in preferences
                                let sanitizedValue = value;
                                if (formField === 'partner_preferences' && typeof value === 'string') {
                                    sanitizedValue = this.sanitizeText(value);
                                }
                                preferenceFields.push({ formField, dbField, value: sanitizedValue });
                            }
                        } else {
                            // Sanitize text fields to prevent code injection
                            let sanitizedValue = value;
                            if (formField === 'aboutMe' && typeof value === 'string') {
                                sanitizedValue = this.sanitizeText(value);
                            }
                            if (formField === 'partner_preferences' && typeof value === 'string') {
                                sanitizedValue = this.sanitizeText(value);
                            }
                            
                            // Other profile data goes to user_attributes table
                            // Safeguard: double-check that "preferred" fields and preferred_countries don't go here
                            if (formField === 'preferred_countries') {
                                // preferred_countries is handled separately in user_preferred_countries junction table
                                // Should never reach here due to skip at line 1135, but extra safeguard
                                continue;
                            } else if ((formField.startsWith('preferred_') || formField === 'partner_preferences') && preferenceFieldNames.includes(formField)) {
                                // This is a "preferred" field or partner_preferences, route to preferences instead
                                preferenceFields.push({ formField, dbField: formField, value: sanitizedValue });
                            } else {
                                attrFields.push({ formField, dbField, value: sanitizedValue });
                            }
                        }
                    }
                }

                // Build users table update
                const userUpdateFields = [];
                const userUpdateValues = [];
                let userParamCount = 1;
                
                // Track location changes for history and rate limiting
                const locationFieldsBeingUpdated = [];
                const newLocationValues = { country_id: null, state_id: null, city_id: null };
                
                for (const field of userFields) {
                    // Geo fields need _id suffix, but gender doesn't
                    if (['country', 'state', 'city'].includes(field.formField)) {
                        userUpdateFields.push(`${field.dbField}_id = $${userParamCount}`);
                        // Only track if not already added (prevent duplicates)
                        if (!locationFieldsBeingUpdated.includes(field.formField)) {
                            locationFieldsBeingUpdated.push(field.formField);
                        }
                        // Store new location values
                        if (field.formField === 'country') {
                            newLocationValues.country_id = field.value;
                        } else if (field.formField === 'state') {
                            newLocationValues.state_id = field.value;
                        } else if (field.formField === 'city') {
                            newLocationValues.city_id = field.value;
                        }
                    } else {
                        userUpdateFields.push(`${field.dbField} = $${userParamCount}`);
                    }
                    userUpdateValues.push(field.value);
                    userParamCount++;
                }

                // Check rate limiting and log location changes if location is being updated
                // Only check if location fields are actually being updated (not just present in form)
                if (locationFieldsBeingUpdated.length > 0) {
                    // Get current location values
                    const currentLocationResult = await this.authController.db.query(
                        'SELECT country_id, state_id, city_id FROM users WHERE id = $1',
                        [userIdToUpdate]
                    );
                    
                    if (currentLocationResult.rows.length > 0) {
                        const oldLocationValues = {
                            country_id: currentLocationResult.rows[0].country_id,
                            state_id: currentLocationResult.rows[0].state_id,
                            city_id: currentLocationResult.rows[0].city_id
                        };
                        
                        // Normalize values: convert empty strings and undefined to null for comparison
                        const normalizeValue = (val) => {
                            if (val === '' || val === undefined || val === null) return null;
                            // Convert to string for comparison to handle number/string mismatches
                            return String(val);
                        };
                        
                        // Check if location actually changed - only check fields being updated
                        let locationChanged = false;
                        if (locationFieldsBeingUpdated.includes('country')) {
                            const oldVal = normalizeValue(oldLocationValues.country_id);
                            const newVal = normalizeValue(newLocationValues.country_id);
                            // Only consider it changed if both values are not null and different
                            if (oldVal !== null && newVal !== null && oldVal !== newVal) {
                                locationChanged = true;
                            } else if ((oldVal === null) !== (newVal === null)) {
                                // One is null and the other isn't - that's a change
                                locationChanged = true;
                            }
                        }
                        if (locationFieldsBeingUpdated.includes('state')) {
                            const oldVal = normalizeValue(oldLocationValues.state_id);
                            const newVal = normalizeValue(newLocationValues.state_id);
                            if (oldVal !== null && newVal !== null && oldVal !== newVal) {
                                locationChanged = true;
                            } else if ((oldVal === null) !== (newVal === null)) {
                                locationChanged = true;
                            }
                        }
                        if (locationFieldsBeingUpdated.includes('city')) {
                            const oldVal = normalizeValue(oldLocationValues.city_id);
                            const newVal = normalizeValue(newLocationValues.city_id);
                            if (oldVal !== null && newVal !== null && oldVal !== newVal) {
                                locationChanged = true;
                            } else if ((oldVal === null) !== (newVal === null)) {
                                locationChanged = true;
                            }
                        }
                        
                        // Only run rate limiting check if location actually changed
                        if (locationChanged) {
                            // Check rate limiting: max 1 change per 30 days
                            const rateLimitCheck = await this.authController.db.query(`
                                SELECT COUNT(*) as change_count
                                FROM user_location_history
                                WHERE user_id = $1
                                AND changed_at > NOW() - INTERVAL '30 days'
                            `, [userIdToUpdate]);
                            
                            const changeCount = parseInt(rateLimitCheck.rows[0].change_count || 0);
                            const maxChangesPerMonth = 1;
                            
                            if (changeCount >= maxChangesPerMonth) {
                                // Return success response with location limit flag for toast notification
                                return res.status(200).json({
                                    success: true,
                                    locationLimitReached: true,
                                    message: `You have changed your location ${changeCount} time(s) in the last 30 days. Maximum ${maxChangesPerMonth} change(s) allowed per 30 days. Please wait before changing your location again.`
                                });
                            }
                            
                            // Build new location values - only update fields that are being changed
                            const finalNewLocation = { ...oldLocationValues };
                            if (locationFieldsBeingUpdated.includes('country') && newLocationValues.country_id !== null && newLocationValues.country_id !== undefined) {
                                finalNewLocation.country_id = newLocationValues.country_id;
                            }
                            if (locationFieldsBeingUpdated.includes('state')) {
                                // State can be set to null to clear it
                                finalNewLocation.state_id = newLocationValues.state_id;
                            }
                            if (locationFieldsBeingUpdated.includes('city')) {
                                // City can be set to null to clear it
                                finalNewLocation.city_id = newLocationValues.city_id;
                            }
                            
                            // Store old and new values for logging after update
                            req.locationChangeData = {
                                old: oldLocationValues,
                                new: finalNewLocation
                            };
                        }
                    }
                }

                // Build user_attributes table update
                // Filter out preferred_countries to ensure it never goes to user_attributes
                const attrFieldsFiltered = attrFields.filter(f => f.formField !== 'preferred_countries' && f.dbField !== 'preferred_countries');
                
                for (const field of attrFieldsFiltered) {
                    attrUpdateFields.push(`${field.dbField} = $${attrParamCount}`);
                    attrUpdateValues.push(field.value);
                    attrParamCount++;
                }

                // Check if real_name was updated (before database update)
                const realNameField = userFields.find(f => f.dbField === 'real_name');
                let newRealName = null;
                let oldRealName = null;
                let nameChanged = false;
                
                if (realNameField) {
                    newRealName = realNameField.value;
                    
                    // Get old name BEFORE update
                    const oldNameResult = await this.authController.db.query(
                        'SELECT real_name FROM users WHERE id = $1',
                        [userIdToUpdate]
                    );
                    oldRealName = oldNameResult.rows[0]?.real_name || null;
                    
                    // Normalize values for comparison (trim and handle null/empty)
                    const normalizeName = (val) => {
                        if (!val || val === null || val === undefined) return null;
                        return String(val).trim();
                    };
                    
                    const oldNameNormalized = normalizeName(oldRealName);
                    const newNameNormalized = normalizeName(newRealName);
                    
                    // Check if name actually changed
                    if (oldNameNormalized !== newNameNormalized) {
                        nameChanged = true;
                        
                        // Check rate limiting: max 1 change per 90 days (3 months)
                        const rateLimitCheck = await this.authController.db.query(`
                            SELECT COUNT(*) as change_count
                            FROM user_name_change_history
                            WHERE user_id = $1
                            AND changed_at > NOW() - INTERVAL '90 days'
                        `, [userIdToUpdate]);
                        
                        const changeCount = parseInt(rateLimitCheck.rows[0].change_count || 0);
                        const maxChangesPerQuarter = 1;
                        
                        if (changeCount >= maxChangesPerQuarter) {
                            // Return success response with name limit flag for toast notification
                            return res.status(200).json({
                                success: true,
                                nameLimitReached: true,
                                message: `You have changed your name ${changeCount} time(s) in the last 90 days. Maximum ${maxChangesPerQuarter} change(s) allowed per 90 days. Please wait before changing your name again.`
                            });
                        }
                    }
                }

                // Update users table if there are fields to update
                if (userUpdateFields.length > 0) {
                    userUpdateValues.push(userIdToUpdate);
                    const userUpdateQuery = `
                        UPDATE users 
                        SET ${userUpdateFields.join(', ')}
                        WHERE id = $${userParamCount}
                    `;
                    try {
                    await this.authController.db.query(userUpdateQuery, userUpdateValues);
                    
                    // Log location change to history table after successful update
                    if (req.locationChangeData) {
                        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                        const userAgent = req.headers['user-agent'] || null;
                        
                        await this.authController.db.query(`
                            INSERT INTO user_location_history 
                            (user_id, old_country_id, old_state_id, old_city_id, 
                             new_country_id, new_state_id, new_city_id, 
                             ip_address, user_agent, changed_at)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                        `, [
                            userIdToUpdate,
                            req.locationChangeData.old.country_id || null,
                            req.locationChangeData.old.state_id || null,
                            req.locationChangeData.old.city_id || null,
                            req.locationChangeData.new.country_id || null,
                            req.locationChangeData.new.state_id || null,
                            req.locationChangeData.new.city_id || null,
                            ipAddress || null,
                            userAgent || null
                        ]);
                        
                        // Clear location change data after logging
                        delete req.locationChangeData;
                    }
                    
                    // Log name change to history table after successful update
                    if (nameChanged && newRealName && oldRealName !== newRealName) {
                        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                        const userAgent = req.headers['user-agent'] || null;
                        
                        try {
                            await this.authController.db.query(`
                                INSERT INTO user_name_change_history 
                                (user_id, old_real_name, new_real_name, ip_address, user_agent, changed_at)
                                VALUES ($1, $2, $3, $4, $5, NOW())
                            `, [
                                userIdToUpdate,
                                oldRealName || null,
                                newRealName,
                                ipAddress || null,
                                userAgent || null
                            ]);
                            console.log(`📝 Logged name change for user ${userIdToUpdate}: ${oldRealName} → ${newRealName}`);
                        } catch (nameHistoryError) {
                            // Log error but don't fail the update
                            console.error('Error logging name change to history:', nameHistoryError.message);
                        }
                    }
                    } catch (err) {
                        console.error('Error updating users table:', err.message);
                        throw err;
                    }
                }

                // Update user_attributes table if there are fields to update
                if (attrUpdateFields.length > 0) {
                    attrUpdateValues.push(userIdToUpdate);
                    
                    // First check if user_attributes record exists
                    const checkAttrResult = await this.authController.db.query(
                        'SELECT user_id FROM user_attributes WHERE user_id = $1',
                        [userIdToUpdate]
                    );

                    if (checkAttrResult.rows.length > 0) {
                        // Update existing record
                        const attrUpdateQuery = `
                            UPDATE user_attributes 
                            SET ${attrUpdateFields.join(', ')}
                            WHERE user_id = $${attrParamCount}
                        `;
                        await this.authController.db.query(attrUpdateQuery, attrUpdateValues);
                    } else {
                        // Insert new record with all fields
                        // Note: attrUpdateValues already has userIdToUpdate at the end (from line 1285)
                        // So we need to extract it and use the rest for the field values
                        const fieldNames = attrUpdateFields.map(field => field.split(' = ')[0]);
                        // Remove userIdToUpdate from the end of attrUpdateValues for INSERT
                        const attrFieldValues = attrUpdateValues.slice(0, -1); // All values except the last one (userIdToUpdate)
                        const valuePlaceholders = attrFieldValues.map((_, i) => `$${i + 2}`).join(', ');
                        const attrInsertQuery = `
                            INSERT INTO user_attributes (user_id, ${fieldNames.join(', ')})
                            VALUES ($1, ${valuePlaceholders})
                        `;
                        await this.authController.db.query(attrInsertQuery, [userIdToUpdate, ...attrFieldValues]);
                    }
                }

                // Handle preferred_countries separately (save to user_preferred_countries table)
                if (profileData.preferred_countries !== undefined) {
                    // Delete existing preferred countries
                    await this.authController.db.query(
                        'DELETE FROM user_preferred_countries WHERE user_id = $1',
                        [userIdToUpdate]
                    );
                    
                    // Insert new preferred countries if provided
                    if (Array.isArray(profileData.preferred_countries) && profileData.preferred_countries.length > 0) {
                        for (const country of profileData.preferred_countries) {
                            if (country && country.id) {
                                await this.authController.db.query(`
                                    INSERT INTO user_preferred_countries (user_id, country_id, is_all_countries)
                                    VALUES ($1, $2, false)
                                `, [userIdToUpdate, country.id]);
                            }
                        }
                    }
                    // If empty array, it means "All Countries" (no records = show all)
                }
                
                // Filter out preferred_countries from preferenceFields (it's handled separately)
                const preferenceFieldsFiltered = preferenceFields.filter(f => f.formField !== 'preferred_countries');
                
                // Update user_preferences table if there are preference fields to update
                if (preferenceFieldsFiltered.length > 0) {
                    // Map preference fields to database columns
                    const prefFieldMap = {
                        'preferred_age_min': 'age_min',
                        'preferred_age_max': 'age_max',
                        'preferred_distance': 'location_radius'
                    };
                    
                    // Check if user_preferences record exists
                    const checkPrefResult = await this.authController.db.query(
                        'SELECT id FROM user_preferences WHERE user_id = $1',
                        [userIdToUpdate]
                    );
                    
                    const prefUpdateFields = [];
                    const prefUpdateValues = [];
                    let prefParamCount = 1;
                    
                    for (const field of preferenceFieldsFiltered) {
                        const dbColumn = prefFieldMap[field.dbField] || field.dbField;
                        prefUpdateFields.push(`${dbColumn} = $${prefParamCount}`);
                        prefUpdateValues.push(field.value);
                        prefParamCount++;
                    }
                    
                    if (checkPrefResult.rows.length > 0) {
                        // Update existing record
                        prefUpdateValues.push(userIdToUpdate);
                        const prefUpdateQuery = `
                            UPDATE user_preferences 
                            SET ${prefUpdateFields.join(', ')}
                            WHERE user_id = $${prefParamCount}
                        `;
                        try {
                            await this.authController.db.query(prefUpdateQuery, prefUpdateValues);
                        } catch (err) {
                            console.error('Error updating user_preferences table:', err.message);
                            throw err;
                        }
                    } else {
                        // Insert new record
                        const prefColumns = prefUpdateFields.map(f => f.split(' = ')[0]);
                        // user_id should be $1, preference fields start at $2
                        const prefValuePlaceholders = prefUpdateValues.map((_, i) => `$${i + 2}`).join(', ');
                        const prefInsertQuery = `
                            INSERT INTO user_preferences (user_id, ${prefColumns.join(', ')})
                            VALUES ($1, ${prefValuePlaceholders})
                        `;
                        try {
                            await this.authController.db.query(prefInsertQuery, [userIdToUpdate, ...prefUpdateValues]);
                        } catch (err) {
                            console.error('Error inserting into user_preferences table:', err.message);
                            throw err;
                        }
                    }
                }

                // Update multi-select interests in user_interests_multiple (delete then insert)
                if (interestCategories && interestCategories.length >= 0) {
                    try {
                        await this.authController.db.query(
                            'DELETE FROM user_interests_multiple WHERE user_id = $1',
                            [userIdToUpdate]
                        );
                        if (normalizedInterestIds.length > 0) {
                            const uniqueIds = Array.from(new Set(normalizedInterestIds));
                            for (const interestId of uniqueIds) {
                                await this.authController.db.query(
                                    'INSERT INTO user_interests_multiple (user_id, interest_id) VALUES ($1, $2)',
                                    [userIdToUpdate, interestId]
                                );
                            }
                        }
                    } catch (err) {
                        console.error('Error updating user_interests_multiple:', err.message);
                    }
                }

                // Update multi-select hobbies in user_hobbies_multiple (delete then insert)
                // Only update hobbies if they were explicitly provided in the request
                if (hasHobbiesInRequest && hobbyList !== null) {
                    try {
                        await this.authController.db.query(
                            'DELETE FROM user_hobbies_multiple WHERE user_id = $1',
                            [userIdToUpdate]
                        );
                        if (normalizedHobbyIds && normalizedHobbyIds.length > 0) {
                            const uniqueHobbies = Array.from(new Set(normalizedHobbyIds));
                            for (const hobbyId of uniqueHobbies) {
                                await this.authController.db.query(
                                    'INSERT INTO user_hobbies_multiple (user_id, hobby_id) VALUES ($1, $2)',
                                    [userIdToUpdate, hobbyId]
                                );
                            }
                        }
                    } catch (err) {
                        console.error('Error updating user_hobbies_multiple:', err.message);
                    }
                }

                if (userUpdateFields.length === 0 && attrUpdateFields.length === 0 && preferenceFieldsFiltered.length === 0 && profileData.preferred_countries === undefined) {
                    return res.status(400).json({
                        success: false,
                        error: 'No valid fields to update'
                    });
                }

                // After successful database update, handle cache, session, and WebSocket updates
                if (userUpdateFields.length > 0) {
                    // 1. Clear real_name cache (Priority Action #1)
                    try {
                        if (this.redis && this.redis.isConnected) {
                            await this.redis.del(`user:${userIdToUpdate}:real_name`);
                            console.log(`🗑️ Cleared real_name cache for user ${userIdToUpdate}`);
                        } else if (redisManager && redisManager.isConnected) {
                            await redisManager.del(`user:${userIdToUpdate}:real_name`);
                            console.log(`🗑️ Cleared real_name cache for user ${userIdToUpdate}`);
                        }
                    } catch (cacheError) {
                        console.warn('Failed to clear real_name cache:', cacheError.message);
                    }

                    // 2. Update session data (Priority Action #3)
                    if (newRealName) {
                        try {
                            sessionService.updateUserSessions(userIdToUpdate, { real_name: newRealName });
                            console.log(`🔄 Updated session data for user ${userIdToUpdate}`);
                        } catch (sessionError) {
                            console.warn('Failed to update session data:', sessionError.message);
                        }
                    }

                    // 3. WebSocket notification (Priority Action #4)
                    if (newRealName && this.io && oldRealName !== newRealName) {
                        try {
                            // Notify the user's own clients
                            this.io.to(`user:${userIdToUpdate}`).emit('userNameChanged', {
                                userId: userIdToUpdate,
                                newName: newRealName,
                                oldName: oldRealName
                            });
                            
                            // Notify users in active conversations with this user
                            this.io.emit('userProfileUpdated', {
                                userId: userIdToUpdate,
                                field: 'real_name',
                                newValue: newRealName,
                                oldValue: oldRealName
                            });
                            
                            console.log(`📡 WebSocket notification sent for name change: ${oldRealName} → ${newRealName}`);
                        } catch (wsError) {
                            console.warn('Failed to send WebSocket notification:', wsError.message);
                        }
                    }
                }

                // Prepare response with updated real_name if changed
                const responseData = {
                    success: true,
                    message: 'Profile updated successfully',
                    updatedFields: Object.keys(profileData).filter(field => profileData[field] !== undefined && profileData[field] !== '')
                };
                
                // Include new real_name in response for frontend update (Priority Action #2)
                if (newRealName) {
                    responseData.real_name = newRealName;
                }

                res.json(responseData);

            } catch (error) {
                console.error('Profile update error:', error);
                console.error('Error stack:', error.stack);
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    message: error.message
                });
            }
        });

        // User status endpoints
        router.get('/api/user-status/:userId', (req, res) => {
            this.authController.getUserStatus(req, res);
        });

        router.get('/api/user-lastseen/:userId', (req, res) => {
            this.authController.getUserLastSeen(req, res);
        });

        router.post('/api/user-offline', (req, res) => {
            this.authController.updateUserOffline(req, res);
        });

        router.post('/api/user-online', (req, res) => {
            this.authController.updateUserOnline(req, res);
        });

        // User logout endpoint for real-time status updates
        router.post('/api/user-logout', (req, res) => {
            this.authController.handleUserLogout(req, res);
        });

        // Bulk user status endpoint for efficient online status checking
        router.post('/api/users-online-status', (req, res) => {
            this.authController.getUsersOnlineStatus(req, res);
        });

        // Username availability check endpoint
        router.get('/api/check-real_name', async (req, res) => {
            try {
                const { real_name } = req.query;
                
                if (!real_name) {
                    return res.status(400).json({
                        success: false,
                        error: 'Username parameter is required'
                    });
                }

                // Note: real_name doesn't need uniqueness checking, so this endpoint is deprecated
                // Keeping for backward compatibility but always returns available
                res.json({
                    success: true,
                    available: true,
                    message: 'Real names do not need to be unique'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

                // Email availability check endpoint
        router.get('/api/check-email', async (req, res) => {
            try {
                const { email } = req.query;
                
                if (!email) {
                    return res.status(400).json({
                        success: false,
                        error: 'Email parameter is required'
                    });
                }

                // Check if email exists in database
                const result = await this.authController.db.query(
                    'SELECT id FROM users WHERE email = $1',
                    [email]
                );

                const isAvailable = result.rows.length === 0;

                res.json({
                    success: true,
                    available: isAvailable,
                    email: email
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // States/provinces endpoint for country selection
        router.get('/api/states', async (req, res) => {
            try {
                const { country_id } = req.query;
                
                if (!country_id) {
                    return res.status(400).json({
                        success: false,
                        error: 'Country ID parameter is required'
                    });
                }

                // Query states/provinces for the given country
                const result = await this.authController.db.query(
                    'SELECT id, name FROM state WHERE country_id = $1 ORDER BY name',
                    [country_id]
                );

                res.json({
                    success: true,
                    states: result.rows,
                    country_id: country_id
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // Cities endpoint for state selection
        router.get('/api/cities', async (req, res) => {
            try {
                const { state_id } = req.query;
                
                if (!state_id) {
                    return res.status(400).json({
                        success: false,
                        error: 'State ID parameter is required'
                    });
                }

                // Query cities for the given state
                const result = await this.authController.db.query(
                    'SELECT id, name FROM city WHERE state_id = $1 ORDER BY name',
                    [state_id]
                );

                res.json({
                    success: true,
                    cities: result.rows,
                    state_id: state_id
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // Online users endpoint
        router.get('/api/online-users', async (req, res) => {
            try {
                // Query users who were active in the last 10 minutes
                const result = await this.authController.db.query(`
                    SELECT id, real_name, last_login 
                    FROM users 
                    WHERE last_login > NOW() - INTERVAL '10 minutes'
                    ORDER BY last_login DESC
                `);

                res.json({
                    success: true,
                    onlineUsers: result.rows,
                    count: result.rows.length
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // User profile endpoint
        router.get('/api/user/:userId', async (req, res) => {
            try {
                const { userId } = req.params;
                const { public: isPublic } = req.query;
                
                // Query user profile data
                const result = await this.authController.db.query(`
                    SELECT u.id, u.real_name, u.email, u.birthdate, u.gender, 
                           u.country_id, u.state_id, u.city_id, u.date_joined, u.last_login,
                           COALESCE(u.email_verified, false) as email_verified,
                           c.name as country_name, s.name as state_name, ci.name as city_name
                    FROM users u
                    LEFT JOIN country c ON u.country_id = c.id
                    LEFT JOIN state s ON u.state_id = s.id
                    LEFT JOIN city ci ON u.city_id = ci.id
                    WHERE u.id = $1
                `, [userId]);

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'User not found'
                    });
                }

                const user = result.rows[0];
                
                // If public profile, remove sensitive data
                if (isPublic === '1') {
                    delete user.email;
                    delete user.last_login;
                }

                res.json({
                    success: true,
                    user: user
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // User images endpoint
        router.get('/api/user/:userId/images', async (req, res) => {
            try {
                const { userId } = req.params;
                
                if (!userId || isNaN(userId)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid user ID'
                    });
                }
                
                const result = await this.authController.db.query(`
                    SELECT id, file_name, is_profile, featured, uploaded_at
                    FROM user_images 
                    WHERE user_id = $1 
                    ORDER BY is_profile DESC, featured DESC, uploaded_at DESC
                `, [userId]);

                const images = result.rows.map(row => ({
                    id: row.id,
                    file_name: row.file_name,
                    is_profile: row.is_profile === true || row.is_profile === 1 || row.is_profile === '1' || row.is_profile === 'true',
                    featured: row.featured === true || row.featured === 1 || row.featured === '1' || row.featured === 'true',
                    uploaded_at: row.uploaded_at
                }));

                res.json({
                    success: true,
                    images: images,
                    count: images.length
                });

            } catch (error) {
                console.error('Error fetching user images:', error);
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    message: error.message
                });
            }
        });

        // Configure multer for profile image uploads
        const profileImageStorage = multer.diskStorage({
            destination: (req, file, cb) => {
                const uploadDir = path.join(__dirname, '..', 'app', 'uploads', 'profile_images');
                // Ensure directory exists
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                cb(null, uploadDir);
            },
            filename: (req, file, cb) => {
                const timestamp = Date.now();
                const randomStr = Math.random().toString(36).substring(2, 15);
                const ext = path.extname(file.originalname).toLowerCase();
                const filename = `user_${timestamp}_${randomStr}${ext}`;
                cb(null, filename);
            }
        });

        const profileImageUpload = multer({
            storage: profileImageStorage,
            limits: {
                fileSize: 5 * 1024 * 1024, // 5MB limit
                files: 10 // Max 10 files
            },
            fileFilter: (req, file, cb) => {
                const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                if (allowedMimeTypes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error('Invalid file type. Only images are allowed.'), false);
                }
            }
        });

        // Upload profile images endpoint
        router.post('/api/profile/upload-images', profileImageUpload.array('images', 10), async (req, res) => {
            try {
                const sessionToken = this.extractSessionToken(req);
                const session = this.validateSession(sessionToken, res);
                if (!session) return;

                const authenticatedUserId = session.user.id;
                const userId = req.body.userId || authenticatedUserId;

                if (!userId) {
                    return res.status(400).json({
                        success: false,
                        error: 'User ID is required'
                    });
                }

                // Check if user already has 6 images (limit)
                const existingImagesResult = await this.authController.db.query(
                    'SELECT COUNT(*) as count FROM user_images WHERE user_id = $1',
                    [userId]
                );
                const existingCount = parseInt(existingImagesResult.rows[0].count) || 0;
                const maxImages = 6;
                const remainingSlots = maxImages - existingCount;

                if (!req.files || req.files.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'No images provided'
                    });
                }

                if (req.files.length > remainingSlots) {
                    return res.status(400).json({
                        success: false,
                        error: `You can only upload ${remainingSlots} more image(s). Maximum ${maxImages} images allowed.`
                    });
                }

                const uploadedImages = [];
                const errors = [];

                for (const file of req.files) {
                    try {
                        // Compress and optimize image with sharp
                        const imagePath = file.path;
                        try {
                            const metadata = await sharp(imagePath).metadata();
                            const originalSize = (await fs.promises.stat(imagePath)).size;
                            
                            const tempPath = imagePath + '.tmp';
                            const maxDimension = 800; // Max width or height - optimized for ~100KB target
                            
                            // Create Sharp pipeline - always compress/resize for optimization
                            let sharpInstance = sharp(imagePath);
                            
                            // Auto-rotate based on EXIF orientation to fix display issues
                            sharpInstance = sharpInstance.rotate();
                            
                            // Always resize to max dimension for consistent compression (maintain aspect ratio)
                            sharpInstance = sharpInstance.resize(maxDimension, maxDimension, {
                                fit: 'inside',
                                withoutEnlargement: true
                            });
                            
                            // Convert to JPEG with aggressive compression settings targeting ~100KB from 5MB
                            await sharpInstance
                                .jpeg({ 
                                    quality: 70,
                                    progressive: true,
                                    mozjpeg: true,
                                    optimizeCoding: true,
                                    optimizeScans: true,
                                    trellisQuantisation: true,
                                    overshootDeringing: true
                                })
                                .toFile(tempPath);
                            
                            // Replace original with compressed version
                            await fs.promises.unlink(imagePath);
                            await fs.promises.rename(tempPath, imagePath);
                            
                            // Rename to include userId in filename: user_{userId}_{timestamp}_{random}.jpg
                            const timestamp = Date.now();
                            const randomStr = Math.random().toString(36).substring(2, 15);
                            const newFileName = `user_${userId}_${timestamp}_${randomStr}.jpg`;
                            const oldPath = imagePath;
                            const newPath = path.join(path.dirname(oldPath), newFileName);
                            await fs.promises.rename(oldPath, newPath);
                            file.filename = newFileName;
                            file.path = newPath;
                            
                        } catch (sharpError) {
                            console.error('Sharp processing failed:', sharpError.message);
                            // If compression fails, try to clean up temp file
                            try {
                                const tempPath = imagePath + '.tmp';
                                if (fs.existsSync(tempPath)) {
                                    await fs.promises.unlink(tempPath);
                                }
                            } catch (cleanupError) {
                                // Ignore cleanup errors
                            }
                        }

                        // Insert into database
                        const insertResult = await this.authController.db.query(`
                            INSERT INTO user_images (user_id, file_name, is_profile, featured)
                            VALUES ($1, $2, 0, 0)
                            RETURNING id, file_name, is_profile, featured, uploaded_at
                        `, [userId, file.filename]);

                        const imageRow = insertResult.rows[0];
                        uploadedImages.push({
                            id: imageRow.id,
                            file_name: imageRow.file_name,
                            is_profile: imageRow.is_profile === true || imageRow.is_profile === 1 || imageRow.is_profile === '1' || imageRow.is_profile === 'true',
                            featured: imageRow.featured === true || imageRow.featured === 1 || imageRow.featured === '1' || imageRow.featured === 'true',
                            uploaded_at: imageRow.uploaded_at
                        });
                    } catch (error) {
                        console.error('Error processing image:', error.message);
                        // Delete file if database insert failed
                        try {
                            await fs.promises.unlink(file.path);
                        } catch (unlinkError) {
                            // Ignore cleanup errors
                        }
                        errors.push({ filename: file.originalname, error: error.message });
                    }
                }

                res.json({
                    success: true,
                    uploaded: uploadedImages,
                    count: uploadedImages.length,
                    errors: errors.length > 0 ? errors : undefined
                });

            } catch (error) {
                console.error('Error uploading images:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to upload images'
                });
            }
        });

        // Delete profile image endpoint
        router.delete('/api/profile/delete-image', async (req, res) => {
            try {
                const sessionToken = this.extractSessionToken(req);
                const session = this.validateSession(sessionToken, res);
                if (!session) return;

                const authenticatedUserId = session.user.id;
                const { imageId, fileName } = req.body;

                if (!imageId || !fileName) {
                    return res.status(400).json({
                        success: false,
                        error: 'Image ID and file name are required'
                    });
                }

                // Verify image belongs to user
                const imageResult = await this.authController.db.query(
                    'SELECT user_id FROM user_images WHERE id = $1',
                    [imageId]
                );

                if (imageResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Image not found'
                    });
                }

                const imageUserId = imageResult.rows[0].user_id;
                
                if (imageUserId !== authenticatedUserId) {
                    return res.status(403).json({
                        success: false,
                        error: 'Unauthorized'
                    });
                }

                // Delete from database
                await this.authController.db.query(
                    'DELETE FROM user_images WHERE id = $1',
                    [imageId]
                );

                // Delete file
                const filePath = path.join(__dirname, '..', 'app', 'uploads', 'profile_images', fileName);
                try {
                    if (fs.existsSync(filePath)) {
                        await fs.promises.unlink(filePath);
                    }
                } catch (fileError) {
                    console.error('Error deleting file:', fileError);
                    // Continue even if file deletion fails
                }

                res.json({
                    success: true,
                    message: 'Image deleted successfully'
                });

            } catch (error) {
                console.error('Error deleting image:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to delete image',
                    message: error.message
                });
            }
        });

        // Set profile image endpoint
        router.post('/api/profile/set-profile-image', async (req, res) => {
            try {
                const sessionToken = this.extractSessionToken(req);
                const session = this.validateSession(sessionToken, res);
                if (!session) return;

                const authenticatedUserId = session.user.id;
                const { imageId } = req.body;

                if (!imageId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Image ID is required'
                    });
                }

                // Verify image belongs to user
                const imageResult = await this.authController.db.query(
                    'SELECT user_id FROM user_images WHERE id = $1',
                    [imageId]
                );

                if (imageResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Image not found'
                    });
                }

                if (imageResult.rows[0].user_id !== authenticatedUserId) {
                    return res.status(403).json({
                        success: false,
                        error: 'Unauthorized'
                    });
                }

                // Unset all other profile images for this user
                await this.authController.db.query(
                    'UPDATE user_images SET is_profile = 0 WHERE user_id = $1',
                    [authenticatedUserId]
                );

                // Set this image as profile
                await this.authController.db.query(
                    'UPDATE user_images SET is_profile = 1 WHERE id = $1',
                    [imageId]
                );

                res.json({
                    success: true,
                    message: 'Profile image updated successfully'
                });

            } catch (error) {
                console.error('Error setting profile image:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to set profile image',
                    message: error.message
                });
            }
        });

        // Set featured image endpoint
        router.post('/api/profile/set-featured-image', async (req, res) => {
            try {
                const sessionToken = this.extractSessionToken(req);
                const session = this.validateSession(sessionToken, res);
                if (!session) return;

                const authenticatedUserId = session.user.id;
                const { imageId, featured } = req.body;

                if (!imageId || featured === undefined) {
                    return res.status(400).json({
                        success: false,
                        error: 'Image ID and featured status are required'
                    });
                }

                // Verify image belongs to user
                const imageResult = await this.authController.db.query(
                    'SELECT user_id FROM user_images WHERE id = $1',
                    [imageId]
                );

                if (imageResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Image not found'
                    });
                }

                if (imageResult.rows[0].user_id !== authenticatedUserId) {
                    return res.status(403).json({
                        success: false,
                        error: 'Unauthorized'
                    });
                }

                // If setting as featured, first unfeature all other images for this user
                if (featured) {
                    await this.authController.db.query(
                        'UPDATE user_images SET featured = 0 WHERE user_id = $1 AND id != $2',
                        [authenticatedUserId, imageId]
                    );
                }
                
                // Update featured status (convert boolean to integer for smallint column)
                const featuredValue = featured ? 1 : 0;
                await this.authController.db.query(
                    'UPDATE user_images SET featured = $1 WHERE id = $2',
                    [featuredValue, imageId]
                );

                res.json({
                    success: true,
                    message: `Image ${featured ? 'featured' : 'unfeatured'} successfully`
                });

            } catch (error) {
                console.error('Error setting featured image:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to update featured status'
                });
            }
        });

        // Get user languages endpoint
        router.get('/api/profile/languages', async (req, res) => {
            try {
                const { userId } = req.query;
                const sessionToken = this.extractSessionToken(req);
                const session = this.validateSession(sessionToken, res);
                if (!session) return;
                
                const authenticatedUserId = session.user.id;
                const userIdToQuery = userId || authenticatedUserId;
                
                if (!userIdToQuery) {
                    return res.status(400).json({
                        success: false,
                        error: 'User ID is required'
                    });
                }
                
                // Get user's languages
                const result = await this.authController.db.query(`
                    SELECT 
                        ul.id,
                        ul.user_id,
                        ul.language_id,
                        ul.fluency_level_id,
                        ul.is_primary,
                        ul.can_read,
                        ul.can_write,
                        ul.can_speak,
                        ul.can_understand,
                        ul.created_at,
                        ul.updated_at,
                        l.name as language_name,
                        l.native_name,
                        fl.name as fluency_level_name
                    FROM user_languages ul
                    INNER JOIN languages l ON ul.language_id = l.id
                    LEFT JOIN user_language_fluency_levels fl ON ul.fluency_level_id = fl.id
                    WHERE ul.user_id = $1
                    AND l.is_active = true
                    ORDER BY ul.is_primary DESC, l.name ASC
                `, [userIdToQuery]);
                
                res.json({
                    success: true,
                    languages: result.rows
                });
                
            } catch (error) {
                console.error('Error getting user languages:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get user languages',
                    details: error.message
                });
            }
        });

        // Save user languages endpoint
        router.post('/api/profile/languages', async (req, res) => {
            try {
                const sessionToken = this.extractSessionToken(req);
                
                // If no session token found, return error
                if (!sessionToken) {
                    return res.status(401).json({
                        success: false,
                        error: 'Session token is required'
                    });
                }
                
                const session = this.validateSession(sessionToken, res);
                if (!session) {
                    // Session validation failed - return the error that validateSession already sent
                    return;
                }
                
                const { userId, languages } = req.body;
                const authenticatedUserId = session.user.id;
                const userIdToUpdate = userId || authenticatedUserId;
                
                if (!userIdToUpdate) {
                    return res.status(400).json({
                        success: false,
                        error: 'User ID is required'
                    });
                }
                
                if (!Array.isArray(languages)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Languages must be an array'
                    });
                }
                
                // Start transaction
                await this.authController.db.query('BEGIN');
                
                try {
                    // Delete existing languages for this user
                    await this.authController.db.query(
                        'DELETE FROM user_languages WHERE user_id = $1',
                        [userIdToUpdate]
                    );
                    
                    // Insert new languages
                    for (const lang of languages) {
                        if (!lang.language_id) continue; // Skip if no language selected
                        
                        // Ensure at least one skill is true
                        const hasSkill = lang.can_read || lang.can_write || lang.can_speak || lang.can_understand;
                        if (!hasSkill) {
                            lang.can_speak = true; // Default to speaking
                        }
                        
                        await this.authController.db.query(`
                            INSERT INTO user_languages (
                                user_id, language_id, fluency_level_id, is_primary, 
                                can_read, can_write, can_speak, can_understand
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        `, [
                            userIdToUpdate,
                            parseInt(lang.language_id),
                            lang.fluency_level_id ? parseInt(lang.fluency_level_id) : null,
                            lang.is_primary || false,
                            lang.can_read || false,
                            lang.can_write || false,
                            lang.can_speak || false,
                            lang.can_understand || false
                        ]);
                    }
                    
                    // Commit transaction
                    await this.authController.db.query('COMMIT');
                    
                    res.json({
                        success: true,
                        message: 'Languages updated successfully'
                    });
                    
                } catch (dbError) {
                    // Rollback on error
                    await this.authController.db.query('ROLLBACK');
                    throw dbError;
                }
                
            } catch (error) {
                console.error('Error saving user languages:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to save user languages',
                    details: error.message
                });
            }
        });

        // User like count endpoint
        router.get('/api/user/:userId/like-count', async (req, res) => {
            try {
                const { userId } = req.params;
                
                // Query like count for user
                const result = await this.authController.db.query(`
                    SELECT COUNT(*) as like_count
                    FROM users_likes 
                    WHERE liked_user_id = $1
                `, [userId]);

                const likeCount = parseInt(result.rows[0].like_count) || 0;

                res.json({
                    success: true,
                    likeCount: likeCount
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });

        // User view count endpoint
        router.get('/api/user/:userId/view-count', async (req, res) => {
            try {
                const { userId } = req.params;
                
                // Query profile view count for user
                const result = await this.authController.db.query(`
                    SELECT COUNT(*) as view_count
                    FROM user_activity 
                    WHERE target_user_id = $1
                    AND activity_type = 'profile_view'
                `, [userId]);

                const viewCount = parseInt(result.rows[0].view_count) || 0;

                res.json({
                    success: true,
                    viewCount: viewCount
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });
    }

    getRouter() {
        return router;
    }
}

module.exports = AuthRoutes; 