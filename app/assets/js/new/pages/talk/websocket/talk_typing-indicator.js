/**
 * TALK TYPING INDICATOR
 * Handles typing indicators (show, hide, send)
 * Extracted from talk.html (lines 705-762, 1940-1962)
 * 
 * Dependencies:
 * - CONFIG (talk_config.js)
 * - TalkState (talk_state.js)
 * - Global functions: showNotification
 * - Global variables: socket, isSocketConnected, currentConversation, conversations
 */

// Typing indicator state
let currentTypingIndicator = null;
let typingTimeout = null;

function resolveTypingDisplayName(real_name) {
    if (real_name && typeof real_name === 'string' && real_name.trim()) {
        return real_name.trim();
    }

    const state = typeof TalkState !== 'undefined' ? TalkState : null;
    const conversations = state && typeof state.getConversations === 'function'
        ? state.getConversations()
        : window.conversations;
    const currentConversationKey = state && typeof state.getCurrentConversation === 'function'
        ? state.getCurrentConversation()
        : window.currentConversation;

    if (currentConversationKey && conversations && conversations[currentConversationKey]?.name) {
        return conversations[currentConversationKey].name;
    }

    return 'Someone';
}

/**
 * Show typing indicator
 * @param {string|null} real_name - Username to display (default: partner name)
 */
function showTypingIndicator(real_name = null) {
    hideTypingIndicator();

    const typingContainer = document.getElementById('typingStatusInline');
    const typingText = document.getElementById('typingStatusText');
    if (!typingContainer || !typingText) {
        return;
    }

    const displayName = resolveTypingDisplayName(real_name);
    typingText.textContent = `${displayName} typing.`;
    typingContainer.classList.remove('is-hidden');

    currentTypingIndicator = typingContainer;

    typingTimeout = setTimeout(() => {
        hideTypingIndicator();
    }, CONFIG.TIMEOUTS.TYPING_INDICATOR);
}

/**
 * Hide typing indicator
 */
function hideTypingIndicator() {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }

    const typingContainer = document.getElementById('typingStatusInline');
    const typingText = document.getElementById('typingStatusText');

    if (typingContainer) {
        typingContainer.classList.add('is-hidden');
    }

    if (typingText) {
        typingText.textContent = '';
    }

    currentTypingIndicator = null;
}


/**
 * Send typing indicator to server
 */
function sendTypingIndicator() {
    const socket = window.socket;
    const isSocketConnected = window.isSocketConnected;
    const currentConversation = TalkState ? TalkState.getCurrentConversation() : window.currentConversation;
    const conversations = TalkState ? TalkState.getConversations() : window.conversations;

    if (!socket || !isSocketConnected || !currentConversation) {
        return;
    }

    const conversation = conversations[currentConversation];
    if (!conversation || !conversation.partnerId) {
        return;
    }

    // SECURITY: Use safe emit if available
    if (window.safeSocketEmit) {
        window.safeSocketEmit('typing', {
            receiverId: conversation.partnerId,
            isTyping: true
        });
    } else if (window.isAuthenticated) {
        socket.emit('typing', {
            receiverId: conversation.partnerId,
            isTyping: true
        });
    }
}

// Make functions globally available
window.showTypingIndicator = showTypingIndicator;
window.hideTypingIndicator = hideTypingIndicator;
window.sendTypingIndicator = sendTypingIndicator;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showTypingIndicator,
        hideTypingIndicator,
        sendTypingIndicator
    };
}












