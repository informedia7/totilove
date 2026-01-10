/**
 * Standalone Online Activity Tracker
 * Provides real-time online status tracking across all pages
 * Based on the implementation from talk.html
 */

class OnlineActivityTracker {
    constructor() {
        this.heartbeatInterval = null;
        this.lastActivityTime = Date.now();
        this.activityHeartbeatTimeout = null;
        this.isRunning = false;
        this.currentUser = null;
        this.sessionToken = null;
        
        // Configuration
        this.config = {
            heartbeatInterval: 30000, // 30 seconds
            activityThrottle: 5000,   // 5 seconds throttle for activity-based heartbeats
            retryAttempts: 3,
            retryDelay: 5000
        };
        
        // OnlineActivityTracker initialized
    }
    
    /**
     * Initialize the tracker with user data
     */
    init(userData, sessionToken = null) {
        this.currentUser = userData;
        this.sessionToken = sessionToken || this.getSessionToken();
        
        if (!this.currentUser?.id) {
            // Cannot initialize OnlineActivityTracker: No user ID provided
            return false;
        }
        
        // OnlineActivityTracker initialized for user
        return true;
    }
    
    /**
     * Extract session token from URL, session manager, or localStorage
     */
    getSessionToken() {
        // Try URL first
        const urlParams = new URLSearchParams(window.location.search);
        let token = urlParams.get('token');
        
        // Try session manager second (preferred method)
        if (!token && window.sessionManager && window.sessionManager.getToken) {
            token = window.sessionManager.getToken();
        }
        
        // No localStorage fallback - only use session manager
        
        return token || '';
    }
    
    /**
     * Start the online activity tracking system
     */
    start() {
        if (!this.currentUser?.id) {
            // Cannot start OnlineActivityTracker: No user initialized
            return false;
        }
        
        if (this.isRunning) {
            // OnlineActivityTracker already running
            return true;
        }
        
        // Starting OnlineActivityTracker heartbeat system
        
        // Send initial heartbeat
        this.sendHeartbeat();
        
        // Set up regular heartbeat interval
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, this.config.heartbeatInterval);
        
        // Set up activity tracking
        this.setupActivityTracking();
        
        // Set up cleanup handlers
        this.setupCleanupHandlers();
        
        this.isRunning = true;
        // OnlineActivityTracker started successfully
        return true;
    }
    
    /**
     * Stop the online activity tracking system
     */
    stop() {
        if (!this.isRunning) {
            // OnlineActivityTracker already stopped
            return;
        }
        
        // Stopping OnlineActivityTracker
        
        // Clear intervals and timeouts
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.activityHeartbeatTimeout) {
            clearTimeout(this.activityHeartbeatTimeout);
            this.activityHeartbeatTimeout = null;
        }
        
        this.isRunning = false;
        // OnlineActivityTracker stopped
    }
    
    /**
     * Send heartbeat to server
     */
    async sendHeartbeat(retryCount = 0) {
        if (!this.currentUser?.id) return false;
        
        try {
            const response = await fetch('/api/heartbeat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': this.currentUser.id
                },
                body: JSON.stringify({
                    userId: this.currentUser.id,
                    timestamp: Date.now(),
                    source: 'OnlineActivityTracker'
                })
            });
            
            if (response.ok) {
                // Heartbeat sent successfully
                this.lastActivityTime = Date.now();
                return true;
            } else {
                // Heartbeat failed
                
                // Retry logic
                if (retryCount < this.config.retryAttempts) {
                    setTimeout(() => {
                        this.sendHeartbeat(retryCount + 1);
                    }, this.config.retryDelay);
                }
                return false;
            }
        } catch (error) {
            // Heartbeat error
            
            // Retry logic
            if (retryCount < this.config.retryAttempts) {
                setTimeout(() => {
                    this.sendHeartbeat(retryCount + 1);
                }, this.config.retryDelay);
            }
            return false;
        }
    }
    
    /**
     * Set up activity tracking for user interactions
     */
    setupActivityTracking() {
        // Track various user activities
        const activities = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart', 'focus'];
        
        activities.forEach(event => {
            document.addEventListener(event, () => {
                this.lastActivityTime = Date.now();
                this.scheduleActivityHeartbeat();
            }, { passive: true });
        });
        
        // Activity tracking set up
    }
    
    /**
     * Schedule a heartbeat based on user activity (throttled)
     */
    scheduleActivityHeartbeat() {
        if (this.activityHeartbeatTimeout) return;
        
        this.activityHeartbeatTimeout = setTimeout(() => {
            this.sendHeartbeat();
            this.activityHeartbeatTimeout = null;
        }, this.config.activityThrottle);
    }
    
    /**
     * Set up cleanup handlers for page unload and logout
     */
    setupCleanupHandlers() {
        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            this.stop();
        });
        
        // Clean up on visibility change (page becomes hidden)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Page hidden, reducing heartbeat frequency
                // Could reduce frequency here if needed
            } else {
                // Page visible, resuming normal heartbeat
                this.sendHeartbeat(); // Send immediate heartbeat when page becomes visible
            }
        });
    }
    
    /**
     * Handle proper logout with server notification
     */
    async handleLogout() {
        if (!this.currentUser?.id) return false;
        
        // OnlineActivityTracker: Initiating logout process
        
        // Stop heartbeat system
        this.stop();
        
        try {
            // Send logout request to server
            const response = await fetch('/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': this.currentUser.id
                },
                body: JSON.stringify({
                    token: this.sessionToken,
                    userId: this.currentUser.id,
                    timestamp: Date.now(),
                    source: 'OnlineActivityTracker'
                })
            });
            
            if (response.ok) {
                // Logout request sent successfully
                return true;
            } else {
                // Logout response not OK, but continuing
                return false;
            }
        } catch (error) {
            // Logout error
            return false;
        }
    }
    
    /**
     * Get status information
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            currentUser: this.currentUser,
            lastActivityTime: this.lastActivityTime,
            timeSinceLastActivity: Date.now() - this.lastActivityTime
        };
    }
    
    /**
     * Auto-setup for pages with standard user data structure
     */
    autoSetup() {
        // Try to get user data from common global variables
        let userData = null;
        let sessionToken = null;
        
        // Check for window.currentUser (used in talk.html)
        if (window.currentUser && window.currentUser.id) {
            userData = window.currentUser;
            sessionToken = window.sessionToken;
        }
        
        // Check for other common patterns
        if (!userData && window.user && window.user.id) {
            userData = window.user;
        }
        
        // Check for data attributes on body
        if (!userData) {
            const body = document.body;
            const userId = body.getAttribute('data-user-id');
            const real_name = body.getAttribute('data-real_name');
            
            if (userId) {
                userData = {
                    id: parseInt(userId),
                    real_name: real_name || 'User'
                };
            }
        }
        
        if (userData) {
            // OnlineActivityTracker: Auto-detected user data
            this.init(userData, sessionToken);
            this.start();
            return true;
        } else {
            // OnlineActivityTracker: Could not auto-detect user data
            return false;
        }
    }
}

// Create global instance
window.OnlineActivityTracker = OnlineActivityTracker;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (!window.onlineTracker) {
        window.onlineTracker = new OnlineActivityTracker();
        
        // Try auto-setup
        setTimeout(() => {
            window.onlineTracker.autoSetup();
        }, 100); // Small delay to ensure user data is loaded
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnlineActivityTracker;
}

        // OnlineActivityTracker module loaded
