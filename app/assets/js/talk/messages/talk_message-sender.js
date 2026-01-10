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

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            // Message will appear via WebSocket real-time update
            // No need to manually add it here - WebSocket handler will display it

            // Note: Users cannot save their own messages - only received messages can be saved
            // Auto-save logic removed to prevent 403 errors

            // Update conversation list to refresh unread counts and last message
            // But don't reload conversations if we're on saved tab to preserve the view
            const messageFilter = getCurrentFilter();
            if (messageFilter !== 'saved') {
                await loadConversations();

                // IMPORTANT: Reload the conversation to ensure the message is saved in history
                // This ensures the sender can see their text messages in their history
                // BUT: Don't reload if we're on the saved tab
                const messageFilter = getCurrentFilter();
                if (messageFilter !== 'saved') {
                    setTimeout(async () => {
                        try {
                            await loadMessages(conversation, { append: true });
                        } catch (error) {
                            // Error handling
                        }
                    }, 500); // Short delay to ensure server has processed the message
                }
            } else {
                // For saved tab, just refresh the saved messages without reloading conversations

            }

            // Don't automatically clear reply after text - user might want to attach images
            // Reply will be cleared when: user cancels manually, sends images, or switches conversation
        } else {
            // CRITICAL: Improved error message clarity using backend error codes
            if (data.requiresEmailVerification || data.code === 'EMAIL_VERIFICATION_REQUIRED') {
                showNotification('Please verify your email address to send messages. Check your inbox for the verification email.', 'warning');
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

async function sendImagesWithPreviews() {
    if (selectedImages.length === 0) {
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

        if (!messageResponse.ok) {
            throw createError('Failed to create message');
        }

        const messageResult = await messageResponse.json();
        if (!messageResult.success) {
            // CRITICAL: Improved error message clarity using backend error codes
            if (messageResult.requiresEmailVerification || messageResult.code === 'EMAIL_VERIFICATION_REQUIRED') {
                showNotification('Please verify your email address to send messages. Check your inbox for the verification email.', 'warning');
                throw createError(messageResult.error || 'Email verification required');
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

        // Immediately add uploading message to UI for sender
        const uploadingMessage = {
            id: messageResult.messageId,
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

        // Add to UI immediately for sender
        displayMessage(uploadingMessage, currentUserId);

        // Scroll to bottom
        const messagesArea = document.getElementById('messagesArea');
        messagesArea.scrollTop = messagesArea.scrollHeight;

        // Upload images with progress tracking
        const formData = new FormData();
        formData.append('partnerId', conversation.partnerId);
        formData.append('messageId', messageResult.messageId);



        selectedImages.forEach((file, index) => {
            formData.append('images', file);
        });

        // Use XMLHttpRequest for progress tracking
        const uploadData = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // Track upload progress
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const progress = Math.round((event.loaded / event.total) * 100);
                    showNotification(`📤 Uploading... ${progress}%`, 'info');
                }
            });

            xhr.onload = function () {
                if (xhr.status === 200) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (e) {
                        reject(new Error('Invalid response format'));
                    }
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = function () {
                reject(new Error('Upload failed'));
            };

            xhr.open('POST', '/api/messages/upload-images');
            xhr.setRequestHeader('X-User-ID', currentUserId);
            xhr.send(formData);
        });

        if (uploadData.success) {
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
            throw new Error(uploadData.error || 'Upload failed');
        }

    } catch (error) {
        showNotification(`Failed to upload images: ${error.message}`, 'error');
    }
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












