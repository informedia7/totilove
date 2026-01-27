(function(window, document) {
    'use strict';

    const DEFAULT_CONFIG = {
        // Network & Connection
        heartbeatInterval: 10000,
        httpHeartbeatInterval: 30000,
        httpRetryInterval: 3000,
        httpRetryIntervalMax: 60000,
        streamRetryInterval: 5000,
        
        // Batching & Caching
        batchDelay: 180,
        maxBatchSize: 80,
        cacheTtl: 25000,
        maxTrackedUsers: 150,
        
        // Visibility & UI
        hiddenPageRefreshInterval: 45000,
        visibilityRootMargin: '200px 0px',
        minOnlineSyncInterval: 5000,
        uiStaleThresholdMs: 120000,
        uiUnknownThresholdMs: 300000,
        
        // Leadership & Coordination
        leadershipChannelName: 'presence-engine-leadership',
        leadershipStorageKey: 'presence-engine-leader',
        leadershipHeartbeatInterval: 5000,
        leadershipStaleThreshold: 15000,
        leadershipProbeInterval: 4000,
        leadershipClaimDelay: 300,
        leadershipHeartbeatKickoffDelay: 800,
        
        // Rate Limiting & Retries
        requestStatusRateLimitMs: 1000,
        requestStatusMaxRetries: 3,
        followerHeartbeatFallbackMs: 90000,
        promiseMaxAgeMs: 300000,
        
        // Server Awareness
        serverTtlSeconds: 30,
        sessionSwitchGraceMs: 4000,
        socketDisconnectHoldMs: 1800,
        
        // DOM Integration
        domScanSelectors: [
            '[data-presence-id]',
            '.presence-indicator[data-user-id]',
            '.online-indicator[data-user-id]',
            '.online-dot[data-user-id]',
            '.online-dot-results[data-user-id]',
            '.user-status[data-user-id]',
            '.user-status-text[data-user-id]'
        ],
        
        // Metrics
        metricsEnabled: true,
        metricsEndpoint: '/metrics/presence-client',
        metricsBatchSize: 10,
        metricsFlushInterval: 30000,
        
        // Socket.IO
        socketIoClientUrl: '/socket.io/socket.io.js'
    };

    const STATUS_DEFAULT = {
        userId: null,
        isOnline: false,
        lastSeen: null,
        lastActivity: null,
        lastLogin: null,
        timestamp: null,
        stale: true,
        source: 'unknown',
        meta: null
    };

    function resolveSessionToken() {
        try {
            if (window.sessionManager?.getToken) {
                const managedToken = window.sessionManager.getToken();
                if (managedToken) {
                    return managedToken;
                }
            }

            if (typeof window.getSessionToken === 'function') {
                const directToken = window.getSessionToken();
                if (directToken) {
                    return directToken;
                }
            }

            if (typeof window.sessionToken === 'string' && window.sessionToken.trim() !== '') {
                return window.sessionToken.trim();
            }
        } catch (_error) {
            // Ignore token resolution failures; fetch will fall back to cookies.
        }

        return null;
    }

    class LeadershipApiClient {
        constructor(options = {}) {
            this.channel = options.channel || 'presence-engine-leadership';
            this.basePath = options.basePath || '/api/presence/leadership';
            this.cacheTtlMs = options.cacheTtlMs || 2000;
            this.disabledUntil = 0;
            this.consecutiveFailures = 0;
            this.cache = null;
            this.cacheExpiresAt = 0;
            this.sessionTokenProvider = typeof options.sessionTokenProvider === 'function'
                ? options.sessionTokenProvider
                : resolveSessionToken;
        }

        isAvailable() {
            return Date.now() >= this.disabledUntil;
        }

        markFailure(error) {
            console.warn('PresenceEngine: leadership API failure', error?.message || error);
            this.consecutiveFailures += 1;
            if (this.consecutiveFailures >= 3) {
                this.disabledUntil = Date.now() + 15000;
                this.consecutiveFailures = 0;
            }
        }

        markSuccess() {
            this.consecutiveFailures = 0;
            this.disabledUntil = 0;
        }

        buildHeaders() {
            const headers = {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            };

            try {
                const sessionToken = this.sessionTokenProvider?.();
                if (sessionToken) {
                    headers.Authorization = `Bearer ${sessionToken}`;
                    headers['X-Session-Token'] = sessionToken;
                }
            } catch (_error) {
                // Missing session token shouldn't block leadership calls.
            }

            return headers;
        }

        async apiRequest(path = '', { method = 'POST', body = null } = {}) {
            if (!this.isAvailable()) {
                throw new Error('Leadership API temporarily disabled');
            }

            const options = {
                method,
                headers: this.buildHeaders(),
                credentials: 'include'
            };

            if (body && method !== 'GET') {
                options.body = JSON.stringify(body);
            }

            let response;
            try {
                response = await fetch(`${this.basePath}${path}`, options);
            } catch (error) {
                this.markFailure(error);
                throw error;
            }

            let payload = null;
            try {
                payload = await response.json();
            } catch (_error) {
                payload = null;
            }

            if (response.status >= 500) {
                const error = new Error(payload?.error || `HTTP ${response.status}`);
                this.markFailure(error);
                throw error;
            }

            this.markSuccess();
            return { status: response.status, body: payload || {} };
        }

        async getLeader(channel = this.channel, options = {}) {
            if (!this.isAvailable()) {
                return null;
            }

            const now = Date.now();
            if (!options.force && this.cache && now < this.cacheExpiresAt) {
                return this.cache;
            }

            const params = new URLSearchParams();
            if (channel) {
                params.set('channel', channel);
            }

            const query = params.toString();
            const path = query ? `?${query}` : '';

            try {
                const { body } = await this.apiRequest(path, { method: 'GET' });
                const leader = body?.leader || null;
                this.cache = leader;
                this.cacheExpiresAt = now + (options.cacheTtl || this.cacheTtlMs);
                return leader;
            } catch (_error) {
                return null;
            }
        }

        async claimLeader(payload = {}) {
            const body = { ...payload, channel: payload.channel || this.channel };
            const { body: responseBody } = await this.apiRequest('/claim', { method: 'POST', body });
            return responseBody;
        }

        async heartbeatLeader(payload = {}) {
            const body = { ...payload, channel: payload.channel || this.channel };
            const { body: responseBody } = await this.apiRequest('/heartbeat', { method: 'POST', body });
            return responseBody;
        }

        async releaseLeader(payload = {}) {
            const body = { ...payload, channel: payload.channel || this.channel };
            const { body: responseBody } = await this.apiRequest('/release', { method: 'POST', body });
            return responseBody;
        }
    }

    class PresenceEngine {
        constructor(config = {}) {
            this.config = { ...DEFAULT_CONFIG, ...config };
            this.initialized = false;
            
            // Core state
            this.statusCache = new Map();
            this.elementRegistry = new Map();
            this.elementMeta = new WeakMap();
            this.subscribers = new Map();
            
            // Request management
            this.pendingUserIds = new Set();
            this.pendingPromises = new Map();
            this.lastRequestTime = new Map();
            this.retryCounts = new Map();
            this.failedUserIds = new Set();
            
            // Timers
            this.batchTimer = null;
            this.heartbeatTimer = null;
            this.httpRetryTimer = null;
            this.cleanupTimer = null;
            this.promiseCleanupTimer = null;
            
            // Observers
            this.observer = null;
            this.visibilityObserver = null;
            
            // Connection state
            this.socket = null;
            this.socketClientPromise = null;
            this.presenceStream = null;
            this.streamRetryTimer = null;
            this.streamRetryDelay = this.config.streamRetryInterval;
            
            // Page state
            this.pageHidden = document.visibilityState === 'hidden';
            
            // User tracking
            this.trackedUsers = new Set();
            this.waitingUsers = [];
            this.userVisibilityCounts = new Map();
            this.hiddenQueue = new Set();
            this.hiddenRefreshTimer = null;
            
            // Leadership
            this.instanceId = this.generateInstanceId();
            this.isLeader = false;
            this.leaderInfo = null;
            this.leadershipChannel = null;
            this.leadershipHeartbeatTimer = null;
            this.leadershipProbeTimer = null;
            this.leadershipHeartbeatKickoff = null;
            this.leadershipInitialized = false;
            this.lastLeaderHeartbeat = 0;
            this.lastFollowerHeartbeat = 0;
            this.leadershipApi = new LeadershipApiClient({
                channel: this.config.leadershipChannelName
            });
            
            // Metrics
            this.metricsBuffer = [];
            this.metricsFlushTimer = null;
            this.metricsClientId = this.generateMetricsClientId();
            this.metricsLastFlush = 0;
            this.metricsDisabled = false;
            
            // Session
            this.sessionReadyPoller = null;
            this.lastOnlineSync = 0;
            this.pageTerminationHandled = false;
            
            // Debouncing
            this.debouncedStatuses = new Map();
            
            this.bootstrap();
        }

        // === Utility Methods ===
        generateInstanceId() {
            return `presence-${Math.random().toString(36).slice(2)}-${Date.now()}`;
        }

        generateMetricsClientId() {
            try {
                if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                    return crypto.randomUUID();
                }
            } catch (_error) {
                // Fallback
            }
            return `presence-${Math.random().toString(36).slice(2)}-${Date.now()}`;
        }

        getCurrentUser() {
            return window.sessionManager?.getCurrentUser?.() || window.currentUser || null;
        }

        getCapabilitySnapshot() {
            return {
                websocket: Boolean(this.socket?.connected),
                sse: Boolean(this.presenceStream),
                broadcastChannel: Boolean(this.leadershipChannel),
                sessionReady: this.isSessionReady(),
                pageHidden: this.pageHidden
            };
        }

        buildLeadershipPayload(reason = 'heartbeat') {
            const currentUser = this.getCurrentUser();
            return {
                channel: this.config.leadershipChannelName,
                instanceId: this.instanceId,
                tabId: this.instanceId,
                userId: currentUser?.id || null,
                metadata: {
                    reason,
                    page: window.location?.pathname || '',
                    visibility: document?.visibilityState || 'visible',
                    websocket: Boolean(this.socket?.connected),
                    broadcastChannel: Boolean(this.leadershipChannel),
                    capabilities: this.getCapabilitySnapshot()
                },
                reason
            };
        }

        mapLeaderInfo(remote, fallbackReason = 'remote') {
            if (!remote) {
                return null;
            }

            const lastSeen = remote.lastHeartbeat || remote.claimedAt || Date.now();
            return {
                id: remote.instanceId || remote.id,
                instanceId: remote.instanceId || remote.id,
                userId: typeof remote.userId === 'number' ? remote.userId : null,
                tabId: remote.tabId || null,
                reason: remote.reason || fallbackReason,
                lastSeen
            };
        }

        leadershipApiAvailable() {
            return Boolean(this.leadershipApi?.isAvailable?.() || false);
        }

        isSessionReady() {
            if (window.sessionManager?.isAuthenticated?.()) {
                return true;
            }
            const currentUser = window.sessionManager?.getCurrentUser?.() || window.currentUser;
            return Boolean(currentUser && currentUser.id);
        }

        // === Initialization ===
        bootstrap() {
            if (this.initialized) return;

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.initialize());
            } else {
                this.initialize();
            }
        }

        initialize() {
            if (this.initialized) return;

            if (!this.isSessionReady()) {
                this.pollForSessionReady();
                return;
            }

            if (this.sessionReadyPoller) {
                clearInterval(this.sessionReadyPoller);
                this.sessionReadyPoller = null;
            }

            this.initialized = true;
            this.setupCrossTabLeadership();
            this.connectSocket();
            this.connectPresenceStream();
            this.scheduleHeartbeat(true);
            this.attachLifecycleHooks();
            this.scanDomForIndicators();
            this.observeDomMutations();
            
            // Setup cleanup intervals
            this.cleanupTimer = setInterval(() => this.pruneDisconnectedElements(), 30000);
            this.promiseCleanupTimer = setInterval(() => this.cleanupStalePromises(), 60000);
        }

        pollForSessionReady() {
            if (this.sessionReadyPoller) return;
            
            this.sessionReadyPoller = setInterval(() => {
                if (this.isSessionReady()) {
                    clearInterval(this.sessionReadyPoller);
                    this.sessionReadyPoller = null;
                    this.initialize();
                }
            }, 500);
        }

        // === Cross-Tab Leadership ===
        setupCrossTabLeadership() {
            if (this.leadershipInitialized) return;
            this.leadershipInitialized = true;

            if (typeof window === 'undefined') {
                this.becomeLeader('no-window');
                return;
            }

            // Setup BroadcastChannel
            if (typeof window.BroadcastChannel !== 'undefined') {
                try {
                    this.leadershipChannel = new window.BroadcastChannel(this.config.leadershipChannelName);
                    this.leadershipChannel.addEventListener('message', (e) => this.handleLeadershipMessage(e));
                } catch (_error) {
                    this.leadershipChannel = null;
                }
            }

            // Initial leadership evaluation with jitter
            const jitter = Math.floor(Math.random() * 250);
            setTimeout(() => this.evaluateLeadership('init'), this.config.leadershipClaimDelay + jitter);
            this.scheduleLeadershipProbe();
        }

        handleLeadershipMessage(event) {
            if (!event?.data || event.data.instanceId === this.instanceId) return;

            const payload = event.data;
            switch (payload.type) {
                case 'leader-heartbeat':
                    this.leaderInfo = { id: payload.leaderId, lastSeen: Date.now() };
                    if (payload.leaderId !== this.instanceId && this.isLeader) {
                        this.demoteToFollower('external-heartbeat');
                    }
                    break;
                case 'leadership-release':
                    if (this.leaderInfo?.id === payload.leaderId) {
                        this.leaderInfo = null;
                        this.evaluateLeadership('leader-release');
                    }
                    break;
                case 'leadership-request':
                    this.evaluateLeadership('request');
                    break;
            }
        }

        evaluateLeadership(reason = 'manual') {
            const task = (async () => {
                const now = Date.now();

                if (!this.leadershipApiAvailable()) {
                    if (!this.isLeader) {
                        this.becomeLeader(`fallback-${reason}`);
                    }
                    return;
                }

                const remoteLeader = await this.leadershipApi.getLeader(this.config.leadershipChannelName, {
                    force: reason === 'init'
                });

                if (remoteLeader && remoteLeader.instanceId === this.instanceId) {
                    this.leaderInfo = this.mapLeaderInfo(remoteLeader, `remote-${reason}`);
                    if (!this.isLeader) {
                        this.becomeLeader(`remote-${reason}`);
                    }
                    return;
                }

                const lastHeartbeat = remoteLeader?.lastHeartbeat || 0;
                const stale = !remoteLeader || (now - lastHeartbeat) > this.config.leadershipStaleThreshold;

                if (stale) {
                    const claimed = await this.claimLeadership(reason);
                    if (claimed) {
                        return;
                    }
                }

                if (this.isLeader && remoteLeader && remoteLeader.instanceId !== this.instanceId) {
                    this.demoteToFollower('remote-conflict');
                }

                this.leaderInfo = this.mapLeaderInfo(remoteLeader, 'remote');
            })();

            task.catch(error => {
                console.warn('PresenceEngine: leadership evaluation error', error?.message || error);
            });
            return task;
        }

        async claimLeadership(reason = 'claim') {
            if (!this.leadershipApiAvailable()) {
                this.becomeLeader(`fallback-${reason}`);
                return true;
            }

            try {
                const payload = this.buildLeadershipPayload(reason);
                const response = await this.leadershipApi.claimLeader(payload);
                if (response?.success) {
                    this.leaderInfo = this.mapLeaderInfo(response.leader, reason) || {
                        id: this.instanceId,
                        instanceId: this.instanceId,
                        lastSeen: Date.now(),
                        reason
                    };
                    this.becomeLeader(reason);
                    return true;
                }

                if (response?.leader) {
                    this.leaderInfo = this.mapLeaderInfo(response.leader, 'remote');
                }

                return false;
            } catch (error) {
                console.warn('PresenceEngine: claimLeadership error', error?.message || error);
                return false;
            }
        }

        becomeLeader(reason = 'claim') {
            this.isLeader = true;
            this.leaderInfo = { id: this.instanceId, lastSeen: Date.now(), reason };
            this.scheduleLeadershipHeartbeat();
            this.broadcastLeadership({ type: 'leader-heartbeat', leaderId: this.instanceId, reason });
        }

        demoteToFollower(reason = 'demote') {
            if (!this.isLeader) return;
            
            this.isLeader = false;
            this.cancelLeadershipTimers();
            this.leaderInfo = null;
        }

        releaseLeadership(reason = 'manual') {
            if (!this.isLeader) return;
            
            this.cancelLeadershipTimers();
            this.isLeader = false;
            this.leaderInfo = null;

            if (this.leadershipApiAvailable()) {
                const payload = this.buildLeadershipPayload(reason);
                this.leadershipApi.releaseLeader(payload).catch(error => {
                    console.warn('PresenceEngine: leadership release error', error?.message || error);
                });
            }

            this.broadcastLeadership({ type: 'leadership-release', leaderId: this.instanceId, reason });
        }

        cancelLeadershipTimers() {
            if (this.leadershipHeartbeatTimer) {
                clearInterval(this.leadershipHeartbeatTimer);
                this.leadershipHeartbeatTimer = null;
            }
            if (this.leadershipProbeTimer) {
                clearInterval(this.leadershipProbeTimer);
                this.leadershipProbeTimer = null;
            }
            this.cancelLeadershipKickoff();
        }

        scheduleLeadershipHeartbeat() {
            if (!this.isLeader) return;
            
            this.sendLeadershipHeartbeat('initial');
            this.leadershipHeartbeatTimer = setInterval(() => {
                this.sendLeadershipHeartbeat('heartbeat');
            }, this.config.leadershipHeartbeatInterval);
            
            this.scheduleLeadershipKickoff();
        }

        scheduleLeadershipProbe() {
            this.leadershipProbeTimer = setInterval(() => {
                this.evaluateLeadership('probe');
            }, this.config.leadershipProbeInterval);
        }

        scheduleLeadershipKickoff() {
            this.cancelLeadershipKickoff();
            this.leadershipHeartbeatKickoff = setTimeout(() => {
                this.leadershipHeartbeatKickoff = null;
                if (this.isLeader) this.sendHeartbeat({ force: true });
            }, this.config.leadershipHeartbeatKickoffDelay);
        }

        cancelLeadershipKickoff() {
            if (this.leadershipHeartbeatKickoff) {
                clearTimeout(this.leadershipHeartbeatKickoff);
                this.leadershipHeartbeatKickoff = null;
            }
        }

        sendLeadershipHeartbeat(reason = 'heartbeat') {
            const now = Date.now();
            this.leaderInfo = {
                id: this.instanceId,
                instanceId: this.instanceId,
                lastSeen: now,
                reason
            };

            if (this.leadershipApiAvailable()) {
                const payload = this.buildLeadershipPayload(reason);
                this.leadershipApi.heartbeatLeader(payload).then(response => {
                    if (response?.leader) {
                        this.leaderInfo = this.mapLeaderInfo(response.leader, reason);
                    }
                }).catch(error => {
                    console.warn('PresenceEngine: leadership heartbeat error', error?.message || error);
                });
            }

            this.broadcastLeadership({ type: 'leader-heartbeat', leaderId: this.instanceId, reason });
        }

        broadcastLeadership(payload = {}) {
            if (!this.leadershipChannel) return;
            
            try {
                this.leadershipChannel.postMessage({
                    ...payload,
                    instanceId: this.instanceId,
                    timestamp: Date.now()
                });
            } catch (_error) {
                // Ignore broadcast failures
            }
        }

        // === Connection Management ===
        async connectSocket() {
            if (this.socket || typeof window === 'undefined') return;

            // Load Socket.IO client if needed
            if (typeof window.io === 'undefined') {
                if (!this.socketClientPromise) {
                    this.socketClientPromise = this.loadSocketIoClientScript()
                        .catch(error => {
                            console.warn('PresenceEngine: Socket.IO client failed to load', error.message);
                            return null;
                        })
                        .finally(() => {
                            this.socketClientPromise = null;
                        });
                }

                await this.socketClientPromise;
                if (typeof window.io === 'undefined' || this.socket) return;
            }

            this.establishSocketConnection();
        }

        loadSocketIoClientScript() {
            return new Promise((resolve, reject) => {
                if (typeof document === 'undefined') {
                    reject(new Error('Document unavailable'));
                    return;
                }

                if (typeof window.io !== 'undefined') {
                    resolve();
                    return;
                }

                const existing = document.querySelector('script[data-presence-socket="true"]');
                if (existing) {
                    if (existing.dataset.socketReady === 'true') {
                        resolve();
                        return;
                    }
                    existing.addEventListener('load', () => resolve(), { once: true });
                    existing.addEventListener('error', () => reject(new Error('Script failed')), { once: true });
                    return;
                }

                const script = document.createElement('script');
                script.src = this.config.socketIoClientUrl;
                script.async = true;
                script.dataset.presenceSocket = 'true';
                script.addEventListener('load', () => {
                    script.dataset.socketReady = 'true';
                    resolve();
                }, { once: true });
                script.addEventListener('error', () => reject(new Error('Script failed')), { once: true });
                document.head.appendChild(script);
            });
        }

        establishSocketConnection() {
            try {
                this.socket = window.io({ transports: ['websocket'] });
                this.socket.on('connect', () => this.onSocketConnect());
                this.socket.on('disconnect', () => this.onSocketDisconnect());
                this.socket.on('user_status_change', (p) => this.onRemoteStatus(p));
                this.socket.on('status_updated', (p) => this.onSelfStatus(p));
                this.socket.on('heartbeat_ack', () => this.onHeartbeatAck());
                this.socket.on('presence:update', (p) => this.onPresenceStreamPayload(p, 'socket'));
            } catch (error) {
                console.error('PresenceEngine: Socket connection failed', error);
                this.socket = null;
            }
        }

        connectPresenceStream() {
            if (this.presenceStream || typeof window.EventSource === 'undefined') return;

            try {
                this.presenceStream = new EventSource('/presence/subscribe', { withCredentials: true });
                this.presenceStream.addEventListener('open', () => this.handlePresenceStreamOpen());
                this.presenceStream.addEventListener('error', () => this.handlePresenceStreamError());
                this.presenceStream.addEventListener('presence', (e) => this.handlePresenceStreamEvent(e));
                this.presenceStream.addEventListener('message', (e) => this.handlePresenceStreamEvent(e));
                this.presenceStream.addEventListener('snapshot', (e) => this.handlePresenceSnapshotEvent(e));
            } catch (error) {
                console.warn('PresenceEngine: SSE connection failed', error.message);
                this.handlePresenceStreamError();
            }
        }

        disconnectPresenceStream() {
            if (this.presenceStream) {
                this.presenceStream.close();
                this.presenceStream = null;
            }
            if (this.streamRetryTimer) {
                clearTimeout(this.streamRetryTimer);
                this.streamRetryTimer = null;
            }
            this.streamRetryDelay = this.config.streamRetryInterval;
        }

        handlePresenceStreamOpen() {
            this.streamRetryDelay = this.config.streamRetryInterval;
            if (this.streamRetryTimer) {
                clearTimeout(this.streamRetryTimer);
                this.streamRetryTimer = null;
            }
        }

        handlePresenceStreamError() {
            if (this.presenceStream) {
                this.presenceStream.close();
                this.presenceStream = null;
            }
            this.schedulePresenceStreamReconnect();
        }

        schedulePresenceStreamReconnect() {
            if (this.streamRetryTimer || typeof window.EventSource === 'undefined') return;

            this.streamRetryTimer = setTimeout(() => {
                this.streamRetryTimer = null;
                this.connectPresenceStream();
            }, this.streamRetryDelay);

            this.streamRetryDelay = Math.min(this.streamRetryDelay * 2, 60000);
        }

        handlePresenceStreamEvent(event) {
            if (!event?.data) return;
            
            try {
                const payload = JSON.parse(event.data);
                this.onPresenceStreamPayload(payload, 'sse');
            } catch (error) {
                console.warn('PresenceEngine: SSE payload parse failed', error.message);
            }
        }

        handlePresenceSnapshotEvent(event) {
            if (!event?.data) return;
            
            try {
                const snapshot = JSON.parse(event.data);
                if (!snapshot || typeof snapshot !== 'object') return;
                
                Object.values(snapshot).forEach(entry => {
                    if (entry && typeof entry === 'object') {
                        this.onPresenceStreamPayload(entry, 'sse');
                    }
                });
            } catch (error) {
                console.warn('PresenceEngine: SSE snapshot parse failed', error.message);
            }
        }

        onSocketConnect() {
            this.disconnectPresenceStream();
            this.authenticateSocket();
            this.refreshAllKnownUsers();
        }

        onSocketDisconnect() {
            this.connectPresenceStream();
        }

        authenticateSocket() {
            const currentUser = window.sessionManager?.getCurrentUser?.();
            if (!currentUser || !this.socket) return;

            this.socket.emit('authenticate', {
                userId: currentUser.id,
                real_name: currentUser.real_name || currentUser.email || ''
            });
        }

        // === Heartbeat ===
        scheduleHeartbeat(immediate = false) {
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
            }
            
            this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.config.heartbeatInterval);
            if (immediate) this.sendHeartbeat();
        }

        async sendHeartbeat(options = {}) {
            const now = Date.now();
            const force = options.force || false;
            
            // Leadership checks
            if (!this.isLeader) {
                const leaderInactive = this.leaderInfo && 
                    (now - this.leaderInfo.lastSeen) > this.config.followerHeartbeatFallbackMs;
                const noLeaderForTooLong = !this.leaderInfo && 
                    (now - this.lastFollowerHeartbeat) > this.config.followerHeartbeatFallbackMs;
                
                if (!(leaderInactive || noLeaderForTooLong) && !force) return;
            }

            if (!force && (now - this.lastOnlineSync) < this.config.minOnlineSyncInterval) {
                return;
            }

            // Track timing
            if (this.isLeader) {
                this.lastLeaderHeartbeat = now;
            } else {
                this.lastFollowerHeartbeat = now;
            }

            // Try socket first
            if (this.socket?.connected) {
                this.lastOnlineSync = now;
                this.socket.emit('heartbeat', {
                    timestamp: now,
                    isLeader: this.isLeader,
                    instanceId: this.instanceId
                });
                return;
            }

            // HTTP fallback
            this.lastOnlineSync = now;
            try {
                const response = await fetch('/api/presence/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(this.buildHeartbeatPayload())
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const result = await response.json().catch(() => null);
                this.resetHttpRetry(result);
                this.updateTTLAwareness(result);
            } catch (error) {
                this.handleHttpHeartbeatFailure();
            }
        }

        buildHeartbeatPayload() {
            return {
                transport: this.socket?.connected ? 'socket' : 'http',
                leader: this.isLeader,
                pageHidden: this.pageHidden,
                instanceId: this.instanceId,
                trackedUsers: this.trackedUsers.size,
                waitingCount: this.waitingUsers.length,
                hiddenQueue: this.hiddenQueue.size
            };
        }

        handleHttpHeartbeatFailure() {
            const delay = Math.min(
                this.config.httpRetryInterval * 1.5,
                this.config.httpRetryIntervalMax
            );
            const jitter = Math.floor(Math.random() * 250);
            
            this.config.httpRetryInterval = delay;
            this.nextHttpAttemptAfter = Date.now() + delay + jitter;
            
            if (this.httpRetryTimer) {
                clearTimeout(this.httpRetryTimer);
            }
            
            this.httpRetryTimer = setTimeout(() => {
                this.sendHeartbeat();
            }, delay + jitter);
        }

        resetHttpRetry(serverPayload = null) {
            if (this.httpRetryTimer) {
                clearTimeout(this.httpRetryTimer);
                this.httpRetryTimer = null;
            }
            
            this.config.httpRetryInterval = DEFAULT_CONFIG.httpRetryInterval;
            
            if (serverPayload?.intervalMs) {
                const clamped = Math.min(Math.max(serverPayload.intervalMs, 5000), 120000);
                this.config.httpHeartbeatInterval = clamped;
            }
        }

        // === Status Handling ===
        onRemoteStatus(payload) {
            if (!payload?.userId) return;
            
            this.applyStatus(payload.userId, {
                isOnline: payload.isOnline,
                lastSeen: payload.lastSeen,
                timestamp: Date.now(),
                source: 'socket'
            });
        }

        onSelfStatus(payload) {
            const currentUser = window.sessionManager?.getCurrentUser?.();
            if (!currentUser) return;
            
            this.applyStatus(currentUser.id, {
                isOnline: payload.isOnline,
                timestamp: Date.now(),
                source: 'self'
            });
        }

        onHeartbeatAck() {
            // No action needed - presence updates come from server pushes
        }

        onPresenceStreamPayload(payload, transport = 'stream') {
            if (!payload || typeof payload.userId === 'undefined') return;

            this.applyStatus(payload.userId, {
                isOnline: payload.isOnline,
                lastSeen: payload.lastSeen,
                lastActivity: payload.lastActivity || null,
                lastLogin: payload.lastLogin || null,
                meta: payload.meta || null,
                timestamp: Date.now(),
                source: transport
            });
        }

        normalizeIsOnline(value) {
            if (typeof value === 'boolean') return value;
            if (value === 1 || value === '1') return true;
            if (value === 0 || value === '0') return false;
            if (typeof value === 'number') return value > 0;
            
            if (typeof value === 'string') {
                const lowered = value.trim().toLowerCase();
                if (['true', 'online', 'yes'].includes(lowered)) return true;
                if (['false', 'offline', 'no'].includes(lowered)) return false;
            }
            
            return null;
        }

        normalizeLastSeen(value, isOnline) {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            if (typeof value === 'string') {
                const parsed = Date.parse(value);
                if (!Number.isNaN(parsed)) return parsed;
            }
            if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
            
            return isOnline ? Date.now() : Date.now();
        }

        applyStatus(userId, payload = {}) {
            const id = Number(userId);
            if (!Number.isFinite(id)) return;

            const normalizedOnline = this.normalizeIsOnline(payload.isOnline);
            if (normalizedOnline === null) return;

            const lastSeenTs = this.normalizeLastSeen(payload.lastSeen, normalizedOnline);
            const now = Date.now();
            const previousRecord = this.statusCache.get(id);
            const meta = payload.meta || null;

            const staleOfflineSnapshot = Boolean(
                previousRecord?.isOnline &&
                !normalizedOnline &&
                payload.source !== 'socket' &&
                payload.source !== 'self' &&
                Number.isFinite(previousRecord?.lastSeen) &&
                Number.isFinite(lastSeenTs) &&
                lastSeenTs <= previousRecord.lastSeen
            );

            if (staleOfflineSnapshot) {
                this.queueUserId(id);
                return previousRecord;
            }

            const holdDuration = this.getOfflineHoldDuration({
                normalizedOnline,
                payload: { ...payload, meta },
                previousRecord,
                now,
                lastSeen: lastSeenTs
            });

            if (holdDuration > 0) {
                this.scheduleDebouncedStatus(
                    id,
                    { ...payload, lastSeen: lastSeenTs, skipGrace: true, meta },
                    holdDuration
                );
                return previousRecord || null;
            }

            // Cancel any pending debounced status
            this.cancelDebouncedStatus(id);

            const record = {
                userId: id,
                isOnline: normalizedOnline,
                lastSeen: lastSeenTs,
                lastActivity: payload.lastActivity ?? null,
                lastLogin: payload.lastLogin ?? null,
                receivedAt: now,
                source: payload.source || 'unknown',
                meta,
                uiState: this.calculateUIState(now, lastSeenTs, normalizedOnline),
                stale: Boolean(payload.stale),
                timestamp: now
            };

            this.statusCache.set(id, record);
            this.renderRegisteredElements(id, record);
            this.notifySubscribers(id, record);
            this.resolvePendingPromises(id, record);
            
            return record;
        }

        scheduleDebouncedStatus(userId, payload, delayMs) {
            this.cancelDebouncedStatus(userId);
            
            const timer = setTimeout(() => {
                this.debouncedStatuses.delete(userId);
                this.applyStatus(userId, { ...payload, force: true });
            }, Math.max(delayMs, 0));
            
            this.debouncedStatuses.set(userId, timer);
        }

        cancelDebouncedStatus(userId) {
            const timer = this.debouncedStatuses.get(userId);
            if (timer) {
                clearTimeout(timer);
                this.debouncedStatuses.delete(userId);
            }
        }

        calculateUIState(now, lastSeen, isOnline) {
            if (!isOnline) return 'offline';
            
            const age = now - lastSeen;
            if (age < this.config.uiStaleThresholdMs) return 'online';
            if (age < this.config.uiUnknownThresholdMs) return 'stale';
            return 'unknown';
        }

        getOfflineHoldDuration({ normalizedOnline, payload, previousRecord, now, lastSeen }) {
            if (normalizedOnline || payload.force || payload.skipGrace) {
                return 0;
            }

            if (!previousRecord?.isOnline) {
                return 0;
            }

            const source = payload.source || 'unknown';

            if (source === 'socket' && this.config.socketDisconnectHoldMs > 0) {
                if (this.shouldSkipSocketDisconnectHold(payload.meta)) {
                    return 0;
                }

                const lastUpdateAge = now - (previousRecord.receivedAt || lastSeen || now);
                if (lastUpdateAge <= this.config.socketDisconnectHoldMs * 3) {
                    return this.config.socketDisconnectHoldMs;
                }
            }

            const requiresSessionGrace = source !== 'socket' && source !== 'self' && this.config.sessionSwitchGraceMs > 0;
            if (requiresSessionGrace) {
                const delta = Math.abs(now - lastSeen);
                if (delta <= this.config.sessionSwitchGraceMs) {
                    return this.config.sessionSwitchGraceMs;
                }
            }

            return 0;
        }

        shouldSkipSocketDisconnectHold(meta) {
            if (!meta || typeof meta !== 'object') return false;
            if (meta.forceImmediate === true) return true;
            const context = meta.context || meta.reason || meta.type || null;
            if (!context) return false;
            return ['logout', 'forced-offline', 'force-logout', 'manual', 'manual-offline', 'sweeper', 'timeout'].includes(context);
        }

        // === Status Requests ===
        requestStatus(userId, options = {}) {
            const id = Number(userId);
            if (!Number.isFinite(id)) {
                return Promise.reject(new Error('Invalid user id'));
            }

            // Check for permanent failure
            if (this.failedUserIds.has(id)) {
                return Promise.reject(new Error('User presence unavailable'));
            }

            // Rate limiting
            const now = Date.now();
            const lastRequest = this.lastRequestTime.get(id) || 0;
            const rateLimitMs = this.config.requestStatusRateLimitMs;
            
            if (now - lastRequest < rateLimitMs && !options.forceRefresh) {
                const cached = this.getCachedStatus(id);
                if (cached) return Promise.resolve({ ...cached });
                
                // Return existing promise if available
                const existingQueue = this.pendingPromises.get(id);
                if (existingQueue?.length) {
                    return this.createChainedPromise(id, existingQueue[0]);
                }
            }
            
            this.lastRequestTime.set(id, now);

            // Check cache
            if (!options.forceRefresh) {
                const cached = this.getCachedStatus(id);
                if (cached) return Promise.resolve(cached);
            }

            // Create new request
            return new Promise((resolve, reject) => {
                const timeoutMs = Math.max(1500, options.timeout || 30000);
                const entry = {
                    resolve,
                    reject,
                    resolveCallbacks: [resolve],
                    rejectCallbacks: [reject],
                    createdAt: Date.now(),
                    timer: setTimeout(() => {
                        this.handleRequestTimeout(id, entry);
                    }, timeoutMs)
                };

                const queue = this.pendingPromises.get(id) || [];
                queue.push(entry);
                this.pendingPromises.set(id, queue);

                if (options.forceRefresh) {
                    this.statusCache.delete(id);
                }

                // Check retry count
                const retryCount = this.retryCounts.get(id) || 0;
                if (retryCount >= this.config.requestStatusMaxRetries) {
                    this.markUserAsFailed(id);
                    return;
                }

                this.queueUserId(id);
            });
        }

        createChainedPromise(userId, existingEntry) {
            return new Promise((resolve, reject) => {
                existingEntry.resolveCallbacks.push(resolve);
                existingEntry.rejectCallbacks.push(reject);
            });
        }

        handleRequestTimeout(userId, entry) {
            const retryCount = (this.retryCounts.get(userId) || 0) + 1;
            this.retryCounts.set(userId, retryCount);
            
            if (retryCount >= this.config.requestStatusMaxRetries) {
                this.markUserAsFailed(userId);
                entry.rejectCallbacks.forEach(reject => 
                    reject(new Error('Presence request failed after retries'))
                );
            } else {
                // Retry
                this.queueUserId(userId);
                entry.timer = setTimeout(() => {
                    this.handleRequestTimeout(userId, entry);
                }, 30000);
            }
        }

        markUserAsFailed(userId) {
            this.failedUserIds.add(userId);
            const queue = this.pendingPromises.get(userId);
            if (queue) {
                queue.forEach(entry => {
                    entry.rejectCallbacks.forEach(reject => 
                        reject(new Error('User presence unavailable'))
                    );
                });
                this.pendingPromises.delete(userId);
            }
            this.retryCounts.delete(userId);
        }

        async requestStatuses(userIds = [], options = {}) {
            const ids = [...new Set(userIds.map(id => Number(id)).filter(id => Number.isFinite(id)))];
            if (ids.length === 0) return {};

            const results = await Promise.allSettled(
                ids.map(async (id) => {
                    try {
                        const status = await this.requestStatus(id, options);
                        return { id, status };
                    } catch (error) {
                        return { id, status: null, error };
                    }
                })
            );

            return results.reduce((acc, item) => {
                if (item.status === 'fulfilled' && item.value.status) {
                    acc[item.value.id] = item.value.status;
                }
                return acc;
            }, {});
        }

        // === Batch Processing ===
        queueUserId(userId) {
            if (this.pageHidden) {
                this.hiddenQueue.add(userId);
                this.scheduleHiddenRefresh();
                return;
            }
            
            this.pendingUserIds.add(userId);
            if (this.batchTimer) {
                clearTimeout(this.batchTimer);
            }
            this.batchTimer = setTimeout(() => this.processBatch(), this.config.batchDelay);
        }

        async processBatch() {
            if (this.pendingUserIds.size === 0) return;

            const batch = Array.from(this.pendingUserIds).slice(0, this.config.maxBatchSize);
            batch.forEach(id => this.pendingUserIds.delete(id));
            
            // Filter out failed users
            const validBatch = batch.filter(id => !this.failedUserIds.has(id));
            if (validBatch.length === 0) return;

            const batchStart = Date.now();
            let httpStatus = null;
            let errorCode = null;

            try {
                const response = await fetch('/api/users-online-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userIds: validBatch })
                });

                httpStatus = response.status;
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                
                if (!data?.statuses || typeof data.statuses !== 'object') {
                    throw new Error('Invalid response format');
                }
                
                validBatch.forEach(id => {
                    const payload = data.statuses[id];
                    if (!payload || typeof payload !== 'object') {
                        this.handleMissingUser(id);
                        return;
                    }

                    const normalizedOnline = this.normalizeIsOnline(payload.isOnline);
                    if (normalizedOnline === null) {
                        this.handleMissingUser(id);
                        return;
                    }

                    // Reset retry count on success
                    this.retryCounts.delete(id);
                    this.failedUserIds.delete(id);
                    
                    this.applyStatus(id, {
                        ...payload,
                        isOnline: normalizedOnline,
                        lastSeen: payload.lastSeen,
                        meta: payload.meta || null,
                        source: payload.source || 'http'
                    });
                });
                
                this.captureBatchMetric({
                    durationMs: Date.now() - batchStart,
                    batchSize: validBatch.length,
                    success: true,
                    httpStatus,
                    source: 'http'
                });
            } catch (error) {
                errorCode = error?.message || 'unknown_error';
                
                validBatch.forEach(id => {
                    const retryCount = (this.retryCounts.get(id) || 0) + 1;
                    this.retryCounts.set(id, retryCount);
                    
                    if (retryCount >= this.config.requestStatusMaxRetries) {
                        this.markUserAsFailed(id);
                    }
                });
                
                this.captureBatchMetric({
                    durationMs: Date.now() - batchStart,
                    batchSize: validBatch.length,
                    success: false,
                    errorCode,
                    httpStatus,
                    source: 'http'
                });
            } finally {
                if (this.pendingUserIds.size > 0) {
                    this.batchTimer = setTimeout(() => this.processBatch(), this.config.batchDelay);
                }
            }
        }

        handleMissingUser(userId) {
            const id = Number(userId);
            if (!Number.isFinite(id)) return;

            this.retryCounts.delete(id);
            this.failedUserIds.delete(id);
            this.pendingUserIds.delete(id);

            const now = Date.now();
            const record = {
                userId: id,
                isOnline: false,
                lastSeen: now,
                lastActivity: null,
                lastLogin: null,
                receivedAt: now,
                source: 'missing',
                uiState: 'offline',
                stale: true,
                error: 'not_found',
                timestamp: now
            };

            this.statusCache.set(id, record);
            this.renderRegisteredElements(id, record);
            this.notifySubscribers(id, record);
            this.resolvePendingPromises(id, record);
        }

        // === Element Management ===
        bindIndicator(target, userId, options = {}) {
            const element = typeof target === 'string' ? document.getElementById(target) : target;
            if (!element?.isConnected) return Promise.resolve(null);

            const id = Number(userId);
            if (!Number.isFinite(id)) {
                console.warn('PresenceEngine: invalid user id for element', element);
                return Promise.resolve(null);
            }

            element.dataset.userId = id;
            element.dataset.presenceBound = 'true';

            const variant = options.variant || this.detectVariant(element);
            const mergedOptions = {
                variant,
                showLastSeen: options.showLastSeen !== false,
                onlineText: options.onlineText,
                offlineText: options.offlineText,
                emphasize: options.emphasize || false,
                subtle: options.subtle || false
            };
            this.elementMeta.set(element, mergedOptions);

            if (!this.elementRegistry.has(id)) {
                this.elementRegistry.set(id, new Set());
            }
            this.elementRegistry.get(id).add(element);

            this.observeVisibility(element, id);

            return this.requestStatus(id).then(status => {
                this.renderElement(element, status);
                return status;
            });
        }

        unbindIndicator(element) {
            if (!element) return;
            
            const userId = element.dataset?.userId;
            if (!userId) return;
            
            const id = Number(userId);
            this.stopObservingVisibility(element, id);
            
            const bucket = this.elementRegistry.get(id);
            if (!bucket) return;
            
            bucket.delete(element);
            if (bucket.size === 0) {
                this.elementRegistry.delete(id);
            }
        }

        detectVariant(element) {
            if (!element) return 'pill';
            if (element.classList.contains('online-indicator') || element.classList.contains('online-dot')) {
                return 'dot';
            }
            if (element.classList.contains('presence-chip')) {
                return 'chip';
            }
            return 'pill';
        }

        renderRegisteredElements(userId, status) {
            const bucket = this.elementRegistry.get(userId);
            if (!bucket) return;
            
            bucket.forEach(element => {
                if (element.isConnected) {
                    this.renderElement(element, status);
                }
            });
        }

        renderElement(element, status) {
            if (!element || !status) return;
            
            const meta = this.elementMeta.get(element) || { variant: this.detectVariant(element) };
            
            // Update UI state classes
            element.classList.remove('ui-online', 'ui-stale', 'ui-unknown', 'ui-offline');
            element.classList.add(`ui-${status.uiState || 'unknown'}`);
            
            if (meta.variant === 'dot') {
                element.classList.add('presence-dot');
                element.classList.toggle('is-online', status.isOnline);
                element.classList.toggle('is-offline', !status.isOnline);
                
                if (status.uiState === 'stale' || status.uiState === 'unknown') {
                    element.classList.add('is-stale');
                    element.style.opacity = '0.7';
                } else {
                    element.classList.remove('is-stale');
                    element.style.opacity = '1';
                }
                
                element.style.display = status.uiState === 'offline' ? 'none' : 'block';
                return;
            }

            // Default pill/chip rendering
            element.classList.add('presence-indicator');
            element.classList.toggle('is-online', status.isOnline);
            element.classList.toggle('is-offline', !status.isOnline);
            
            if (meta.emphasize) element.classList.add('presence-indicator--emphasis');
            if (meta.subtle) element.classList.add('presence-indicator--subtle');

            const showLastSeen = meta.showLastSeen && !status.isOnline && status.lastSeen;
            let onlineText = meta.onlineText !== undefined ? meta.onlineText : 'Online now';
            
            if (status.uiState === 'stale') onlineText = 'Recently online';
            if (status.uiState === 'unknown') onlineText = 'Status unknown';
            
            const offlineText = meta.offlineText !== undefined ? meta.offlineText : 'Offline';
            const dot = '<span class="presence-dot"></span>';
            const showStatusText = status.uiState !== 'offline' || !showLastSeen;
            
            const statusText = showStatusText
                ? `<span class="presence-text">${status.uiState === 'offline' ? offlineText : onlineText}</span>`
                : '';
                
            const lastSeenText = showLastSeen
                ? `<span class="presence-last-seen">Last active ${this.formatRelative(status.lastSeen)}</span>`
                : '';

            element.innerHTML = `${dot}${statusText}${lastSeenText}`;
            element.style.display = 'inline-flex';
        }

        // === Visibility Management ===
        observeVisibility(element, userId) {
            if (!element || !Number.isFinite(userId)) return;

            if (!this.visibilityObserver) {
                this.visibilityObserver = new IntersectionObserver(
                    (entries) => this.handleVisibilityEntries(entries),
                    {
                        root: null,
                        rootMargin: this.config.visibilityRootMargin,
                        threshold: [0, 0.01, 0.1]
                    }
                );
            }

            element.dataset.visibilityUserId = String(userId);
            this.visibilityObserver.observe(element);
        }

        stopObservingVisibility(element, userId) {
            if (this.visibilityObserver) {
                this.visibilityObserver.unobserve(element);
            }

            if (element?.dataset?.visibilityUserId) {
                delete element.dataset.visibilityUserId;
            }

            if (Number.isFinite(userId)) {
                this.handleElementHidden(userId, element, true);
            }
        }

        handleVisibilityEntries(entries) {
            entries.forEach(entry => {
                const element = entry.target;
                const userId = Number(element.dataset?.userId || element.dataset?.visibilityUserId);
                if (!Number.isFinite(userId)) return;

                if (entry.isIntersecting && entry.intersectionRatio > 0) {
                    this.handleElementVisible(userId, element);
                } else {
                    this.handleElementHidden(userId, element, false);
                }
            });
        }

        handleElementVisible(userId, element) {
            const current = this.userVisibilityCounts.get(userId) || 0;
            this.userVisibilityCounts.set(userId, current + 1);

            if (current === 0) {
                if (this.tryTrackUser(userId)) {
                    this.removeWaitingUser(userId);
                    this.flagElementsDeferred(userId, false);
                    this.queueUserId(userId);
                } else {
                    this.enqueueWaitingUser(userId);
                    this.flagElementsDeferred(userId, true);
                }
            } else if (this.isUserTracked(userId)) {
                this.queueUserId(userId);
            }

            if (element) {
                element.dataset.presenceVisible = 'true';
            }
        }

        handleElementHidden(userId, element, forceRemove) {
            const current = this.userVisibilityCounts.get(userId) || 0;
            const decrement = forceRemove ? Math.max(0, current - 1) : current - 1;
            
            if (decrement <= 0) {
                this.userVisibilityCounts.delete(userId);
                const removed = this.trackedUsers.delete(userId);
                this.removeWaitingUser(userId);
                if (removed) this.promoteWaitingUser();
            } else {
                this.userVisibilityCounts.set(userId, decrement);
            }

            if (element) {
                element.dataset.presenceVisible = 'false';
            }
        }

        tryTrackUser(userId) {
            if (!this.config.maxTrackedUsers || this.config.maxTrackedUsers <= 0) return true;
            if (this.trackedUsers.has(userId)) return true;
            if (this.trackedUsers.size < this.config.maxTrackedUsers) {
                this.trackedUsers.add(userId);
                return true;
            }
            return false;
        }

        enqueueWaitingUser(userId) {
            if (this.waitingUsers.includes(userId)) return;
            this.waitingUsers.push(userId);
        }

        removeWaitingUser(userId) {
            const index = this.waitingUsers.indexOf(userId);
            if (index !== -1) this.waitingUsers.splice(index, 1);
        }

        promoteWaitingUser() {
            if (!this.config.maxTrackedUsers || this.waitingUsers.length === 0) return;

            while (this.waitingUsers.length > 0 && this.trackedUsers.size < this.config.maxTrackedUsers) {
                const candidate = this.waitingUsers.shift();
                if (!Number.isFinite(candidate)) continue;
                if ((this.userVisibilityCounts.get(candidate) || 0) === 0) continue;
                
                this.trackedUsers.add(candidate);
                this.flagElementsDeferred(candidate, false);
                this.queueUserId(candidate);
                break;
            }
        }

        isUserTracked(userId) {
            if (!this.config.maxTrackedUsers) return true;
            return this.trackedUsers.has(userId);
        }

        flagElementsDeferred(userId, deferred) {
            const bucket = this.elementRegistry.get(userId);
            if (!bucket) return;
            
            bucket.forEach(element => {
                if (!element) return;
                element.dataset.presenceDeferred = deferred ? 'true' : 'false';
                element.classList.toggle('presence-deferred', deferred);
            });
        }

        // === Page Visibility ===
        handleDocumentVisibilityChange() {
            const nowHidden = document.visibilityState === 'hidden';
            this.pageHidden = nowHidden;
            
            if (nowHidden) {
                // Move pending requests to hidden queue
                this.pendingUserIds.forEach(id => this.hiddenQueue.add(id));
                this.pendingUserIds.clear();
                this.scheduleHiddenRefresh();
                this.flushMetrics(true);
            } else {
                // Page became visible
                this.clearHiddenRefreshTimer();
                this.flushHiddenQueue(true);
                this.refreshTrackedUsers();
                this.sendHeartbeat({ force: true });
                this.evaluateLeadership('visibility');
            }
        }

        flushHiddenQueue(immediate = false) {
            if (this.hiddenQueue.size === 0) return;
            
            this.hiddenQueue.forEach(id => this.pendingUserIds.add(id));
            this.hiddenQueue.clear();
            
            if (immediate) {
                if (this.batchTimer) clearTimeout(this.batchTimer);
                this.processBatch();
            } else {
                if (this.batchTimer) clearTimeout(this.batchTimer);
                this.batchTimer = setTimeout(() => this.processBatch(), this.config.batchDelay);
            }
        }

        scheduleHiddenRefresh() {
            if (this.hiddenRefreshTimer || !this.pageHidden) return;
            
            this.hiddenRefreshTimer = setTimeout(() => {
                this.hiddenRefreshTimer = null;
                this.flushHiddenQueue(false);
                if (this.pageHidden && this.hiddenQueue.size > 0) {
                    this.scheduleHiddenRefresh();
                }
            }, this.config.hiddenPageRefreshInterval);
        }

        clearHiddenRefreshTimer() {
            if (this.hiddenRefreshTimer) {
                clearTimeout(this.hiddenRefreshTimer);
                this.hiddenRefreshTimer = null;
            }
        }

        // === DOM Integration ===
        scanDomForIndicators() {
            const selectors = this.config.domScanSelectors.join(',');
            document.querySelectorAll(selectors).forEach(node => {
                const userId = this.resolveNodeUserId(node);
                if (userId) this.bindIndicator(node, userId);
            });
        }

        observeDomMutations() {
            if (this.observer) return;
            
            const selectors = this.config.domScanSelectors.join(',');
            this.observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    // Added nodes
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType !== Node.ELEMENT_NODE) return;
                        if (this.matchesDomScanSelector(node)) {
                            const userId = this.resolveNodeUserId(node);
                            if (userId) this.bindIndicator(node, userId);
                        }
                        node.querySelectorAll?.(selectors).forEach(child => {
                            const childUserId = this.resolveNodeUserId(child);
                            if (childUserId) this.bindIndicator(child, childUserId);
                        });
                    });
                    
                    // Removed nodes
                    mutation.removedNodes.forEach(node => {
                        if (node.nodeType !== Node.ELEMENT_NODE) return;
                        if (this.matchesDomScanSelector(node)) this.unbindIndicator(node);
                        node.querySelectorAll?.(selectors).forEach(child => this.unbindIndicator(child));
                    });
                });
            });

            this.observer.observe(document.body, { childList: true, subtree: true });
        }

        resolveNodeUserId(element) {
            return element?.dataset?.userId || element?.dataset?.presenceId || null;
        }

        matchesDomScanSelector(element) {
            if (!element?.matches) return false;
            return this.config.domScanSelectors.some(selector => {
                try {
                    return element.matches(selector);
                } catch (_error) {
                    return false;
                }
            });
        }

        pruneDisconnectedElements() {
            this.elementRegistry.forEach((elements, userId) => {
                const filtered = Array.from(elements).filter(el => el.isConnected);
                if (filtered.length === 0) {
                    this.elementRegistry.delete(userId);
                } else {
                    this.elementRegistry.set(userId, new Set(filtered));
                }
            });
        }

        // === Utility Methods ===
        formatRelative(value) {
            if (!value) return 'unknown';
            
            const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
            if (!Number.isFinite(timestamp)) return 'unknown';
            
            const diff = Date.now() - timestamp;
            if (diff < 0) return 'just now';
            if (diff > 31536000000 * 10) return 'a long time ago';
            
            if (diff < 10000) return 'just now';
            if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
            if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
            if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
            
            const weeks = Math.floor(diff / 604800000);
            if (weeks < 4) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
            
            const months = Math.max(1, Math.floor(diff / 2592000000));
            if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
            
            const years = Math.floor(diff / 31536000000);
            return `${years} year${years === 1 ? '' : 's'} ago`;
        }

        // === Subscribers ===
        subscribe(userId, callback) {
            const id = Number(userId);
            if (!Number.isFinite(id) || typeof callback !== 'function') {
                return () => {};
            }
            
            if (!this.subscribers.has(id)) {
                this.subscribers.set(id, new Set());
            }
            this.subscribers.get(id).add(callback);
            
            const cached = this.getCachedStatus(id);
            if (cached) setTimeout(() => callback({ ...cached }), 0);
            
            return () => this.unsubscribe(id, callback);
        }

        unsubscribe(userId, callback) {
            const id = Number(userId);
            const bucket = this.subscribers.get(id);
            if (!bucket) return;
            bucket.delete(callback);
            if (bucket.size === 0) this.subscribers.delete(id);
        }

        notifySubscribers(userId, status) {
            const bucket = this.subscribers.get(userId);
            if (!bucket) return;
            
            bucket.forEach(cb => {
                try {
                    cb({ ...status });
                } catch (error) {
                    console.warn('PresenceEngine: subscriber failed', error.message);
                }
            });
        }

        // === Promise Management ===
        resolvePendingPromises(userId, status) {
            const queue = this.pendingPromises.get(userId);
            if (!queue) return;
            
            queue.forEach(entry => {
                clearTimeout(entry.timer);
                entry.resolveCallbacks.forEach(resolve => resolve({ ...status }));
            });
            
            this.pendingPromises.delete(userId);
            this.retryCounts.delete(userId);
        }

        cleanupStalePromises() {
            const now = Date.now();
            const maxAge = this.config.promiseMaxAgeMs;
            
            this.pendingPromises.forEach((queue, userId) => {
                const activePromises = queue.filter(entry => {
                    if (now - entry.createdAt > maxAge) {
                        entry.rejectCallbacks.forEach(reject => 
                            reject(new Error('Presence request expired'))
                        );
                        return false;
                    }
                    return true;
                });
                
                if (activePromises.length === 0) {
                    this.pendingPromises.delete(userId);
                    this.retryCounts.delete(userId);
                } else {
                    this.pendingPromises.set(userId, activePromises);
                }
            });
        }

        // === Core API ===
        refreshAllKnownUsers() {
            this.elementRegistry.forEach((_, userId) => this.queueUserId(userId));
        }

        refreshTrackedUsers() {
            if (this.trackedUsers.size === 0) return;
            this.trackedUsers.forEach(userId => {
                if (Number.isFinite(userId)) {
                    this.queueUserId(userId);
                }
            });
        }

        getCachedStatus(userId) {
            const id = Number(userId);
            const record = this.statusCache.get(id);
            return record ? { ...record } : null;
        }

        updateTTLAwareness(serverPayload) {
            if (serverPayload?.ttlSeconds) {
                console.debug('PresenceEngine: Server TTL is', serverPayload.ttlSeconds, 'seconds');
            }
        }

        attachLifecycleHooks() {
            document.addEventListener('visibilitychange', () => this.handleDocumentVisibilityChange());
            window.addEventListener('beforeunload', () => this.handlePageTermination());
            window.addEventListener('pagehide', () => this.handlePageTermination());
        }

        handlePageTermination() {
            this.disconnectPresenceStream();
            this.releaseLeadership('page-termination');
            this.flushMetrics(true);
        }

        // === Metrics ===
        metricsEnabled() {
            if (this.metricsDisabled) return false;
            return this.config.metricsEnabled !== false && typeof fetch === 'function';
        }

        disableMetrics(reason = '') {
            if (this.metricsDisabled) return;
            this.metricsDisabled = true;
            this.metricsBuffer = [];
            if (this.metricsFlushTimer) {
                clearTimeout(this.metricsFlushTimer);
                this.metricsFlushTimer = null;
            }
            if (reason) {
                console.info('[PresenceEngine] Metrics disabled:', reason);
            }
        }

        captureBatchMetric(details = {}) {
            if (!this.metricsEnabled()) return;
            
            const sample = {
                ts: Date.now(),
                durationMs: Number.isFinite(details.durationMs) ? Math.max(0, details.durationMs) : null,
                batchSize: Number.isInteger(details.batchSize) ? details.batchSize : 0,
                success: details.success !== false,
                errorCode: details.errorCode || null,
                pageHidden: this.pageHidden,
                trackedCount: this.trackedUsers.size,
                waitingCount: this.waitingUsers.length,
                hiddenQueue: this.hiddenQueue.size,
                visibleUsers: this.userVisibilityCounts.size,
                maxTracked: this.config.maxTrackedUsers,
                cacheSize: this.statusCache.size,
                transport: this.socket?.connected ? 'socket' : (this.presenceStream ? 'sse' : 'http'),
                httpStatus: Number.isInteger(details.httpStatus) ? details.httpStatus : null,
                source: details.source || 'unknown'
            };
            
            this.enqueueMetric(sample);
        }

        enqueueMetric(sample) {
            if (!sample || !this.metricsEnabled()) return;
            
            if (this.metricsBuffer.length >= 100) this.metricsBuffer.shift();
            this.metricsBuffer.push(sample);
            
            if (this.metricsBuffer.length >= this.config.metricsBatchSize) {
                this.flushMetrics();
            } else if (!this.metricsFlushTimer) {
                this.metricsFlushTimer = setTimeout(() => {
                    this.metricsFlushTimer = null;
                    this.flushMetrics();
                }, this.config.metricsFlushInterval);
            }
        }

        flushMetrics(immediate = false) {
            if (!this.metricsEnabled() || this.metricsBuffer.length === 0) return;
            
            const samples = this.metricsBuffer.slice();
            this.metricsBuffer = [];
            
            if (this.metricsFlushTimer) {
                clearTimeout(this.metricsFlushTimer);
                this.metricsFlushTimer = null;
            }
            
            this.metricsLastFlush = Date.now();
            this.sendMetrics(samples, immediate);
        }

        sendMetrics(samples, immediate = false) {
            if (this.metricsDisabled) return;
            if (!Array.isArray(samples) || samples.length === 0) return;
            
            const payload = {
                samples,
                metadata: {
                    clientId: this.metricsClientId,
                    version: window.Presence?.__engineVersion || null,
                    pathname: window.location?.pathname || null,
                    userAgent: navigator?.userAgent || null
                }
            };
            
            const endpoint = this.config.metricsEndpoint;
            const body = JSON.stringify(payload);
            
            // Use sendBeacon for immediate/hidden sends
            if ((immediate || this.pageHidden) && navigator?.sendBeacon) {
                try {
                    const blob = new Blob([body], { type: 'application/json' });
                    navigator.sendBeacon(endpoint, blob);
                    return;
                } catch (_error) {
                    // Fall through to fetch
                }
            }
            
            // Use fetch for normal sends
            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                keepalive: true,
                body
            }).then(response => {
                if (response && (response.status === 401 || response.status === 403)) {
                    this.disableMetrics(`HTTP ${response.status}`);
                }
            }).catch(() => {
                // Swallow metric errors
            });
        }
    }

    function createNoopPresenceEngine() {
        const noopStatus = { ...STATUS_DEFAULT };
        return {
            initialized: false,
            disabled: true,
            socket: null,
            bindIndicator: () => undefined,
            unbindIndicator: () => undefined,
            getCachedStatus: () => null,
            requestStatus: async () => ({ ...noopStatus }),
            requestStatuses: async () => ({}),
            refreshAllKnownUsers: () => undefined,
            refreshTrackedUsers: () => undefined,
            queueUserId: () => undefined,
            metricsEnabled: () => false,
            captureBatchMetric: () => undefined,
            enqueueMetric: () => undefined,
            flushMetrics: () => undefined
        };
    }

    // === VirtualizedPresenceList (Compressed) ===
    class VirtualizedPresenceList {
        constructor(container, options = {}) {
            if (!container) throw new Error('Container required');
            if (typeof options.renderItem !== 'function') throw new Error('renderItem callback required');
            
            this.container = container;
            this.options = { itemHeight: 96, overscan: 4, ...options };
            this.itemHeight = Math.max(32, Number(this.options.itemHeight) || 96);
            this.overscan = Math.max(0, Number(this.options.overscan) || 4);
            this.scrollContainer = this.resolveScrollContainer(this.options.scrollContainer);
            this.items = [];
            this.range = { start: 0, end: 0 };
            
            this.setupContainer();
            this.recalculate();
            this.scrollContainer.addEventListener('scroll', () => this.render(), { passive: true });
            
            if (typeof ResizeObserver !== 'undefined') {
                new ResizeObserver(() => this.handleResize()).observe(
                    this.scrollContainer === window ? document.documentElement : this.scrollContainer
                );
            }
        }
        
        resolveScrollContainer(candidate) {
            if (!candidate) return this.container;
            if (candidate === window || candidate === document) return window;
            if (candidate instanceof Element) return candidate;
            if (typeof candidate === 'string') {
                return document.querySelector(candidate) || this.container;
            }
            return this.container;
        }
        
        setupContainer() {
            this.container.classList.add('virtualized-presence-shell');
            this.container.innerHTML = `
                <div class="virtualized-presence-spacer virtualized-presence-spacer--top"></div>
                <div class="virtualized-list-inner ${this.options.innerClass || ''}"></div>
                <div class="virtualized-presence-spacer virtualized-presence-spacer--bottom"></div>
            `;
            this.topSpacer = this.container.firstElementChild;
            this.inner = this.topSpacer.nextElementSibling;
            this.bottomSpacer = this.inner.nextElementSibling;
        }
        
        handleResize() {
            this.recalculate();
            this.render(true);
        }
        
        recalculate() {
            const viewport = this.scrollContainer === window
                ? window.innerHeight
                : (this.scrollContainer.clientHeight || this.container.clientHeight || this.itemHeight);
            this.viewportSize = Math.max(this.itemHeight, viewport);
            this.visibleCount = Math.max(1, Math.ceil(this.viewportSize / this.itemHeight) + this.overscan * 2);
        }
        
        setItems(items = []) {
            this.items = Array.isArray(items) ? items.slice() : [];
            this.container.dataset.virtualEmpty = this.items.length === 0 ? 'true' : 'false';
            this.render(true);
        }
        
        render(force = false) {
            if (this.items.length === 0) {
                this.clearContent();
                return;
            }
            
            const scrollTop = this.scrollContainer === window
                ? window.scrollY || document.documentElement.scrollTop || 0
                : this.scrollContainer.scrollTop;
                
            const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.overscan);
            const endIndex = Math.min(this.items.length, startIndex + this.visibleCount);
            
            if (!force && this.range.start === startIndex && this.range.end === endIndex) return;
            this.range = { start: startIndex, end: endIndex };
            
            // Update spacers
            this.topSpacer.style.height = `${startIndex * this.itemHeight}px`;
            this.bottomSpacer.style.height = `${Math.max(0, (this.items.length - endIndex) * this.itemHeight)}px`;
            
            // Render visible items
            const fragment = document.createDocumentFragment();
            const nodes = [];
            for (let i = startIndex; i < endIndex; i++) {
                const node = this.options.renderItem(this.items[i], i, { recycledNode: null, isRecycle: false });
                if (node) {
                    node.dataset.virtualIndex = i;
                    fragment.appendChild(node);
                    nodes.push(node);
                }
            }
            this.inner.replaceChildren(fragment);
            
            if (this.options.onRangeRendered) {
                this.options.onRangeRendered({
                    nodes,
                    startIndex,
                    endIndex,
                    items: this.items.slice(startIndex, endIndex)
                });
            }
        }
        
        clearContent() {
            this.topSpacer.style.height = '0px';
            this.bottomSpacer.style.height = '0px';
            this.inner.replaceChildren();
            this.range = { start: 0, end: 0 };
        }
        
        destroy() {
            this.scrollContainer.removeEventListener('scroll', () => this.render());
            this.container.classList.remove('virtualized-presence-shell');
            this.container.innerHTML = '';
            this.items = [];
        }
    }

    // === Global Initialization ===
    (function initializePresenceEngine() {
        const userConfig = window.PresenceConfig || {};
        const engineDisabled = userConfig.disabled === true || userConfig.enableEngine === false;

        if (!window.__PresenceEngineInstance) {
            window.__PresenceEngineInstance = engineDisabled
                ? createNoopPresenceEngine()
                : new PresenceEngine(userConfig);
        }

        if (engineDisabled && window.__PresenceEngineInstance) {
            window.__PresenceEngineInstance.disabled = true;
        }

        window.Presence = window.__PresenceEngineInstance || createNoopPresenceEngine();
        window.Presence.__engineVersion = '3.2.0-optimized';
        window.StatusService = window.Presence;
    })();

    window.VirtualizedPresenceList = VirtualizedPresenceList;
})(window, document);