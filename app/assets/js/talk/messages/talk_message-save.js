/**
 * TALK MESSAGE SAVE
 * Handles saving and unsaving messages
 * Extracted from talk.html (lines 2389-2716)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - CONFIG (talk_config.js)
 * - Global functions: showNotification, getCurrentFilter, filterConversations,
 *   loadConversations, renderMessages, formatMessageTime
 */

/**
 * Save message functionality - Database-based
 */
async function saveMessage(message, event = null) {
    try {
        const currentUserId = TalkState.getCurrentUserId();
        if (!currentUserId) {
            if (typeof showNotification === 'function') {
                showNotification('User not authenticated', 'error');
            }
            return;
        }

        // Check if message can be saved
        // Allow saving soft-recalled messages (receiver can still see and save them)
        // Only block hard-recalled messages (but those are deleted anyway)
        const recallType = message.recall_type || 'none';
        if (recallType === 'hard' || message.content === '[Message recalled]' || message.content === 'Message recalled') {
            if (typeof showNotification === 'function') {
                showNotification('Cannot save recalled messages', 'error');
            }
            return;
        }

        // Check if message is already saved
        const savedMessages = CONFIG.USERS.SAVED_MESSAGES || [];
        const isMessageSaved = savedMessages.find(saved => saved.messageId === message.id);
        if (isMessageSaved) {
            if (typeof showNotification === 'function') {
                showNotification('Message already saved', 'info');
            }
            return;
        }

        // Save message to database via API
        const apiBaseUrl = window.API_BASE_URL || '';
        
        // Ensure messageId is properly formatted (could be string or number)
        const messageIdValue = message.id ? String(message.id) : null;
        if (!messageIdValue) {
            throw new Error('Invalid message ID');
        }
        
        // Ensure userId is an integer
        const userIdValue = parseInt(currentUserId);
        if (isNaN(userIdValue)) {
            throw new Error('Invalid user ID');
        }
        
        const response = await fetch(`${apiBaseUrl}/api/messages/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userIdValue
            },
            body: JSON.stringify({
                messageId: messageIdValue,
                userId: userIdValue
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Save message error:', errorData);
            throw new Error(errorData.error || `Failed to save message to database (${response.status})`);
        }

        const result = await response.json();
        
        if (result.success) {
            if (typeof showNotification === 'function') {
                showNotification('Message saved successfully', 'success');
            }
            if (typeof refreshSavedMessages === 'function') {
                await refreshSavedMessages();
            }
            
            // Update saved counts for all conversations
            const savedMessages = CONFIG.USERS.SAVED_MESSAGES || [];
            const conversations = TalkState.getConversations();
            Object.values(conversations).forEach(conv => {
                const savedCount = savedMessages.filter(msg => parseInt(msg.conversationId) === parseInt(conv.partnerId)).length;
                conv.savedMessageCount = savedCount;
            });
            TalkState.setConversations(conversations);
            
            // Get current filter to preserve it
            const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
            
            // Re-render conversations to update the saved count badges (preserves current filter)
            if (typeof filterConversations === 'function') {
                filterConversations(currentFilter, false);
            }
            
            // Only reload from server if not on saved tab (to avoid switching views)
            if (currentFilter !== 'saved' && typeof loadConversations === 'function') {
                await loadConversations();
            }
            
            // Update button UI permanently after saved messages are refreshed
            // Use a small delay to ensure DOM is ready
            setTimeout(() => {
                const updateSaveButton = () => {
                    let saveBtn = null;
                    
                    if (event && event.target) {
                        saveBtn = event.target;
                    } else {
                        // Find the button by message ID
                        const messageDiv = document.querySelector(`[data-message-id="${message.id}"]`);
                        if (messageDiv) {
                            saveBtn = messageDiv.querySelector('.save-btn');
                        }
                    }
                    
                    if (saveBtn) {
                        // Update button to show star icon permanently
                        saveBtn.innerHTML = '⭐';
                        saveBtn.className = 'message-action-btn save-btn saved';
                        saveBtn.disabled = false; // Don't disable to preserve color
                        saveBtn.title = 'Message already saved';
                        saveBtn.style.opacity = '1';
                        saveBtn.style.cursor = 'not-allowed';
                        saveBtn.style.color = '#ffc107';
                        saveBtn.style.filter = 'none';
                        saveBtn.style.pointerEvents = 'auto';
                        // Update onclick to show notification
                        saveBtn.onclick = (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (typeof showNotification === 'function') {
                                showNotification('Message already saved', 'info');
                            }
                        };
                    }
                };
                
                updateSaveButton();
                
                // Also update after a short delay in case messages are re-rendered
                setTimeout(updateSaveButton, 100);
            }, 50);
        } else {
            throw new Error(result.error || 'Failed to save message');
        }
    } catch (error) {
        if (typeof showNotification === 'function') {
            showNotification('Failed to save message: ' + error.message, 'error');
        }
    }
}

/**
 * Unsave message
 */
async function unsaveMessage(messageId) {
    try {
        const currentUserId = TalkState.getCurrentUserId();
        if (!currentUserId) {
            if (typeof showNotification === 'function') {
                showNotification('User not authenticated', 'error');
            }
            return;
        }

        // Remove message from database via API
        const apiBaseUrl = window.API_BASE_URL || '';
        
        // Ensure messageId is properly formatted
        const messageIdValue = messageId ? String(messageId) : null;
        if (!messageIdValue) {
            throw new Error('Invalid message ID');
        }
        
        // Ensure userId is an integer
        const userIdValue = parseInt(currentUserId);
        if (isNaN(userIdValue)) {
            throw new Error('Invalid user ID');
        }
        
        const response = await fetch(`${apiBaseUrl}/api/messages/unsave`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userIdValue
            },
            body: JSON.stringify({
                messageId: messageIdValue,
                userId: userIdValue
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Unsave message error:', errorData);
            throw new Error(errorData.error || `Failed to remove saved message from database (${response.status})`);
        }

        const result = await response.json();
        
        if (result.success) {
            if (typeof showNotification === 'function') {
                showNotification('Message removed from saved', 'success');
            }
            
            // Refresh from database first
            if (typeof refreshSavedMessages === 'function') {
                await refreshSavedMessages();
            }
            
            // Update saved counts for all conversations
            const savedMessages = CONFIG.USERS.SAVED_MESSAGES || [];
            const conversations = TalkState.getConversations();
            Object.values(conversations).forEach(conv => {
                const savedCount = savedMessages.filter(msg => parseInt(msg.conversationId) === parseInt(conv.partnerId)).length;
                conv.savedMessageCount = savedCount;
            });
            TalkState.setConversations(conversations);
            
            // Get current filter to preserve it
            const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
            
            // Re-render conversations to update the saved count badges (preserves current filter)
            if (typeof filterConversations === 'function') {
                filterConversations(currentFilter, false);
            }
            
            // Only reload from server if not on saved tab (to avoid switching views)
            if (currentFilter !== 'saved' && typeof loadConversations === 'function') {
                await loadConversations();
                
                // Also re-render current conversation messages to update button states
                const currentConversation = TalkState.getCurrentConversation();
                if (currentConversation && conversations[currentConversation] && conversations[currentConversation].messages) {
                    if (typeof renderMessages === 'function') {
                        renderMessages(conversations[currentConversation].messages);
                    }
                }
            }
            
            // Update button UI to change from star icon back to save icon
            // Use a longer delay to ensure all re-rendering is complete
            setTimeout(() => {
                const updateUnsaveButton = () => {
                    // Find the button by message ID - try both .save-btn and .unsave-btn
                    const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
                    if (messageDiv) {
                        // First, try to find unsave button (in saved tab view)
                        const unsaveBtn = messageDiv.querySelector('.unsave-btn');
                        if (unsaveBtn) {
                            // Convert unsave button to save button
                            unsaveBtn.innerHTML = '💾';
                            unsaveBtn.className = 'message-action-btn save-btn';
                            unsaveBtn.title = 'Save message';
                            unsaveBtn.style.opacity = '';
                            unsaveBtn.style.cursor = 'pointer';
                            unsaveBtn.style.color = '';
                            unsaveBtn.style.filter = '';
                            
                            // Get the message object from the conversation
                            const conversations = typeof TalkState !== 'undefined' && TalkState.getConversations ? TalkState.getConversations() : {};
                            const currentConversation = typeof TalkState !== 'undefined' && TalkState.getCurrentConversation ? TalkState.getCurrentConversation() : null;
                            let message = null;
                            if (currentConversation && conversations[currentConversation] && conversations[currentConversation].messages) {
                                message = conversations[currentConversation].messages.find(m => m.id == messageId);
                            }
                            
                            // Update onclick to save the message
                            unsaveBtn.onclick = (e) => {
                                e.stopPropagation();
                                if (message && typeof saveMessage === 'function') {
                                    saveMessage(message, e);
                                }
                            };
                        }
                        
                        // Also check for save button (in regular conversation view)
                        const saveBtn = messageDiv.querySelector('.save-btn.saved');
                        if (saveBtn) {
                            // Update button to show save icon (not saved state)
                            saveBtn.innerHTML = '💾';
                            saveBtn.className = 'message-action-btn save-btn';
                            saveBtn.title = 'Save message';
                            saveBtn.style.opacity = '';
                            saveBtn.style.cursor = 'pointer';
                            saveBtn.style.color = '';
                            saveBtn.style.filter = '';
                            saveBtn.style.pointerEvents = 'auto';
                            
                            // Get the message object from the conversation
                            const conversations = typeof TalkState !== 'undefined' && TalkState.getConversations ? TalkState.getConversations() : {};
                            const currentConversation = typeof TalkState !== 'undefined' && TalkState.getCurrentConversation ? TalkState.getCurrentConversation() : null;
                            let message = null;
                            if (currentConversation && conversations[currentConversation] && conversations[currentConversation].messages) {
                                message = conversations[currentConversation].messages.find(m => m.id == messageId);
                            }
                            
                            // Update onclick to save the message
                            saveBtn.onclick = (e) => {
                                e.stopPropagation();
                                if (message && typeof saveMessage === 'function') {
                                    saveMessage(message, e);
                                }
                            };
                        }
                    }
                };
                
                updateUnsaveButton();
                
                // Also update after delays to catch re-rendered messages
                setTimeout(updateUnsaveButton, 200);
                setTimeout(updateUnsaveButton, 500);
            }, 100);

            // If we're on the saved tab, refresh the conversation view
            if (currentFilter === 'saved') {
                const currentConversation = TalkState.getCurrentConversation();
                if (currentConversation) {
                    const conversation = conversations[currentConversation];
                    if (conversation) {
                        // Re-select the conversation to refresh the saved messages view
                        const conversationSavedMessages = savedMessages.filter(msg => {
                            const msgConvId = parseInt(msg.conversationId);
                            const convPartnerId = parseInt(conversation.partnerId);
                            return msgConvId === convPartnerId;
                        });
                        
                        if (conversationSavedMessages.length > 0) {
                            // Fetch only the remaining saved messages
                            const savedMessageIds = conversationSavedMessages.map(msg => parseInt(msg.messageId)).filter(id => !isNaN(id));
                            
                            try {
                                const response = await fetch(`/api/messages/conversation/${currentUserId}/${conversation.partnerId}`, {
                                    method: 'GET',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'X-User-ID': currentUserId
                                    }
                                });
                                
                                if (response.ok) {
                                    const data = await response.json();
                                    if (data.success && data.messages) {
                                        // Filter to only saved messages
                                        const savedOnly = data.messages.filter(msg => {
                                            const msgId = parseInt(msg.id);
                                            return savedMessageIds.includes(msgId);
                                        });
                                        
                                        // Convert to our format
                                        const messages = savedOnly.map((msg) => {
                                            const senderId = msg.sender_id || msg.senderId;
                                            const isSentByMe = parseInt(senderId) === currentUserId;
                                            
                                            return {
                                                type: isSentByMe ? 'sent' : 'received',
                                                text: msg.content,
                                                time: typeof formatMessageTime === 'function' ? formatMessageTime(msg.timestamp) : new Date(msg.timestamp).toLocaleTimeString(),
                                                id: msg.id,
                                                isRead: msg.is_read || msg.isRead,
                                                attachments: msg.attachments || [],
                                                hasAttachments: (msg.attachment_count || 0) > 0 || (msg.attachments && msg.attachments.length > 0),
                                                sender_id: senderId,
                                                content: msg.content,
                                                timestamp: msg.timestamp,
                                                recall_type: msg.recall_type || 'none',
                                                replyTo: msg.replyTo || (msg.reply_to_id ? {
                                                    id: msg.reply_to_id,
                                                    text: msg.reply_to_text,
                                                    senderId: msg.reply_to_sender
                                                } : null)
                                            };
                                        });
                                        
                                        // Add header
                                        if (messages.length > 0) {
                                            const savedHeader = {
                                                type: 'system',
                                                text: `Showing ${messages.length} saved message${messages.length > 1 ? 's' : ''} from this conversation`,
                                                time: 'Now',
                                                id: 'saved-header',
                                                isRead: true,
                                                content: `Showing ${messages.length} saved message${messages.length > 1 ? 's' : ''} from this conversation`,
                                                timestamp: Date.now()
                                            };
                                            messages.unshift(savedHeader);
                                        } else {
                                            messages.push({
                                                type: 'system',
                                                text: 'No saved messages in this conversation',
                                                time: 'Now',
                                                id: 'no-saved-header',
                                                isRead: true,
                                                content: 'No saved messages in this conversation',
                                                timestamp: Date.now()
                                            });
                                        }
                                        
                                        if (typeof renderMessages === 'function') {
                                            renderMessages(messages);
                                        }
                                    }
                                }
                            } catch (error) {
                                // Error handling
                            }
                        } else {
                            // No more saved messages for this conversation
                            if (typeof renderMessages === 'function') {
                                renderMessages([{
                                    type: 'system',
                                    text: 'No saved messages in this conversation',
                                    time: 'Now',
                                    id: 'no-saved-header',
                                    isRead: true,
                                    content: 'No saved messages in this conversation',
                                    timestamp: Date.now()
                                }]);
                            }
                        }
                    }
                }
            }
        } else {
            throw new Error(result.error || 'Failed to remove saved message');
        }

    } catch (error) {
        if (typeof showNotification === 'function') {
            showNotification('Failed to remove saved message: ' + error.message, 'error');
        }
    }
}

/**
 * Refresh saved messages from database and update CONFIG and UI
 */
async function refreshSavedMessages() {
    try {
        const currentUserId = TalkState.getCurrentUserId();
        if (!currentUserId) {
            CONFIG.USERS.SAVED_MESSAGES = [];
            return;
        }

        // Load saved messages from database
        const apiBaseUrl = window.API_BASE_URL || '';
        const response = await fetch(`${apiBaseUrl}/api/messages/saved?userId=${currentUserId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success && data.messages && Array.isArray(data.messages)) {
            // Transform database data to match frontend expected structure
            const transformedMessages = data.messages.map(dbMessage => {
                // For saved messages: receiver_id is always currentUserId (only receivers can save)
                // So conversationId should be sender_id (the other person)
                const senderId = parseInt(dbMessage.sender_id) || parseInt(dbMessage.senderId);
                const conversationId = senderId; // The sender is the partner in saved messages
                
                // Handle timestamp - could be string or number
                let timestamp;
                if (typeof dbMessage.timestamp === 'string') {
                    timestamp = new Date(dbMessage.timestamp).getTime();
                } else if (typeof dbMessage.timestamp === 'number') {
                    timestamp = dbMessage.timestamp;
                } else {
                    timestamp = Date.now();
                }
                
                return {
                    messageId: dbMessage.id,
                    content: dbMessage.message || dbMessage.content || '',
                    senderId: senderId,
                    senderUsername: dbMessage.other_real_name || `User${senderId}`,
                    timestamp: timestamp,
                    conversationId: conversationId, // This should match conversation.partnerId
                    uniqueId: `${dbMessage.id}_${senderId}_${timestamp}`
                };
            });
            
            CONFIG.USERS.SAVED_MESSAGES = transformedMessages;
        } else {
            CONFIG.USERS.SAVED_MESSAGES = [];
        }

        // If currently on saved tab, refresh the view
        const activeFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
        if (activeFilter === 'saved' && typeof filterConversations === 'function') {
            filterConversations('saved');
        }
    } catch (error) {
        CONFIG.USERS.SAVED_MESSAGES = [];
    }
}

/**
 * Get saved message preview for a specific conversation
 */
function getSavedMessagePreview(partnerId) {
    try {
        const savedMessages = CONFIG.USERS.SAVED_MESSAGES || [];
        const conversationSavedMessages = savedMessages.filter(msg => msg.conversationId === partnerId);

        if (conversationSavedMessages.length > 0) {
            // Get the most recent saved message
            const latestSaved = conversationSavedMessages.sort((a, b) => b.timestamp - a.timestamp)[0];
            return latestSaved.content.substring(0, 50) + (latestSaved.content.length > 50 ? '...' : '');
        }
        return 'No saved messages';
    } catch (error) {
        return 'Error loading preview';
    }
}

// Make functions globally available
window.saveMessage = saveMessage;
window.unsaveMessage = unsaveMessage;
window.refreshSavedMessages = refreshSavedMessages;
window.getSavedMessagePreview = getSavedMessagePreview;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        saveMessage,
        unsaveMessage,
        refreshSavedMessages,
        getSavedMessagePreview
    };
}













