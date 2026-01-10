/**
 * TALK APP INITIALIZATION
 * Handles app initialization, event listeners setup, and smart refresh
 * Extracted from talk.html (lines 374-535)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - CONFIG (talk_config.js)
 * - Global functions: loadConversations, populateSenderFilterFromConversations, setupFilterDropdowns,
 *   initializeWebSocket, refreshSavedMessages, loadMessages, debouncedLoadConversations,
 *   debouncedSearchConversations, filterConversations, getCurrentFilter, updateCharacterCounter,
 *   sendTypingIndicator, sendMessage, showNotification, cleanupCache, renderMessages
 * - Global variables: window.socket, window.isSocketConnected, window.safeSocketEmit, window.io
 */

/**
 * Track last load time for smart refresh
 * @type {number|null}
 */
// Use window object to prevent duplicate declaration errors if script loads twice
if (typeof window.lastLoadTime === 'undefined') {
    window.lastLoadTime = null;
}

/**
 * Initialize the application
 * Sets up all event listeners, WebSocket, smart refresh, and saved messages
 * @returns {Promise<void>}
 * @example
 * // Initialize the app on page load
 * await initApp();
 */
async function initApp() {
    // Hide back button on initial load (only show when chat is opened)
    const backBtn = document.getElementById('chatBackBtn');
    if (backBtn) {
        backBtn.style.display = 'none';
    }
    
    // Load conversations first
    if (typeof loadConversations === 'function') {
        await loadConversations();
    }
    
    // Populate "Search in chat" sender filter dynamically from loaded conversations
    if (typeof populateSenderFilterFromConversations === 'function') {
        populateSenderFilterFromConversations();
    }
    
    // Setup event listeners
    setupEventListeners();

    // Initialize WebSocket for real-time features
    if (typeof initializeWebSocket === 'function') {
        initializeWebSocket();
    }

    // Setup smart refresh and background sync
    setupSmartRefresh();

    // Initialize saved messages from database
    if (typeof refreshSavedMessages === 'function') {
        refreshSavedMessages();
    }

    // Check if there's a current conversation with recalled messages and refresh if needed
    const currentConversation = TalkState.getCurrentConversation();
    const conversations = TalkState.getConversations();
    if (currentConversation && conversations[currentConversation]) {
        const conversation = conversations[currentConversation];
        const hasRecalledMessages = conversation.messages && conversation.messages.some(msg => msg.recall_type && msg.recall_type !== 'none');
        if (hasRecalledMessages) {
            // Force refresh to ensure recalled messages are properly displayed
            if (typeof loadMessages === 'function') {
                await loadMessages(conversation, { forceRefresh: true, offset: 0, limit: 10 });
            }
        }
    }

    // Expose loadConversations globally so other pages can trigger refresh
    if (typeof loadConversations === 'function') {
        window.loadConversations = loadConversations;
    }

    // Listen for unblock events from activity page
    window.addEventListener('userUnblocked', async (event) => {
        const { unblockedUserId } = event.detail;
        const currentUserId = TalkState.getCurrentUserId();
        
        // OPTIMIZED: Selective cache invalidation instead of clearing all
        const messageCache = TalkState.getMessageCache ? TalkState.getMessageCache() : (window.messageCache || new Map());
        const conversationCache = TalkState.getConversationCache ? TalkState.getConversationCache() : (window.conversationCache || new Map());
        
        const cacheKey = `${currentUserId}_${unblockedUserId}`;
        const reverseCacheKey = `${unblockedUserId}_${currentUserId}`;
        if (messageCache && typeof messageCache.delete === 'function') {
            messageCache.delete(cacheKey);
            messageCache.delete(reverseCacheKey);
        }
        if (conversationCache && typeof conversationCache.delete === 'function') {
            conversationCache.delete(`conv_${unblockedUserId}`);
        }
        
        // Clear blocked users cache to force refresh
        if (typeof window.blockedUsersCache !== 'undefined' && window.blockedUsersCache) {
            window.blockedUsersCache.clear();
        }
        if (typeof window.blockedUsersCacheTimestamp !== 'undefined') {
            window.blockedUsersCacheTimestamp = 0;
        }
        
        // Refresh conversations list
        if (typeof loadConversations === 'function') {
            await loadConversations();
        }
        
        // CRITICAL: Handle race condition - reload conversation if currently viewing unblocked user
        const currentConv = TalkState.getCurrentConversation();
        const convs = TalkState.getConversations();
        if (currentConv && convs[currentConv]) {
            const conv = convs[currentConv];
            if (conv.partnerId === unblockedUserId) {
                // Reload messages for the unblocked user
                if (typeof loadMessages === 'function') {
                    await loadMessages(conv, { forceRefresh: true, offset: 0, limit: 10 });
                }
            }
        }
        
        if (typeof showNotification === 'function') {
            showNotification('Conversations refreshed', 'success');
        }
    });

    // Listen for block events from WebSocket
    if (window.io && typeof window.io === 'function') {
        // Use WebSocket-only transport to avoid CSP unsafe-eval violations
        const socket = window.io({
            transports: ['websocket']
        });
        socket.on('user_blocked', (data) => {
            if (typeof showNotification === 'function') {
                showNotification(data.message || 'You have been blocked by this user', 'warning');
            }
            
            // CRITICAL: Fix bidirectional block check
            const currentConv = TalkState.getCurrentConversation();
            const convs = TalkState.getConversations();
            if (currentConv && convs[currentConv]) {
                const conv = convs[currentConv];
                // Check both directions: blocker blocked you OR you blocked them
                if (conv.partnerId === data.blockerId || conv.partnerId === data.blockedId) {
                    // Switch to empty state
                    TalkState.setCurrentConversation(null);
                    const emptyState = document.getElementById('emptyState');
                    const chatHeader = document.getElementById('chatHeader');
                    const messageInputArea = document.getElementById('messageInputArea');
                    const backBtn = document.getElementById('chatBackBtn');
                    if (emptyState) emptyState.style.display = 'block';
                    if (chatHeader) chatHeader.style.display = 'none';
                    if (messageInputArea) messageInputArea.style.display = 'none';
                    // Hide back button when showing empty state
                    if (backBtn) backBtn.style.display = 'none';
                    
                    // On mobile: show sidebar and reset chat area when user is blocked
                    if (window.innerWidth <= 768) {
                        const sidebar = document.querySelector('.sidebar');
                        const chatArea = document.querySelector('.chat-area');
                        if (sidebar) {
                            sidebar.style.display = '';
                        }
                        if (chatArea) {
                            chatArea.style.position = '';
                            chatArea.style.top = '';
                            chatArea.style.left = '';
                            chatArea.style.right = '';
                            chatArea.style.bottom = '';
                            chatArea.style.width = '';
                            chatArea.style.height = '';
                            chatArea.style.zIndex = '';
                            chatArea.style.background = '';
                        }
                    }
                    
                    // Disable input for blocked users
                    const messageInput = document.getElementById('messageInput');
                    if (messageInput) {
                        messageInput.disabled = true;
                        messageInput.placeholder = 'You cannot send messages to this user';
                    }
                }
            }
            
            // Clear blocked users cache
            if (typeof window.blockedUsersCache !== 'undefined' && window.blockedUsersCache) {
                window.blockedUsersCache.clear();
            }
            if (typeof window.blockedUsersCacheTimestamp !== 'undefined') {
                window.blockedUsersCacheTimestamp = 0;
            }
            
            // Refresh conversation list (debounced)
            if (typeof debouncedLoadConversations === 'function') {
                debouncedLoadConversations();
            }
        });

        socket.on('user_unblocked', (data) => {
            if (typeof showNotification === 'function') {
                showNotification(data.message || 'You have been unblocked by this user', 'success');
            }
            
            // Clear blocked users cache
            if (typeof window.blockedUsersCache !== 'undefined' && window.blockedUsersCache) {
                window.blockedUsersCache.clear();
            }
            if (typeof window.blockedUsersCacheTimestamp !== 'undefined') {
                window.blockedUsersCacheTimestamp = 0;
            }
            
            // Re-enable input if it was disabled
            const messageInput = document.getElementById('messageInput');
            if (messageInput) {
                messageInput.disabled = false;
                messageInput.placeholder = 'Type a message...';
            }
            
            // Refresh conversation list (debounced)
            if (typeof debouncedLoadConversations === 'function') {
                debouncedLoadConversations();
            }
        });
    }
}

/**
 * Setup smart refresh for data synchronization
 * Configures periodic refresh intervals for conversations, cache cleanup, and recalled messages
 * @returns {void}
 * @example
 * // Setup smart refresh (called automatically by initApp)
 * setupSmartRefresh();
 */
function setupSmartRefresh() {
    // Refresh conversations every configured interval when page is visible
    setInterval(() => {
        if (!document.hidden) {
            // Don't auto-refresh if user is on the saved or unread tab to prevent resetting the view
            const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
            if (currentFilter === 'saved' || currentFilter === 'unread') {
                return; // Skip refresh when on saved or unread tab
            }
            
            const now = Date.now();
            if (!window.lastLoadTime || now - window.lastLoadTime > CONFIG.TIMEOUTS.REFRESH) {
                if (typeof loadConversations === 'function') {
                    loadConversations();
                }
                window.lastLoadTime = now;
            }
        }
    }, CONFIG.TIMEOUTS.REFRESH);

    // Smart cache cleanup every configured interval
    setInterval(() => {
        if (typeof cleanupCache === 'function') {
            cleanupCache();
        }
    }, CONFIG.TIMEOUTS.CACHE_CLEANUP);

    // Check for recalled messages every configured interval to ensure they stay displayed
    setInterval(() => {
        if (!document.hidden) {
            const currentConv = TalkState.getCurrentConversation();
            const convs = TalkState.getConversations();
            
            // Don't check for recalled messages if user is on the saved or unread tab
            const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
            if (currentFilter === 'saved' || currentFilter === 'unread') {
                return; // Skip recalled message check when on saved or unread tab
            }
            
            if (currentConv && convs[currentConv]) {
                const conversation = convs[currentConv];
                const hasRecalledMessages = conversation.messages && conversation.messages.some(msg => msg.recall_type && msg.recall_type !== 'none');
                if (hasRecalledMessages) {
                    // Check if recalled messages are properly displayed in DOM
                    const recalledElements = document.querySelectorAll('[data-recalled="true"]');
                    const recalledMessageIds = Array.from(recalledElements).map(el => el.getAttribute('data-message-id'));
                    const recalledInMemory = conversation.messages.filter(msg => msg.recall_type && msg.recall_type !== 'none').map(msg => msg.id.toString());

                    // If there's a mismatch, refresh the display
                    if (recalledMessageIds.length !== recalledInMemory.length ||
                        !recalledInMemory.every(id => recalledMessageIds.includes(id))) {
                        if (typeof renderMessages === 'function') {
                            renderMessages(conversation.messages);
                        }
                    }
                }
            }
        }
    }, CONFIG.TIMEOUTS.RECALL_CHECK);
}

/**
 * Setup event listeners for user interactions
 * Configures listeners for search, filters, message input, and keyboard shortcuts
 * @returns {void}
 * @example
 * // Setup event listeners (called automatically by initApp)
 * setupEventListeners();
 */
function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput && typeof debouncedSearchConversations === 'function') {
        searchInput.addEventListener('input', (e) => {
            debouncedSearchConversations(e.target.value);
        });
    }

    // Filter tabs
    document.querySelectorAll('.filter-btn').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            if (typeof filterConversations === 'function') {
                filterConversations(e.target.dataset.filter);
            }
        });
    });

    // Message input
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;

    // Auto-resize textarea and send typing indicator
    let typingTimer = null;
    messageInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';

        // Update character counter
        if (typeof updateCharacterCounter === 'function') {
            updateCharacterCounter();
        }

        // Send typing indicator
        if (typeof sendTypingIndicator === 'function') {
            sendTypingIndicator();
        }

        // Clear previous timer
        if (typingTimer) {
            clearTimeout(typingTimer);
        }

        // Stop typing indicator after configured timeout of inactivity
        typingTimer = setTimeout(() => {
            const socket = window.socket;
            const isSocketConnected = window.isSocketConnected;
            const currentConv = TalkState.getCurrentConversation();
            const convs = TalkState.getConversations();
            
            if (socket && isSocketConnected && currentConv && convs[currentConv]) {
                const conversation = convs[currentConv];
                if (conversation && conversation.partnerId) {
                    // Use safe emit if available, otherwise direct emit
                    if (window.safeSocketEmit) {
                        window.safeSocketEmit('typing', {
                            receiverId: conversation.partnerId,
                            isTyping: false
                        });
                    } else if (typeof window.isAuthenticated !== 'undefined' && window.isAuthenticated) {
                        socket.emit('typing', {
                            receiverId: conversation.partnerId,
                            isTyping: false
                        });
                    }
                }
            }
        }, CONFIG.TIMEOUTS.TYPING_DEBOUNCE);
    });

    // Update character counter on input
    if (typeof updateCharacterCounter === 'function') {
        messageInput.addEventListener('input', updateCharacterCounter);
        messageInput.addEventListener('paste', function() {
            setTimeout(updateCharacterCounter, 10);
        });
    }

    // Send on Enter (but allow Shift+Enter for new line)
    messageInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (typeof sendMessage === 'function') {
                sendMessage();
            }
        }
    });

    // Initialize character counter
    if (typeof updateCharacterCounter === 'function') {
        updateCharacterCounter();
    }

    // Add keyboard shortcuts
    document.addEventListener('keydown', function (e) {
        // Ctrl/Cmd + K to focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (searchInput) {
                searchInput.focus();
            }
        }

        // Escape to clear search
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            if (searchInput) {
                searchInput.value = '';
                if (typeof searchConversations === 'function') {
                    searchConversations('');
                }
            }
        }
    });
}

// Make functions globally available
window.initApp = initApp;
window.setupEventListeners = setupEventListeners;
window.setupSmartRefresh = setupSmartRefresh;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initApp,
        setupEventListeners,
        setupSmartRefresh
    };
}












