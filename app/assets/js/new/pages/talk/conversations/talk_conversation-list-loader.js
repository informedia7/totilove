/**
 * TALK CONVERSATION LOADER
 * Handles loading conversations from the API
 * Extracted from talk.html (lines 531-591)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - CONFIG (talk_config.js)
 * - Utils (talk_utils.js)
 * - Global functions: getUserIdFromToken, handleError, renderConversations
 */

const SESSION_ERROR_REGEX = /invalid or expired session|session expired|authentication required/i;
const redirectToLogin = () => window.location.replace('/login?redirect=' + encodeURIComponent(location.pathname + location.search));

/**
 * Debounced version of loadConversations
 */
const debouncedLoadConversations = Utils.debounce(async function() {
    await loadConversations();
}, 500);

/**
 * Load conversations from API
 */
async function loadConversations() {
    try {
        // Get current user ID from server-injected data or token
        let currentUserId = TalkState.getCurrentUserId() || window.currentUser?.id || getUserIdFromToken();

        if (!currentUserId) {
            return;
        }

        // Update state with current user ID
        TalkState.setCurrentUserId(currentUserId);

        const response = await fetch(`/api/messages/conversations?userId=${currentUserId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            }
        });

        if (!response.ok) {
            if ([401, 403, 419, 440].includes(response.status)) {
                redirectToLogin();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            // Check if email verification is required
            if (data.requiresEmailVerification) {
                // Show message if verification is needed
                if (typeof showNotification === 'function') {
                    showNotification('Please verify your email to view conversations', 'info');
                }
                // Return empty conversations
                renderConversations({});
                return;
            }
            
            // Convert API response to our conversation format
            const conversations = {};
            data.conversations.forEach(conv => {
                // Ensure conversation ID is set correctly - use partnerId as fallback
                const convId = conv.id || conv.partnerId?.toString() || String(conv.partnerId);
                
                // Check if user is deleted - check multiple sources
                const isDeleted = conv.isDeleted === true || 
                                 conv.isDeleted === 'true' ||
                                 conv.name === 'Deleted User' || 
                                 conv.name === 'Account Deactivated';
                
                // Determine is_online from status or explicit is_online property
                const statusLower = (conv.status || 'offline').toLowerCase();
                const isOnline = conv.is_online !== undefined 
                    ? conv.is_online 
                    : statusLower.includes('online');
                
                // Ensure last message timestamp is always numeric
                let timestamp = conv.lastMessageTimestamp;
                if (timestamp !== undefined && timestamp !== null) {
                    timestamp = Number(timestamp);
                    if (isNaN(timestamp)) {
                        timestamp = 0;
                    }
                } else {
                    timestamp = 0;
                }

                // Normalize last seen fields from API (fallback for Presence engine)
                const apiLastSeenAt = conv.lastSeenAt || conv.last_seen_at || null;
                let apiLastSeenTimestamp = conv.lastSeenTimestamp;
                if (apiLastSeenTimestamp !== undefined && apiLastSeenTimestamp !== null) {
                    apiLastSeenTimestamp = Number(apiLastSeenTimestamp);
                    if (isNaN(apiLastSeenTimestamp)) {
                        apiLastSeenTimestamp = apiLastSeenAt ? Date.parse(apiLastSeenAt) || 0 : 0;
                    }
                } else if (apiLastSeenAt) {
                    apiLastSeenTimestamp = Date.parse(apiLastSeenAt) || 0;
                } else {
                    apiLastSeenTimestamp = 0;
                }

                let apiLastSentTimestamp = conv.lastSentTimestamp ?? conv.last_sent_timestamp ?? conv.last_sent_time ?? 0;
                let apiLastReceivedTimestamp = conv.lastReceivedTimestamp ?? conv.last_received_timestamp ?? conv.last_received_time ?? 0;
                apiLastSentTimestamp = Number(apiLastSentTimestamp) || 0;
                apiLastReceivedTimestamp = Number(apiLastReceivedTimestamp) || 0;
                
                conversations[convId] = {
                    id: convId,
                    name: conv.name || 'Unknown User',
                    avatar: conv.avatar || '',
                    status: conv.status || 'Offline',
                    is_online: isOnline,
                    unread: parseInt(conv.unread) || 0,
                    partnerId: parseInt(conv.partnerId) || 0,
                    messages: [], // Messages will be loaded separately
                    lastMessage: conv.lastMessage || 'No messages yet',
                    lastMessageTime: conv.lastMessageTime || '',
                    lastMessageTimestamp: timestamp, // Always a number, never undefined
                    isBlocked: false, // Will be checked and updated
                    isDeleted: isDeleted,
                    lastSeenAt: apiLastSeenAt,
                    lastSeenTimestamp: apiLastSeenTimestamp,
                    lastSentTimestamp: apiLastSentTimestamp,
                    lastReceivedTimestamp: apiLastReceivedTimestamp,
                    savedMessageCount: 0 // Will be calculated below
                };
                
            });
            
            // Calculate saved message counts for all conversations
            const savedMessages = CONFIG.USERS.SAVED_MESSAGES || [];
            Object.values(conversations).forEach(conv => {
                const savedCount = savedMessages.filter(msg => parseInt(msg.conversationId) === parseInt(conv.partnerId)).length;
                conv.savedMessageCount = savedCount;
            });

            // Update state
            TalkState.setConversations(conversations);
            
            // Update filtered conversations based on current filter
            const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
            let filtered = Object.values(conversations);
            
            if (currentFilter === 'unread') {
                filtered = Object.values(conversations).filter(c => c.unread > 0);
            } else if (currentFilter === 'saved') {
                // Get saved messages from database (loaded in CONFIG)
                const savedMessages = CONFIG.USERS.SAVED_MESSAGES || [];
                if (savedMessages.length === 0) {
                    filtered = [];
                } else {
                    const savedConversationIds = [...new Set(savedMessages.map(msg => parseInt(msg.conversationId)))];
                    filtered = Object.values(conversations).filter(c => 
                        savedConversationIds.includes(parseInt(c.partnerId))
                    );
                }
            }
            
            // For 'all' filter, ensure all conversations including deleted users are included
            if (currentFilter === 'all') {
                filtered = Object.values(conversations);
            }
            
            // Sort by last message time (most recent first)
            // Conversations with no messages (timestamp = 0) should go to the bottom
            filtered.sort((a, b) => {
                const sentA = Number(a.lastSentTimestamp) || 0;
                const sentB = Number(b.lastSentTimestamp) || 0;
                if (sentA !== sentB) {
                    return sentB - sentA;
                }

                const receivedA = Number(a.lastReceivedTimestamp) || 0;
                const receivedB = Number(b.lastReceivedTimestamp) || 0;
                if (receivedA !== receivedB) {
                    return receivedB - receivedA;
                }

                const timeA = Number(a.lastMessageTimestamp) || 0;
                const timeB = Number(b.lastMessageTimestamp) || 0;
                if (timeA === 0 && timeB === 0) {
                    return 0;
                }
                if (timeA === 0) {
                    return 1;
                }
                if (timeB === 0) {
                    return -1;
                }
                return timeB - timeA;
            });
            
            TalkState.setFilteredConversations(filtered);

            // Render conversations
            if (typeof renderConversations === 'function') {
                renderConversations();
            }
        } else {
            if (SESSION_ERROR_REGEX.test(data.error || '')) {
                redirectToLogin();
                return;
            }
            if (typeof handleError === 'function') {
                handleError(data.error || 'Failed to load conversations', 'loadConversations');
            }
        }
    } catch (error) {
        if (SESSION_ERROR_REGEX.test(error?.message || '')) {
            redirectToLogin();
            return;
        }
        if (typeof handleError === 'function') {
            handleError(error, 'loadConversations');
        }
    }
}

// Make functions globally available
window.loadConversations = loadConversations;
window.debouncedLoadConversations = debouncedLoadConversations;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadConversations,
        debouncedLoadConversations
    };
}





