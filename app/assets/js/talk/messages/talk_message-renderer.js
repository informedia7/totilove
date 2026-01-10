/**
 * TALK MESSAGE RENDERER
 * Handles rendering messages in the chat area
 * Updated version: full page, fixes scroll-to-top lazy loading
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - CONFIG (talk_config.js)
 * - MessageFactory (talk_message-factory.js)
 * - Global functions: ensureMessageTime, createMessageElement, markMessageAsRead,
 *   setupScrollLazyLoading, cleanupStuckMessages, hideTypingIndicator, formatMessageTime, loadMessages
 */

/**
 * Ensure message has time property (DEPRECATED - factory uses timestamp directly now)
 */
function ensureMessageTime(message) {
    return message;
}

/**
 * Render messages in the chat area
 */
function renderMessages(messages, prepend = false) {
    const messagesArea = document.getElementById('messagesArea');
    if (!messagesArea) return;

    // For pagination (non-prepend), always clear and replace messages
    if (!prepend) {
        // Clear all messages - we're loading a specific page
        messagesArea.innerHTML = '';
    }

    // Store scroll position for prepend
    let scrollPosition = null;
    let scrollHeight = null;
    if (prepend) {
        scrollHeight = messagesArea.scrollHeight;
        scrollPosition = messagesArea.scrollTop;
    }

    const fragment = document.createDocumentFragment();

    messages.forEach(message => {
        if (prepend && messagesArea.querySelector(`[data-message-id="${message.id}"]`)) return;

        const messageWithTime = ensureMessageTime(message);
        const messageElement = typeof createMessageElement === 'function' ? createMessageElement(messageWithTime) : null;
        if (messageElement) {
            if (message.is_sender_deleted || message.sender_real_name === 'Deleted User') {
                messageElement.classList.add('message-deleted-user');
                messageElement.style.cursor = 'default';
            }
            fragment.appendChild(messageElement);
        }

        // Remove blob message if server version exists
        const blobMsg = messagesArea.querySelector(`[data-blob-message="true"][data-message-id="${message.id}"]`);
        if (blobMsg) {
            const blobImages = blobMsg.querySelectorAll('img[src^="blob:"]');
            blobImages.forEach(img => URL.revokeObjectURL(img.src));
            blobMsg.remove();
        }

        if (message.type === 'received' && !message.isRead && typeof markMessageAsRead === 'function') {
            markMessageAsRead(message.id);
        }
    });

    if (prepend) {
        // Find sentinel if it exists
        const sentinel = messagesArea.querySelector('#messages-lazy-load-sentinel');
        const insertBefore = sentinel || messagesArea.firstChild;
        if (insertBefore) {
            messagesArea.insertBefore(fragment, insertBefore);
        } else {
            messagesArea.appendChild(fragment);
        }
        
        // CRITICAL: Ensure sentinel stays at the top after prepend
        // This prevents the sentinel from being pushed down by prepended messages
        const sentinelAfterPrepend = messagesArea.querySelector('#messages-lazy-load-sentinel');
        if (sentinelAfterPrepend && messagesArea.firstChild !== sentinelAfterPrepend) {
            messagesArea.insertBefore(sentinelAfterPrepend, messagesArea.firstChild);
        }
    } else {
        messagesArea.appendChild(fragment);
    }

    // Setup scroll lazy loading
    if (!prepend) {
        // New conversation or page navigation
        const isInitialLoad = typeof getCurrentPage === 'function' && getCurrentPage() === 1;
        
        if (isInitialLoad) {
            // For initial load (page 1): scroll to bottom FIRST, then setup observer
            // This ensures sentinel at top is not visible when observer is created
            const scrollToBottom = () => { 
                messagesArea.scrollTop = messagesArea.scrollHeight; 
            };
            scrollToBottom();
            setTimeout(scrollToBottom, 50);
            setTimeout(scrollToBottom, 100);
            
            // Wait for scroll to complete, then setup observer
            // The sentinel will be at top but not visible since we're at bottom
            setTimeout(() => {
                setupScrollLazyLoading(messagesArea);
                if (typeof cleanupStuckMessages === 'function') cleanupStuckMessages();
            }, 300);
        } else {
            // For pagination (page > 1): user is already at top, setup immediately
            setupScrollLazyLoading(messagesArea);
        }
    } else {
        // Messages prepended - restore scroll position
        const newScrollHeight = messagesArea.scrollHeight;
        const heightDifference = newScrollHeight - scrollHeight;
        messagesArea.scrollTop = scrollPosition + heightDifference;
    }
}

/**
 * Setup lazy loading for messages when scrolling to top
 * Uses Intersection Observer API for efficient detection
 */
function setupScrollLazyLoading(messagesArea) {
    const MESSAGES_PER_LOAD = 10;
    const SENTINEL_ID = 'messages-lazy-load-sentinel';
    
    // Get current conversation
    const currentConversationId = TalkState.getCurrentConversation();
    if (!currentConversationId) {
        cleanupScrollLazyLoading(messagesArea);
        return;
    }
    
    // Check if observer already exists for this conversation
    const existingState = messagesArea._scrollLoadingState;
    if (existingState && existingState.conversationId === currentConversationId && existingState.observer && existingState.sentinel && existingState.sentinel.parentNode) {
        // Observer already set up for this conversation and sentinel exists
        // Just update hasMore state
        if (typeof getCurrentPage === 'function' && typeof getTotalPages === 'function') {
            const currentPageNum = getCurrentPage();
            const totalPagesNum = getTotalPages();
            existingState.hasMore = currentPageNum < totalPagesNum;
            if (existingState.sentinel) {
                existingState.sentinel.style.display = existingState.hasMore ? '' : 'none';
            }
        }
        return;
    }
    
    // Cleanup existing observer if switching conversations or sentinel was removed
    cleanupScrollLazyLoading(messagesArea);
    
    const conversations = TalkState.getConversations();
    const conversation = conversations[currentConversationId];
    if (!conversation) return;
    
    // Only set up observer if we have messages
    const currentMessageCount = conversation.messages ? conversation.messages.length : 0;
    if (currentMessageCount === 0) {
        // No messages yet - observer will be set up after initial load
        return;
    }
    
    // Get the oldest (first) message - this is our cursor for pagination
    const oldestMessage = conversation.messages[0];
    const cursorMessageId = oldestMessage ? oldestMessage.id : null;
    const cursorTimestamp = oldestMessage && oldestMessage.timestamp ? oldestMessage.timestamp : null;
    
    // Determine if there might be more messages to load
    // Check if we're not on the last page (can go to next page)
    let hasMore = false;
    if (typeof getCurrentPage === 'function' && typeof getTotalPages === 'function') {
        const currentPageNum = getCurrentPage();
        const totalPagesNum = getTotalPages();
        hasMore = currentPageNum < totalPagesNum; // Can go to next page if not on last page
    } else {
        // Fallback: If we have a full batch (10 messages), assume there might be more
        hasMore = currentMessageCount >= MESSAGES_PER_LOAD;
    }
    
    // Initialize state with cursor-based pagination
    const state = {
        conversationId: currentConversationId,
        cursorMessageId: cursorMessageId,      // Oldest loaded message ID (cursor)
        cursorTimestamp: cursorTimestamp,      // Oldest loaded message timestamp (cursor)
        isLoading: false,
        hasMore: hasMore,
        observer: null,
        sentinel: null,
        lastLoadTime: 0,
        reconnectScrollHandler: null
    };
    
    messagesArea._scrollLoadingState = state;
    
    // Create sentinel element at the top
    const sentinel = document.createElement('div');
    sentinel.id = SENTINEL_ID;
    sentinel.style.height = '20px'; // Make it slightly larger for better detection
    sentinel.style.width = '100%';
    sentinel.style.pointerEvents = 'none';
    sentinel.style.flexShrink = '0';
    sentinel.style.position = 'relative';
    
    // Insert sentinel at the top of messages area
    if (messagesArea.firstChild) {
        messagesArea.insertBefore(sentinel, messagesArea.firstChild);
    } else {
        messagesArea.appendChild(sentinel);
    }
    
    state.sentinel = sentinel;
    
    // Load next page when scrolling to top (next page = older messages)
    const loadNextPage = async () => {
        // Verify we're still on the same conversation
        const currentConvId = TalkState.getCurrentConversation();
        if (currentConvId !== state.conversationId) {
            cleanupScrollLazyLoading(messagesArea);
            return;
        }
        
        // Check if pagination is currently navigating (prevent concurrent loads)
        if (typeof isNavigatingPage === 'function' && isNavigatingPage()) {
            return;
        }
        
        // Cooldown: prevent loading if we just loaded within the last 1000ms
        const now = Date.now();
        if (now - state.lastLoadTime < 1000) {
            return;
        }
        
        // Check if already loading
        if (state.isLoading) {
            return;
        }
        
        // Check if we can go to next page (not on last page)
        if (typeof getCurrentPage !== 'function' || typeof getTotalPages !== 'function' || typeof goToNextPage !== 'function') {
            return;
        }
        
        const currentPageNum = getCurrentPage();
        const totalPagesNum = getTotalPages();
        
        if (currentPageNum >= totalPagesNum) {
            // Already on last page, no more messages to load
            state.hasMore = false;
            if (state.sentinel) state.sentinel.style.display = 'none';
            return;
        }
        
        // Set loading state and update last load time
        state.isLoading = true;
        state.lastLoadTime = now;
        
        // Temporarily disconnect observer to prevent triggers during loading
        if (state.observer && state.sentinel) {
            state.observer.unobserve(state.sentinel);
            state.observer._isObserving = false;
        }
        
        try {
            // Navigate to next page using pagination system
            await goToNextPage();
            
            // Update hasMore based on new page number
            const newPageNum = getCurrentPage();
            state.hasMore = newPageNum < totalPagesNum;
            
            if (!state.hasMore && state.sentinel) {
                // On last page now, hide sentinel
                state.sentinel.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading next page:', error);
            state.hasMore = false;
        } finally {
            // Reset loading state
            state.isLoading = false;
            
            // Don't reconnect observer automatically - wait for user to scroll away and back
            // This prevents immediate re-triggers when user is still at top
            // Observer will be reconnected when user scrolls down and then back up
        }
    };
    
    // Create Intersection Observer
    const observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        
        // Early return if already loading or no more messages
        if (state.isLoading || !state.hasMore) {
            return;
        }
        
        // Check if user has scrolled away from bottom (indicates intentional scroll to top)
        const scrollTop = messagesArea.scrollTop;
        const scrollHeight = messagesArea.scrollHeight;
        const clientHeight = messagesArea.clientHeight;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // Within 50px of bottom
        
        // Only trigger if sentinel is visible AND user has scrolled away from bottom
        // This prevents immediate trigger on initial load when sentinel might be visible
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !isAtBottom) {
            // Double-check loading state (race condition protection)
            if (state.isLoading) {
                return;
            }
            
            loadNextPage();
        }
    }, {
        root: messagesArea,
        rootMargin: '0px',
        threshold: 0.5 // Single threshold - only trigger when 50% visible
    });
    
    // Only observe if we're not at the bottom (for initial load, wait until user scrolls)
    const scrollTop = messagesArea.scrollTop;
    const scrollHeight = messagesArea.scrollHeight;
    const clientHeight = messagesArea.clientHeight;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    if (!isAtBottom) {
        // User is not at bottom, safe to observe
        observer.observe(sentinel);
        observer._isObserving = true;
    } else {
        // At bottom - wait for user to scroll up before observing
        // Observer will be connected when user scrolls away from bottom
        observer._isObserving = false;
    }
    
    state.observer = observer;
    
    // Add scroll listener to connect/update observer based on scroll position
    const reconnectObserverOnScroll = () => {
        const scrollTop = messagesArea.scrollTop;
        const scrollHeight = messagesArea.scrollHeight;
        const clientHeight = messagesArea.clientHeight;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        
        // Update hasMore based on current page
        if (typeof getCurrentPage === 'function' && typeof getTotalPages === 'function') {
            const currentPageNum = getCurrentPage();
            const totalPagesNum = getTotalPages();
            state.hasMore = currentPageNum < totalPagesNum;
            
            // Show/hide sentinel based on whether we can go to next page
            if (state.sentinel) {
                state.sentinel.style.display = state.hasMore ? '' : 'none';
            }
        }
        
        // Connect observer when user scrolls away from bottom (towards top)
        // Disconnect when at bottom to prevent immediate triggers
        if (state.observer && state.sentinel && state.hasMore && !state.isLoading) {
            if (!isAtBottom && !state.observer._isObserving) {
                // User has scrolled up - safe to observe sentinel
                state.observer.observe(state.sentinel);
                state.observer._isObserving = true;
            } else if (isAtBottom && state.observer._isObserving) {
                // User is at bottom - disconnect to prevent triggers
                state.observer.unobserve(state.sentinel);
                state.observer._isObserving = false;
            }
        }
    };
    
    messagesArea.addEventListener('scroll', reconnectObserverOnScroll, { passive: true });
    state.reconnectScrollHandler = reconnectObserverOnScroll;
}

/**
 * Cleanup scroll lazy loading observer and sentinel
 */
function cleanupScrollLazyLoading(messagesArea) {
    if (!messagesArea) return;
    
    const state = messagesArea._scrollLoadingState;
    if (state) {
        if (state.observer) {
            state.observer.disconnect();
            state.observer = null;
        }
        if (state.reconnectScrollHandler) {
            messagesArea.removeEventListener('scroll', state.reconnectScrollHandler);
            state.reconnectScrollHandler = null;
        }
        if (state.sentinel && state.sentinel.parentNode) {
            state.sentinel.parentNode.removeChild(state.sentinel);
            state.sentinel = null;
        }
        messagesArea._scrollLoadingState = null;
    }
    
    // Also remove any old sentinel that might exist
    const oldSentinel = messagesArea.querySelector('#messages-lazy-load-sentinel');
    if (oldSentinel && oldSentinel.parentNode) {
        oldSentinel.parentNode.removeChild(oldSentinel);
    }
}

/**
 * Instantly display a single new message
 */
function displayMessage(message, currentUserId) {
    const messagesArea = document.getElementById('messagesArea');
    if (!messagesArea) return;

    if (messagesArea.querySelector(`[data-message-id="${message.id}"]`)) return;

    const isSentByCurrentUser = parseInt(message.senderId) === parseInt(currentUserId);
    message.type = isSentByCurrentUser ? 'sent' : 'received';

    message.sender_id = message.senderId || message.sender_id;
    message.receiver_id = message.receiverId || message.receiver_id;
    message.senderId = message.senderId || message.sender_id;
    message.receiverId = message.receiverId || message.receiver_id;

    message.text = message.text || message.content || '';
    message.content = message.content || message.text || '';

    if (!message.recall_type) message.recall_type = 'none';

    const messageElement = typeof createMessageElement === 'function' ? createMessageElement(message) : null;
    if (!messageElement) { console.error('Failed to create message element:', message.id); return; }

    if (message.is_sender_deleted || message.sender_real_name === 'Deleted User') {
        messageElement.classList.add('message-deleted-user');
        messageElement.style.cursor = 'pointer';
        messageElement.addEventListener('click', () => {
            if (typeof showAccountDeactivatedModal === 'function') showAccountDeactivatedModal(message.senderId || message.sender_id, 'Account Deactivated');
        });
    }

    const existingTimeElements = messageElement.querySelectorAll('.message-time');
    if (existingTimeElements.length > 1) for (let i = 0; i < existingTimeElements.length - 1; i++) existingTimeElements[i].remove();

    if (typeof hideTypingIndicator === 'function') hideTypingIndicator();

    messageElement.style.opacity = '0';
    messageElement.style.transform = 'translateY(20px)';
    messagesArea.appendChild(messageElement);

    setTimeout(() => {
        messageElement.style.transition = 'all 0.3s ease';
        messageElement.style.opacity = '1';
        messageElement.style.transform = 'translateY(0)';
    }, 10);
}

/**
 * Add images to an existing message element
 */
function addImagesToMessage(messageElement, attachments) {
    let imageContainer = messageElement.querySelector('.message-images-container');
    
    if (!imageContainer) {
        const attachmentsDiv = messageElement.querySelector('.message-attachments') || (() => {
            const bubble = messageElement.querySelector('.message-bubble');
            if (!bubble) return null;
            const div = document.createElement('div');
            div.className = 'message-attachments';
            bubble.appendChild(div);
            return div;
        })();
        imageContainer = attachmentsDiv;
    }

    if (!imageContainer) return;

    imageContainer.innerHTML = '';

    attachments.forEach(attachment => {
        if (attachment.attachment_type === 'image') {
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'message-image-wrapper';
            const img = document.createElement('img');
            img.className = 'message-image-clean';
            img.alt = attachment.original_filename || 'Image';
            img.style.cursor = 'pointer';
            img.style.opacity = '0';

            const paths = [];
            if (attachment.thumbnail_path) paths.push(attachment.thumbnail_path.startsWith('/') ? attachment.thumbnail_path : '/' + attachment.thumbnail_path);
            if (attachment.file_path && attachment.file_path !== attachment.thumbnail_path) paths.push(attachment.file_path.startsWith('/') ? attachment.file_path : '/' + attachment.file_path);

            img.onload = () => { img.style.transition = 'all 0.3s ease'; img.style.opacity = '1'; };
            img.onerror = () => { imgWrapper.innerHTML = `<div class="image-error-clean"><span>📷 Failed to load</span></div>`; };

            if (typeof loadImageWithFallback === 'function') loadImageWithFallback(img, paths);
            else img.src = paths[0] || '';

            img.onclick = () => { if (typeof openImageViewer === 'function') openImageViewer(attachment.file_path || attachment.thumbnail_path, attachment.original_filename); };
            imgWrapper.appendChild(img);
            imageContainer.appendChild(imgWrapper);
        }
    });

    const messageText = messageElement.querySelector('.message-text');
    if (messageText && ['📷', '', null].includes(messageText.textContent.trim())) messageText.style.display = 'none';
}

/**
 * Refresh scroll lazy loading state after pagination changes
 * Updates hasMore state based on current page number
 */
function refreshScrollLazyLoadingState() {
    const messagesArea = document.getElementById('messagesArea');
    if (!messagesArea) return;
    
    const state = messagesArea._scrollLoadingState;
    if (!state) return;
    
    // Update hasMore based on current page
    if (typeof getCurrentPage === 'function' && typeof getTotalPages === 'function') {
        const currentPageNum = getCurrentPage();
        const totalPagesNum = getTotalPages();
        state.hasMore = currentPageNum < totalPagesNum;
        
        // Show/hide sentinel based on whether we can go to next page
        if (state.sentinel) {
            state.sentinel.style.display = state.hasMore ? '' : 'none';
        }
    }
}

// Make functions globally available
window.renderMessages = renderMessages;
window.displayMessage = displayMessage;
window.setupScrollLazyLoading = setupScrollLazyLoading;
window.cleanupScrollLazyLoading = cleanupScrollLazyLoading;
window.refreshScrollLazyLoadingState = refreshScrollLazyLoadingState;
window.ensureMessageTime = ensureMessageTime;
window.addImagesToMessage = addImagesToMessage;
