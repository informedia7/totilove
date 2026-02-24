(function (window, document) {
    'use strict';

    const LOCATION_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
    const LOCATION_CACHE_FAILURE_TTL_MS = 60 * 1000; // retry after a minute when fetch fails
    const LOCATION_LOOKUP_ENABLED = window.TalkLocationConfig?.enabled !== false;
    const DEFAULT_SOCKET_DISCONNECT_HOLD_MS = 2000;
    const userLocationCache = new Map();
    const offlineHoldTimers = new Map();
    let autoRefreshUserId = null;
    let locationRequestId = 0;

    function revealChatMeta(element) {
        if (typeof window.showChatMeta === 'function') {
            window.showChatMeta(element);
            return;
        }
        if (!element) {
            return;
        }
        element.classList.remove('chat-meta-hidden');
        element.setAttribute('aria-hidden', 'false');
    }

    function concealChatMeta(element) {
        if (typeof window.hideChatMeta === 'function') {
            window.hideChatMeta(element);
            return;
        }
        if (!element) {
            return;
        }
        element.classList.add('chat-meta-hidden');
        element.setAttribute('aria-hidden', 'true');
    }

    function isPresenceActive() {
        if (typeof window.isPresenceSystemEnabled === 'function') {
            return window.isPresenceSystemEnabled();
        }
        if (window.PresenceDisabled === true) {
            return false;
        }
        if (window.PresenceConfig?.disabled === true) {
            return false;
        }
        if (window.Presence && window.Presence.disabled === true) {
            return false;
        }
        return true;
    }

    function getTalkState() {
        return window.TalkState || null;
    }

    function getConversations() {
        const state = getTalkState();
        if (state && typeof state.getConversations === 'function') {
            return state.getConversations();
        }
        return window.conversations || {};
    }

    function setConversations(conversations) {
        const state = getTalkState();
        if (state && typeof state.setConversations === 'function') {
            state.setConversations(conversations);
        } else {
            window.conversations = conversations;
        }
    }

    function getCurrentConversationKey() {
        const state = getTalkState();
        if (state && typeof state.getCurrentConversation === 'function') {
            return state.getCurrentConversation();
        }
        return window.currentConversation || null;
    }

    function getResolvedSessionToken() {
        try {
            if (typeof window.getSessionToken === 'function') {
                const tokenFromFn = window.getSessionToken();
                if (tokenFromFn) {
                    return tokenFromFn;
                }
            }
        } catch (_error) {
            // Ignore token resolution issues and fall back to window.sessionToken
        }
        return window.sessionToken || '';
    }

    let stopChatStatusRefresh = null;

    function stopAutoRefreshStatus() {
        if (typeof stopChatStatusRefresh === 'function') {
            stopChatStatusRefresh();
            stopChatStatusRefresh = null;
        }
        autoRefreshUserId = null;
    }

    function getSocketDisconnectHoldMs() {
        const presenceConfig = window.Presence?.config || window.PresenceConfig || {};
        const value = Number(presenceConfig.socketDisconnectHoldMs ?? DEFAULT_SOCKET_DISCONNECT_HOLD_MS);
        if (!Number.isFinite(value)) {
            return DEFAULT_SOCKET_DISCONNECT_HOLD_MS;
        }
        return Math.max(0, value);
    }

    function clearOfflineHoldTimer(userId) {
        const timer = offlineHoldTimers.get(userId);
        if (timer) {
            clearTimeout(timer);
            offlineHoldTimers.delete(userId);
        }
    }

    function clearAllOfflineHoldTimers() {
        offlineHoldTimers.forEach(timer => clearTimeout(timer));
        offlineHoldTimers.clear();
    }

    function shouldDelayOfflineTransition(userId) {
        if (!window.Presence || typeof window.Presence.getCachedStatus !== 'function') {
            return false;
        }

        const holdMs = getSocketDisconnectHoldMs();
        if (holdMs <= 0) {
            return false;
        }

        const status = window.Presence.getCachedStatus(userId);
        if (!status || !status.isOnline) {
            return false;
        }

        const lastUpdateTs = status.receivedAt || status.timestamp || status.lastSeen;
        if (!Number.isFinite(lastUpdateTs)) {
            return false;
        }

        const age = Date.now() - lastUpdateTs;
        return age <= holdMs * 3;
    }

    function scheduleDelayedOfflineUpdate(userId) {
        const holdMs = getSocketDisconnectHoldMs();
        if (holdMs <= 0) {
            return StatusManager.updateUserOnline(userId, false);
        }

        if (offlineHoldTimers.has(userId)) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            const timer = setTimeout(() => {
                offlineHoldTimers.delete(userId);
                Promise.resolve(StatusManager.updateUserOnline(userId, false)).finally(resolve);
            }, holdMs);
            offlineHoldTimers.set(userId, timer);
        });
    }

    function startAutoRefreshStatus(userId, targetElement) {
        const numericUserId = Number(userId);
        if (!targetElement || !Number.isFinite(numericUserId)) {
            stopAutoRefreshStatus();
            return;
        }

        if (!isPresenceActive()) {
            stopAutoRefreshStatus();
            return;
        }

        if (autoRefreshUserId === numericUserId && typeof stopChatStatusRefresh === 'function') {
            return;
        }

        if (window.PresenceRefresh?.startAutoRefreshStatus) {
            stopAutoRefreshStatus();
            stopChatStatusRefresh = window.PresenceRefresh.startAutoRefreshStatus(numericUserId, targetElement, {
                indicatorOptions: {
                    variant: 'pill',
                    showLastSeen: true,
                    onlineText: 'Online now',
                    offlineText: 'Offline',
                    emphasize: true
                }
            });
            autoRefreshUserId = numericUserId;
        }
    }

    function refreshConversationIndicators(userId, isOnline) {
        if (!userId) {
            return;
        }

        if (!isPresenceActive()) {
            document.querySelectorAll('.conversation-item .online-indicator').forEach(indicator => {
                indicator.style.display = 'none';
            });
            return;
        }

        const indicators = document.querySelectorAll(`.conversation-item .online-indicator[data-user-id='${userId}']`);
        if (indicators.length === 0) {
            return;
        }

        indicators.forEach(indicator => {
            indicator.classList.toggle('is-online', !!isOnline);
            indicator.classList.toggle('is-offline', !isOnline);
            applyStatusDecorations(indicator, isOnline ? 'online' : 'offline');

            // Presence engine will repaint bound nodes; fall back to manual display toggle otherwise
            if (!window.Presence || indicator.dataset.presenceBound !== 'true') {
                indicator.style.display = isOnline ? 'block' : 'none';
            }
        });
    }

    function pushPresenceRealtimeHint(userId, isOnline) {
        if (!window.Presence) {
            return;
        }

        const numericUserId = Number(userId);
        if (!Number.isFinite(numericUserId)) {
            return;
        }

        const now = Date.now();
        const existing = typeof window.Presence.getCachedStatus === 'function'
            ? window.Presence.getCachedStatus(numericUserId)
            : (window.Presence.statusCache instanceof Map ? window.Presence.statusCache.get(numericUserId) : null);

        const statusRecord = {
            userId: numericUserId,
            isOnline: !!isOnline,
            lastSeen: !isOnline ? now : (existing?.lastSeen || now),
            lastActivity: now,
            lastLogin: isOnline ? now : (existing?.lastLogin || null),
            receivedAt: now,
            timestamp: now,
            source: 'talk-realtime',
            stale: false,
            uiState: isOnline ? 'online' : 'offline'
        };

        if (window.Presence.statusCache instanceof Map) {
            window.Presence.statusCache.set(numericUserId, statusRecord);
        }

        if (typeof window.Presence.renderRegisteredElements === 'function') {
            window.Presence.renderRegisteredElements(numericUserId, statusRecord);
        }

        if (typeof window.Presence.notifySubscribers === 'function') {
            window.Presence.notifySubscribers(numericUserId, statusRecord);
        }
    }

        function getStyleRegistry() {
            return window.TalkStyleRegistry || null;
        }

        function applyStatusDecorations(target, status) {
            if (!target) {
                return;
            }
            const registry = getStyleRegistry();
            const normalized = status || 'offline';
            if (registry && typeof registry.applyStatusColors === 'function') {
                registry.applyStatusColors(target, normalized);
            } else {
                target.dataset.talkStatus = normalized;
            }
        }

    function cacheUserLocation(userId, value, ttl = LOCATION_CACHE_TTL_MS) {
        userLocationCache.set(userId, {
            value,
            expiresAt: Date.now() + ttl
        });
    }

    function getCachedUserLocation(userId) {
        const cached = userLocationCache.get(userId);
        if (!cached) {
            return null;
        }
        if (cached.expiresAt > Date.now()) {
            return cached.value;
        }
        userLocationCache.delete(userId);
        return null;
    }

    function isConversationDeleted(conversation) {
        if (!conversation) {
            return true;
        }
        if (conversation.isDeleted) {
            return true;
        }
        const name = (conversation.name || '').toLowerCase();
        return name === 'deleted user' || name === 'account deactivated';
    }

    function unbindPresenceElement(element) {
        if (!element) {
            return;
        }
        try {
            if (element.dataset?.presenceBound === 'true' && typeof window.Presence?.unbindIndicator === 'function') {
                window.Presence.unbindIndicator(element);
            }
        } catch (error) {
            console.warn('Presence unbind failed', error);
        }
        if (element.dataset) {
            delete element.dataset.userId;
            delete element.dataset.presenceBound;
            delete element.dataset.visibilityUserId;
            delete element.dataset.presenceVisible;
            delete element.dataset.presenceDeferred;
        }
    }

    async function ensurePresenceBinding(element, userId, options) {
        if (!element || !window.Presence || !isPresenceActive()) {
            return null;
        }
        const numericUserId = Number(userId);
        if (!Number.isFinite(numericUserId)) {
            return null;
        }
        const alreadyBoundId = Number(element.dataset?.userId);
        if (element.dataset?.presenceBound === 'true' && alreadyBoundId === numericUserId) {
            return window.Presence.getCachedStatus?.(numericUserId) || null;
        }
        if (element.dataset?.presenceBound === 'true') {
            unbindPresenceElement(element);
        }
        return window.Presence.bindIndicator(element, numericUserId, options);
    }

    function detachChatIndicators() {
        const chatStatus = document.getElementById('chatStatus');
        const chatAvatar = document.getElementById('chatAvatar');
        const avatarIndicator = chatAvatar?.querySelector('.online-indicator');

        if (chatStatus) {
            unbindPresenceElement(chatStatus);
            concealChatMeta(chatStatus);
            chatStatus.textContent = '';
            chatStatus.innerHTML = '';
        }
        if (avatarIndicator) {
            unbindPresenceElement(avatarIndicator);
            avatarIndicator.style.display = 'none';
        }

        stopAutoRefreshStatus();
    }

    async function updateChatLocation(conversation, chatLocation, chatLocationText) {
        if (!chatLocation || !chatLocationText) {
            return;
        }
        if (isConversationDeleted(conversation)) {
            chatLocationText.textContent = '';
            concealChatMeta(chatLocation);
            return;
        }
        if (!LOCATION_LOOKUP_ENABLED || !conversation.partnerId) {
            chatLocationText.textContent = '';
            concealChatMeta(chatLocation);
            return;
        }

        const currentRequestId = ++locationRequestId;
        const locationString = await getUserLocationString(conversation.partnerId);
        if (currentRequestId !== locationRequestId) {
            return;
        }
        if (locationString) {
            chatLocationText.textContent = locationString;
            revealChatMeta(chatLocation);
        } else {
            chatLocationText.textContent = '';
            concealChatMeta(chatLocation);
        }
    }

    async function getUserLocationString(userId) {
        if (!LOCATION_LOOKUP_ENABLED || !userId) {
            return null;
        }

        const cached = getCachedUserLocation(userId);
        if (cached !== null) {
            return cached;
        }

        try {
            const sessionToken = getResolvedSessionToken();
            const headers = {};
            if (sessionToken) {
                headers['x-session-token'] = sessionToken;
                headers.Authorization = `Bearer ${sessionToken}`;
            }

            const url = sessionToken
                ? `/api/user/${userId}?token=${encodeURIComponent(sessionToken)}`
                : `/api/user/${userId}`;

            const response = await fetch(url, {
                credentials: 'include',
                headers
            });
            if (!response.ok) {
                cacheUserLocation(userId, null, LOCATION_CACHE_FAILURE_TTL_MS);
                return null;
            }
            const data = await response.json();
            const user = data?.success ? data.user : null;
            const locationParts = [];
            if (user?.city_name) locationParts.push(user.city_name);
            if (user?.country_name) locationParts.push(user.country_name);
            const locationString = locationParts.length ? locationParts.join(', ') : null;
            cacheUserLocation(userId, locationString);
            return locationString;
        } catch (error) {
            cacheUserLocation(userId, null, LOCATION_CACHE_FAILURE_TTL_MS);
            return null;
        }
    }

    const StatusManager = {
        updateCurrentChat: async function () {
            const conversations = getConversations();
            const currentConversationKey = getCurrentConversationKey();
            if (!currentConversationKey || !conversations[currentConversationKey]) {
                stopAutoRefreshStatus();
                return;
            }

            const conversation = conversations[currentConversationKey];
            const chatStatus = document.getElementById('chatStatus');
            const chatAvatar = document.getElementById('chatAvatar');
            const chatLocation = document.getElementById('chatLocation');
            const chatLocationText = document.getElementById('chatLocationText');
            const presenceEnabled = isPresenceActive();

            if (!conversation || !chatAvatar || !conversation.partnerId) {
                detachChatIndicators();
                if (chatLocation) {
                    chatLocationText.textContent = '';
                    concealChatMeta(chatLocation);
                }
                return;
            }

            updateChatLocation(conversation, chatLocation, chatLocationText);

            const partnerId = Number(conversation.partnerId);
            if (!Number.isFinite(partnerId)) {
                detachChatIndicators();
                return;
            }

            const isDeleted = isConversationDeleted(conversation);

            let indicator = chatAvatar.querySelector('.online-indicator');
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.className = 'online-indicator';
                chatAvatar.appendChild(indicator);
            }

            if (presenceEnabled) {
                indicator.dataset.userId = String(partnerId);
            } else {
                delete indicator.dataset.userId;
            }

            const initialOnline = Boolean(conversation.is_online);
            indicator.classList.toggle('is-online', initialOnline);
            indicator.classList.toggle('is-offline', !initialOnline);
            applyStatusDecorations(indicator, initialOnline ? 'online' : 'offline');

            if (isDeleted || !presenceEnabled) {
                indicator.style.display = 'none';
                unbindPresenceElement(indicator);
            } else if (window.Presence) {
                await ensurePresenceBinding(indicator, partnerId, { variant: 'dot' });
                indicator.style.display = initialOnline ? 'block' : 'none';
            } else {
                indicator.style.display = 'none';
                unbindPresenceElement(indicator);
            }

            if (chatStatus) {
                if (isDeleted || !presenceEnabled) {
                    detachChatIndicators();
                } else if (window.Presence) {
                    await ensurePresenceBinding(chatStatus, partnerId, {
                        variant: 'pill',
                        showLastSeen: true,
                        onlineText: 'Online now',
                        offlineText: 'Offline',
                        emphasize: true
                    });
                    chatStatus.style.display = 'inline-flex';
                    revealChatMeta(chatStatus);
                    startAutoRefreshStatus(partnerId, chatStatus);
                    applyStatusDecorations(chatStatus, initialOnline ? 'online' : 'offline');
                } else {
                    stopAutoRefreshStatus();
                    unbindPresenceElement(chatStatus);
                    this.updateStatusFallback(chatStatus);
                }
            } else {
                stopAutoRefreshStatus();
            }
        },

        updateUserOnline: async function (userId, isOnline) {
            const conversations = getConversations();
            let statusUpdated = false;

            Object.values(conversations).forEach(conversation => {
                if (conversation.partnerId == userId) {
                    conversation.status = isOnline ? 'Online' : 'Offline';
                    conversation.is_online = isOnline;
                    if (isOnline) {
                        conversation.lastOnlineTime = Date.now();
                    }
                    statusUpdated = true;
                }
            });

            if (statusUpdated) {
                setConversations(conversations);
                refreshConversationIndicators(userId, isOnline);
                pushPresenceRealtimeHint(userId, isOnline);
            }

            const currentConversationKey = getCurrentConversationKey();
            if (currentConversationKey && conversations[currentConversationKey] && conversations[currentConversationKey].partnerId == userId) {
                await this.updateCurrentChat();
            }
        },

        updateStatusFallback: function (chatStatus) {
            if (chatStatus) {
                applyStatusDecorations(chatStatus, 'offline');
                concealChatMeta(chatStatus);
            }
        }
    };

    async function updateCurrentChatStatus() {
        await StatusManager.updateCurrentChat();
    }

    function cleanupStatusListeners() {
        if (window.statusListenersInitialized) {
            window.statusListenersInitialized = false;
        }
        clearAllOfflineHoldTimers();
        stopAutoRefreshStatus();
    }

    async function updateUserOnlineStatus(userId, isOnline) {
        const numericUserId = Number(userId);
        if (!Number.isFinite(numericUserId)) {
            return;
        }

        if (isOnline) {
            clearOfflineHoldTimer(numericUserId);
            await StatusManager.updateUserOnline(numericUserId, true);
            return;
        }

        if (shouldDelayOfflineTransition(numericUserId)) {
            await scheduleDelayedOfflineUpdate(numericUserId);
            return;
        }

        clearOfflineHoldTimer(numericUserId);
        await StatusManager.updateUserOnline(numericUserId, false);
    }

    window.addEventListener('pagehide', cleanupStatusListeners);

    window.StatusManager = StatusManager;
    window.updateCurrentChatStatus = updateCurrentChatStatus;
    window.cleanupStatusListeners = cleanupStatusListeners;
    window.updateUserOnlineStatus = updateUserOnlineStatus;
})(window, document);
