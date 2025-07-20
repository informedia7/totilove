const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'totilove',
    password: '123',
    port: 5432,
});

/**
 * Enhanced Session Management API
 * Provides endpoints for secure session handling
 */
class SessionAPI {
    constructor() {
        this.router = express.Router();
        this.setupRoutes();
    }

    setupRoutes() {
        // Create test session for development
        this.router.post('/api/create-test-session', this.createTestSession.bind(this));
        
        // Refresh token endpoint
        this.router.post('/api/refresh-token', this.requireAuth.bind(this), this.refreshToken.bind(this));
        
        // Logout endpoint
        this.router.post('/api/logout', this.requireAuth.bind(this), this.logout.bind(this));
        
        // Session status check
        this.router.get('/api/session-status', this.requireAuth.bind(this), this.getSessionStatus.bind(this));
        
        // Clean up expired sessions
        this.router.post('/api/cleanup-sessions', this.cleanupExpiredSessions.bind(this));
    }

    /**
     * Generate secure session token
     */
    generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Create a session for a user (for login)
     */
    async createSession(userId, ipAddress = '127.0.0.1', userAgent = 'Unknown') {
        try {
            // Generate new session token
            const sessionToken = this.generateSessionToken();
            const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            
            // Delete old sessions for this user (to avoid unique constraint violation)
            await pool.query(
                'DELETE FROM user_sessions WHERE user_id = $1',
                [userId]
            );
            
            // Create new session
            await pool.query(
                `INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at, is_active, created_at, last_activity)
                 VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
                [userId, sessionToken, ipAddress, userAgent, expiryTime]
            );
            
            console.log(`✅ Session created for user ${userId}:`, sessionToken.substring(0, 16) + '...');
            
            return {
                token: sessionToken,
                expiresAt: expiryTime.toISOString(),
                userId: userId
            };
            
        } catch (error) {
            console.error('❌ Session creation error:', error);
            throw new Error('Failed to create session: ' + error.message);
        }
    }

    /**
     * Create test session for development
     */
    async createTestSession(req, res) {
        try {
            const { userId = 20 } = req.body;
            
            // Generate new session token
            const sessionToken = this.generateSessionToken();
            const expiryTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
            
            // Get user info
            const userResult = await pool.query(
                'SELECT id, username, email FROM users WHERE id = $1',
                [userId]
            );
            
            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            const user = userResult.rows[0];
            
            // Delete old sessions for this user (to avoid unique constraint violation)
            await pool.query(
                'DELETE FROM user_sessions WHERE user_id = $1',
                [userId]
            );
            
            // Create new session
            await pool.query(
                `INSERT INTO user_sessions (user_id, session_token, expires_at, is_active, created_at, last_activity)
                 VALUES ($1, $2, $3, true, NOW(), NOW())`,
                [userId, sessionToken, expiryTime]
            );
            
            console.log(`✅ Test session created for user ${userId}:`, sessionToken.substring(0, 16) + '...');
            
            res.json({
                success: true,
                token: sessionToken,
                expiresAt: expiryTime.toISOString(),
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            });
            
        } catch (error) {
            console.error('❌ Test session creation error:', error);
            res.status(500).json({ error: 'Failed to create test session' });
        }
    }

    /**
     * Refresh authentication token
     */
    async refreshToken(req, res) {
        try {
            const userId = req.user.id;
            const oldToken = req.sessionToken;
            
            // Generate new token
            const newSessionToken = this.generateSessionToken();
            const expiryTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            
            // Update session with new token
            const result = await pool.query(
                `UPDATE user_sessions 
                 SET session_token = $1, expires_at = $2, last_activity = NOW()
                 WHERE session_token = $3 AND user_id = $4 AND is_active = true
                 RETURNING user_id`,
                [newSessionToken, expiryTime, oldToken, userId]
            );
            
            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Session not found or expired' });
            }
            
            console.log(`🔄 Token refreshed for user ${userId}`);
            
            res.json({
                success: true,
                token: newSessionToken,
                expiresAt: expiryTime.toISOString()
            });
            
        } catch (error) {
            console.error('❌ Token refresh error:', error);
            res.status(500).json({ error: 'Failed to refresh token' });
        }
    }

    /**
     * Logout and invalidate session
     */
    async logout(req, res) {
        try {
            const sessionToken = req.sessionToken;
            
            // Invalidate session
            await pool.query(
                'UPDATE user_sessions SET is_active = false, last_activity = NOW() WHERE session_token = $1',
                [sessionToken]
            );
            
            console.log('👋 User logged out');
            
            res.json({
                success: true,
                message: 'Logged out successfully'
            });
            
        } catch (error) {
            console.error('❌ Logout error:', error);
            res.status(500).json({ error: 'Failed to logout' });
        }
    }

    /**
     * Get current session status
     */
    async getSessionStatus(req, res) {
        try {
            const sessionToken = req.sessionToken;
            
            const result = await pool.query(
                `SELECT user_id, created_at, expires_at, last_activity 
                 FROM user_sessions 
                 WHERE session_token = $1 AND is_active = true`,
                [sessionToken]
            );
            
            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Session not found' });
            }
            
            const session = result.rows[0];
            
            res.json({
                success: true,
                session: {
                    userId: session.user_id,
                    createdAt: session.created_at,
                    expiresAt: session.expires_at,
                    lastActivity: session.last_activity,
                    isValid: new Date() < new Date(session.expires_at)
                }
            });
            
        } catch (error) {
            console.error('❌ Session status error:', error);
            res.status(500).json({ error: 'Failed to get session status' });
        }
    }

    /**
     * Clean up expired sessions
     */
    async cleanupExpiredSessions(req, res) {
        try {
            const result = await pool.query(
                `UPDATE user_sessions 
                 SET is_active = false 
                 WHERE expires_at < NOW() AND is_active = true`
            );
            
            console.log(`🧹 Cleaned up ${result.rowCount} expired sessions`);
            
            res.json({
                success: true,
                cleanedSessions: result.rowCount
            });
            
        } catch (error) {
            console.error('❌ Session cleanup error:', error);
            res.status(500).json({ error: 'Failed to cleanup sessions' });
        }
    }

    /**
     * Authentication middleware
     */
    async requireAuth(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'No authorization token provided' });
            }
            
            const sessionToken = authHeader.substring(7);
            
            // Validate session
            const result = await pool.query(
                `SELECT us.user_id, us.expires_at, u.username, u.email
                 FROM user_sessions us
                 JOIN users u ON us.user_id = u.id
                 WHERE us.session_token = $1 AND us.is_active = true`,
                [sessionToken]
            );
            
            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid or expired session' });
            }
            
            const session = result.rows[0];
            
            // Check expiry
            if (new Date() >= new Date(session.expires_at)) {
                await pool.query(
                    'UPDATE user_sessions SET is_active = false WHERE session_token = $1',
                    [sessionToken]
                );
                return res.status(401).json({ error: 'Session expired' });
            }
            
            // Update last activity
            await pool.query(
                'UPDATE user_sessions SET last_activity = NOW() WHERE session_token = $1',
                [sessionToken]
            );
            
            // Add user info to request
            req.user = {
                id: session.user_id,
                username: session.username,
                email: session.email
            };
            req.sessionToken = sessionToken;
            
            next();
            
        } catch (error) {
            console.error('❌ Auth middleware error:', error);
            res.status(500).json({ error: 'Authentication error' });
        }
    }

    getRouter() {
        return this.router;
    }
}

module.exports = SessionAPI;
