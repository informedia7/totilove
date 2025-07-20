/**
 * Centralized Session Management System for Totilove
 * Handles authentication tokens, user data, and session lifecycle
 */

class SessionManager {
    constructor() {
        this.TOKEN_KEY = 'totilove_session_token';
        this.USER_KEY = 'totilove_current_user';
        this.EXPIRY_KEY = 'totilove_token_expiry';
        this.API_BASE = '';
        
        // Token validation settings
        this.MIN_TOKEN_LENGTH = 32;
        this.TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry
        
        // Initialize on load
        this.init();
    }

    init() {
        console.log('🔐 SessionManager initializing...');
        this.cleanupInvalidTokens();
        this.setupTokenRefresh();
    }

    /**
     * Clean up any invalid or expired tokens
     */
    cleanupInvalidTokens() {
        const token = this.getToken();
        const expiry = this.getTokenExpiry();
        
        // Remove invalid tokens
        if (token && (token.length < this.MIN_TOKEN_LENGTH || this.isTokenExpired())) {
            console.log('🧹 Cleaning up invalid/expired token');
            this.clearSession();
        }
        
        // Clean up old storage formats
        localStorage.removeItem('token');
        localStorage.removeItem('sessionToken'); 
        localStorage.removeItem('currentUser');
        sessionStorage.clear(); // Clear any session storage tokens
    }

    /**
     * Get current authentication token
     */
    getToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    }

    /**
     * Get token expiry timestamp
     */
    getTokenExpiry() {
        const expiry = localStorage.getItem(this.EXPIRY_KEY);
        return expiry ? parseInt(expiry) : null;
    }

    /**
     * Check if current token is expired
     */
    isTokenExpired() {
        const expiry = this.getTokenExpiry();
        if (!expiry) return true;
        return Date.now() >= expiry;
    }

    /**
     * Check if token needs refresh (close to expiry)
     */
    shouldRefreshToken() {
        const expiry = this.getTokenExpiry();
        if (!expiry) return false;
        return Date.now() >= (expiry - this.TOKEN_REFRESH_THRESHOLD);
    }

    /**
     * Set authentication token with expiry
     */
    setToken(token, expiryMinutes = 60) {
        if (!token || token.length < this.MIN_TOKEN_LENGTH) {
            throw new Error('Invalid token format');
        }
        
        const expiry = Date.now() + (expiryMinutes * 60 * 1000);
        
        localStorage.setItem(this.TOKEN_KEY, token);
        localStorage.setItem(this.EXPIRY_KEY, expiry.toString());
        
        console.log('✅ Token set with expiry:', new Date(expiry).toLocaleString());
    }

    /**
     * Get current user data
     */
    getCurrentUser() {
        const userData = localStorage.getItem(this.USER_KEY);
        return userData ? JSON.parse(userData) : null;
    }

    /**
     * Set current user data
     */
    setCurrentUser(user) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    }

    /**
     * Clear all session data
     */
    clearSession() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        localStorage.removeItem(this.EXPIRY_KEY);
        console.log('🗑️ Session cleared');
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        const token = this.getToken();
        return token && !this.isTokenExpired();
    }

    /**
     * Make authenticated API request
     */
    async apiRequest(url, options = {}) {
        const token = this.getToken();
        
        if (!token || this.isTokenExpired()) {
            throw new Error('No valid authentication token');
        }

        // Check if token needs refresh
        if (this.shouldRefreshToken()) {
            try {
                await this.refreshToken();
            } catch (error) {
                console.warn('⚠️ Token refresh failed, continuing with current token');
            }
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getToken()}`,
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        // Handle token expiry
        if (response.status === 401) {
            console.log('🔒 Token expired, clearing session');
            this.clearSession();
            throw new Error('Authentication expired');
        }

        return response;
    }

    /**
     * Login with credentials
     */
    async login(email, password) {
        try {
            const response = await fetch('/api/login', {
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
            
            if (data.token && data.user) {
                this.setToken(data.token, 60); // 1 hour expiry
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
                await this.apiRequest('/api/logout', { method: 'POST' });
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
     * Refresh authentication token
     */
    async refreshToken() {
        try {
            const response = await fetch('/api/refresh-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getToken()}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.token) {
                    this.setToken(data.token, 60);
                    console.log('🔄 Token refreshed');
                    return data.token;
                }
            }
            
            throw new Error('Token refresh failed');
        } catch (error) {
            console.error('❌ Token refresh error:', error);
            throw error;
        }
    }

    /**
     * Setup automatic token refresh
     */
    setupTokenRefresh() {
        // Check every 5 minutes
        setInterval(() => {
            if (this.isAuthenticated() && this.shouldRefreshToken()) {
                this.refreshToken().catch(error => {
                    console.warn('⚠️ Automatic token refresh failed:', error);
                });
            }
        }, 5 * 60 * 1000);
    }

    /**
     * Create a development/testing session
     */
    async createTestSession(userId = 20) {
        try {
            const response = await fetch('/api/create-test-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.token && data.user) {
                    this.setToken(data.token, 120); // 2 hours for testing
                    this.setCurrentUser(data.user);
                    console.log('🧪 Test session created for user:', userId);
                    return data;
                }
            }
            
            throw new Error('Test session creation failed');
        } catch (error) {
            console.error('❌ Test session error:', error);
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
        if (!token || this.isTokenExpired()) {
            throw new Error('No valid authentication token');
        }

        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Debug session information
     */
    debugSession() {
        console.log('🔍 Session Debug Info:', {
            hasToken: !!this.getToken(),
            tokenLength: this.getToken()?.length || 0,
            isExpired: this.isTokenExpired(),
            shouldRefresh: this.shouldRefreshToken(),
            user: this.getCurrentUser(),
            expiry: this.getTokenExpiry() ? new Date(this.getTokenExpiry()).toLocaleString() : 'None'
        });
    }
}

// Create global instance
window.sessionManager = new SessionManager();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionManager;
}
