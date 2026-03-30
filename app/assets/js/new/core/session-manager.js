/**
 * Centralized Session Management System for Totilove
 * Handles authentication tokens, user data, and session lifecycle
 */

class SessionManager {
    constructor() {
        this.API_BASE = window.location.origin;
        
        // Token validation settings
        this.MIN_TOKEN_LENGTH = 32;
        this.LANGUAGE_CACHE_TTL = 2 * 60 * 1000; // cache for 2 minutes
        this.languageCache = new Map();
        
        // Initialize on load
        this.init();
    }

    init() {
        this.cleanupInvalidTokens();
    }

    /**
     * Clean up any invalid or expired tokens
     */
    cleanupInvalidTokens() {
        const token = this.getToken();
        
        // Remove invalid tokens
        if (token && token.length < this.MIN_TOKEN_LENGTH) {
            console.log('🧹 Cleaning up invalid token');
            this.clearSession();
        }
    }

    /**
     * Get current authentication token
     */
    getToken() {
        // Try URL parameters first (in case CSRF hasn't run yet)
        const urlParams = new URLSearchParams(window.location.search);
        let token = urlParams.get('token');
        
        if (token) {
            return token;
        }
        
        // Try cookies (where CSRF stores it)
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const trimmed = cookie.trim();
            const equalIndex = trimmed.indexOf('=');
            if (equalIndex === -1) continue;
            
            const name = trimmed.substring(0, equalIndex).trim();
            const value = trimmed.substring(equalIndex + 1).trim();
            
            if (name === 'sessionToken') {
                return decodeURIComponent(value);
            }
        }
        
        return null;
    }

    /**
     * Get token from URL (alias for getToken, kept for compatibility)
     */
    getTokenFromURL() {
        return this.getToken();
    }

    /**
     * Check if current token is expired
     * URL and cookie tokens are always considered valid
     */
    isTokenExpired() {
        return false; // Tokens from URL/cookies are always valid
    }

    /**
     * Check if token needs refresh
     */
    shouldRefreshToken() {
        return false; // No refresh needed for URL/cookie tokens
    }

    /**
     * Set authentication token
     * Note: Tokens are stored in URL parameters or cookies, not localStorage
     */
    setToken(token, expiryMinutes = 60) {
        if (!token || token.length < this.MIN_TOKEN_LENGTH) {
            throw new Error('Invalid token format');
        }
        
        // Set cookie with expiry
        const expiryDate = new Date();
        expiryDate.setTime(expiryDate.getTime() + (expiryMinutes * 60 * 1000));
        document.cookie = `sessionToken=${token}; expires=${expiryDate.toUTCString()}; path=/`;
        
        console.log('✅ Token set in cookie');
    }

    /**
     * Get current user data
     */
    getCurrentUser() {
        return window.currentUser || null;
    }

    /**
     * Set current user data
     */
    setCurrentUser(user) {
        window.currentUser = user;
    }

    /**
     * Clear all session data
     */
    clearSession() {
        // Clear cookie
        document.cookie = 'sessionToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        window.currentUser = null;
        console.log('🗑️ Session cleared');
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        const token = this.getToken();
        return !!token; // If token exists (from URL or cookie), user is authenticated
    }

    /**
     * Check authentication status (alias for isAuthenticated)
     */
    checkAuth() {
        return Promise.resolve(this.isAuthenticated());
    }

    /**
     * Make authenticated API request
     */
    async apiRequest(url, options = {}) {
        const token = this.getToken();
        
        // Don't throw error if token is null - backend can read from cookies
        // Tokens from URL or cookies are always valid, no expiry check needed

        // Start with existing headers or create new object
        const headers = options.headers || {};
        
        // Ensure headers is a plain object (not Headers instance)
        const headersObj = headers instanceof Headers ? {} : { ...headers };
        
        // Set base headers (only if not already set)
        if (!headersObj['Content-Type']) {
            headersObj['Content-Type'] = 'application/json';
        }
        
        // Only add auth headers if we have a token
        // Backend can read token from cookies if headers are missing
        if (token) {
            headersObj['Authorization'] = `Bearer ${token}`;
            headersObj['X-Session-Token'] = token;
        }

        // Add x-user-id header if user is available
        const currentUser = this.getCurrentUser();
        if (currentUser && currentUser.id) {
            headersObj['x-user-id'] = currentUser.id.toString();
        }

        // Get CSRF token if available (for POST/PUT/PATCH/DELETE)
        // The fetch override in csrf-token.js should handle this automatically,
        // but we add it here as a fallback
        const method = (options.method || 'GET').toUpperCase();
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            // Try to get CSRF token - the fetch override should handle this, but we add it here for safety
            // Check multiple sources for CSRF token
            if (window.csrfToken) {
                headersObj['X-CSRF-Token'] = window.csrfToken;
            } else if (typeof window.getCSRFToken === 'function') {
                // Try to get it synchronously if already cached, or wait for it
                try {
                    const csrfTokenPromise = window.getCSRFToken();
                    // If it's a promise, we need to await it, but this function is async so that's fine
                    if (csrfTokenPromise && typeof csrfTokenPromise.then === 'function') {
                        const csrfToken = await csrfTokenPromise;
                        if (csrfToken) {
                            headersObj['X-CSRF-Token'] = csrfToken;
                        }
                    } else if (csrfTokenPromise) {
                        // Already resolved
                        headersObj['X-CSRF-Token'] = csrfTokenPromise;
                    }
                } catch (error) {
                    console.warn('⚠️ Could not get CSRF token in sessionManager:', error);
                }
            }
        }

        const fullUrl = url.startsWith('http') ? url : `${this.API_BASE}${url}`;
        let urlObj = null;
        try {
            urlObj = new URL(fullUrl, window.location.origin);
        } catch (_err) {
            // Swallow URL parsing errors for relative or malformed URLs
        }

        const cacheable = this.shouldCacheLanguageRequest(urlObj, method, options);
        let languageCacheKey;
        if (cacheable && urlObj) {
            languageCacheKey = this.getLanguageCacheKey(urlObj);
            const cachedResponse = this.getCachedLanguageResponse(languageCacheKey);
            if (cachedResponse) {
                return cachedResponse;
            }
        }

        if (this.shouldInvalidateLanguageCache(urlObj, method)) {
            this.invalidateLanguageCache(urlObj);
        }
        
        // Ensure credentials are included so cookies are sent
        const fetchOptions = {
            ...options,
            credentials: 'same-origin', // Always include cookies
            headers: headersObj
        };
        
        const response = await fetch(fullUrl, fetchOptions);

        if (cacheable && response.ok && languageCacheKey) {
            await this.storeLanguageResponse(languageCacheKey, response.clone());
        }

        // Handle token expiry - but check response body first
        if (response.status === 401) {
            try {
                const errorData = await response.clone().json();
                const errorMessage = errorData.error || '';
                
                // Only clear session if:
                // 1. We had a token in JavaScript AND backend says it's expired/invalid
                // 2. OR backend explicitly says session expired/invalid
                const isExpired = errorMessage.includes('expired') || 
                                 errorMessage.includes('invalid') ||
                                 errorMessage.includes('Session expired');
                
                if (token && isExpired) {
                    // We had a token but backend says it's expired - clear session
                    console.log('🔒 Session expired or invalid, clearing session');
                    this.clearSession();
                    throw new Error(errorMessage || 'Authentication expired');
                } else if (!token && errorMessage.includes('Session token required')) {
                    // No token in JS and backend can't find it in cookies either
                    // This might be a real auth issue, but don't clear if we never had a token
                    throw new Error(errorMessage || 'Authentication required');
                } else if (isExpired) {
                    // Backend says expired but we didn't have token - might be cookie issue
                    console.log('⚠️ Backend reports expired session, but no token in JavaScript');
                    throw new Error(errorMessage || 'Authentication expired');
                } else {
                    // Other 401 error - don't clear session
                    throw new Error(errorMessage || 'Authentication required');
                }
            } catch (parseError) {
                // If we can't parse the error, only clear if we had a token
                if (token) {
                    console.log('🔒 401 response received with token, clearing session');
                    this.clearSession();
                }
                throw new Error('Authentication failed');
            }
        }

        return response;
    }

    shouldCacheLanguageRequest(urlObj, method, options) {
        if (!urlObj || method !== 'GET') {
            return false;
        }
        if (options && options.disableLanguageCache) {
            return false;
        }
        return this.isLanguageEndpoint(urlObj.pathname);
    }

    shouldInvalidateLanguageCache(urlObj, method) {
        if (!urlObj) {
            return false;
        }
        if (method === 'GET') {
            return false;
        }
        return this.isLanguageEndpoint(urlObj.pathname);
    }

    isLanguageEndpoint(pathname = '') {
        return pathname.replace(/\/+$/, '') === '/api/profile/languages';
    }

    getLanguageCacheKey(urlObj) {
        const userId = urlObj?.searchParams?.get('userId') || 'current';
        return `languages:${userId}`;
    }

    getCachedLanguageResponse(cacheKey) {
        if (!cacheKey || !this.languageCache.has(cacheKey)) {
            return null;
        }

        const cachedEntry = this.languageCache.get(cacheKey);
        if (!cachedEntry || cachedEntry.expiresAt < Date.now()) {
            this.languageCache.delete(cacheKey);
            return null;
        }

        return new Response(cachedEntry.body, {
            status: cachedEntry.status,
            statusText: cachedEntry.statusText,
            headers: cachedEntry.headers
        });
    }

    async storeLanguageResponse(cacheKey, response) {
        if (!cacheKey || !response) {
            return;
        }

        const body = await response.text();
        const headers = {};
        response.headers.forEach((value, name) => {
            if (name) {
                headers[name] = value;
            }
        });

        this.languageCache.set(cacheKey, {
            body,
            status: response.status,
            statusText: response.statusText,
            headers,
            expiresAt: Date.now() + this.LANGUAGE_CACHE_TTL
        });
    }

    invalidateLanguageCache(urlObj) {
        if (!urlObj) {
            this.languageCache.clear();
            return;
        }
        const cacheKey = this.getLanguageCacheKey(urlObj);
        this.languageCache.delete(cacheKey);
    }

    /**
     * Login with credentials
     */
    async login(email, password) {
        try {
            const response = await fetch(`${this.API_BASE}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                throw new Error('Login failed');
            }

            const data = await response.json();
            
            if (data.sessionToken && data.user) {
                this.setToken(data.sessionToken, 60); // 1 hour expiry
                this.setCurrentUser(data.user);
                console.log('✅ Login successful');
                return data;
            } else {
                throw new Error('Invalid login response');
            }
        } catch (error) {
            console.error('❌ Login error:', error);
            throw error;
        }
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            // Call logout API if authenticated
            if (this.isAuthenticated()) {
                const currentUser = this.getCurrentUser();
                await this.apiRequest('/api/logout', { 
                    method: 'POST',
                    body: JSON.stringify({
                        userId: currentUser?.id
                    })
                });
            }
        } catch (error) {
            console.warn('⚠️ Logout API call failed:', error);
        } finally {
            this.clearSession();
            console.log('👋 Logged out');
        }
    }

    /**
     * Get current user profile from API
     */
    async getUserProfile() {
        try {
            const response = await this.apiRequest('/api/profile');
            
            if (response.ok) {
                const user = await response.json();
                this.setCurrentUser(user);
                return user;
            } else {
                throw new Error('Failed to fetch user profile');
            }
        } catch (error) {
            console.error('❌ Profile fetch error:', error);
            throw error;
        }
    }


    /**
     * Redirect to login if not authenticated
     */
    requireAuthentication(redirectUrl = '/pages/login.html') {
        if (!this.isAuthenticated()) {
            console.log('🔒 Authentication required, redirecting to login');
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    }

    /**
     * Get authentication headers for manual fetch requests
     */
    getAuthHeaders() {
        const token = this.getToken();
        if (!token) {
            throw new Error('No valid authentication token');
        }

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        // Add x-user-id header if user is available
        const currentUser = this.getCurrentUser();
        if (currentUser && currentUser.id) {
            headers['x-user-id'] = currentUser.id.toString();
        }

        return headers;
    }
}

// Create global instance
window.sessionManager = new SessionManager();

// Add heartbeat logic to keep user online
function startHeartbeat() {
    if (!window.currentUser) return;
    if (window.heartbeatStarted) return;
    window.heartbeatStarted = true;
    const hasRealtimeConnection = () => {
        const engine = window.Presence || window.__PresenceEngineInstance;
        return Boolean(engine?.socket && engine.socket.connected);
    };

    window.legacyHeartbeatInterval = setInterval(() => {
        if (hasRealtimeConnection()) {
            return;
        }

        fetch('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: window.currentUser.id,
                real_name: window.currentUser.real_name || window.currentUser.real_name || '',
                timestamp: Date.now()
            })
        }).catch(() => {
            // Silently ignore network hiccups; Presence engine will retry when needed
        });
    }, 30020); // every 30 seconds when no realtime socket is available
}
// Start heartbeat after authentication
if (window.sessionManager && window.sessionManager.isAuthenticated && window.sessionManager.isAuthenticated()) {
    window.currentUser = window.currentUser || window.sessionManager.getCurrentUser();
    if (window.currentUser) {
        startHeartbeat();
    }
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionManager;
}

