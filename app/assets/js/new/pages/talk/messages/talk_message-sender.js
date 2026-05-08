/**
 * TALK MESSAGE SENDER
 * Handles sending text and image messages
 * Copied 100% from reference talk.html (lines 5666-5888, 6812-7016)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - Global functions: showNotification, validateMessageContent, validateMessageInput, 
 *   checkIfBlocked, getCurrentTimestamp, formatMessageTime, createMessageElement,
 *   getCurrentFilter, loadConversations, loadMessages,
 *   selectConversation, handleError, updateCharacterCounter, displayMessage,
 *   validateConversation, createError, cancelReply, clearImagePreviews
 * - Global variables: conversations, currentConversation, currentUserId, currentReply, selectedImages
 */

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value;

    // Get current user ID
    const currentUserId = TalkState ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);
    if (!currentUserId) {
        showNotification('User not authenticated', 'error');
        return;
    }

    // Check if we have images to send
    if (selectedImages.length > 0) {
        // If we have images, send them with any text as caption
        // Validate caption if provided
        if (text && text.trim()) {
            const contentValidation = validateMessageContent(text);
            if (!contentValidation.valid) {
                showNotification(contentValidation.error, 'error');
                return;
            }
        }
        await sendImagesWithPreviews();

        // Clear text input if images were sent
        input.value = '';
        updateCharacterCounter();
        return;
    }

    // Regular text message
    const validationResult = await validateMessageInput(text);
    if (!validationResult) {
        return;
    }

    const { conversation, sanitizedContent } = validationResult;
    const finalText = sanitizedContent;

    // IMPORTANT: Proactive block check before sending
    try {
        const isBlocked = await checkIfBlocked(currentUserId, conversation.partnerId);
        if (isBlocked) {
            showNotification('You cannot send messages to this user', 'warning');
            return;
        }
    } catch (error) {
        // Continue if check fails (backend will enforce)
    }

    try {
        // Clear input immediately for better UX
        input.value = '';
        updateCharacterCounter();

        // Prepare message data
        const messageData = {
            receiverId: conversation.partnerId,
            content: finalText
        };

        // Include reply information if replying
        const currentReply = window.currentReply;
        if (currentReply) {
            messageData.replyTo = {
                id: currentReply.id,
                text: currentReply.text,
                senderId: currentReply.sender_id,
                hasImage: currentReply.hasImage,
                attachments: currentReply.attachments || []
            };
        }

        // Send message via API (CSRF token added automatically by csrf-token.js)
        const response = await fetch('/api/messages/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            },
            credentials: 'same-origin',
            body: JSON.stringify(messageData)
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success) {
            // Message will appear via WebSocket real-time update
            // No need to manually add it here - WebSocket handler will display it

            // Note: Users cannot save their own messages - only received messages can be saved
            // Auto-save logic removed to prevent 403 errors

            // Update conversation list to refresh unread counts and last message
            // But don't reload conversations if we're on saved tab to preserve the view
            const messageFilter = getCurrentFilter();
            if (messageFilter !== 'saved') {
                await loadConversations();

                const fallbackMessageId =
                    data.messageId ||
                    data.message?.messageId ||
                    data.message?.message?.id ||
                    data.message?.id;

                scheduleMessageRefreshFallback(conversation, fallbackMessageId);
            } else {
                // For saved tab, just refresh the saved messages without reloading conversations

            }

            // Don't automatically clear reply after text - user might want to attach images
            // Reply will be cleared when: user cancels manually, sends images, or switches conversation
        } else {
            // CRITICAL: Improved error message clarity using backend error codes
            if (data.requiresEmailVerification || data.code === 'EMAIL_VERIFICATION_REQUIRED') {
                showNotification('Please verify your email address to send messages. Check your inbox for the verification email.', 'warning');
            } else if (data.code === 'RECEIVER_SUSPENDED') {
                showNotification('User currently not available', 'warning');
            } else if (data.code === 'RECEIVER_PAUSED') {
                showNotification('User account is paused', 'warning');
            } else if (data.blocked) {
                // Use specific error codes from backend
                if (data.code === 'BLOCKED_BY_RECEIVER') {
                    showNotification('This user has blocked you', 'warning');
                } else if (data.code === 'BLOCKED_BY_SENDER') {
                    showNotification('You have blocked this user', 'warning');
                } else {
                    showNotification(data.error || 'Cannot send message to this user', 'warning');
                }
            } else {
                handleError(new Error(data.error || 'Unknown error'), 'sendMessage');
            }
        }
    } catch (error) {
        // Show more detailed error message
        const errorMessage = error.message || 'Failed to send message';
        console.error('Error sending message:', error);
        showNotification(errorMessage, 'error');
    }
}

function uploadChatImagesWithProgress(formData, currentUserId, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/messages/upload-images');
        xhr.withCredentials = true;
        xhr.setRequestHeader('X-User-ID', currentUserId);

        const sessionToken = typeof window.getSessionToken === 'function'
            ? window.getSessionToken()
            : (window.sessionToken || '');

        if (sessionToken) {
            xhr.setRequestHeader('Authorization', `Bearer ${sessionToken}`);
            xhr.setRequestHeader('X-Session-Token', sessionToken);
        }

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable || typeof onProgress !== 'function') {
                return;
            }
            const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
            onProgress(progress);
        };

        xhr.onload = () => {
            let response;
            try {
                response = JSON.parse(xhr.responseText || '{}');
            } catch (error) {
                reject(new Error('Invalid upload response from server'));
                return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(response);
                return;
            }

            const detailedError = response.error
                || response.message
                || response.details?.message
                || `Upload failed with status ${xhr.status}`;
            reject(new Error(detailedError));
        };

        xhr.onerror = () => {
            reject(new Error('Network error during upload'));
        };

        xhr.send(formData);
    });
}

async function sendImagesWithPreviews() {
    if (selectedImages.length === 0) {
        return;
    }

    if (selectedImages.length > 5) {
        showNotification('Maximum 5 images allowed per message', 'warning');
        return;
    }

    // Get current user ID
    const currentUserId = TalkState ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);
    if (!currentUserId) {
        showNotification('User not authenticated', 'error');
        return;
    }

    if (!currentConversation) {
        showNotification('No conversation selected', 'error');
        return;
    }

    const conversation = conversations[currentConversation];
    if (!validateConversation(conversation)) {
        showNotification('No conversation selected', 'error');
        return;
    }

    // IMPORTANT: Proactive block check before sending
    try {
        const isBlocked = await checkIfBlocked(currentUserId, conversation.partnerId);
        if (isBlocked) {
            showNotification('You cannot send messages to this user', 'warning');
            clearImagePreviews();
            return;
        }
    } catch (error) {
        // Continue if check fails (backend will enforce)
    }

    let createdMessageId = null;
    let uploadingMessageId = null;

    try {
        // Get caption text if any
        const input = document.getElementById('messageInput');
        let captionText = '';
        if (input && input.value && input.value.trim()) {
            const contentValidation = validateMessageContent(input.value);
            if (!contentValidation.valid) {
                showNotification(contentValidation.error, 'error');
                return;
            }
            captionText = contentValidation.sanitized;
        }

        // Prepare message data
        const messageData = {
            receiverId: conversation.partnerId,
            content: captionText || '📷 Image'
        };

        // Include reply information if replying
        const currentReply = window.currentReply;
        if (currentReply) {
            messageData.replyTo = {
                id: currentReply.id,
                text: currentReply.text,
                senderId: currentReply.sender_id,
                hasImage: currentReply.hasImage,
                attachments: currentReply.attachments
            };
        }

        // First create a message (CSRF token added automatically by csrf-token.js)
        const messageResponse = await fetch('/api/messages/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            },
            credentials: 'same-origin',
            body: JSON.stringify(messageData)
        });

        const messageResult = await messageResponse.json().catch(() => ({}));
        if (!messageResponse.ok || !messageResult.success) {
            // CRITICAL: Improved error message clarity using backend error codes
            if (messageResult.requiresEmailVerification || messageResult.code === 'EMAIL_VERIFICATION_REQUIRED') {
                showNotification('Please verify your email address to send messages. Check your inbox for the verification email.', 'warning');
                throw createError(messageResult.error || 'Email verification required');
            } else if (messageResult.code === 'RECEIVER_SUSPENDED') {
                showNotification('User currently not available', 'warning');
                throw createError(messageResult.error || 'User not available');
            } else if (messageResult.code === 'RECEIVER_PAUSED') {
                showNotification('User account is paused', 'warning');
                throw createError(messageResult.error || 'User not available');
            } else if (messageResult.blocked) {
                // Use specific error codes from backend
                if (messageResult.code === 'BLOCKED_BY_RECEIVER') {
                    showNotification('This user has blocked you', 'warning');
                } else if (messageResult.code === 'BLOCKED_BY_SENDER') {
                    showNotification('You have blocked this user', 'warning');
                } else {
                    showNotification(messageResult.error || 'Cannot send message to this user', 'warning');
                }
                throw createError(messageResult.error || 'Blocked');
            } else {
                throw createError(messageResult.error || 'Failed to create message');
            }
        }

        createdMessageId = messageResult.messageId;

        // Immediately add uploading message to UI for sender
        const uploadingMessage = {
            id: createdMessageId,
            senderId: currentUserId,
            receiverId: conversation.partnerId,
            content: ' ',
            timestamp: messageResult.timestamp || Date.now(), // Use server timestamp if available, otherwise current time in milliseconds
            isUploading: true,
            attachment_count: selectedImages.length,
            senderUsername: window.currentUser.real_name || window.currentUser.real_name || 'User'
        };

        // Add to conversation
        conversation.messages = conversation.messages || [];
        conversation.messages.push(uploadingMessage);
        uploadingMessageId = uploadingMessage.id;

        // Add to UI immediately for sender
        displayMessage(uploadingMessage, currentUserId);

        // Scroll to bottom
        const messagesArea = document.getElementById('messagesArea');
        messagesArea.scrollTop = messagesArea.scrollHeight;

        // Upload images with progress tracking
        const formData = new FormData();
        formData.append('partnerId', conversation.partnerId);
        formData.append('messageId', createdMessageId);



        selectedImages.forEach((file, index) => {
            formData.append('images', file);
        });

        const uploadData = await uploadChatImagesWithProgress(formData, currentUserId, (progress) => {
            showNotification(`📤 Uploading... ${progress}%`, 'info');
        });

        if (uploadData && uploadData.success) {
            showNotification(`✅ Successfully uploaded ${uploadData.data.totalProcessed} image(s)`, 'success');
            clearImagePreviews();

            // Auto-save image reply messages when in saved tab
            // Note: Users cannot save their own messages - only received messages can be saved
            // Auto-save logic removed to prevent 403 errors

            // Update conversations list
            await loadConversations();

            // Clear reply information after successful image send
            // Images are the final action, so we can clear the reply state now
            if (window.currentReply) {
                cancelReply();
            }
        } else {
            throw new Error(uploadData?.error || uploadData?.data?.error || 'Upload failed');
        }

    } catch (error) {
        const messageIdToRemove = createdMessageId || uploadingMessageId;

        // Remove placeholder message from UI + local state (so "📷 Image" doesn't look like it succeeded)
        if (messageIdToRemove) {
            try {
                // Remove from DOM
                const messageEl = document.querySelector(`[data-message-id="${messageIdToRemove}"]`);
                if (messageEl) {
                    messageEl.remove();
                }

                // Remove from in-memory conversation
                if (conversation && Array.isArray(conversation.messages)) {
                    conversation.messages = conversation.messages.filter(m => (m && m.id) != messageIdToRemove);
                }

                // Best-effort: recall/delete the created message on server
                await fetch(`/api/messages/${messageIdToRemove}/recall`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-ID': currentUserId
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({})
                }).catch(() => {});
            } catch (_) {
                // Ignore cleanup errors; UX notification below still applies
            }
        }

        showNotification(`Failed to upload images: ${error.message}`, 'error');
    }
}

/**
 * Fallback to refresh conversation if WebSocket delivery fails
 * Reloads messages only when the new message is still missing after a short delay
 */
function scheduleMessageRefreshFallback(conversation, messageId, delay = 800) {
    if (!conversation || !messageId || typeof loadMessages !== 'function') {
        return;
    }

    const targetConversationId = (conversation.id || conversation.partnerId || '').toString();
    if (!targetConversationId) {
        return;
    }

    const messageSelectorId = messageId.toString();

    setTimeout(async () => {
        const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
        if (currentFilter === 'saved') {
            return;
        }

        const activeConversationId = TalkState ? TalkState.getCurrentConversation() : null;
        if (activeConversationId && activeConversationId.toString() !== targetConversationId) {
            return;
        }

        const existingMessage = document.querySelector(`[data-message-id="${messageSelectorId}"]`);
        if (existingMessage) {
            return;
        }

        try {
            await loadMessages(conversation, { forceRefresh: true, offset: 0, limit: 10 });
        } catch (error) {
            console.error('[Talk] Fallback refresh failed after send', error);
        }
    }, delay);
}

// Make functions globally available
window.sendMessage = sendMessage;
window.sendImagesWithPreviews = sendImagesWithPreviews;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sendMessage,
        sendImagesWithPreviews
    };
}












