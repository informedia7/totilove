const crypto = require('crypto');

class SessionService {
    constructor(pool, redisClient) {
        this.pool = pool;
        this.redis = redisClient;
        this.SESSION_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds
        this.SESSION_PREFIX = 'session:';
        this.USER_SESSION_PREFIX = 'user_sessions:';
    }

    /**
     * Create a new session for a user
     */
    async createSession(userId, ipAddress = '', userAgent = '') {
        try {
            // Generate secure session token
            const sessionToken = crypto.randomBytes(32).toString('hex');
            const sessionData = {
                userId: userId,
                createdAt: Date.now(),
                lastActivity: Date.now(),
                ipAddress: ipAddress,
                userAgent: userAgent,
                isActive: true
            };

            // Store in Redis with expiration (if available)
            if (this.redis) {
                await this.redis.setEx(
                    `${this.SESSION_PREFIX}${sessionToken}`,
                    this.SESSION_EXPIRY,
                    JSON.stringify(sessionData)
                );

                // Also store user -> session mapping
                await this.redis.setEx(
                    `${this.USER_SESSION_PREFIX}${userId}`,
                    this.SESSION_EXPIRY,
                    sessionToken
                );
            }

            // Store in PostgreSQL for persistence
            try {
                await this.pool.query(`
                    INSERT INTO user_sessions (user_id, session_token, last_activity, is_active, ip_address, user_agent, created_at)
                    VALUES ($1, $2, NOW(), true, $3, $4, NOW())
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        session_token = $2,
                        last_activity = NOW(),
                        is_active = true,
                        ip_address = $3,
                        user_agent = $4
                `, [userId, sessionToken, ipAddress, userAgent]);
            } catch (dbError) {
                console.warn('PostgreSQL session storage failed:', dbError.message);
                if (!this.redis) {
                    // If no Redis and database fails, we can't create session
                    throw new Error('Session storage failed');
                }
            }

            console.log(`✅ Session created for user ${userId}: ${sessionToken.substring(0, 8)}...`);
            return sessionToken;

        } catch (error) {
            console.error('❌ Error creating session:', error);
            throw error;
        }
    }

    /**
     * Validate and retrieve session data
     */
    async getSession(sessionToken) {
        try {
            if (!sessionToken) {
                return null;
            }

            // Try Redis first if available (fastest)
            if (this.redis) {
                const sessionData = await this.redis.get(`${this.SESSION_PREFIX}${sessionToken}`);
                
                if (sessionData) {
                    const session = JSON.parse(sessionData);
                    
                    // Update last activity
                    session.lastActivity = Date.now();
                    
                    // Refresh Redis expiration
                    await this.redis.setEx(
                        `${this.SESSION_PREFIX}${sessionToken}`,
                        this.SESSION_EXPIRY,
                        JSON.stringify(session)
                    );

                    console.log(`✅ Session found in Redis for user ${session.userId}`);
                    return session;
                }
            }

            // Use PostgreSQL (either as fallback or primary)
            console.log('🔄 Checking session in PostgreSQL...');
            console.log('🔍 Looking for session token:', sessionToken.substring(0, 20) + '...');
            const result = await this.pool.query(`
                SELECT s.*, u.username, u.email
                FROM user_sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.session_token = $1 
                AND s.is_active = true
            `, [sessionToken]);
            
            console.log('🔍 Query returned', result.rows.length, 'rows');

            if (result.rows.length > 0) {
                const dbSession = result.rows[0];
                const sessionData = {
                    userId: dbSession.user_id,
                    username: dbSession.username,
                    email: dbSession.email,
                    createdAt: new Date(dbSession.created_at).getTime(),
                    lastActivity: Date.now(),
                    ipAddress: dbSession.ip_address,
                    userAgent: dbSession.user_agent,
                    isActive: true
                };

                // Restore to Redis if available
                if (this.redis) {
                    await this.redis.setEx(
                        `${this.SESSION_PREFIX}${sessionToken}`,
                        this.SESSION_EXPIRY,
                        JSON.stringify(sessionData)
                    );
                }

                // Update PostgreSQL last activity
                await this.pool.query(`
                    UPDATE user_sessions 
                    SET last_activity = NOW() 
                    WHERE session_token = $1
                `, [sessionToken]);

                console.log(`✅ Session found in PostgreSQL for user ${sessionData.userId}`);
                return sessionData;
            }

            console.log('❌ Session not found or expired');
            return null;

        } catch (error) {
            console.error('❌ Error getting session:', error);
            return null;
        }
    }

    /**
     * Update session activity
     */
    async updateActivity(sessionToken) {
        try {
            const session = await this.getSession(sessionToken);
            if (!session) {
                return false;
            }

            // Update Redis if available
            if (this.redis) {
                session.lastActivity = Date.now();
                await this.redis.setEx(
                    `${this.SESSION_PREFIX}${sessionToken}`,
                    this.SESSION_EXPIRY,
                    JSON.stringify(session)
                );
            }

            // Update PostgreSQL (less frequently - every 5 minutes to reduce load)
            const lastDbUpdate = session.lastDbUpdate || 0;
            const now = Date.now();
            if (now - lastDbUpdate > 5 * 60 * 1000) { // 5 minutes
                session.lastDbUpdate = now;
                await this.pool.query(`
                    UPDATE user_sessions 
                    SET last_activity = NOW() 
                    WHERE session_token = $1
                `, [sessionToken]);
            }

            return true;

        } catch (error) {
            console.error('❌ Error updating session activity:', error);
            return false;
        }
    }

    /**
     * Destroy a session (logout)
     */
    async destroySession(sessionToken) {
        try {
            if (!sessionToken) {
                return false;
            }

            // Get session data to find user ID
            const session = await this.getSession(sessionToken);
            
            // Remove from Redis if available
            if (this.redis) {
                await this.redis.del(`${this.SESSION_PREFIX}${sessionToken}`);
                
                if (session) {
                    await this.redis.del(`${this.USER_SESSION_PREFIX}${session.userId}`);
                }
            }

            // Mark as inactive in PostgreSQL
            await this.pool.query(`
                UPDATE user_sessions 
                SET is_active = false, last_activity = NOW()
                WHERE session_token = $1
            `, [sessionToken]);

            console.log(`✅ Session destroyed: ${sessionToken.substring(0, 8)}...`);
            return true;

        } catch (error) {
            console.error('❌ Error destroying session:', error);
            return false;
        }
    }

    /**
     * Destroy all sessions for a user
     */
    async destroyUserSessions(userId) {
        try {
            // Get current session token from Redis if available
            if (this.redis) {
                const currentSessionToken = await this.redis.get(`${this.USER_SESSION_PREFIX}${userId}`);
                
                if (currentSessionToken) {
                    await this.redis.del(`${this.SESSION_PREFIX}${currentSessionToken}`);
                    await this.redis.del(`${this.USER_SESSION_PREFIX}${userId}`);
                }
            }

            // Deactivate all sessions in PostgreSQL
            await this.pool.query(`
                UPDATE user_sessions 
                SET is_active = false, last_activity = NOW()
                WHERE user_id = $1
            `, [userId]);

            console.log(`✅ All sessions destroyed for user ${userId}`);
            return true;

        } catch (error) {
            console.error('❌ Error destroying user sessions:', error);
            return false;
        }
    }

    /**
     * Get active sessions for a user
     */
    async getUserSessions(userId) {
        try {
            // Check Redis first
            const sessionToken = await this.redis.get(`${this.USER_SESSION_PREFIX}${userId}`);
            
            if (sessionToken) {
                const session = await this.getSession(sessionToken);
                if (session) {
                    return [session];
                }
            }

            // Fallback to PostgreSQL
            const result = await this.pool.query(`
                SELECT * FROM user_sessions
                WHERE user_id = $1 
                AND is_active = true
                AND last_activity > NOW() - INTERVAL '30 days'
                ORDER BY last_activity DESC
            `, [userId]);

            return result.rows.map(row => ({
                userId: row.user_id,
                sessionToken: row.session_token,
                createdAt: new Date(row.created_at).getTime(),
                lastActivity: new Date(row.last_activity).getTime(),
                ipAddress: row.ip_address,
                userAgent: row.user_agent,
                isActive: row.is_active
            }));

        } catch (error) {
            console.error('❌ Error getting user sessions:', error);
            return [];
        }
    }

    /**
     * Clean up expired sessions (run periodically)
     */
    async cleanupExpiredSessions() {
        try {
            console.log('🧹 Cleaning up expired sessions...');

            // PostgreSQL cleanup
            const result = await this.pool.query(`
                UPDATE user_sessions 
                SET is_active = false
                WHERE is_active = true 
                AND last_activity < NOW() - INTERVAL '30 days'
                RETURNING session_token
            `);

            console.log(`✅ Cleaned up ${result.rows.length} expired sessions from PostgreSQL`);

            // Redis cleanup is automatic due to expiration
            return result.rows.length;

        } catch (error) {
            console.error('❌ Error cleaning up sessions:', error);
            return 0;
        }
    }

    /**
     * Get online users from active sessions
     */
    async getOnlineUsers(limit = 50) {
        try {
            // Get from PostgreSQL with user details
            const result = await this.pool.query(`
                SELECT DISTINCT u.id, u.username, u.gender, u.birthdate, c.name as country,
                       s.last_activity, s.ip_address
                FROM user_sessions s
                JOIN users u ON s.user_id = u.id
                LEFT JOIN country c ON u.country_id = c.id
                WHERE s.is_active = true 
                AND s.last_activity > NOW() - INTERVAL '15 minutes'
                ORDER BY s.last_activity DESC
                LIMIT $1
            `, [limit]);

            return result.rows.map(user => ({
                id: user.id,
                username: user.username,
                gender: user.gender,
                age: user.birthdate ? Math.floor((Date.now() - new Date(user.birthdate)) / (365.25 * 24 * 60 * 60 * 1000)) : null,
                country: user.country,
                lastActivity: new Date(user.last_activity).getTime(),
                isOnline: true
            }));

        } catch (error) {
            console.error('❌ Error getting online users:', error);
            return [];
        }
    }
}

module.exports = SessionService;
