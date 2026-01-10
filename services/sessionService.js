const crypto = require('crypto');
const config = require('../config/config');
const redisManager = require('../config/redis');

class SessionService {
    constructor() {
        this.sessions = new Map();
        this.cleanupInterval = null;
        this.startCleanupInterval();
    }

    // Generate a secure session token
    generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Create a new session
    createSession(user) {
        const sessionToken = this.generateSessionToken();
        const expiresAt = Date.now() + config.session.duration;
        
        const session = {
            token: sessionToken,
            user: {
                id: user.id,
                email: user.email,
                real_name: user.real_name,
    
            },
            createdAt: Date.now(),
            expiresAt: expiresAt,
            lastActivity: Date.now()
        };

        // Store in memory
        this.sessions.set(sessionToken, session);
        
        // Store in Redis for persistence
        redisManager.set(`session:${sessionToken}`, session, config.session.duration / 1000);
        
        console.log(`🔑 Generated session token: ${sessionToken.substring(0, 12)}...`);
        return sessionToken;
    }

    // Get session by token
    getSession(sessionToken) {
        // First check memory cache
        let session = this.sessions.get(sessionToken);
        
        if (!session) {
            // Try Redis
            redisManager.get(`session:${sessionToken}`).then(redisSession => {
                if (redisSession) {
                    this.sessions.set(sessionToken, redisSession);
                    session = redisSession;
                }
            });
        }
        
        if (session && session.expiresAt > Date.now()) {
            // Update last activity
            session.lastActivity = Date.now();
            this.sessions.set(sessionToken, session);
            redisManager.set(`session:${sessionToken}`, session, config.session.duration / 1000);
            return session;
        }
        
        return null;
    }

    // Delete session
    deleteSession(sessionToken) {
        this.sessions.delete(sessionToken);
        redisManager.del(`session:${sessionToken}`);
        console.log(`🗑️ Session deleted: ${sessionToken.substring(0, 12)}...`);
    }

    // Extend session
    extendSession(sessionToken) {
        const session = this.getSession(sessionToken);
        if (session) {
            session.expiresAt = Date.now() + config.session.duration;
            session.lastActivity = Date.now();
            
            this.sessions.set(sessionToken, session);
            redisManager.set(`session:${sessionToken}`, session, config.session.duration / 1000);
            
            return true;
        }
        return false;
    }

    // Get all active sessions for a user
    getUserSessions(userId) {
        const userSessions = [];
        
        for (const [token, session] of this.sessions.entries()) {
            if (session.user.id === userId && session.expiresAt > Date.now()) {
                userSessions.push({
                    token: token.substring(0, 12) + '...',
                    createdAt: session.createdAt,
                    lastActivity: session.lastActivity,
                    expiresAt: session.expiresAt
                });
            }
        }
        
        return userSessions;
    }

    // Delete all sessions for a user
    deleteUserSessions(userId) {
        const tokensToDelete = [];
        
        for (const [token, session] of this.sessions.entries()) {
            if (session.user.id === userId) {
                tokensToDelete.push(token);
            }
        }
        
        tokensToDelete.forEach(token => {
            this.deleteSession(token);
        });
        
        console.log(`🗑️ Deleted ${tokensToDelete.length} sessions for user ${userId}`);
    }

    // Rate limiting methods
    getRateLimit(key) {
        return redisManager.get(`rate_limit:${key}`);
    }

    setRateLimit(key, data) {
        return redisManager.set(`rate_limit:${key}`, data, 60); // 1 minute TTL
    }

    // Cleanup expired sessions
    cleanupExpiredSessions() {
        const now = Date.now();
        const expiredTokens = [];
        
        for (const [token, session] of this.sessions.entries()) {
            if (session.expiresAt < now) {
                expiredTokens.push(token);
            }
        }
        
        expiredTokens.forEach(token => {
            this.sessions.delete(token);
        });
        
        if (expiredTokens.length > 0) {
            console.log(`🧹 Cleaned up ${expiredTokens.length} expired sessions`);
        }
    }

    // Start cleanup interval
    startCleanupInterval() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
        }, config.session.cleanupInterval);
    }

    // Stop cleanup interval
    stopCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    // Get session statistics
    getStats() {
        const now = Date.now();
        let activeSessions = 0;
        let expiredSessions = 0;
        
        for (const session of this.sessions.values()) {
            if (session.expiresAt > now) {
                activeSessions++;
            } else {
                expiredSessions++;
            }
        }
        
        return {
            totalSessions: this.sessions.size,
            activeSessions,
            expiredSessions,
            cleanupInterval: config.session.cleanupInterval
        };
    }

    // Validate session token format
    isValidTokenFormat(token) {
        return token && typeof token === 'string' && token.length === 64 && /^[a-f0-9]+$/i.test(token);
    }

    // Update session user data (e.g., when profile is updated)
    updateSessionUser(sessionToken, userUpdates) {
        const session = this.getSession(sessionToken);
        if (session && session.user) {
            // Update user data in session
            Object.assign(session.user, userUpdates);
            session.lastActivity = Date.now();
            
            // Update in memory
            this.sessions.set(sessionToken, session);
            
            // Update in Redis
            redisManager.set(`session:${sessionToken}`, session, config.session.duration / 1000);
            
            console.log(`🔄 Updated session user data for token: ${sessionToken.substring(0, 12)}...`);
            return true;
        }
        return false;
    }

    // Update all sessions for a user (e.g., when name changes)
    updateUserSessions(userId, userUpdates) {
        let updatedCount = 0;
        
        for (const [token, session] of this.sessions.entries()) {
            if (session.user && session.user.id === userId && session.expiresAt > Date.now()) {
                Object.assign(session.user, userUpdates);
                session.lastActivity = Date.now();
                
                // Update in memory
                this.sessions.set(token, session);
                
                // Update in Redis
                redisManager.set(`session:${token}`, session, config.session.duration / 1000);
                
                updatedCount++;
            }
        }
        
        if (updatedCount > 0) {
            console.log(`🔄 Updated ${updatedCount} session(s) for user ${userId}`);
        }
        
        return updatedCount;
    }

}

// Singleton instance
const sessionService = new SessionService();

module.exports = sessionService;
