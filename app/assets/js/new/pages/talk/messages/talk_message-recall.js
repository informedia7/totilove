/**
 * TALK MESSAGE RECALL
 * Handles message recall/deletion
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - Global functions: showNotification, getCurrentConversationCacheKey,
 *   formatMessageTime, createMessageElement, loadConversations
 */

/**
 * Main entry point - determines message type and routes to appropriate recall function
 */
async function performDeleteMessage(messageId, messageElement) {
    if (!messageId) {
        if (typeof showNotification === 'function') {
            showNotification('Error: Message ID is missing', 'error');
        }
        return;
    }

    const numericMessageId = parseInt(messageId);
    if (!numericMessageId || isNaN(numericMessageId) || numericMessageId <= 0) {
        if (typeof showNotification === 'function') {
            showNotification('Invalid message ID', 'error');
        }
        return;
    }

    try {
        const currentUserId = TalkState.getCurrentUserId();
        if (!currentUserId) {
            throw new Error('User not authenticated');
        }

        // Call recall API
        const response = await fetch(`/api/messages/${numericMessageId}/recall`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            },
            body: JSON.stringify({
                userId: currentUserId,
                recallType: 'auto'
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to recall message');
        }

        const recallType = result.recallType || 'hard';

        // Get message from memory to determine type
        let message = getMessageFromMemory(numericMessageId);
        
        // CRITICAL: Try to get full message data including attachments from DOM if memory is incomplete
        if (messageElement && typeof getFullMessageData === 'function' && (!message || !message.attachments || message.attachments.length === 0)) {
            const fullMessageData = getFullMessageData(messageElement, message || { id: numericMessageId });
            if (fullMessageData && (fullMessageData.attachments && fullMessageData.attachments.length > 0 || fullMessageData.hasAttachments)) {
                message = { ...message, ...fullMessageData };
            }
        }
        
        // CRITICAL: Robust image detection - check multiple sources (same logic as factory)
        // Priority: DOM checks first (most reliable), then message object
        let isImageMessage = false;
        
        // 1. Check DOM element for image-message class (HIGHEST PRIORITY - most reliable)
        if (messageElement) {
            if (messageElement.classList.contains('image-message')) {
                isImageMessage = true;
            }
            
            // 2. Check DOM element for image container (even without class)
            if (!isImageMessage && messageElement.querySelector('.message-images-container')) {
                isImageMessage = true;
            }
            
            // 3. Check for image elements directly in the message
            if (!isImageMessage && messageElement.querySelector('img.message-image-clean, .message-image-wrapper img')) {
                isImageMessage = true;
            }
        }
        
        // 4. Check message object for attachment info (same as factory logic)
        if (!isImageMessage && message) {
            // Check for image attachments with valid paths (same as factory)
            const imageAttachmentsForCheck = message.attachments ? message.attachments.filter(att => 
                att.attachment_type === 'image' || !att.attachment_type
            ) : [];
            const hasValidImageAttachments = imageAttachmentsForCheck.length > 0 && 
                imageAttachmentsForCheck.some(att => att.thumbnail_path || att.file_path);
            
            // Check for attachment indicators - be more aggressive
            const hasAttachmentInfo = message.hasAttachments || 
                message.attachment_count > 0 || 
                hasValidImageAttachments ||
                (message.attachment_count > 0 && imageAttachmentsForCheck.length > 0) ||
                (message.attachments && message.attachments.length > 0);
            
            isImageMessage = hasAttachmentInfo;
        }
        
        // 5. Fallback: If message has image placeholder text, treat as image
        if (!isImageMessage && message && (message.text || message.content)) {
            const messageText = message.text || message.content || '';
            const isImagePlaceholder = messageText === '📷' ||
                messageText.trim() === '' ||
                messageText.startsWith('📷 Shared') ||
                messageText.startsWith('📷 Image') ||
                /^📷\s*[A-Za-z\s]*image/i.test(messageText);
            
            if (isImagePlaceholder) {
                isImageMessage = true;
            }
        }

        if (recallType === 'hard') {
            // Hard delete: Remove completely
            handleHardRecall(numericMessageId, messageElement);
        } else if (recallType === 'soft') {
            // Soft delete: Show "recalled" placeholder
            if (isImageMessage) {
                await handleSoftRecallImage(numericMessageId, messageElement, message);
            } else {
                handleSoftRecallText(numericMessageId, messageElement, message);
            }
        }

        // Mark cache as stale
        markCacheAsStale();

    } catch (error) {
        console.error('Error recalling message:', error);
        if (typeof showNotification === 'function') {
            showNotification('Failed to recall message: ' + error.message, 'error');
        }
    }
}

/**
 * Handle soft recall for TEXT messages
 */
function handleSoftRecallText(messageId, messageElement, message) {
    // Get timestamp from database (via message in memory)
    const timestamp = message?.timestamp || Date.now();
    const timeText = message?.time || (typeof formatMessageTime === 'function' 
        ? formatMessageTime(timestamp) 
        : new Date(timestamp).toLocaleTimeString());

    // Update message in memory
    if (message) {
        message.recall_type = 'soft';
        updateMessageInMemory(messageId, message);
    }

    // Create recalled text message placeholder
    const placeholder = createRecalledTextPlaceholder(messageId, timestamp, timeText);

    // Replace element in DOM
    if (messageElement && messageElement.parentNode) {
        try {
            messageElement.parentNode.replaceChild(placeholder, messageElement);
        } catch (error) {
            console.error('Error replacing message with recalled placeholder:', error);
        }
    }

    if (typeof showNotification === 'function') {
        showNotification('Message recalled (just for you)', 'success');
    }
}

/**
 * Handle soft recall for IMAGE messages
 */
async function handleSoftRecallImage(messageId, messageElement, message) {
    // Get timestamp from database (via message in memory)
    const timestamp = message?.timestamp || Date.now();
    const timeText = message?.time || (typeof formatMessageTime === 'function' 
        ? formatMessageTime(timestamp) 
        : new Date(timestamp).toLocaleTimeString());

    // Update message in memory - ensure all attachment info is preserved for factory detection
    // Factory needs: hasAttachments, attachment_count, attachments array, or recall_type + attachment_count
    const recalledMessage = {
        ...message,
        id: messageId,
        recall_type: 'soft',
        // Preserve attachment info - critical for factory to detect as image message
        hasAttachments: message?.hasAttachments !== false, // Keep true if it was true, default to true
        attachments: message?.attachments || [],
        attachment_count: message?.attachment_count || (message?.hasAttachments ? 1 : 0) || 1,
        type: message?.type || 'sent',
        sender_id: message?.sender_id || TalkState.getCurrentUserId(),
        senderId: message?.senderId || message?.sender_id || TalkState.getCurrentUserId(),
        text: message?.text || message?.content || '📷 Image',
        content: message?.content || message?.text || '📷 Image',
        timestamp: timestamp,
        time: timeText
    };

    updateMessageInMemory(messageId, recalledMessage);

    // Re-render using MessageFactory
    if (typeof createMessageElement === 'function') {
        const newElement = createMessageElement(recalledMessage);
        if (messageElement && messageElement.parentNode) {
            messageElement.parentNode.replaceChild(newElement, messageElement);
        }
    }

    if (typeof showNotification === 'function') {
        showNotification('Image recalled (just for you)', 'success');
    }
}

/**
 * Handle hard recall (complete deletion)
 */
function handleHardRecall(messageId, messageElement) {
    // Remove from DOM
    if (messageElement && messageElement.parentNode) {
        messageElement.parentNode.removeChild(messageElement);
    }

    // Remove from memory
    removeMessageFromMemory(messageId);

    if (typeof showNotification === 'function') {
        showNotification('Message deleted completely', 'success');
    }

    // Refresh conversation list
    if (typeof loadConversations === 'function') {
        loadConversations();
    }
}

/**
 * Create recalled text message placeholder element
 */
function createRecalledTextPlaceholder(messageId, timestamp, timeText) {
    const placeholder = document.createElement('div');
    placeholder.className = 'message recalled-message sent';
    placeholder.setAttribute('data-message-id', messageId);
    placeholder.setAttribute('data-recalled', 'true');
    placeholder.setAttribute('data-type', 'sent');

    placeholder.innerHTML = `
        <div class="message-bubble recalled-bubble">
            <div class="recalled-content">
                <span class="recalled-icon">🗑️</span>
                <span class="recalled-text">Message recalled</span>
            </div>
        </div>
        ${timeText ? `<div class="message-time">${timeText}</div>` : ''}
    `;

    return placeholder;
}

/**
 * Get message from memory (conversation state)
 */
function getMessageFromMemory(messageId) {
    const conversations = TalkState.getConversations() || {};
    const currentConversation = TalkState.getCurrentConversation();
    
    if (!currentConversation || !conversations[currentConversation] || !conversations[currentConversation].messages) {
        return null;
    }

    return conversations[currentConversation].messages.find(m => String(m.id) === String(messageId)) || null;
}

/**
 * Update message in memory
 */
function updateMessageInMemory(messageId, updatedMessage) {
    const conversations = TalkState.getConversations() || {};
    const currentConversation = TalkState.getCurrentConversation();
    
    if (!currentConversation || !conversations[currentConversation] || !conversations[currentConversation].messages) {
        return;
    }

    const messages = conversations[currentConversation].messages;
    const index = messages.findIndex(m => String(m.id) === String(messageId));
    
    if (index !== -1) {
        messages[index] = { ...messages[index], ...updatedMessage };
        TalkState.setConversations(conversations);
    }
}

/**
 * Remove message from memory
 */
function removeMessageFromMemory(messageId) {
    const conversations = TalkState.getConversations() || {};
    const currentConversation = TalkState.getCurrentConversation();
    
    if (!currentConversation || !conversations[currentConversation] || !conversations[currentConversation].messages) {
        return;
    }

    const messages = conversations[currentConversation].messages;
    const index = messages.findIndex(m => String(m.id) === String(messageId));
    
    if (index !== -1) {
        messages.splice(index, 1);
        TalkState.setConversations(conversations);
    }
}

/**
 * Mark message cache as stale
 */
function markCacheAsStale() {
    const messageCache = TalkState.getMessageCache();
    const cacheKey = typeof getCurrentConversationCacheKey === 'function' 
        ? getCurrentConversationCacheKey() 
        : null;
    
    if (cacheKey && messageCache) {
        const cachedData = messageCache.get(cacheKey);
        if (cachedData) {
            cachedData.stale = true;
        }
    }
}

/**
 * Remove message from DOM (legacy function for backward compatibility)
 */
function removeMessageFromDOM(messageElement) {
    if (messageElement && messageElement.parentNode) {
        messageElement.parentNode.removeChild(messageElement);
    }
}

// Make functions globally available
window.performDeleteMessage = performDeleteMessage;
window.removeMessageFromDOM = removeMessageFromDOM;
window.handleSoftRecallText = handleSoftRecallText;
window.handleSoftRecallImage = handleSoftRecallImage;
window.handleHardRecall = handleHardRecall;
window.markCacheAsStale = markCacheAsStale;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        performDeleteMessage,
        removeMessageFromDOM,
        handleSoftRecallText,
        handleSoftRecallImage,
        handleHardRecall,
        markCacheAsStale
    };
}
