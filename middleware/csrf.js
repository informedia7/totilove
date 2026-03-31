/**
 * CSRF Protection Middleware
 * Implements CSRF token generation and validation
 * Follows industry best practices for Express.js applications
 */

const crypto = require('crypto');

class CSRFMiddleware {
    constructor(redisClient = null) {
        // Store tokens in memory (fallback) or Redis (for distributed systems)
        this.tokens = new Map();
        this.redis = redisClient;
        this.useRedis = !!redisClient;
        this.tokenExpiry = 3600000; // 1 hour
        this.redisPrefix = 'csrf:';
    }

    /**
     * Generate a CSRF token for a session
     * @param {string} sessionToken - Session token to associate with CSRF token
     * @returns {string} CSRF token
     */
    async generateToken(sessionToken) {
        if (!sessionToken) {
            return null;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + this.tokenExpiry;
        const tokenData = {
            sessionToken,
            expiry
        };
        
        if (this.useRedis && this.redis) {
            try {
                // Store in Redis with expiry
                const redisKey = `${this.redisPrefix}${token}`;
                await this.redis.setEx(redisKey, Math.floor(this.tokenExpiry / 1000), JSON.stringify(tokenData));
            } catch (error) {
                // Fallback to memory storage
                this.tokens.set(token, tokenData);
            }
        } else {
            // Store in memory
            this.tokens.set(token, tokenData);
        }
        
        // Clean up expired tokens periodically
        this.cleanupExpiredTokens();
        
        return token;
    }

    /**
     * Validate a CSRF token
     * @param {string} token - CSRF token to validate
     * @param {string} sessionToken - Session token to match
     * @returns {boolean} True if token is valid
     */
    async validateToken(token, sessionToken) {
        if (!token || !sessionToken) {
            return false;
        }

        let tokenData = null;
        
        if (this.useRedis && this.redis) {
            try {
                const redisKey = `${this.redisPrefix}${token}`;
                const data = await this.redis.get(redisKey);
                if (data) {
                    tokenData = JSON.parse(data);
                }
            } catch (error) {
                // Fallback to memory
                tokenData = this.tokens.get(token);
            }
        } else {
            tokenData = this.tokens.get(token);
        }
        
        if (!tokenData) {
            return false;
        }

        // Check if token expired
        if (tokenData.expiry < Date.now()) {
            this.removeToken(token);
            return false;
        }

        // Verify session token matches
        if (tokenData.sessionToken !== sessionToken) {
            return false;
        }

        return true;
    }

    /**
     * Remove a token (optional - for single-use tokens)
     */
    async removeToken(token) {
        if (this.useRedis && this.redis) {
            try {
                const redisKey = `${this.redisPrefix}${token}`;
                await this.redis.del(redisKey);
            } catch (error) {
                // Redis deletion failed, continue with memory cleanup
            }
        }
        this.tokens.delete(token);
    }

    /**
     * Clean up expired tokens
     * Only runs cleanup on 10% of calls to avoid performance impact
     */
    cleanupExpiredTokens() {
        // Only cleanup 10% of the time to avoid performance impact
        if (Math.random() > 0.1) {
            return;
        }
        
        const now = Date.now();
        for (const [token, data] of this.tokens.entries()) {
            if (data.expiry < now) {
                this.tokens.delete(token);
            }
        }
    }

    /**
     * Middleware to validate CSRF token for state-changing requests
     * Only validates POST, PUT, PATCH, DELETE methods
     */
    validate() {
        return async (req, res, next) => {
            // Only validate state-changing HTTP methods
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
                return next();
            }

            // Public endpoints that don't require CSRF protection
            const publicEndpoints = [
                '/api/login',
                '/api/register',
                '/api/auth/check-session',
                '/login',
                '/register',
                '/logout', // Logout endpoint (common pattern to exclude)
                '/api/csrf-token' // Token generation endpoint
            ];
            
            // Profile update endpoints (already authenticated via session token in cookie)
            // Exclude all /api/profile/* endpoints from CSRF validation
            const isProfileEndpoint = req.path.startsWith('/api/profile/') || 
                                     req.originalUrl.startsWith('/api/profile/') ||
                                     req.url.startsWith('/api/profile/');

            // Activity tracking endpoints (frequent, low-risk, already authenticated)
            const activityEndpoints = [
                '/api/heartbeat',
                '/api/presence/heartbeat',
                '/api/user-offline',
                '/metrics/presence-client',
                '/api/user-logout'
            ];

            // API endpoints that are GET-only and don't need CSRF
            const getOnlyEndpoints = [
                '/api/matches',
                '/api/stats',
                '/api/user' // User data endpoints (GET only)
            ];

            // Check if this endpoint should be excluded
            const isPublicEndpoint = publicEndpoints.some(path => req.path === path);
            const isActivityEndpoint = activityEndpoints.some(path => req.path === path || req.path.startsWith(path));
            const isGetOnlyEndpoint = getOnlyEndpoints.some(path => req.path.startsWith(path));

            if (isPublicEndpoint || isActivityEndpoint || isGetOnlyEndpoint || isProfileEndpoint) {
                return next();
            }

            // Extract CSRF token from headers or body
            const csrfToken = req.headers['x-csrf-token'] || 
                            req.headers['X-CSRF-Token'] ||
                            req.body?.csrfToken;

            // Extract session token from cookie ONLY (no URL tokens for security)
            const sessionToken = req.cookies?.sessionToken || 
                                req.cookies?.session;

            if (!csrfToken) {
                return res.status(403).json({
                    success: false,
                    error: 'CSRF token is required',
                    code: 'CSRF_TOKEN_MISSING'
                });
            }

            if (!sessionToken) {
                return res.status(401).json({
                    success: false,
                    error: 'Session token required',
                    code: 'SESSION_TOKEN_MISSING'
                });
            }

            // Validate token (async if using Redis)
            const isValid = await this.validateToken(csrfToken, sessionToken);
            if (!isValid) {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid CSRF token',
                    code: 'CSRF_TOKEN_INVALID'
                });
            }
            
            // Optionally rotate token after successful validation (single-use tokens)
            // Uncomment if you want single-use CSRF tokens (more secure but requires token refresh)
            // this.removeToken(csrfToken);

            // Token is valid, proceed
            next();
        };
    }
}

module.exports = CSRFMiddleware;

