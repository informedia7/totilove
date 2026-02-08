/**
 * TALK REALTIME MESSAGING
 * Handles real-time message events (new_message, message_recalled, image_upload_complete)
 * Extracted from talk.html (lines 1656-1932)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - Global functions: showNotification, playNotificationSound, displayMessage, formatMessageTime,
 *   loadConversations, markMessageAsRead, replaceProgressWithImages, addImagesToMessage,
 *   createMessageElement, replaceMessageWithRecalledText, removeMessageFromDOM,
 *   getCurrentConversationCacheKey, findMessageById, getCurrentTimestamp
 * - Global variables: socket, currentConversation, conversations, messageCache, currentUserId
 */

/**
 * Setup real-time message event handlers
 * This should be called after socket is initialized and authenticated
 */
function setupRealtimeMessageHandlers() {
    if (!window.socket) {
        return;
    }

    const socket = window.socket;

    // Prevent duplicate handlers - remove old listeners first
    if (window.realtimeHandlersSetup) {
        // Remove old listeners before adding new ones
        socket.off('image_upload_progress');
        socket.off('image_upload_complete');
        socket.off('new_message');
        socket.off('message_sent_update');
        socket.off('message_read_update');
        socket.off('user_typing');
        socket.off('user_online');
        socket.off('user_offline');
        socket.off('user_status_change');
        socket.off('message_recalled');
    }
    window.realtimeHandlersSetup = true;

    // Listen for image upload progress - for sender only
    socket.on('image_upload_progress', (data) => {
        // Progress handling removed - now using simple notifications
    });

    // Listen for image upload completion - update sender's placeholder with actual images
    socket.on('image_upload_complete', (data) => {
        const currentUserId = TalkState ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);
        
        if (data.senderId == currentUserId) {
            const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
            if (messageElement && data.attachments) {
                if (typeof replaceProgressWithImages === 'function') {
                    replaceProgressWithImages(messageElement, data.attachments);
                }
            }
        }
        // Receiver gets full message with attachments via 'new_message' and de-dup logic; no extra handling here
    });

    // Listen for new messages in real-time
    socket.on('new_message', async (messageData) => {
        const currentUserId = TalkState ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);
        const currentConversation = TalkState ? TalkState.getCurrentConversation() : window.currentConversation;
        const conversations = TalkState ? TalkState.getConversations() : window.conversations;
        const messageSenderId = parseInt(messageData.senderId);
        const messageReceiverId = parseInt(messageData.receiverId);
        const isIncomingForMe = messageReceiverId === currentUserId;
        let notificationPlayed = false;
        
        // Check if the message is for the current conversation
        if (currentConversation && conversations[currentConversation]) {
            const conversation = conversations[currentConversation];
            const partnerIdInt = parseInt(conversation.partnerId);

            // Only show message if it's part of the current conversation:
            // 1. Message is FROM current partner TO current user (received message)
            // 2. Message is FROM current user TO current partner (sent message confirmation)
            const isFromPartnerToMe = (messageSenderId === partnerIdInt && messageReceiverId === currentUserId);
            const isFromMeToPartner = (messageSenderId === currentUserId && messageReceiverId === partnerIdInt);

            if (isFromPartnerToMe || isFromMeToPartner) {
                // De-dup by messageId: if element already exists, update it instead of adding a new one
                const existingElement = document.querySelector(`[data-message-id="${messageData.id}"]`);
                const incomingHasAttachments = Array.isArray(messageData.attachments) && messageData.attachments.length > 0;

                // Ensure messages array exists
                if (!conversation.messages) conversation.messages = [];
                const existingIdx = conversation.messages.findIndex(m => String(m.id) === String(messageData.id));

                if (existingElement) {
                    // Message element exists in DOM - update it
                    // CRITICAL: Remove ALL duplicate timestamps, keep only one
                    const existingTimeElements = existingElement.querySelectorAll('.message-time');
                    if (existingTimeElements.length > 1) {
                        // Remove all but the last one
                        for (let i = 0; i < existingTimeElements.length - 1; i++) {
                            existingTimeElements[i].remove();
                        }
                    }

                    if (existingIdx !== -1) {
                        const existingMsg = conversation.messages[existingIdx];
                        // Update with database timestamp
                        const updatedMsg = {
                            ...existingMsg,
                            timestamp: messageData.timestamp || existingMsg.timestamp, // Use database timestamp
                            content: messageData.content ?? existingMsg.content,
                            attachment_count: messageData.attachment_count ?? existingMsg.attachment_count,
                            attachments: incomingHasAttachments ? messageData.attachments : (existingMsg.attachments || []),
                            hasAttachments: incomingHasAttachments || existingMsg.hasAttachments,
                            isUploading: false // Remove uploading state
                        };

                        // Don't set time property - factory will format from timestamp (database source)
                        conversation.messages[existingIdx] = updatedMsg;

                        // Update timestamp in existing element to use database timestamp
                        if (existingTimeElements.length > 0) {
                            const timeEl = existingTimeElements[existingTimeElements.length - 1];
                            if (updatedMsg.timestamp) {
                                const timeText = typeof formatMessageTime === 'function' 
                                    ? formatMessageTime(updatedMsg.timestamp) 
                                    : new Date(updatedMsg.timestamp).toLocaleTimeString();
                                if (timeText.includes('<span')) {
                                    timeEl.innerHTML = timeText;
                                } else {
                                    timeEl.textContent = timeText;
                                }
                            }
                        }
                    }

                    if (incomingHasAttachments) {
                        // Add/replace images in the existing DOM node
                        if (typeof addImagesToMessage === 'function') {
                            addImagesToMessage(existingElement, messageData.attachments);
                        }
                        // Hide placeholder text if present
                        const messageTextEl = existingElement.querySelector('.message-text');
                        if (messageTextEl) {
                            const txt = (messageTextEl.textContent || '').trim();
                            if (txt === '📷' || txt.startsWith('📷 Shared') || txt.startsWith('📷 Image') || txt === '') {
                                messageTextEl.style.display = 'none';
                            }
                        }
                    }

                    // Scroll to bottom
                    const messagesArea = document.getElementById('messagesArea');
                    if (messagesArea) {
                        messagesArea.scrollTop = messagesArea.scrollHeight;
                    }

                    // For received messages, still notify and mark read
                    if (isFromPartnerToMe) {
                        if (typeof showNotification === 'function') {
                            showNotification(`💬 New message from ${conversation.name}`, 'info');
                        }
                        if (typeof playNotificationSound === 'function') {
                            playNotificationSound();
                            notificationPlayed = true;
                        }
                        if (typeof markMessageAsRead === 'function') {
                            setTimeout(() => { markMessageAsRead(messageData.id); }, 500);
                        }
                    }

                    // Skip adding duplicate DOM/message entries
                } else {
                    // Instantly add the message to the conversation without database reload
                    // Match reference implementation exactly - pass attachments as-is from server
                    const formattedMessage = {
                        id: messageData.id,
                        senderId: messageSenderId,
                        receiverId: messageReceiverId,
                        sender_id: messageSenderId, // CRITICAL: Both field names needed
                        receiver_id: messageReceiverId, // CRITICAL: Both field names needed
                        content: messageData.content || '',
                        text: messageData.content || '', // CRITICAL: Factory checks both text and content
                        timestamp: messageData.timestamp || Date.now(),
                        status: 'sent',
                        senderUsername: messageData.sender_real_name || (isFromMeToPartner ? window.currentUser?.real_name : conversation.name),
                        attachment_count: messageData.attachment_count || 0,
                        attachments: messageData.attachments || [],
                        hasAttachments: (messageData.attachments && messageData.attachments.length > 0) || (messageData.attachment_count > 0),
                        recall_type: messageData.recall_type || 'none', // CRITICAL: Ensure recall_type is set
                        // Include reply information from WebSocket
                        replyTo: messageData.replyTo || null
                    };

                    // Don't set time property - factory will format from timestamp (database source)
                    // This prevents duplicate timestamps (one from database, one from formatted time)

                    // Add to conversation messages array
                    conversation.messages.push(formattedMessage);
                    
                    // Display the message (both received and sent messages need to be displayed)
                    if ((isFromPartnerToMe || isFromMeToPartner) && typeof displayMessage === 'function') {
                        displayMessage(formattedMessage, currentUserId);
                    }

                    // Scroll to bottom
                    const messagesArea = document.getElementById('messagesArea');
                    if (messagesArea) {
                        messagesArea.scrollTop = messagesArea.scrollHeight;
                    }

                    // Show notification for received messages only
                    if (isFromPartnerToMe) {
                        if (typeof showNotification === 'function') {
                            showNotification(`💬 New message from ${conversation.name}`, 'info');
                        }

                        // Play notification sound if available
                        if (typeof playNotificationSound === 'function') {
                            playNotificationSound();
                            notificationPlayed = true;
                        }

                        // Mark as read if conversation is active
                        if (typeof markMessageAsRead === 'function') {
                            setTimeout(() => {
                                markMessageAsRead(messageData.id);
                            }, 500);
                        }
                    }
                }
            }
        }

        if (isIncomingForMe && !notificationPlayed) {
            if (typeof playNotificationSound === 'function') {
                playNotificationSound();
            }
            if (typeof showNotification === 'function') {
                const senderName = messageData.sender_real_name || messageData.senderName || messageData.senderUsername || 'New message';
                showNotification(`💬 New message from ${senderName}`, 'info');
            }
        }

        // Always reload conversation list to update unread counts
        if (typeof loadConversations === 'function') {
            await loadConversations();
        }
    });

    // Listen for message status updates
    socket.on('message_read', (data) => {
        const currentConversation = TalkState ? TalkState.getCurrentConversation() : window.currentConversation;
        const conversations = TalkState ? TalkState.getConversations() : window.conversations;

        // Update message status in current conversation if visible
        if (currentConversation && conversations[currentConversation]) {
            const conversation = conversations[currentConversation];
            if (conversation.messages) {
                const message = conversation.messages.find(msg => msg.id === data.messageId);
                if (message) {
                    message.isRead = true;
                    // Could update UI to show read status
                }
            }
        }
    });

    // Listen for typing indicators
    socket.on('user_typing', (data) => {
        const currentConversation = TalkState ? TalkState.getCurrentConversation() : window.currentConversation;
        const conversations = TalkState ? TalkState.getConversations() : window.conversations;
        
        if (currentConversation && conversations[currentConversation]) {
            const conversation = conversations[currentConversation];
            // Check if this typing event is for the current conversation partner
            if (parseInt(data.userId) === parseInt(conversation.partnerId)) {
                if (data.isTyping) {
                    // Show typing indicator
                    if (typeof showTypingIndicator === 'function') {
                        showTypingIndicator(data.real_name || conversation.name);
                    }
                } else {
                    // Hide typing indicator
                    if (typeof hideTypingIndicator === 'function') {
                        hideTypingIndicator();
                    }
                }
            }
        }
    });

    // Listen for online status updates
    socket.on('user_online', (data) => {
        if (typeof updateUserOnlineStatus === 'function') {
            updateUserOnlineStatus(data.userId, true);
        }
    });

    socket.on('user_offline', (data) => {
        if (typeof updateUserOnlineStatus === 'function') {
            updateUserOnlineStatus(data.userId, false);
        }
    });

    socket.on('user_status_change', (data) => {
        if (typeof updateUserOnlineStatus === 'function' && typeof data.isOnline === 'boolean') {
            updateUserOnlineStatus(data.userId, data.isOnline);
        }
    });

    // Handle message recall events
    socket.on('message_recalled', (data) => {
        const currentUserId = TalkState ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);
        const currentConversation = TalkState ? TalkState.getCurrentConversation() : window.currentConversation;
        const conversations = TalkState ? TalkState.getConversations() : window.conversations;
        const messageCache = TalkState ? TalkState.getMessageCache() : window.messageCache;
        
        const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);

        if (messageElement && !messageElement.hasAttribute('data-recalled')) {
            if (data.recallType === 'hard') {
                // Hard delete: Use new recall function
                if (typeof handleHardRecall === 'function') {
                    handleHardRecall(data.messageId, messageElement);
                } else if (typeof removeMessageFromDOM === 'function') {
                    removeMessageFromDOM(messageElement);
                }

                // Show notification for recipients
                if (data.recalledBy != currentUserId) {
                    if (typeof showNotification === 'function') {
                        showNotification('A message was deleted', 'info');
                    }
                }
            } else if (data.recallType === 'soft') {
                // Soft delete: Only sender sees recalled placeholder
                if (data.recalledBy === currentUserId) {
                    // Get message from memory
                    let msg = null;
                    if (currentConversation && conversations[currentConversation]?.messages) {
                        msg = conversations[currentConversation].messages.find(m => String(m.id) === String(data.messageId));
                    }

                    // Determine message type
                    const isImageMessage = messageElement?.classList.contains('image-message') ||
                                         (msg && (msg.hasAttachments || msg.attachment_count > 0 || (msg.attachments && msg.attachments.length > 0)));

                    // Use new recall functions
                    if (isImageMessage && typeof handleSoftRecallImage === 'function') {
                        handleSoftRecallImage(data.messageId, messageElement, msg);
                    } else if (typeof handleSoftRecallText === 'function') {
                        handleSoftRecallText(data.messageId, messageElement, msg);
                    }
                }
                // Recipients see original message (no changes needed)
            }
        }
    });
}

// Make function globally available
window.setupRealtimeMessageHandlers = setupRealtimeMessageHandlers;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        setupRealtimeMessageHandlers
    };
}












