const express = require('express');
const config = require('../config/config');
const router = express.Router();
const SESSION_DURATION_MS = config.session?.duration || (2 * 60 * 60 * 1000);

class MatchesRoutes {
    constructor(matchesController, authMiddleware) {
        this.matchesController = matchesController;
        this.authMiddleware = authMiddleware;
        this.router = express.Router();
        this.setupRoutes();
    }

    setupRoutes() {
        const router = this.router;

        // Helper method to extract session token from request
        const extractSessionToken = (req) => {
            const authHeader = req.headers.authorization;
            return authHeader ? authHeader.replace('Bearer ', '') : 
                   req.headers['x-session-token'] || 
                   req.cookies?.sessionToken ||
                   req.cookies?.session ||
                   req.query.token ||
                   req.body?.sessionToken;
        };

        // Helper method to validate session
        const validateSession = (req, res) => {
            const sessionToken = extractSessionToken(req);
            
            if (!sessionToken || !this.authMiddleware) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token is required'
                });
            }

            const session = this.authMiddleware.sessions.get(sessionToken);
            
            if (!session || session.expiresAt <= Date.now()) {
                if (session) {
                    this.authMiddleware.sessions.delete(sessionToken);
                }
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired session'
                });
            }

            // Extend session
            session.expiresAt = Date.now() + SESSION_DURATION_MS;
            
            return session;
        };

        // DELETE /api/matches/:userId/unmatch - Unmatch a user
        router.delete('/:userId/unmatch', (req, res) => {
            // Validate session
            const session = validateSession(req, res);
            if (!session) return; // Response already sent

            // Verify user can only unmatch their own matches
            const requestedUserId = parseInt(req.params.userId);
            if (session.user.id !== requestedUserId) {
                return res.status(403).json({
                    success: false,
                    error: 'You can only unmatch your own matches'
                });
            }

            // Get the user ID to unmatch from query parameter or body
            const unmatchUserId = req.query.userId || req.body.userId;
            if (!unmatchUserId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID to unmatch is required'
                });
            }

            this.matchesController.unmatchUser(req, res);
        });

        // POST /api/matches/:userId/match-score-preference - Save match score preference
        router.post('/:userId/match-score-preference', (req, res) => {
            // Validate session
            const session = validateSession(req, res);
            if (!session) return; // Response already sent

            // Verify user can only update their own preference
            const requestedUserId = parseInt(req.params.userId);
            if (session.user.id !== requestedUserId) {
                return res.status(403).json({
                    success: false,
                    error: 'You can only update your own preferences'
                });
            }

            this.matchesController.saveMinCompatibilityScorePreference(req, res);
        });

        // GET /api/matches/:userId - Get user matches
        // This route must come AFTER specific routes to avoid conflicts
        router.get('/:userId', (req, res) => {
            // Validate session
            const session = validateSession(req, res);
            if (!session) return; // Response already sent

            // Verify user can only access their own matches
            const requestedUserId = parseInt(req.params.userId);
            if (session.user.id !== requestedUserId) {
                return res.status(403).json({
                    success: false,
                    error: 'You can only access your own matches'
                });
            }

            this.matchesController.getMatches(req, res);
        });
    }

    // Separate method for stats routes
    setupStatsRoutes() {
        const router = express.Router();

        // GET /api/stats/total-users - Get total active users
        router.get('/total-users', (req, res) => {
            this.matchesController.getTotalUsers(req, res);
        });

        // GET /api/stats/matches-today - Get matches created today
        router.get('/matches-today', (req, res) => {
            this.matchesController.getMatchesToday(req, res);
        });

        // GET /api/stats/online-now - Get currently online users
        router.get('/online-now', (req, res) => {
            this.matchesController.getOnlineUsers(req, res);
        });

        return router;
    }

    getRouter() {
        return this.router;
    }
}

module.exports = MatchesRoutes;


