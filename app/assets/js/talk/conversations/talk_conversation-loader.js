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
                
                // Ensure lastMessageTimestamp is always a number
                let timestamp = conv.lastMessageTimestamp;
                if (timestamp !== undefined && timestamp !== null) {
                    timestamp = Number(timestamp);
                    if (isNaN(timestamp)) {
                        timestamp = 0;
                    }
                } else {
                    timestamp = 0;
                }
                
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
                // Ensure both are numbers
                const timeA = Number(a.lastMessageTimestamp) || 0;
                const timeB = Number(b.lastMessageTimestamp) || 0;
                
                // If both are 0, maintain original order
                if (timeA === 0 && timeB === 0) {
                    return 0;
                }
                // If only A is 0, B comes first
                if (timeA === 0) {
                    return 1;
                }
                // If only B is 0, A comes first
                if (timeB === 0) {
                    return -1;
                }
                // Both have valid timestamps, sort by timestamp descending (newest first)
                return timeB - timeA;
            });
            
            TalkState.setFilteredConversations(filtered);

            // Render conversations
            if (typeof renderConversations === 'function') {
                renderConversations();
            }
        } else {
            if (typeof handleError === 'function') {
                handleError(data.error || 'Failed to load conversations', 'loadConversations');
            }
        }
    } catch (error) {
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





