// Online Status Management for Totilove
class OnlineStatusManager {
    constructor() {
        this.heartbeatInterval = 30000; // 30 seconds
        this.lastSeen = Date.now();
        this.isOnline = false;
        this.heartbeatTimer = null;
        
        this.init();
    }

    init() {
        // Start heartbeat when user is logged in
        if (typeof window.sessionManager !== 'undefined' && window.sessionManager.isAuthenticated()) {
            this.startHeartbeat();
        }

        // Listen for page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.setOnline();
            } else {
                this.setOffline();
            }
        });

        // Listen for beforeunload (page close/refresh)
        window.addEventListener('beforeunload', () => {
            this.setOffline();
        });

        // Listen for network status
        window.addEventListener('online', () => this.setOnline());
        window.addEventListener('offline', () => this.setOffline());
    }

    startHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        this.setOnline();
        
        this.heartbeatTimer = setInterval(() => {
            if (window.sessionManager && window.sessionManager.isAuthenticated()) {
                this.sendHeartbeat();
            } else {
                this.stopHeartbeat();
            }
        }, this.heartbeatInterval);

        console.log('🟢 Online status heartbeat started');
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.setOffline();
        console.log('🔴 Online status heartbeat stopped');
    }

    async sendHeartbeat() {
        const user = window.sessionManager.getCurrentUser();
        if (!user) return;

        try {
            const response = await fetch('/api/heartbeat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: user.id,
                    username: user.username,
                    timestamp: Date.now()
                })
            });

            if (response.ok) {
                this.lastSeen = Date.now();
                this.isOnline = true;
                console.log('💓 Heartbeat sent successfully');
            }
        } catch (error) {
            console.error('❌ Heartbeat failed:', error);
            this.isOnline = false;
        }
    }

    setOnline() {
        this.isOnline = true;
        this.lastSeen = Date.now();
        
        // Update localStorage
        localStorage.setItem('userOnlineStatus', 'online');
        localStorage.setItem('lastSeen', this.lastSeen.toString());
        
        console.log('🟢 User status: ONLINE');
        this.updateStatusDisplay();
    }

    setOffline() {
        this.isOnline = false;
        
        // Update localStorage
        localStorage.setItem('userOnlineStatus', 'offline');
        localStorage.setItem('lastSeen', this.lastSeen.toString());
        
        console.log('🔴 User status: OFFLINE');
        this.updateStatusDisplay();
        
        // Send offline status to server
        this.sendOfflineStatus();
    }

    async sendOfflineStatus() {
        const user = window.sessionManager?.getCurrentUser();
        if (!user) return;

        try {
            await fetch('/api/user-offline', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: user.id,
                    timestamp: Date.now()
                })
            });
        } catch (error) {
            console.error('❌ Failed to send offline status:', error);
        }
    }

    updateStatusDisplay() {
        // Update any status indicators on the page
        const statusIndicators = document.querySelectorAll('.user-status-indicator');
        statusIndicators.forEach(indicator => {
            indicator.className = `user-status-indicator ${this.isOnline ? 'online' : 'offline'}`;
            indicator.textContent = this.isOnline ? '🟢 Online' : '🔴 Offline';
        });
    }

    getOnlineUsers() {
        // This would fetch from server in a real implementation
        return fetch('/api/online-users')
            .then(response => response.json())
            .catch(error => {
                console.error('❌ Failed to fetch online users:', error);
                return [];
            });
    }

    isUserOnline(userId) {
        // Check if a specific user is online
        return fetch(`/api/user-status/${userId}`)
            .then(response => response.json())
            .then(data => data.isOnline)
            .catch(error => {
                console.error('❌ Failed to check user status:', error);
                return false;
            });
    }

    getLastSeen(userId) {
        // Get when a user was last seen
        return fetch(`/api/user-lastseen/${userId}`)
            .then(response => response.json())
            .then(data => new Date(data.lastSeen))
            .catch(error => {
                console.error('❌ Failed to get last seen:', error);
                return null;
            });
    }

    formatLastSeen(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }
}

// Create global instance
const onlineStatus = new OnlineStatusManager();

// Export for use in other files
window.onlineStatus = onlineStatus;
