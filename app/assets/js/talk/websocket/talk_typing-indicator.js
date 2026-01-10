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

/**
 * Show typing indicator
 * @param {string|null} real_name - Username to display (default: 'Someone')
 */
function showTypingIndicator(real_name = null) {
    // Remove existing typing indicator
    hideTypingIndicator();

    const messagesArea = document.getElementById('messagesArea');
    if (!messagesArea) return;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'message received typing-indicator-container';
    typingDiv.id = 'typingIndicator';

    const displayName = real_name || 'Someone';

    typingDiv.innerHTML = `
        <div class="typing-indicator">
            <span>${displayName} typing</span>
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;

    messagesArea.appendChild(typingDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    currentTypingIndicator = typingDiv;

    // Auto-remove after configured timeout
    typingTimeout = setTimeout(() => {
        hideTypingIndicator();
    }, CONFIG.TIMEOUTS.TYPING_INDICATOR);
}

/**
 * Hide typing indicator
 */
function hideTypingIndicator() {
    if (currentTypingIndicator) {
        currentTypingIndicator.remove();
        currentTypingIndicator = null;
    }

    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
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












