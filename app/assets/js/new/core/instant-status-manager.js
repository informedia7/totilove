// Instant Status Manager for Real-Time Online Status Updates
class InstantStatusManager {
    constructor(options = {}) {
        // Configurable options
        this.pageType = options.pageType || this.detectPageType();
        this.heartbeatInterval = options.heartbeatInterval || this.getDefaultHeartbeatInterval();
        this.batchDelay = options.batchDelay || 200; // 200ms
        this.cacheTTL = options.cacheTTL || 60000; // 60s
        this.retryDelay = options.initialRetryDelay || 1000;
        this.maxRetryDelay = options.maxRetryDelay || 30010;
        this.httpMinInterval = options.httpMinInterval || (this.pageType === 'talk' ? 30000 : 60000);
        this.httpRetryDelay = options.httpRetryDelay || 2000;
        this.httpRetryDelayMax = options.httpRetryDelayMax || 60000;
        this.initialHttpRetryDelay = this.httpRetryDelay;
        this.httpRetryTimeout = null;
        this.lastHttpHeartbeatAttempt = 0;
        this.lastSuccessfulHttpHeartbeat = 0;
        this.nextHttpAttemptAfter = 0;

        // Internal state
        this.socket = null;
        this.isInitialized = false;
        this.statusCache = new Map(); // userId -> { isOnline, timestamp, lastUpdated }
        this.statusElements = new Map(); // userId -> [elements]
        this.pendingUserIds = new Set();
        this.batchTimer = null;
        this.isProcessingBatch = false;
        this.heartbeatTimer = null;

        // MutationObserver throttling
        this._mutationScheduled = false;
        this._pendingRemovedNodes = new Set();

        // Bind instance methods for listeners
        this._onSocketConnect = this._onSocketConnect.bind(this);
        this._onSocketDisconnect = this._onSocketDisconnect.bind(this);
        this._onUserStatusChange = this._onUserStatusChange.bind(this);
        this._onStatusUpdated = this._onStatusUpdated.bind(this);
        this._onHeartbeatAck = this._onHeartbeatAck.bind(this);

        this.init();
    }

    detectPageType() {
        const path = (window.location.pathname || '').toLowerCase();
        if (path.includes('/talk')) return 'talk';
        if (path.includes('/matches')) return 'matches';
        return 'default';
    }

    getDefaultHeartbeatInterval() {
        return this.pageType === 'talk' ? 10000 : 30000;
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeStatusManager());
        } else {
            this.initializeStatusManager();
        }
    }

    initializeStatusManager() {
        if (this.isInitialized) return;

        if (!window.sessionManager || !window.sessionManager.isAuthenticated()) {
            return;
        }

        this.initializeWebSocket();
        this.startHeartbeat();
        this.setupEventListeners();
        this.scanForStatusElements();

        // Periodic cleanup to remove disconnected elements (avoid memory leaks)
        this._cleanupTimer = setInterval(() => this._cleanupDisconnectedElements(), 30_000);

        this.isInitialized = true;
    }

    initializeWebSocket() {
        try {
            if (typeof io === 'undefined') {
                console.warn('⚠️ Socket.IO not available, using fallback status checks');
                return;
            }

            this.socket = io({ transports: ['websocket'] });

            this.socket.on('connect', this._onSocketConnect);
            this.socket.on('disconnect', this._onSocketDisconnect);
            this.socket.on('user_status_change', this._onUserStatusChange);
            this.socket.on('status_updated', this._onStatusUpdated);
            this.socket.on('heartbeat_ack', this._onHeartbeatAck);

        } catch (error) {
            console.error('❌ WebSocket initialization failed:', error);
        }
    }

    _onSocketConnect() {
        this.authenticateSocket();

        // On reconnect, refresh statuses for all known users to ensure UI consistency
        this.refreshAllKnownStatuses();
    }

    _onSocketDisconnect() {
        console.log('🔌 Status WebSocket disconnected');
    }

    _onUserStatusChange(data) {
        this.handleRemoteUserStatusChange(data);
    }

    _onStatusUpdated(data) {
        this.handleOwnStatusUpdate(data);
    }

    _onHeartbeatAck() {
        this.handleHeartbeatAck();
    }

    authenticateSocket() {
        if (!this.socket || !window.sessionManager) return;
        const currentUser = window.sessionManager.getCurrentUser();
        if (!currentUser) return;

        this.socket.emit('authenticate', {
            userId: currentUser.id,
            real_name: currentUser.real_name || currentUser.real_name || currentUser.email || ''
        });
    }

    startHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatInterval);
        // Send immediately
        this.sendHeartbeat();
    }

    sendHeartbeat() {
        if (this.socket && this.socket.connected) {
            try {
                this.socket.emit('heartbeat', { timestamp: Date.now() });
            } catch (err) {
                // Fallback to HTTP if socket emit fails
                this.sendHttpHeartbeat();
            }
            return;
        }
        this.sendHttpHeartbeat();
    }

    async sendHttpHeartbeat() {
        const now = Date.now();
        if (now < this.nextHttpAttemptAfter) {
            return;
        }
        this.lastHttpHeartbeatAttempt = now;
        this.nextHttpAttemptAfter = now + this.httpMinInterval;

        try {
            const currentUser = window.sessionManager?.getCurrentUser();
            if (!currentUser) return;

            const response = await fetch('/api/user-online', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id })
            });

            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                const retryAfterHeader = response.headers ? response.headers.get('Retry-After') : null;
                if (retryAfterHeader) {
                    const retryAfterSeconds = parseInt(retryAfterHeader, 10);
                    if (!Number.isNaN(retryAfterSeconds)) {
                        error.retryAfter = retryAfterSeconds * 1000;
                    }
                }
                throw error;
            }

            this.lastSuccessfulHttpHeartbeat = now;
            this.resetHttpRetry();
        } catch (error) {
            this.handleHttpHeartbeatFailure(error);
        }
    }

    handleHttpHeartbeatFailure(error) {
        console.error('❌ HTTP heartbeat failed:', error);
        let delay = this.httpRetryDelay;
        if (error && typeof error.retryAfter === 'number') {
            delay = error.retryAfter;
        } else {
            this.httpRetryDelay = Math.min(this.httpRetryDelay * 2, this.httpRetryDelayMax);
            delay = this.httpRetryDelay;
        }

        this.nextHttpAttemptAfter = Date.now() + delay;

        if (this.httpRetryTimeout) {
            clearTimeout(this.httpRetryTimeout);
        }
        this.httpRetryTimeout = setTimeout(() => {
            this.httpRetryTimeout = null;
            this.sendHttpHeartbeat();
        }, delay);
    }

    resetHttpRetry() {
        if (this.httpRetryTimeout) {
            clearTimeout(this.httpRetryTimeout);
            this.httpRetryTimeout = null;
        }
        this.httpRetryDelay = this.initialHttpRetryDelay;
        this.nextHttpAttemptAfter = Date.now() + this.httpMinInterval;
    }
    handleHeartbeatAck() {
        this.updateOwnStatus(true);
    }

    handleRemoteUserStatusChange({ userId, isOnline, timestamp }) {
        if (typeof userId === 'string') userId = parseInt(userId, 10);
        if (isNaN(userId)) return;

        this.statusCache.set(userId, {
            isOnline: !!isOnline,
            timestamp: timestamp || Date.now(),
            lastUpdated: Date.now()
        });

        this.updateUserStatusElements(userId, !!isOnline);
        console.log(`👤 Remote user ${userId} ${isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}`);
    }

    handleOwnStatusUpdate({ isOnline }) {
        this.updateOwnStatus(!!isOnline);
    }

    updateOwnStatus(isOnline) {
        const currentUser = window.sessionManager?.getCurrentUser();
        if (!currentUser) return;

        this.statusCache.set(currentUser.id, {
            isOnline: !!isOnline,
            timestamp: Date.now(),
            lastUpdated: Date.now()
        });

        this.updateUserStatusElements(currentUser.id, !!isOnline);
    }

    updateUserStatusElements(userId, isOnline) {
        const elements = this.statusElements.get(userId) || [];
        elements.forEach(el => this.updateStatusElement(el, isOnline));
    }

    updateStatusElement(element, isOnline) {
        if (!element) return;

        // Safety check: Don't modify card elements
        if (element.classList.contains('online-user-card') || element.closest('.online-user-card')) {
            return; // Don't modify card elements
        }

        // CRITICAL: Don't modify large container elements that contain page content
        if (element.classList.contains('profile-container') || 
            element.classList.contains('tab-content') ||
            element.classList.contains('profile-cards-container') ||
            element.id === 'profile-container' ||
            element.id === 'tab-content' ||
            element.id === 'tab-panel-full' ||
            element.closest('.profile-container') === element) {
            console.warn('⚠️ Instant Status Manager: Skipping large container element', element.id || element.className);
            return; // Don't modify container elements
        }

        // Safety check: Don't modify elements that are too large (likely containers)
        if (element.children.length > 10 || element.innerHTML.length > 5000) {
            console.warn('⚠️ Instant Status Manager: Skipping large element (likely container)', element.id || element.className);
            return; // Don't modify large container elements
        }

        // Check if this is a dot-only indicator element (don't create child elements for these)
        if (element.classList.contains('online-dot') || element.classList.contains('online-dot-results')) {
            // These elements ARE the dot indicators themselves - just show/hide them
            if (isOnline) {
                element.style.display = 'block';
                // Ensure proper styling if not already set
                if (!element.style.width) {
                    element.style.width = '12px';
                    element.style.height = '12px';
                    element.style.borderRadius = '50%';
                    element.style.background = '#00b894';
                    element.style.boxShadow = '0 0 0 2px rgba(0,184,148,0.3)';
                }
            } else {
                element.style.display = 'none';
            }
            
            // Dispatch custom event for other scripts
            element.dispatchEvent(new CustomEvent('statusChanged', {
                detail: { isOnline: !!isOnline, userId: element.dataset.userId }
            }));
            return;
        }

        // For text-based status elements, create/update child structure
        let dot = element.querySelector('.ism-dot');
        let text = element.querySelector('.ism-text');

        if (!dot || !text) {
            // Clear any existing content to prevent duplicates
            // BUT only if this is a small status element, not a container
            if (element.innerHTML.length < 500) {
                element.innerHTML = '';
            } else {
                console.warn('⚠️ Instant Status Manager: Skipping innerHTML clear on large element', element.id || element.className);
                return; // Don't clear large elements
            }
            dot = document.createElement('span');
            dot.className = 'ism-dot';
            dot.style.marginRight = '6px';
            dot.style.fontSize = '1.2em';
            dot.setAttribute('aria-hidden', 'true');

            text = document.createElement('span');
            text.className = 'ism-text';
            text.style.verticalAlign = 'middle';

            element.appendChild(dot);
            element.appendChild(text);
        }

        // Text-based status - only update if not already set to prevent flicker
        const currentText = text.textContent;
        const newText = isOnline ? 'Online' : 'Offline';
        if (currentText !== newText) {
            dot.textContent = '●';
            dot.style.color = isOnline ? '#27ae60' : '#aaa';
            text.textContent = newText;
        }
        element.classList.toggle('online', isOnline);
        element.classList.toggle('offline', !isOnline);

        // Dispatch custom event for other scripts
        element.dispatchEvent(new CustomEvent('statusChanged', {
            detail: { isOnline: !!isOnline, userId: element.dataset.userId }
        }));
    }

    registerStatusElement(element, userId) {
        // CRITICAL: Don't register large container elements as status elements
        if (!element) return;
        
        // Skip large container elements that contain page content
        if (element.classList.contains('profile-container') || 
            element.classList.contains('tab-content') ||
            element.classList.contains('profile-cards-container') ||
            element.id === 'profile-container' ||
            element.id === 'tab-content' ||
            element.id === 'tab-panel-full') {
            console.warn('⚠️ Instant Status Manager: Skipping registration of container element', element.id || element.className);
            return; // Don't register container elements
        }
        
        // Skip elements that are too large (likely containers)
        if (element.children.length > 10 || (element.innerHTML && element.innerHTML.length > 5000)) {
            console.warn('⚠️ Instant Status Manager: Skipping registration of large element', element.id || element.className);
            return; // Don't register large container elements
        }
        if (!element || !userId) return;
        const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
        if (isNaN(userIdNum)) {
            console.warn('Invalid user ID:', userId);
            return;
        }

        // Prevent duplicate registration
        if (element.dataset.ismRegistered === 'true') {
            // Already registered, just update if needed
            const cached = this.statusCache.get(userIdNum);
            if (cached && (Date.now() - cached.lastUpdated) < this.cacheTTL) {
                this.updateStatusElement(element, cached.isOnline);
            }
            return;
        }

        element.dataset.userId = userIdNum;
        element.dataset.ismRegistered = 'true'; // Mark as registered by instant-status-manager

        if (!this.statusElements.has(userIdNum)) this.statusElements.set(userIdNum, []);
        const arr = this.statusElements.get(userIdNum);
        if (!arr.includes(element)) arr.push(element);

        // Immediately set from cache if fresh
        const cached = this.statusCache.get(userIdNum);
        if (cached && (Date.now() - cached.lastUpdated) < this.cacheTTL) {
            this.updateStatusElement(element, cached.isOnline);
            return;
        }

        // Otherwise queue it (element attached will be updated when batch returns)
        this.queueUserStatusRequest(userIdNum, element);
    }

    unregisterStatusElement(element) {
        if (!element) return;
        const userId = element.dataset?.userId;
        if (!userId) return;
        const userIdNum = parseInt(userId, 10);
        if (isNaN(userIdNum)) return;

        const arr = this.statusElements.get(userIdNum);
        if (!arr) return;
        const idx = arr.indexOf(element);
        if (idx !== -1) arr.splice(idx, 1);

        // Remove registration flag
        delete element.dataset.ismRegistered;

        // Remove map key if empty
        if (arr.length === 0) this.statusElements.delete(userIdNum);
    }

    // Batch queueing logic with starvation protection
    queueUserStatusRequest(userId, element = null) {
        this.pendingUserIds.add(userId);

        if (element) {
            if (!this.statusElements.has(userId)) this.statusElements.set(userId, []);
            const arr = this.statusElements.get(userId);
            if (!arr.includes(element)) arr.push(element);
        }

        // If a timer already exists, only reset it if there's sufficiently long left
        if (this.batchTimer) {
            // Can't inspect remaining time of a timeout reliably; use simple heuristic: don't continually clear/set within 50ms
            // We'll allow the existing timer to run if set within the last 50ms window by leaving it alone.
            // For simplicity in browsers, we just clear and set — but developers can tune batchDelay to avoid starvation.
            clearTimeout(this.batchTimer);
        }

        this.batchTimer = setTimeout(() => this.processBatchRequests(), this.batchDelay);
    }

    async processBatchRequests() {
        if (this.isProcessingBatch || this.pendingUserIds.size === 0) return;
        this.isProcessingBatch = true;

        const userIdsToCheck = Array.from(this.pendingUserIds);
        // Clear pending early so new requests can accumulate
        this.pendingUserIds.clear();

        try {
            const response = await fetch('/api/users-online-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: userIdsToCheck })
            });

            if (response.status === 429) {
                console.warn('⚠️ Rate limit exceeded, retrying with backoff...');
                // Requeue
                userIdsToCheck.forEach(id => this.pendingUserIds.add(id));

                // Exponential backoff
                this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
                setTimeout(() => {
                    this.retryDelay = 1000;
                    this.isProcessingBatch = false;
                    this.processBatchRequests();
                }, this.retryDelay);

                return;
            }

            this.retryDelay = 1000; // reset after success or non-429

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            const data = await response.json();

            if (data && data.success && data.statuses) {
                Object.keys(data.statuses).forEach(userIdStr => {
                    const id = parseInt(userIdStr, 10);
                    const statusData = data.statuses[userIdStr];
                    this.statusCache.set(id, {
                        isOnline: !!statusData.isOnline,
                        timestamp: statusData.timestamp || Date.now(),
                        lastUpdated: Date.now()
                    });
                    this.updateUserStatusElements(id, !!statusData.isOnline);
                });
            } else {
                // If server returns unusual payload, mark users offline as a safe fallback
                userIdsToCheck.forEach(id => this.updateUserStatusElements(id, false));
            }
        } catch (error) {
            console.error('❌ Failed to fetch batch user status:', error);
            // Fallback: mark as offline to avoid stale showing as online
            userIdsToCheck.forEach(id => this.updateUserStatusElements(id, false));
        } finally {
            this.isProcessingBatch = false;
            // If more came in while processing, schedule another run
            if (this.pendingUserIds.size > 0) {
                if (this.batchTimer) clearTimeout(this.batchTimer);
                this.batchTimer = setTimeout(() => this.processBatchRequests(), this.batchDelay);
            }
        }
    }

    scanForStatusElements() {
        const allUserIds = new Set();

        // Prefer elements that explicitly have data-user-id, but exclude viewer/favorite/like cards and their children
        // Also exclude large container elements
        const statusElements = document.querySelectorAll('[data-user-id]:not(.viewer-card):not(.favorite-card):not(.who-liked-me-card):not(.who-i-like-card):not(.like-card):not(.profile-container):not(.tab-content):not(.profile-cards-container)');
        statusElements.forEach(element => {
            // Skip if element is inside any card
            if (element.closest('.viewer-card, .favorite-card, .who-liked-me-card, .who-i-like-card, .like-card')) {
                return;
            }
            
            // Skip large container elements
            if (element.id === 'profile-container' || 
                element.id === 'tab-content' || 
                element.id === 'tab-panel-full' ||
                element.classList.contains('profile-container') ||
                element.classList.contains('tab-content') ||
                element.classList.contains('profile-cards-container')) {
                return;
            }
            
            // Skip elements that are too large (likely containers)
            if (element.children.length > 10 || (element.innerHTML && element.innerHTML.length > 5000)) {
                return;
            }
            
            const userId = element.dataset.userId;
            if (userId) {
                const userIdNum = parseInt(userId, 10);
                if (!isNaN(userIdNum)) {
                    allUserIds.add(userIdNum);
                    this.registerStatusElement(element, userIdNum);
                }
            }
        });

        // Additional class-based selectors (including text status elements)
        const classSelectors = ['.user-status', '.user-status-text', '.online-dot', '.online-dot-results'];
        classSelectors.forEach(sel => {
            const els = document.querySelectorAll(sel);
            els.forEach(element => {
                const userId = element.dataset.userId;
                if (userId) {
                    const userIdNum = parseInt(userId, 10);
                    if (!isNaN(userIdNum)) {
                        allUserIds.add(userIdNum);
                        this.registerStatusElement(element, userIdNum);
                    }
                }
            });
        });

        if (allUserIds.size > 0) {
            allUserIds.forEach(userId => this.queueUserStatusRequest(userId, null));
            setTimeout(() => { if (!this.isProcessingBatch) this.processBatchRequests(); }, 500);
        }
    }

    // Public API: getUserStatus returns cached value or queues a refresh
    async getUserStatus(userId) {
        const userIdNum = parseInt(userId, 10);
        if (isNaN(userIdNum)) return false;

        const cached = this.statusCache.get(userIdNum);
        if (cached && (Date.now() - cached.lastUpdated) < this.cacheTTL) return cached.isOnline;

        this.queueUserStatusRequest(userIdNum, null);
        return cached ? cached.isOnline : false;
    }

    async refreshUserStatus(userId) {
        const userIdNum = parseInt(userId, 10);
        if (isNaN(userIdNum)) return false;

        this.statusCache.delete(userIdNum);
        this.queueUserStatusRequest(userIdNum, null);

        if (!this.isProcessingBatch) {
            if (this.batchTimer) clearTimeout(this.batchTimer);
            this.processBatchRequests();
        }

        const cached = this.statusCache.get(userIdNum);
        return cached ? cached.isOnline : false;
    }

    // Refresh statuses for all known userIds (useful after reconnect)
    refreshAllKnownStatuses() {
        const ids = Array.from(this.statusElements.keys());
        ids.forEach(id => this.queueUserStatusRequest(id, null));
        if (!this.isProcessingBatch) {
            if (this.batchTimer) clearTimeout(this.batchTimer);
            this.processBatchRequests();
        }
    }

    setupEventListeners() {
        // MutationObserver: watch for added/removed nodes but throttle processing
        const observer = new MutationObserver(mutations => {
            // Collect removed nodes for cleanup and added nodes for registration, but process in a single RAF
            let added = [];
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) added.push(node); });
                mutation.removedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) this._pendingRemovedNodes.add(node); });
            });

            if (!this._mutationScheduled) {
                this._mutationScheduled = true;
                requestAnimationFrame(() => {
                    // Process added nodes (exclude viewer/favorite/like/online-user cards and their children)
                    added.forEach(node => {
                        const statusEls = node.querySelectorAll ? node.querySelectorAll('[data-user-id]:not(.viewer-card):not(.favorite-card):not(.who-liked-me-card):not(.who-i-like-card):not(.like-card):not(.online-user-card)') : [];
                        statusEls.forEach(el => {
                            // Skip if element is inside any card
                            if (el.closest('.viewer-card, .favorite-card, .who-liked-me-card, .who-i-like-card, .like-card, .online-user-card')) {
                                return;
                            }
                            const uid = el.dataset.userId;
                            if (uid) this.registerStatusElement(el, uid);
                        });

                        // Also check class-based markers on the node itself (but not if it's a card or inside a card)
                        if (node.dataset && node.dataset.userId && !node.classList.contains('viewer-card') && !node.classList.contains('favorite-card') && !node.classList.contains('who-liked-me-card') && !node.classList.contains('who-i-like-card') && !node.classList.contains('like-card') && !node.classList.contains('online-user-card') && !node.closest('.viewer-card, .favorite-card, .who-liked-me-card, .who-i-like-card, .like-card, .online-user-card')) {
                            this.registerStatusElement(node, node.dataset.userId);
                        }
                    });

                    // Process removed nodes to unregister elements and free memory
                    this._pendingRemovedNodes.forEach(node => {
                        try {
                            // Unregister any tracked descendants
                            const els = node.querySelectorAll ? node.querySelectorAll('[data-user-id]') : [];
                            els.forEach(el => this.unregisterStatusElement(el));

                            // If node itself had dataset
                            if (node.dataset && node.dataset.userId) this.unregisterStatusElement(node);
                        } catch (e) {
                            // ignore
                        }
                    });
                    this._pendingRemovedNodes.clear();
                    this._mutationScheduled = false;
                });
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        this._mutationObserver = observer;

        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.sendHeartbeat(); });

        window.addEventListener('beforeunload', () => { this.sendOfflineStatus(); });
    }

    async sendOfflineStatus() {
        try {
            const currentUser = window.sessionManager?.getCurrentUser();
            if (!currentUser) return;

            const payload = JSON.stringify({ userId: currentUser.id, timestamp: Date.now() });

            if (navigator.sendBeacon) {
                const blob = new Blob([payload], { type: 'application/json' });
                navigator.sendBeacon('/api/user-offline', blob);
            } else {
                await fetch('/api/user-offline', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload
                });
            }
        } catch (error) {
            console.error('❌ Failed to send offline status:', error);
        }
    }

    // Periodic cleanup for disconnected elements
    _cleanupDisconnectedElements() {
        this.statusElements.forEach((els, userId) => {
            const filtered = els.filter(el => el && el.isConnected);
            if (filtered.length === 0) this.statusElements.delete(userId);
            else this.statusElements.set(userId, filtered);
        });
    }

    // Manual cleanup method
    cleanup() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        if (this._cleanupTimer) clearInterval(this._cleanupTimer);
        if (this._mutationObserver) this._mutationObserver.disconnect();
        if (this.socket) this.socket.disconnect();
        this.sendOfflineStatus();
    }
}

// Initialize the instant status manager globally (guard against duplicates)
if (!window.InstantStatusManagerInitialized) {
    const managerOptions = window.InstantStatusManagerConfig || {};
    window.instantStatusManager = new InstantStatusManager(managerOptions);
    window.InstantStatusManagerInitialized = true;
    window.InstantStatusManagerInstance = window.instantStatusManager;
} else if (window.InstantStatusManagerInstance) {
    window.instantStatusManager = window.InstantStatusManagerInstance;
}

// Backwards-compatible global helper API
window.UserStatus = {
    ...(window.UserStatus || {}),
    updateUserStatus: (target, userId, options = {}) => {
        const element = typeof target === 'string' ? document.getElementById(target) : target;
        if (element && userId) window.instantStatusManager.registerStatusElement(element, userId);
    },
    getUserStatus: (userId) => window.instantStatusManager.getUserStatus(userId),
    refreshUserStatus: (userId) => window.instantStatusManager.refreshUserStatus(userId)
};

// Module export for CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InstantStatusManager;
}
