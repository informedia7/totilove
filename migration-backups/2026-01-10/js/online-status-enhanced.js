// Enhanced Online Status Management for Totilove
class OnlineStatusManager {
    constructor() {
        this.heartbeatInterval = 15000; // 15 seconds (reduced from 30)
        this.websocketHeartbeatInterval = 10000; // 10 seconds for WebSocket
        this.lastSeen = Date.now();
        this.isOnline = false;
        this.heartbeatTimer = null;
        this.websocketTimer = null;
        this.connectionQuality = 'good'; // good, fair, poor, offline
        this.failedHeartbeats = 0;
        this.maxFailedHeartbeats = 3;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.isReconnecting = false;
        
        this.init();
    }

    // Preferences Manager for Online Status
    getStatusPreference(key, defaultValue = null) {
        try {
            // Try session manager first (preferred method)
            if (window.sessionManager && window.sessionManager.getCurrentUser) {
                const user = window.sessionManager.getCurrentUser();
                if (user && user.id) {
                    // No localStorage fallback
                    return defaultValue;
                }
            }
            
            // No localStorage fallback
            return defaultValue;
        } catch (error) {
            console.warn('Error getting status preference:', error);
            return defaultValue;
        }
    }

    setStatusPreference(key, value) {
        try {
            // Store in session manager if available
            if (window.sessionManager && window.sessionManager.getCurrentUser) {
                const user = window.sessionManager.getCurrentUser();
                if (user && user.id) {
                    // No localStorage storage
                }
            }
        } catch (error) {
            console.warn('Error setting status preference:', error);
        }
    }

    init() {
        // Start heartbeat when user is logged in
        if (typeof window.sessionManager !== 'undefined' && window.sessionManager.isAuthenticated()) {
            this.startHeartbeat();
            this.initializeWebSocket();
        }

        // Listen for page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.handlePageVisible();
            } else {
                this.handlePageHidden();
            }
        });

        // Enhanced beforeunload handling
        window.addEventListener('beforeunload', (e) => {
            this.handlePageUnload();
        });

        // Listen for network status with improved handling
        window.addEventListener('online', () => this.handleNetworkOnline());
        window.addEventListener('offline', () => this.handleNetworkOffline());

        // Add focus/blur events for better detection
        window.addEventListener('focus', () => this.handleWindowFocus());
        window.addEventListener('blur', () => this.handleWindowBlur());

        // Add periodic connection quality check
        setInterval(() => this.checkConnectionQuality(), 30000);
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

        console.log('🟢 Enhanced heartbeat started (15s interval)');
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.websocketTimer) {
            clearInterval(this.websocketTimer);
            this.websocketTimer = null;
        }
        this.disconnectWebSocket();
        this.setOffline();
        console.log('🔴 Enhanced heartbeat stopped');
    }

    initializeWebSocket() {
        try {
            // Check if Socket.IO is available
            if (typeof io === 'undefined') {
                console.warn('⚠️ Socket.IO not available, skipping WebSocket initialization');
                return;
            }

            if (this.socket && this.socket.connected) {
                return; // Already connected
            }

            // Use WebSocket-only transport to avoid CSP unsafe-eval violations
            this.socket = io({
                transports: ['websocket']
            });
            
            this.socket.on('connect', () => {
                console.log('🔌 Socket.IO connected for status monitoring');
                this.reconnectAttempts = 0;
                this.isReconnecting = false;
                
                // Authenticate the socket connection
                const user = window.sessionManager.getCurrentUser();
                if (user) {
                    this.socket.emit('authenticate', {
                        userId: user.id,
                        real_name: user.real_name
                    });
                }
                
                this.startWebSocketHeartbeat();
            });

            this.socket.on('disconnect', () => {
                console.log('🔌 Socket.IO disconnected');
                if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.attemptReconnect();
                }
            });

            this.socket.on('connect_error', (error) => {
                console.error('🔌 Socket.IO connection error:', error);
                this.connectionQuality = 'poor';
            });

            this.socket.on('authenticated', (data) => {
                console.log('✅ WebSocket authenticated successfully');
                this.connectionQuality = 'good';
            });

            this.socket.on('auth_error', (data) => {
                console.error('❌ WebSocket authentication failed:', data.message);
                this.connectionQuality = 'poor';
            });

            this.socket.on('heartbeat_ack', (data) => {
                this.handleWebSocketHeartbeatAck();
            });

        } catch (error) {
            console.error('❌ Socket.IO initialization failed:', error);
            this.connectionQuality = 'poor';
        }
    }

    startWebSocketHeartbeat() {
        if (this.websocketTimer) {
            clearInterval(this.websocketTimer);
        }

        this.websocketTimer = setInterval(() => {
            if (this.socket && this.socket.connected) {
                this.sendWebSocketHeartbeat();
            }
        }, this.websocketHeartbeatInterval);
    }

    sendWebSocketHeartbeat() {
        try {
            if (this.socket && this.socket.connected) {
                const user = window.sessionManager.getCurrentUser();
                this.socket.emit('heartbeat', {
                    userId: user?.id,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('❌ Socket.IO heartbeat failed:', error);
            this.connectionQuality = 'poor';
        }
    }

    handleWebSocketHeartbeatAck() {
        this.connectionQuality = 'good';
        this.failedHeartbeats = 0;
    }

    attemptReconnect() {
        if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
            return;
        }

        this.isReconnecting = true;
        this.reconnectAttempts++;
        
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff
        
        console.log(`🔄 Attempting WebSocket reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
        
        setTimeout(() => {
            this.isReconnecting = false;
            this.initializeWebSocket();
        }, delay);
    }

    disconnectWebSocket() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    async sendHeartbeat() {
        const user = window.sessionManager.getCurrentUser();
        if (!user) return;

        try {
            const startTime = Date.now();
            const response = await fetch('/api/heartbeat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: user.id,
                    real_name: user.real_name,
                    timestamp: Date.now(),
                    connectionQuality: this.connectionQuality
                })
            });

            const responseTime = Date.now() - startTime;

            if (response.ok) {
                this.lastSeen = Date.now();
                this.isOnline = true;
                this.failedHeartbeats = 0;
                
                // Update connection quality based on response time
                if (responseTime < 1000) {
                    this.connectionQuality = 'good';
                } else if (responseTime < 3000) {
                    this.connectionQuality = 'fair';
                } else {
                    this.connectionQuality = 'poor';
                }
                
                console.log(`💓 Heartbeat sent successfully (${responseTime}ms, ${this.connectionQuality})`);
            } else {
                this.handleHeartbeatFailure();
            }
        } catch (error) {
            console.error('❌ Heartbeat failed:', error);
            this.handleHeartbeatFailure();
        }
    }

    handleHeartbeatFailure() {
        this.failedHeartbeats++;
        this.connectionQuality = 'poor';
        
        if (this.failedHeartbeats >= this.maxFailedHeartbeats) {
            console.warn('⚠️ Multiple heartbeat failures - marking as offline');
            this.setOffline();
            // Try to reconnect WebSocket
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                this.attemptReconnect();
            }
        }
    }

    setOnline() {
        this.isOnline = true;
        this.lastSeen = Date.now();
        this.failedHeartbeats = 0;
        
        // Update status using preferences manager
        this.setStatusPreference('userOnlineStatus', 'online');
        this.setStatusPreference('lastSeen', this.lastSeen.toString());
        
        console.log(`🟢 User status: ONLINE (${this.connectionQuality} connection)`);
        this.updateStatusDisplay();
        
        // Send immediate heartbeat when coming online
        if (window.sessionManager && window.sessionManager.isAuthenticated()) {
            this.sendHeartbeat();
        }
    }

    setOffline() {
        this.isOnline = false;
        
        // Update status using preferences manager
        this.setStatusPreference('userOnlineStatus', 'offline');
        this.setStatusPreference('lastSeen', this.lastSeen.toString());
        
        console.log('🔴 User status: OFFLINE');
        this.updateStatusDisplay();
        
        // Send offline status to server
        this.sendOfflineStatus();
    }

    // Enhanced event handlers
    handlePageVisible() {
        console.log('👁️ Page became visible - resuming full activity');
        this.setOnline();
        if (!this.heartbeatTimer) {
            this.startHeartbeat();
        }
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.initializeWebSocket();
        }
    }

    handlePageHidden() {
        console.log('👁️‍🗨️ Page hidden - reducing activity');
        // Don't immediately set offline, just reduce activity
        // User might switch tabs frequently
    }

    handlePageUnload() {
        console.log('🚪 Page unloading - sending offline status');
        // Use sendBeacon for reliable delivery during page unload
        this.sendOfflineStatusBeacon();
        this.disconnectWebSocket();
    }

    handleNetworkOnline() {
        console.log('🌐 Network online - resuming activity');
        this.connectionQuality = 'good';
        this.setOnline();
        if (!this.heartbeatTimer) {
            this.startHeartbeat();
        }
        this.initializeWebSocket();
    }

    handleNetworkOffline() {
        console.log('🌐 Network offline - going offline');
        this.connectionQuality = 'offline';
        this.setOffline();
        this.stopHeartbeat();
    }

    handleWindowFocus() {
        console.log('🎯 Window focused - resuming full activity');
        this.setOnline();
    }

    handleWindowBlur() {
        console.log('🎯 Window blurred - maintaining activity');
        // Don't go offline immediately, user might return soon
    }

    checkConnectionQuality() {
        const now = Date.now();
        const timeSinceLastSeen = now - this.lastSeen;
        
        // If no heartbeat for 2 minutes, consider offline
        if (timeSinceLastSeen > 120000) {
            console.warn('⏰ No heartbeat for 2 minutes - marking offline');
            this.setOffline();
        } else if (timeSinceLastSeen > 60000) {
            console.warn('⏰ No heartbeat for 1 minute - poor connection');
            this.connectionQuality = 'poor';
        }
        
        this.updateStatusDisplay();
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

    sendOfflineStatusBeacon() {
        const user = window.sessionManager?.getCurrentUser();
        if (!user) return;

        // Use sendBeacon for reliable delivery during page unload
        if (navigator.sendBeacon) {
            const data = new Blob([JSON.stringify({
                userId: user.id,
                timestamp: Date.now()
            })], { type: 'application/json' });
            
            navigator.sendBeacon('/api/user-offline', data);
        } else {
            // Fallback to synchronous fetch
            this.sendOfflineStatus();
        }
    }

    updateStatusDisplay() {
        // Update any status indicators on the page
        const statusIndicators = document.querySelectorAll('.user-status-indicator');
        statusIndicators.forEach(indicator => {
            const statusClass = this.isOnline ? 'online' : 'offline';
            const statusText = this.isOnline ? '🟢 Online' : '🔴 Offline';
            const qualityText = this.isOnline ? ` (${this.connectionQuality})` : '';
            
            indicator.className = `user-status-indicator ${statusClass}`;
            indicator.textContent = statusText + qualityText;
        });

        // Update connection quality indicators
        const qualityIndicators = document.querySelectorAll('.connection-quality-indicator');
        qualityIndicators.forEach(indicator => {
            indicator.className = `connection-quality-indicator ${this.connectionQuality}`;
            indicator.textContent = this.getConnectionQualityText();
        });
    }

    getConnectionQualityText() {
        switch (this.connectionQuality) {
            case 'good': return '🟢 Good';
            case 'fair': return '🟡 Fair';
            case 'poor': return '🟠 Poor';
            case 'offline': return '🔴 Offline';
            default: return '❓ Unknown';
        }
    }

    async getOnlineUsers() {
        try {
            const response = await fetch('/api/online-users');
            const data = await response.json();
            return data.users || data.onlineUsers || [];
        } catch (error) {
            console.error('❌ Failed to fetch online users:', error);
            return [];
        }
    }

    // Use standalone OnlineCheck module for user status checking
    async isUserOnline(userId) {
        if (window.OnlineCheck && window.OnlineCheck.isUserOnline) {
            return window.OnlineCheck.isUserOnline(userId);
        }
        
        // Fallback implementation
        try {
            const response = await fetch(`/api/user-status/${userId}`);
            const data = await response.json();
            return data.isOnline;
        } catch (error) {
            console.error('❌ Failed to check user status:', error);
            return false;
        }
    }

    async getLastSeen(userId) {
        if (window.OnlineCheck && window.OnlineCheck.getUserLastSeen) {
            return window.OnlineCheck.getUserLastSeen(userId);
        }
        
        // Fallback implementation
        try {
            const response = await fetch(`/api/user-lastseen/${userId}`);
            const data = await response.json();
            return new Date(data.lastSeen);
        } catch (error) {
            console.error('❌ Failed to get last seen:', error);
            return null;
        }
    }

    formatLastSeen(timestamp) {
        if (window.OnlineCheck && window.OnlineCheck.formatLastSeen) {
            return window.OnlineCheck.formatLastSeen(timestamp);
        }
        
        // Fallback implementation
        const now = Date.now();
        const diff = now - timestamp;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (seconds < 10) return 'Just now';
        if (seconds < 60) return `${seconds}s ago`;
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    // Public API methods
    getStatus() {
        return {
            isOnline: this.isOnline,
            lastSeen: this.lastSeen,
            connectionQuality: this.connectionQuality,
            failedHeartbeats: this.failedHeartbeats,
            websocketConnected: this.socket && this.socket.readyState === WebSocket.OPEN
        };
    }

    forceOnline() {
        console.log('🔧 Force setting online status');
        this.setOnline();
        if (!this.heartbeatTimer) {
            this.startHeartbeat();
        }
        this.initializeWebSocket();
    }

    forceOffline() {
        console.log('🔧 Force setting offline status');
        this.stopHeartbeat();
        this.setOffline();
    }
}

// Create global instance
const enhancedOnlineStatus = new OnlineStatusManager();

// Export for use in other files
window.onlineStatus = enhancedOnlineStatus;
window.enhancedOnlineStatus = enhancedOnlineStatus;
