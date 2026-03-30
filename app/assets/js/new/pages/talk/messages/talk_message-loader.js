/**
 * TALK MESSAGE LOADER
 * Handles loading messages from the API with caching
 * Extracted from talk.html (lines 543-694)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - CONFIG (talk_config.js)
 * - Global functions: getUserIdFromToken, validateConversation, checkIfBlocked, 
 *   getCurrentFilter, formatMessageTime, renderMessages, showNotification
 */

function ensureConversationListVisibleOnMobile() {
    if (typeof showConversationListOnMobile === 'function') {
        showConversationListOnMobile();
        return;
    }
    if (window.innerWidth > 768) {
        return;
    }
    if (window.TalkNavigationState && typeof window.TalkNavigationState.setState === 'function') {
        window.TalkNavigationState.setState('NAV_CONVERSATIONS_LIST');
        return;
    }
    if (document && document.body) {
        document.body.dataset.navState = 'NAV_CONVERSATIONS_LIST';
        document.body.classList.add('nav-conversations');
        document.body.classList.remove('nav-chat');
    }
}

/**
 * Load messages for a conversation
 */
async function loadMessages(conversation, options = {}) {
    let { forceRefresh = false, offset = 0, limit = null, prepend = false, before = null, beforeId = null, forSearch = false } = options;
    
    // Prevent loading if pagination is currently navigating (unless this is the pagination load itself with forceRefresh)
    if (typeof isNavigatingPage === 'function' && isNavigatingPage() && offset === 0 && !forceRefresh) {
        // Skip non-forced loads during pagination navigation to prevent duplicate loads
        return;
    }
    
    // Cursor-based pagination (preferred) or offset-based (fallback)
    const useCursor = before !== null || beforeId !== null;
    
    // Default limit: 10 for initial load, 10 for pagination
    const defaultLimit = limit !== null ? limit : (offset === 0 && !useCursor ? 10 : 10);
    const actualLimit = defaultLimit;

    // Ensure currentUserId is set
    let currentUserId = TalkState.getCurrentUserId();
    if (!currentUserId) {
        currentUserId = window.currentUser?.id || (typeof getUserIdFromToken === 'function' ? getUserIdFromToken() : null);
        if (currentUserId) {
            TalkState.setCurrentUserId(currentUserId);
        }
    }

    // Safety check for conversation parameter - do this early
    if (!conversation || !currentUserId || (typeof validateConversation === 'function' && !validateConversation(conversation))) {
        return;
    }

    // CRITICAL: Check if user is blocked before loading messages
    try {
        if (typeof checkIfBlocked === 'function') {
            const isBlocked = await checkIfBlocked(currentUserId, conversation.partnerId);
            if (isBlocked) {
                if (typeof showNotification === 'function') {
                    showNotification('This user has blocked you or you have blocked them', 'warning');
                }
                // Switch to empty state
                TalkState.setCurrentConversation(null);
                const emptyState = document.getElementById('emptyState');
                const chatHeader = document.getElementById('chatHeader');
                const messageInputArea = document.getElementById('messageInputArea');
                if (emptyState) emptyState.style.display = 'flex';
                if (chatHeader) {
                    chatHeader.style.display = 'none';
                    chatHeader.classList.remove('is-active');
                }
                if (messageInputArea) messageInputArea.style.display = 'none';
                
                ensureConversationListVisibleOnMobile();
                return;
            }
        }
    } catch (error) {
        // Continue loading if check fails (fail open)
    }

    // Define cacheKey early so it's available in catch block
    const cacheKey = `${currentUserId}_${conversation.partnerId}`;
    const messageCache = TalkState.getMessageCache();
    const loadingStates = TalkState.getLoadingStates();

    // If we're on saved or unread tab, don't load all messages - this should be handled in selectConversation
    const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
    if (currentFilter === 'saved' || currentFilter === 'unread') {
        // This should not happen if selectConversation is working correctly
        // But as a safety check, return early
        return;
    }

    // Force refresh if any messages in the conversation were recalled
    const conversations = TalkState.getConversations();
    if (!forceRefresh && conversation.messages) {
        const hasRecalledMessages = conversation.messages.some(msg => msg.recall_type && msg.recall_type !== 'none');
        if (hasRecalledMessages) {
            forceRefresh = true;
        }
    }

    try {
        const now = Date.now();
        const CACHE_DURATION = CONFIG.LIMITS.CACHE_DURATION || 60000;

        // Always fetch fresh data from database for images, don't rely on DOM cache for conversations with attachments
        // Check message cache first for non-forced refresh (only for initial load with offset=0, not pagination)
        // IMPORTANT: Skip cache if offset > 0 (pagination) to always fetch fresh from database
        if (!forceRefresh && !prepend && offset === 0 && messageCache.has(cacheKey)) {
            const cached = messageCache.get(cacheKey);
            if (now - cached.timestamp < CACHE_DURATION) {
                if (typeof renderMessages === 'function') {
                    renderMessages(cached.messages, false);
                }
                return;
            }
        }
        
        // For pagination (offset > 0), always skip cache and fetch from database
        if (offset > 0 && messageCache.has(cacheKey)) {
            messageCache.delete(cacheKey);
        }

        // Prevent duplicate loading
        if (loadingStates.has(cacheKey)) {
            return;
        }

        loadingStates.add(cacheKey);

        // Build URL with cursor-based or offset-based pagination
        let url = `/api/messages/conversation/${currentUserId}/${conversation.partnerId}?limit=${actualLimit}`;
        
        if (useCursor) {
            // Cursor-based pagination (preferred - more reliable)
            // NOTE: Backend needs to support 'before' and 'beforeId' query parameters
            // For now, if backend doesn't support it, it will return an error and we'll fall back
            if (before) {
                url += `&before=${before}`;
            }
            if (beforeId) {
                url += `&beforeId=${beforeId}`;
            }
        } else {
            // Offset-based pagination (fallback for initial load or if cursor not available)
            url += `&offset=${offset}`;
        }
        
        let response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            }
        });

        // If cursor-based pagination fails, fall back to offset-based
        if (!response.ok && useCursor && response.status === 400) {
            // Fall back to offset-based pagination
            const fallbackUrl = `/api/messages/conversation/${currentUserId}/${conversation.partnerId}?limit=${actualLimit}&offset=${offset}`;
            response = await fetch(fallbackUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': currentUserId
                }
            });
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        loadingStates.delete(cacheKey);

        if (data.success) {
            // Resolve conversation key upfront so downstream logic can rely on it
            const currentConversationId = TalkState.getCurrentConversation();
            const conversationKey = currentConversationId ||
                conversation?.id ||
                (conversation?.partnerId ? conversation.partnerId.toString() : null) ||
                Object.keys(conversations).find(key =>
                    conversations[key] && conversations[key].partnerId === conversation.partnerId
                );

            // Store total message count from API if available (for search display)
            // Check multiple possible fields where total count might be stored
            const totalCount = data.total_count || data.totalCount || data.pagination?.total_count || data.pagination?.totalCount || null;
            
            if (totalCount !== null && conversationKey && conversations[conversationKey]) {
                conversations[conversationKey].totalMessageCount = totalCount;
            }
            // Convert API messages to our format
            const messages = data.messages.map((msg) => {
                const senderId = msg.sender_id || msg.senderId;
                const receiverId = msg.receiver_id || msg.receiverId;

                // Determine if message was sent by current user
                const isSentByMe = parseInt(senderId) === currentUserId;

                // Build replyTo object with attachments if available
                let replyTo = null;
                if (msg.replyTo) {
                    // Server sent full replyTo object
                    replyTo = {
                        id: msg.replyTo.id || msg.reply_to_id,
                        text: msg.replyTo.text || msg.reply_to_text,
                        senderId: msg.replyTo.senderId || msg.reply_to_sender,
                        hasImage: msg.replyTo.hasImage || false,
                        attachments: msg.replyTo.attachments || []
                    };
                } else if (msg.reply_to_id) {
                    // Old format - need to look up original message for attachments
                    replyTo = {
                        id: msg.reply_to_id,
                        text: msg.reply_to_text,
                        senderId: msg.reply_to_sender,
                        hasImage: false,
                        attachments: []
                    };
                    
                    // Try to find the original message in the loaded messages to get attachments
                    const originalMsg = data.messages.find(m => m.id == msg.reply_to_id);
                    if (originalMsg && originalMsg.attachments && originalMsg.attachments.length > 0) {
                        const imageAttachments = originalMsg.attachments.filter(att => att.attachment_type === 'image');
                        if (imageAttachments.length > 0) {
                            replyTo.hasImage = true;
                            replyTo.attachments = imageAttachments;
                        }
                    } else {
                        // If not found in current batch, try to get from conversation state
                        const conversations = TalkState.getConversations();
                        const currentConversation = TalkState.getCurrentConversation();
                        if (currentConversation && conversations[currentConversation] && conversations[currentConversation].messages) {
                            const originalMsgInState = conversations[currentConversation].messages.find(m => m.id == msg.reply_to_id);
                            if (originalMsgInState && originalMsgInState.attachments && originalMsgInState.attachments.length > 0) {
                                const imageAttachments = originalMsgInState.attachments.filter(att => att.attachment_type === 'image');
                                if (imageAttachments.length > 0) {
                                    replyTo.hasImage = true;
                                    replyTo.attachments = imageAttachments;
                                }
                            }
                        }
                    }
                }
                
                // If replyTo exists but has no attachments, try to enrich it from conversation state
                if (replyTo && (!replyTo.attachments || replyTo.attachments.length === 0)) {
                    const conversations = TalkState.getConversations();
                    const currentConversation = TalkState.getCurrentConversation();
                    if (currentConversation && conversations[currentConversation] && conversations[currentConversation].messages) {
                        const originalMsg = conversations[currentConversation].messages.find(m => m.id == replyTo.id);
                        if (originalMsg && originalMsg.attachments && originalMsg.attachments.length > 0) {
                            const imageAttachments = originalMsg.attachments.filter(att => att.attachment_type === 'image');
                            if (imageAttachments.length > 0) {
                                replyTo.hasImage = true;
                                replyTo.attachments = imageAttachments;
                            }
                        }
                    }
                }

                const mappedMessage = {
                    type: isSentByMe ? 'sent' : 'received',
                    text: msg.content,
                    // Don't set time property - factory will format from timestamp (database source)
                    // time: typeof formatMessageTime === 'function' ? formatMessageTime(msg.timestamp) : new Date(msg.timestamp).toLocaleTimeString(),
                    id: msg.id,
                    isRead: msg.is_read || msg.isRead,
                    attachments: msg.attachments || [],
                    hasAttachments: (msg.attachment_count || 0) > 0 || (msg.attachments && msg.attachments.length > 0),
                    // Preserve both ends of the message so filters can distinguish
                    sender_id: senderId,
                    receiver_id: receiverId,
                    senderId: senderId,
                    receiverId: receiverId,
                    content: msg.content,
                    timestamp: msg.timestamp, // CRITICAL: Database timestamp is the single source of truth
                    // Add recall fields to maintain recall state
                    recall_type: msg.recall_type || 'none',
                    recalled_at: msg.recalled_at || null, // When message was recalled (from database)
                    // Preserve reply information from server (include attachments if available)
                    replyTo: replyTo,
                    // Deleted user flag
                    is_sender_deleted: msg.is_sender_deleted || msg.isSenderDeleted || false,
                    sender_real_name: msg.sender_real_name || null
                };

                return mappedMessage;
            });

            // Handle message merging for pagination using the resolved conversationKey
            
            // 🔥 CRITICAL: For search, use separate message storage (searchMessages)
            // This keeps search independent from main chat window
            if (forSearch) {
                if (conversationKey && conversations[conversationKey]) {
                    // Initialize searchMessages if it doesn't exist
                    if (!conversations[conversationKey].searchMessages) {
                        conversations[conversationKey].searchMessages = [];
                    }
                    
                    if (prepend) {
                        // Prepend older messages (for scroll loading)
                        const existingIds = new Set(conversations[conversationKey].searchMessages.map(m => m.id.toString()));
                        const newMessages = messages.filter(m => !existingIds.has(m.id.toString()));
                        conversations[conversationKey].searchMessages = newMessages.concat(conversations[conversationKey].searchMessages);
                    } else {
                        // Append new messages (for incremental loading with offset)
                        const existingIds = new Set(conversations[conversationKey].searchMessages.map(m => m.id.toString()));
                        const newMessages = messages.filter(m => !existingIds.has(m.id.toString()));
                        conversations[conversationKey].searchMessages = conversations[conversationKey].searchMessages.concat(newMessages);
                    }
                }
            } else {
                // Main chat window - use regular messages array
                if (prepend && conversationKey && conversations[conversationKey] && conversations[conversationKey].messages) {
                    // Prepend older messages to existing messages
                    // Filter out duplicates by message ID
                    const existingIds = new Set(conversations[conversationKey].messages.map(m => m.id.toString()));
                    const newMessages = messages.filter(m => !existingIds.has(m.id.toString()));
                    
                    conversations[conversationKey].messages = newMessages.concat(conversations[conversationKey].messages);
                    
                    // If all messages were duplicates, mark this in the conversation
                    if (newMessages.length === 0 && messages.length > 0) {
                        conversations[conversationKey]._allMessagesDuplicates = true;
                    }
                } else if (!prepend) {
                    // Page navigation (any offset) or initial load (offset = 0): replace all messages
                    // IMPORTANT: Always replace messages for pagination, never accumulate
                    if (conversationKey && conversations[conversationKey]) {
                        conversations[conversationKey].messages = messages;
                    }
                } else {
                    // Prepend mode (for scroll-based lazy loading - page 2+)
                    // Filter out duplicates and prepend older messages to the beginning
                    if (conversationKey && conversations[conversationKey] && conversations[conversationKey].messages) {
                        const existingIds = new Set(conversations[conversationKey].messages.map(m => m.id.toString()));
                        const newMessages = messages.filter(m => !existingIds.has(m.id.toString()));
                        // Prepend new messages to the beginning (older messages go first)
                        conversations[conversationKey].messages = newMessages.concat(conversations[conversationKey].messages);
                    } else if (conversationKey && conversations[conversationKey]) {
                        conversations[conversationKey].messages = messages;
                    }
                }
            }
            
            if (!conversationKey) {
                console.error('Could not find conversation key for merging messages');
            }
            
            TalkState.setConversations(conversations);

            // Only render messages in main chat if not loading for search
            // Search panel handles its own rendering separately
            if (!forSearch && typeof renderMessages === 'function') {
                renderMessages(messages, prepend);
            }
            
            // Update pagination after loading (only for non-prepend loads, i.e., page navigation)
            // Skip pagination update for search loads
            if (!forSearch && !prepend && typeof updatePaginationAfterLoad === 'function' && conversationKey && conversations[conversationKey]) {
                updatePaginationAfterLoad(conversations[conversationKey], messages.length);
            }
        } else {
            loadingStates.delete(cacheKey);
        }
    } catch (error) {
        loadingStates.delete(cacheKey);
        if (typeof showNotification === 'function') {
            showNotification('Failed to load messages', 'error');
        }
    }
}

// Make function globally available
window.loadMessages = loadMessages;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadMessages
    };
}













