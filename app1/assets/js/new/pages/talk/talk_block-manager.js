/**
 * TALK BLOCK MANAGER
 * Handles user blocking functionality
 * Extracted from talk.html (lines 944-1052)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - CONFIG (talk_config.js)
 * - Global functions: showNotification, handleError, loadConversations, getCurrentUserId
 * - Global variables: messageCache (from TalkState or global)
 * - Global variables: blockedUsersCache, blockedUsersCacheTimestamp (if used)
 */

function showConversationListAfterBlock() {
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
 * Store pending block user data
 * @type {number|null}
 */
let pendingBlockUserId = null;

/**
 * Store pending block user name
 * @type {string|null}
 */
let pendingBlockUserName = null;

/**
 * Block current user from chat
 * Shows confirmation modal before blocking
 * Checks if user has received messages from the partner before allowing block
 * @returns {void}
 * @example
 * // Block the current conversation partner
 * blockCurrentUser();
 */
function blockCurrentUser() {
    const currentConversation = TalkState.getCurrentConversation();
    const conversations = TalkState.getConversations();
    
    if (!currentConversation || !conversations[currentConversation]) {
        if (typeof showNotification === 'function') {
            showNotification('No conversation selected', 'error');
        }
        return;
    }
    
    const conversation = conversations[currentConversation];
    const partnerId = conversation.partnerId;
    const partnerName = conversation.name;
    const currentUserId = TalkState.getCurrentUserId();
    
    // Check if user has received any messages from this partner
    const hasReceivedMessages = checkIfReceivedMessages(conversation, partnerId, currentUserId);
    
    if (!hasReceivedMessages) {
        // User hasn't received messages from this partner - don't allow blocking
        if (typeof showNotification === 'function') {
            showNotification('You can only block users who have sent you messages', 'error');
        }
        
        // Close menu
        const menu = document.getElementById('chatMoreMenu');
        if (menu) {
            menu.style.display = 'none';
        }
        return;
    }
    
    // Store for confirmation
    pendingBlockUserId = partnerId;
    pendingBlockUserName = partnerName;
    
    // Show inline confirmation modal positioned above the block button (3-dots menu)
    // Use class selector to target the inline modal, not the universal one
    const blockConfirmModal = document.querySelector('.remove-user-modal#blockConfirmModal');
    const blockButton = document.getElementById('blockUserButton');
    
    if (blockConfirmModal && blockButton) {
        const blockUsernameEl = blockConfirmModal.querySelector('#blockUsername');
        if (blockUsernameEl) {
            blockUsernameEl.textContent = partnerName;
        }
        
        // Get button position
        const buttonRect = blockButton.getBoundingClientRect();
        const modalContent = blockConfirmModal.querySelector('.remove-user-content');
        
        if (modalContent) {
            // Position modal above the button
            const modalHeight = 120; // Approximate height
            const spacing = 8; // Space between button and modal
            
            blockConfirmModal.style.display = 'block';
            blockConfirmModal.style.top = (buttonRect.top - modalHeight - spacing) + 'px';
            blockConfirmModal.style.left = (buttonRect.left + (buttonRect.width / 2)) + 'px';
            blockConfirmModal.style.transform = 'translateX(-50%)';
            
            // Adjust if modal goes off screen
            setTimeout(() => {
                const modalRect = modalContent.getBoundingClientRect();
                if (modalRect.top < 10) {
                    // Position below button if not enough space above
                    blockConfirmModal.style.top = (buttonRect.bottom + spacing) + 'px';
                }
                if (modalRect.left < 10) {
                    blockConfirmModal.style.left = '10px';
                    blockConfirmModal.style.transform = 'none';
                } else if (modalRect.right > window.innerWidth - 10) {
                    blockConfirmModal.style.left = (window.innerWidth - modalRect.width - 10) + 'px';
                    blockConfirmModal.style.transform = 'none';
                }
            }, 0);
        }
        
        // Close modal when clicking outside
        const closeOnOutsideClick = (e) => {
            if (!blockConfirmModal.contains(e.target) && !blockButton.contains(e.target)) {
                closeBlockConfirm();
                document.removeEventListener('click', closeOnOutsideClick);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeOnOutsideClick);
        }, 0);
    }
    
    // Close menu
    const menu = document.getElementById('chatMoreMenu');
    if (menu) {
        menu.style.display = 'none';
    }
}

/**
 * Check if current user has received messages from the partner
 * @param {Object} conversation - The conversation object
 * @param {number} partnerId - The partner's user ID
 * @param {number} currentUserId - The current user's ID
 * @returns {boolean} True if user has received messages, false otherwise
 */
function checkIfReceivedMessages(conversation, partnerId, currentUserId) {
    // Check messages in the conversation object
    if (conversation.messages && Array.isArray(conversation.messages)) {
        // Check if any message has partner as sender and current user as receiver
        const hasReceived = conversation.messages.some(message => {
            const senderId = message.sender_id || message.senderId;
            const receiverId = message.receiver_id || message.receiverId;
            
            // Check if message was sent by partner (sender) to current user (receiver)
            return senderId && 
                   parseInt(senderId) === parseInt(partnerId) &&
                   receiverId &&
                   parseInt(receiverId) === parseInt(currentUserId);
        });
        
        if (hasReceived) {
            return true;
        }
    }
    
    // If no messages in conversation object, check via cache/API
    return checkReceivedMessagesViaAPI(partnerId, currentUserId);
}

/**
 * Check if user has received messages via cache
 * @param {number} partnerId - The partner's user ID
 * @param {number} currentUserId - The current user's ID
 * @returns {boolean} True if user has received messages (synchronous check via cache)
 */
function checkReceivedMessagesViaAPI(partnerId, currentUserId) {
    // Try to check message cache if available
    const messageCache = TalkState.getMessageCache ? TalkState.getMessageCache() : (window.messageCache || new Map());
    if (messageCache && messageCache.size > 0) {
        // Check cache for any messages from partner to current user
        for (const [key, value] of messageCache.entries()) {
            if (key.includes(partnerId.toString()) && key.includes(currentUserId.toString())) {
                const messages = Array.isArray(value) ? value : (value.messages || []);
                if (messages.some(msg => {
                    const senderId = msg.sender_id || msg.senderId;
                    const receiverId = msg.receiver_id || msg.receiverId;
                    // Verify message was sent by partner to current user
                    return senderId && 
                           parseInt(senderId) === parseInt(partnerId) &&
                           receiverId &&
                           parseInt(receiverId) === parseInt(currentUserId);
                })) {
                    return true;
                }
            }
        }
    }
    
    // Default to false if we can't determine
    // This prevents blocking if we can't verify messages were received
    return false;
}

/**
 * Close block confirmation modal
 * Resets pending block data
 * @returns {void}
 * @example
 * // Close the block confirmation modal
 * closeBlockConfirm();
 */
function closeBlockConfirm() {
    // Close inline modal (for 3-dots menu)
    const blockConfirmModal = document.querySelector('.remove-user-modal#blockConfirmModal');
    if (blockConfirmModal) {
        blockConfirmModal.style.display = 'none';
    }
    
    // Also close universal modal if it exists (for user profile modal)
    const universalModal = document.querySelector('.block-confirm-modal');
    if (universalModal) {
        universalModal.style.display = 'none';
    }
    
    pendingBlockUserId = null;
    pendingBlockUserName = null;
    
    // Remove any event listeners
    // Event listener is removed automatically when modal closes
    
    // Also clear window-level pending block data (for profile modal)
    if (typeof window !== 'undefined') {
        window.pendingBlockUserId = null;
        window.pendingBlockContext = null;
    }
}

/**
 * Confirm block action
 * Executes the block operation, clears caches, and updates UI
 * @returns {Promise<void>}
 * @throws {Error} If block operation fails
 * @example
 * // Confirm blocking the pending user
 * await confirmBlock();
 */
async function confirmBlock() {
    // Support both module-level pendingBlockUserId and window.pendingBlockUserId (for profile modal)
    const userIdToBlock = pendingBlockUserId || window.pendingBlockUserId;
    if (!userIdToBlock) {
        closeBlockConfirm();
        return;
    }

    const currentUserId = TalkState.getCurrentUserId();
    
    try {
        const response = await fetch(`/api/users/${userIdToBlock}/block`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            },
            body: JSON.stringify({ reason: 'Blocked from chat' })
        });
        
        const data = await response.json();
        if (data.success) {
            if (typeof showNotification === 'function') {
                showNotification('User blocked successfully', 'success');
            }
            
            // Clear blocked users cache if it exists
            if (typeof window.blockedUsersCache !== 'undefined' && window.blockedUsersCache) {
                window.blockedUsersCache.clear();
            }
            if (typeof window.blockedUsersCacheTimestamp !== 'undefined') {
                window.blockedUsersCacheTimestamp = 0;
            }
            
            // Clear messages area
            const messagesArea = document.getElementById('messagesArea');
            if (messagesArea) {
                messagesArea.innerHTML = '';
            }
            
            // Clear conversation from memory
            const conversations = TalkState.getConversations();
            const currentConversation = TalkState.getCurrentConversation();
            if (currentConversation && conversations[currentConversation]) {
                delete conversations[currentConversation];
            }
            
            // Clear message cache for this conversation
            const messageCache = TalkState.getMessageCache ? TalkState.getMessageCache() : (window.messageCache || new Map());
            if (userIdToBlock && messageCache && typeof messageCache.delete === 'function') {
                const cacheKeysToDelete = [];
                for (const key of messageCache.keys()) {
                    if (key.includes(userIdToBlock.toString())) {
                        cacheKeysToDelete.push(key);
                    }
                }
                cacheKeysToDelete.forEach(key => messageCache.delete(key));
            }
            
            // If blocking from profile modal, close the modal
            if (window.pendingBlockContext === 'talk' && typeof closeProfileModal === 'function') {
                closeProfileModal();
            }
            
            // Reset conversation state
            TalkState.setCurrentConversation(null);
            
            // Refresh conversations list (will remove blocked user)
            if (typeof loadConversations === 'function') {
                await loadConversations();
            }
            
            // Switch to empty state
            const emptyState = document.getElementById('emptyState');
            const chatHeader = document.getElementById('chatHeader');
            const messageInputArea = document.getElementById('messageInputArea');
            if (emptyState) emptyState.style.display = 'flex';
            if (chatHeader) chatHeader.style.display = 'none';
            if (messageInputArea) messageInputArea.style.display = 'none';
            
            showConversationListAfterBlock();
            
            // Clear any active conversation highlights
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
            });
        } else {
            if (typeof handleError === 'function') {
                handleError(data.error || 'Failed to block user', 'confirmBlock');
            } else if (typeof showNotification === 'function') {
                showNotification(data.error || 'Failed to block user', 'error');
            }
        }
    } catch (error) {
        if (typeof handleError === 'function') {
            handleError(error, 'confirmBlock');
        } else if (typeof showNotification === 'function') {
            showNotification(`Failed to block user: ${error.message}`, 'error');
        }
    } finally {
        closeBlockConfirm();
    }
}

// Make functions globally available
window.blockCurrentUser = blockCurrentUser;
window.closeBlockConfirm = closeBlockConfirm;
window.confirmBlock = confirmBlock;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        blockCurrentUser,
        closeBlockConfirm,
        confirmBlock
    };
}












