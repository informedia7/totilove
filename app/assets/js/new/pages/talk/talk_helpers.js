(function (window, document) {
    'use strict';

    function getTalkState() {
        return window.TalkState || null;
    }

    function getCurrentUserId() {
        const state = getTalkState();
        if (state && typeof state.getCurrentUserId === 'function') {
            return state.getCurrentUserId();
        }
        return window.currentUser?.id || null;
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

    function isPresenceSystemEnabled() {
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

    function setFilteredConversations(list) {
        const state = getTalkState();
        if (state && typeof state.setFilteredConversations === 'function') {
            state.setFilteredConversations(list);
        } else {
            window.filteredConversations = list;
        }
    }

    function getMessageCache() {
        const state = getTalkState();
        if (state && typeof state.getMessageCache === 'function') {
            return state.getMessageCache();
        }
        if (!window.messageCache) {
            window.messageCache = new Map();
        }
        return window.messageCache;
    }

    function getCacheDuration() {
        const state = getTalkState();
        if (state && typeof state.getCacheDuration === 'function') {
            return state.getCacheDuration();
        }
        return window.CONFIG?.LIMITS?.CACHE_DURATION || 60000;
    }

    function getSearchDebounceTimer() {
        const state = getTalkState();
        if (state && typeof state.getSearchDebounceTimer === 'function') {
            return state.getSearchDebounceTimer();
        }
        return window.searchDebounceTimer || null;
    }

    function setSearchDebounceTimer(timer) {
        const state = getTalkState();
        if (state && typeof state.setSearchDebounceTimer === 'function') {
            state.setSearchDebounceTimer(timer);
        } else {
            window.searchDebounceTimer = timer;
        }
    }

    function clearSearchDebounceTimer() {
        const state = getTalkState();
        if (state && typeof state.clearSearchDebounceTimer === 'function') {
            state.clearSearchDebounceTimer();
        } else if (window.searchDebounceTimer) {
            clearTimeout(window.searchDebounceTimer);
            window.searchDebounceTimer = null;
        }
    }

    function cleanupCache() {
        const cache = getMessageCache();
        const cacheDuration = getCacheDuration();
        const now = Date.now();
        let cleaned = 0;

        cache.forEach((value, key) => {
            const timestamp = value?.timestamp;
            if (timestamp && now - timestamp > cacheDuration * 2) {
                cache.delete(key);
                cleaned++;
            }
        });

        return cleaned;
    }

    function filterOutRecalledMessages(messages) {
        return Array.isArray(messages) ? messages : [];
    }

    function getCurrentConversationCacheKey() {
        const conversations = getConversations();
        const state = getTalkState();
        const currentConversationKey = state && typeof state.getCurrentConversation === 'function'
            ? state.getCurrentConversation()
            : window.currentConversation;
        const currentUserId = getCurrentUserId();

        if (!currentConversationKey || !currentUserId) {
            return null;
        }

        const conversation = conversations[currentConversationKey];
        if (!conversation || !conversation.partnerId) {
            return null;
        }

        return `${currentUserId}_${conversation.partnerId}`;
    }

    function getCurrentConversationId() {
        const conversations = getConversations();
        const state = getTalkState();
        const currentConversationKey = state && typeof state.getCurrentConversation === 'function'
            ? state.getCurrentConversation()
            : window.currentConversation;

        if (currentConversationKey && conversations[currentConversationKey]) {
            return conversations[currentConversationKey].partnerId || null;
        }
        return null;
    }

    function getCurrentFilter() {
        const activeFilterButton = document.querySelector('.filter-btn.active');
        return activeFilterButton?.dataset.filter || 'all';
    }

    function findMessageById(messageId, messages = null) {
        if (!messageId) {
            return null;
        }

        let list = messages;
        if (!Array.isArray(list)) {
            const conversations = getConversations();
            const state = getTalkState();
            const currentConversationKey = state && typeof state.getCurrentConversation === 'function'
                ? state.getCurrentConversation()
                : window.currentConversation;
            if (currentConversationKey && conversations[currentConversationKey]?.messages) {
                list = conversations[currentConversationKey].messages;
            }
        }

        if (!Array.isArray(list)) {
            return null;
        }

        const targetId = String(messageId);
        return list.find(msg => String(msg.id) === targetId) || null;
    }

    function validateConversation(conversation) {
        return Boolean(conversation && conversation.partnerId);
    }

    function createError(message, fallback = 'Operation failed') {
        return new Error(message || fallback);
    }

    function validateMessageAndUser(messageId, userId) {
        return Boolean(messageId && userId);
    }

    async function markConversationAsRead(partnerId) {
        const currentUserId = getCurrentUserId();
        if (!partnerId || !currentUserId) {
            return;
        }

        try {
            const response = await fetch('/api/messages/mark-conversation-read', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': currentUserId
                },
                body: JSON.stringify({
                    conversationPartnerId: partnerId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                const conversations = getConversations();
                const conversation = Object.values(conversations).find(c => parseInt(c.partnerId) === parseInt(partnerId));
                if (conversation) {
                    conversation.unread = 0;
                    setConversations(conversations);
                }

                if (getCurrentFilter() === 'unread') {
                    filterConversations('unread');
                }
            }
        } catch (error) {
            console.error('Error marking conversation as read:', error);
        }
    }

    async function markMessageAsRead(messageId) {
        const currentUserId = getCurrentUserId();
        if (!validateMessageAndUser(messageId, currentUserId)) {
            return;
        }

        try {
            const response = await fetch(`/api/messages/${messageId}/mark-read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': currentUserId
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (!data.success) {
                return;
            }

            const conversations = getConversations();
            let messageConversationKey = null;

            Object.entries(conversations).forEach(([key, conversation]) => {
                if (conversation.messages) {
                    const message = conversation.messages.find(msg => String(msg.id) === String(messageId));
                    if (message) {
                        message.isRead = true;
                        message.read_at = new Date().toISOString();
                        messageConversationKey = key;
                    }
                }
            });

            const currentFilter = getCurrentFilter();
            const state = getTalkState();
            const currentConversationKey = state && typeof state.getCurrentConversation === 'function'
                ? state.getCurrentConversation()
                : window.currentConversation;

            if (
                currentFilter === 'unread' &&
                messageConversationKey &&
                currentConversationKey === messageConversationKey
            ) {
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageElement && !messageElement.classList.contains('system')) {
                    messageElement.style.transition = 'opacity 0.3s, transform 0.3s';
                    messageElement.style.opacity = '0';
                    messageElement.style.transform = 'translateX(-20px)';
                    setTimeout(() => {
                        if (messageElement.parentNode) {
                            messageElement.remove();
                        }
                        const unreadHeader = document.querySelector('[data-message-id="unread-header"]');
                        if (unreadHeader) {
                            const remainingMessages = Array.from(document.querySelectorAll('[data-message-id]'))
                                .filter(el => !el.classList.contains('system') && el.getAttribute('data-message-id') !== 'unread-header');
                            if (remainingMessages.length > 0) {
                                const headerText = unreadHeader.querySelector('.message-text, .message-content');
                                if (headerText) {
                                    headerText.textContent = `Showing ${remainingMessages.length} unread message${remainingMessages.length > 1 ? 's' : ''} from this conversation`;
                                }
                            } else if (typeof window.renderMessages === 'function') {
                                window.renderMessages([
                                    {
                                        type: 'system',
                                        text: 'No unread messages in this conversation',
                                        time: 'Now',
                                        id: 'no-unread',
                                        isRead: true,
                                        content: 'No unread messages in this conversation',
                                        timestamp: Date.now()
                                    }
                                ]);
                            }
                        }
                    }, 300);
                }
            }

            if (messageConversationKey) {
                const conversation = conversations[messageConversationKey];
                if (conversation && conversation.unread > 0) {
                    conversation.unread--;
                }
                setConversations(conversations);
            }

            if (typeof window.loadConversations === 'function') {
                await window.loadConversations();
            }

            if (currentFilter === 'unread') {
                filterConversations('unread');
            }
        } catch (error) {
            // Silent fail to avoid noisy toasts for auto-read behavior
        }
    }

    async function checkMessageReadStatus(messageId) {
        try {
            const response = await fetch(`/api/messages/${messageId}/status`);
            const result = await response.json();
            return result.isRead;
        } catch (error) {
            return false;
        }
    }

    function filterConversations(filter, skipRender = false) {
        const conversations = getConversations();
        let filtered = [];

        switch (filter) {
            case 'unread':
                filtered = Object.values(conversations).filter(c => c.unread > 0);
                break;
            case 'saved': {
                const savedMessages = window.CONFIG?.USERS?.SAVED_MESSAGES || [];
                if (savedMessages.length === 0) {
                    filtered = [];
                    break;
                }
                const savedIds = [...new Set(savedMessages.map(msg => parseInt(msg.conversationId)))];
                filtered = Object.values(conversations).filter(c => savedIds.includes(parseInt(c.partnerId)));
                filtered.forEach(conv => {
                    const partnerId = parseInt(conv.partnerId);
                    conv.savedMessageCount = savedMessages.filter(msg => parseInt(msg.conversationId) === partnerId).length;
                });
                break;
            }
            case 'all':
            default:
                filtered = Object.values(conversations);
        }

        setFilteredConversations(filtered);

        if (!skipRender && typeof window.renderConversations === 'function') {
            window.renderConversations();
        }
    }

    function debouncedSearchConversations(query) {
        const existingTimer = getSearchDebounceTimer();
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const debounceDuration = window.CONFIG?.TIMEOUTS?.SEARCH_DEBOUNCE || 300;
        const timer = setTimeout(() => {
            searchConversations(query);
        }, debounceDuration);

        setSearchDebounceTimer(timer);
    }

    function searchConversations(query) {
        const conversations = getConversations();

        if (!query.trim()) {
            const currentFilter = getCurrentFilter();
            filterConversations(currentFilter);
            clearSearchDebounceTimer();
            return;
        }

        const currentFilter = getCurrentFilter();
        let baseConversations = [];

        switch (currentFilter) {
            case 'unread':
                baseConversations = Object.values(conversations).filter(c => c.unread > 0);
                break;
            case 'saved': {
                const savedMessages = window.CONFIG?.USERS?.SAVED_MESSAGES || [];
                if (savedMessages.length === 0) {
                    baseConversations = [];
                    break;
                }
                const savedIds = [...new Set(savedMessages.map(msg => parseInt(msg.conversationId)))];
                baseConversations = Object.values(conversations).filter(c => savedIds.includes(parseInt(c.partnerId)));
                baseConversations.forEach(conv => {
                    const partnerId = parseInt(conv.partnerId);
                    conv.savedMessageCount = savedMessages.filter(msg => parseInt(msg.conversationId) === partnerId).length;
                });
                break;
            }
            case 'all':
            default:
                baseConversations = Object.values(conversations);
        }

        const queryLower = query.toLowerCase();
        const filtered = baseConversations.filter(conversation => {
            if (conversation.name?.toLowerCase().includes(queryLower)) {
                return true;
            }
            return conversation.messages && conversation.messages.some(msg =>
                msg.text && msg.text.toLowerCase().includes(queryLower)
            );
        });

        setFilteredConversations(filtered);

        if (typeof window.renderConversations === 'function') {
            window.renderConversations();
        }
    }

    function updateBlockButtonVisibility() {
        const blockButton = document.getElementById('blockUserButton');
        if (!blockButton) {
            return;
        }

        const state = getTalkState();
        const conversations = getConversations();
        const currentConversationKey = state && typeof state.getCurrentConversation === 'function'
            ? state.getCurrentConversation()
            : window.currentConversation;
        const currentUserId = getCurrentUserId();

        if (!currentConversationKey || !conversations[currentConversationKey]) {
            blockButton.style.display = 'none';
            blockButton.style.visibility = 'hidden';
            return;
        }

        const conversation = conversations[currentConversationKey];
        const partnerId = conversation.partnerId;
        let hasReceivedMessages = false;

        if (Array.isArray(conversation.messages)) {
            hasReceivedMessages = conversation.messages.some(message => {
                const senderId = message.sender_id || message.senderId;
                const receiverId = message.receiver_id || message.receiverId;
                return senderId && receiverId &&
                    parseInt(senderId) === parseInt(partnerId) &&
                    parseInt(receiverId) === parseInt(currentUserId);
            });
        }

        if (!hasReceivedMessages) {
            const cache = getMessageCache();
            for (const [key, value] of cache.entries()) {
                if (key.includes(String(partnerId)) && key.includes(String(currentUserId))) {
                    const messages = Array.isArray(value) ? value : value?.messages || [];
                    hasReceivedMessages = messages.some(msg => {
                        const senderId = msg.sender_id || msg.senderId;
                        const receiverId = msg.receiver_id || msg.receiverId;
                        return senderId && receiverId &&
                            parseInt(senderId) === parseInt(partnerId) &&
                            parseInt(receiverId) === parseInt(currentUserId);
                    });
                    if (hasReceivedMessages) {
                        break;
                    }
                }
            }
        }

        if (hasReceivedMessages) {
            blockButton.style.display = 'block';
            blockButton.style.visibility = 'visible';
        } else {
            blockButton.style.display = 'none';
            blockButton.style.visibility = 'hidden';
        }
    }

    function showChatMoreMenu(event) {
        if (event) {
            event.stopPropagation();
        }
        const menu = document.getElementById('chatMoreMenu');
        if (!menu) {
            return;
        }

        const isVisible = menu.style.display !== 'none';
        menu.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            updateBlockButtonVisibility();
            if (typeof window.updateRemoveUserButtonVisibility === 'function') {
                window.updateRemoveUserButtonVisibility();
            }

            const blockButton = document.getElementById('blockUserButton');
            const removeButton = document.getElementById('removeUserButton');
            if ((!blockButton || blockButton.style.display === 'none') &&
                (!removeButton || removeButton.style.display === 'none')) {
                menu.style.display = 'none';
                return;
            }

            const btn = document.getElementById('chatMoreBtn');
            if (btn) {
                const rect = btn.getBoundingClientRect();
                menu.style.top = `${rect.bottom + 5}px`;
                menu.style.right = `${window.innerWidth - rect.right}px`;
            }

            setTimeout(() => {
                const closeMenu = (e) => {
                    if (!menu.contains(e.target) && e.target.id !== 'chatMoreBtn' && !e.target.closest('#chatMoreMenu')) {
                        menu.style.display = 'none';
                        document.removeEventListener('click', closeMenu);
                    }
                };
                document.addEventListener('click', closeMenu);
            }, 0);
        }
    }

    function addCustomFilter() {
        if (typeof window.addNewFilter !== 'function') {
            return;
        }
        window.addNewFilter({
            id: 'custom',
            type: 'dropdown',
            icon: '🔧',
            label: 'Custom',
            options: [
                { value: 'option1', label: 'Option 1', avatar: '1' },
                { value: 'option2', label: 'Option 2', avatar: '2' },
                { value: 'option3', label: 'Option 3', avatar: '3' }
            ],
            searchable: false
        });
    }

    function addMessageTypeFilter() {
        if (typeof window.addNewFilter !== 'function') {
            return;
        }
        window.addNewFilter({
            id: 'messageType',
            type: 'dropdown',
            icon: '💬',
            label: 'Message Type',
            options: [
                { value: 'all', label: 'All Messages', avatar: '💬' },
                { value: 'text', label: 'Text Only', avatar: '📝' },
                { value: 'image', label: 'Images', avatar: '🖼️' },
                { value: 'file', label: 'Files', avatar: '📁' },
                { value: 'link', label: 'Links', avatar: '🔗' }
            ],
            searchable: false
        });
    }

    function addPriorityFilter() {
        if (typeof window.addNewFilter !== 'function') {
            return;
        }
        window.addNewFilter({
            id: 'priority',
            type: 'dropdown',
            icon: '⭐',
            label: 'Priority',
            options: [
                { value: 'all', label: 'All Priorities', avatar: '⭐' },
                { value: 'high', label: 'High Priority', avatar: '🔴' },
                { value: 'medium', label: 'Medium Priority', avatar: '🟡' },
                { value: 'low', label: 'Low Priority', avatar: '🟢' }
            ],
            searchable: false
        });
    }

    function updateNavigationLinks() {
        const links = document.querySelectorAll('a[href*="/profile"], a[href*="/messages"], a[href*="/search"], a[href*="/matches"], a[href*="/activity"], a[href*="/settings"], a[href*="/logout"]');
        links.forEach(link => {
            try {
                const url = new URL(link.href, window.location.origin);
                if (url.searchParams.has('token')) {
                    url.searchParams.delete('token');
                    link.href = url.toString();
                }
            } catch (error) {
                // Ignore malformed URLs
            }
        });
    }

    function cleanupStuckMessages() {
        const stuckMessages = document.querySelectorAll('[data-message-id]');
        stuckMessages.forEach(messageElement => {
            const loadingPlaceholder = messageElement.querySelector('.loading-placeholder');
            const hasActions = messageElement.querySelector('.message-actions');
            if (loadingPlaceholder && !hasActions) {
                loadingPlaceholder.innerHTML = '<div class="image-error-clean"><span>📷 Upload failed or timed out</span></div>';
                if (typeof window.addMessageActions === 'function') {
                    const message = {
                        id: messageElement.getAttribute('data-message-id'),
                        type: messageElement.classList.contains('sent') ? 'sent' : 'received',
                        isUploading: false
                    };
                    window.addMessageActions(messageElement, message);
                }
            }
        });
    }

    function reloadConversation() {
        const state = getTalkState();
        const currentConversationKey = state && typeof state.getCurrentConversation === 'function'
            ? state.getCurrentConversation()
            : window.currentConversation;
        if (!currentConversationKey) {
            return;
        }
        if (typeof window.showNotification === 'function') {
            window.showNotification('🔄 Reloading conversation...', 'info');
        }
        if (typeof window.loadConversation === 'function') {
            window.loadConversation(currentConversationKey);
        }
    }

    function updateLastSeen() {
        // Deprecated placeholder retained for backwards compatibility
    }

    function formatRelativeUnit(value, unit) {
        const safeValue = Math.max(1, Math.floor(value));
        return `${safeValue} ${unit}${safeValue === 1 ? '' : 's'} ago`;
    }

    function describeElapsed(diffMs) {
        if (!Number.isFinite(diffMs)) {
            return 'Unknown time';
        }
        const nonNegative = Math.max(0, diffMs);
        const seconds = Math.floor(nonNegative / 1000);
        if (seconds < 60) {
            return formatRelativeUnit(seconds || 1, 'second');
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return formatRelativeUnit(minutes, 'minute');
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return formatRelativeUnit(hours, 'hour');
        }
        const days = Math.floor(hours / 24);
        if (days < 7) {
            return formatRelativeUnit(days, 'day');
        }
        const weeks = Math.floor(days / 7);
        if (weeks < 4) {
            return formatRelativeUnit(weeks, 'week');
        }
        const months = Math.max(1, Math.floor(days / 30));
        if (months < 12) {
            return formatRelativeUnit(months, 'month');
        }
        const years = Math.floor(days / 365);
        return formatRelativeUnit(years, 'year');
    }

    function formatMessageTime(timestamp) {
        if (!timestamp) {
            return 'Unknown time';
        }

        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return 'Invalid time';
        }

        const now = new Date();
        let diff = now - date;
        if (diff < 0) {
            diff = 0; // clamp clock drift that would otherwise label messages as "Future time"
        }
        const timeString = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const relativeTime = describeElapsed(diff);

        const dateString = date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
        if (date.toDateString() === now.toDateString()) {
            return `<span style="font-size: 80%;">${timeString}</span> <span style="font-size: 90%;">(${relativeTime})</span>`;
        }
        return `<span style="font-size: 80%;">${dateString}, ${timeString}</span> <span style="font-size: 90%;">(${relativeTime})</span>`;
    }

    function formatTimeAgo(dateString) {
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) {
            return 'Unknown time';
        }
        return describeElapsed(Date.now() - date.getTime());
    }

    function createEnhancedLoadingPlaceholder() {
        const placeholder = document.createElement('div');
        placeholder.className = 'enhanced-loading-placeholder';
        placeholder.style.display = 'none';
        return placeholder;
    }

    window.cleanupCache = cleanupCache;
    window.filterOutRecalledMessages = filterOutRecalledMessages;
    window.getCurrentConversationCacheKey = getCurrentConversationCacheKey;
    window.getCurrentConversationId = getCurrentConversationId;
    window.getCurrentFilter = getCurrentFilter;
    window.findMessageById = findMessageById;
    window.validateConversation = validateConversation;
    window.createError = createError;
    window.validateMessageAndUser = validateMessageAndUser;
    window.isPresenceSystemEnabled = isPresenceSystemEnabled;
    window.markConversationAsRead = markConversationAsRead;
    window.markMessageAsRead = markMessageAsRead;
    window.checkMessageReadStatus = checkMessageReadStatus;
    window.filterConversations = filterConversations;
    window.debouncedSearchConversations = debouncedSearchConversations;
    window.searchConversations = searchConversations;
    window.updateBlockButtonVisibility = updateBlockButtonVisibility;
    window.showChatMoreMenu = showChatMoreMenu;
    window.addCustomFilter = addCustomFilter;
    window.addMessageTypeFilter = addMessageTypeFilter;
    window.addPriorityFilter = addPriorityFilter;
    window.updateNavigationLinks = updateNavigationLinks;
    window.cleanupStuckMessages = cleanupStuckMessages;
    window.reloadConversation = reloadConversation;
    window.updateLastSeen = updateLastSeen;
    window.formatMessageTime = formatMessageTime;
    window.formatTimeAgo = formatTimeAgo;
    window.createEnhancedLoadingPlaceholder = createEnhancedLoadingPlaceholder;
})(window, document);
