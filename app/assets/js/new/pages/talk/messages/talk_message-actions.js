/**
 * TALK MESSAGE ACTIONS
 * Handles message actions (reactions, replies, forward, delete, image viewer)
 * Extracted from talk.html (lines 1786-2385)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - CONFIG (talk_config.js)
 * - Global functions: isMessageSentByMe, getCurrentFilter, showNotification, 
 *   saveMessage, unsaveMessage, deleteMessage, performDeleteMessage
 * 
 * IMPORTANT: Confirmation modal has been REMOVED - recall button calls performDeleteMessage directly
 * Version: 2.1 - No modal (updated 2025-01-XX to completely remove confirmation modal)
 * 
 * CACHE BUST: If you see errors about modal.dataset, clear browser cache (Ctrl+Shift+R)
 */

// Global variable for current reply (stored in window for access)
if (!window.currentReply) {
    window.currentReply = null;
}

/**
 * Add message action buttons (reactions, reply, forward, delete)
 */
function addMessageActions(messageDiv, message) {
    // Don't add actions if they already exist
    if (messageDiv.querySelector('.message-actions')) {
        return;
    }

    // Ensure message.type is set - fallback if missing
    if (!message.type) {
        const currentUserId = typeof TalkState !== 'undefined' && TalkState.getCurrentUserId ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);
        const senderId = message.sender_id || message.senderId;
        if (currentUserId && senderId) {
            message.type = parseInt(senderId) === parseInt(currentUserId) ? 'sent' : 'received';
        } else {
            // Fallback: check DOM classes if user ID not available
            if (messageDiv.classList.contains('sent')) {
                message.type = 'sent';
            } else if (messageDiv.classList.contains('received')) {
                message.type = 'received';
            }
        }
    }

    // Ensure recall_type is set with default value
    if (!message.recall_type) {
        message.recall_type = 'none';
    }

    // Don't add actions for recalled messages (both text and image)
    // This ensures recalled messages don't show action buttons for the sender
    if (message.recall_type && message.recall_type !== 'none' && typeof isMessageSentByMe === 'function' && isMessageSentByMe(message)) {
        return;
    }

    // Add message quick actions on hover
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    actionsDiv.style.display = 'none';

    // Reaction button
    const reactionBtn = document.createElement('button');
    reactionBtn.className = 'message-action-btn reaction-btn';
    reactionBtn.innerHTML = '😊';
    reactionBtn.title = 'Add reaction';
    reactionBtn.onclick = (e) => {
        e.stopPropagation();
        showReactionPicker(message.id, reactionBtn);
    };

    // Reply button (for all messages)
    const replyBtn = document.createElement('button');
    replyBtn.className = 'message-action-btn reply-btn';
    replyBtn.innerHTML = '↩️';
    replyBtn.title = 'Reply';
    replyBtn.onclick = (e) => {
        e.stopPropagation();
        // Get full message data including attachments from DOM or conversation
        const fullMessage = getFullMessageData(messageDiv, message);
        startReply(fullMessage);
    };
    actionsDiv.appendChild(replyBtn);

    // Save/Unsave button (only for received messages)
    // Note: Soft-recalled messages can still be saved by receiver since content is still visible
    // Only hard-recalled messages (which are deleted) should not show save button
    // Use multiple checks to ensure we catch all received messages
    const isReceivedByType = message.type === 'received';
    const isReceivedByDOM = messageDiv.classList.contains('received');
    const isReceivedBySender = (() => {
        const currentUserId = typeof TalkState !== 'undefined' && TalkState.getCurrentUserId ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);
        const senderId = message.sender_id || message.senderId;
        return currentUserId && senderId && parseInt(senderId) !== parseInt(currentUserId);
    })();
    const isReceivedMessage = isReceivedByType || isReceivedByDOM || isReceivedBySender;
    // Allow saving soft-recalled messages (they're still visible to receiver)
    // Only block hard-recalled (but those are deleted anyway) or undefined/null recall_type means not recalled
    const recallType = message.recall_type || 'none';
    const isNotHardRecalled = recallType !== 'hard'; // Hard recalls delete the message, so they won't show up anyway
    
    if (isReceivedMessage && isNotHardRecalled) {
        const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
        const savedMessages = (CONFIG && CONFIG.USERS && CONFIG.USERS.SAVED_MESSAGES) ? CONFIG.USERS.SAVED_MESSAGES : [];
        const isMessageSaved = savedMessages && Array.isArray(savedMessages) ? savedMessages.find(saved => saved && saved.messageId == message.id) : false;

        // In Saved tab, show unsave button only (no star icon)
        // In conversation view, show star icon if saved, or save icon if not saved
        if (currentFilter === 'saved' && isMessageSaved) {
            // Saved tab: Show unsave button only
            const unsaveBtn = document.createElement('button');
            unsaveBtn.className = 'message-action-btn unsave-btn';
            unsaveBtn.innerHTML = '🗑️';
            unsaveBtn.title = 'Remove from saved';
            unsaveBtn.onclick = (e) => {
                e.stopPropagation();
                if (typeof unsaveMessage === 'function') {
                    unsaveMessage(message.id);
                }
            };
            actionsDiv.appendChild(unsaveBtn);
        } else {
            // Conversation view: Show save button (star if saved, floppy if not saved)
            const saveBtn = document.createElement('button');
            saveBtn.className = 'message-action-btn save-btn';
            
            if (isMessageSaved) {
                // Message is already saved - show star icon
                saveBtn.innerHTML = '⭐';
                saveBtn.className = 'message-action-btn save-btn saved';
                saveBtn.disabled = false; // Don't disable to preserve color
                saveBtn.title = 'Message already saved';
                saveBtn.style.opacity = '1';
                saveBtn.style.cursor = 'not-allowed';
                saveBtn.style.color = '#ffc107';
                saveBtn.style.filter = 'none';
                saveBtn.style.pointerEvents = 'auto';
                saveBtn.onclick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (typeof showNotification === 'function') {
                        showNotification('Message already saved', 'info');
                    }
                };
            } else {
                // Message is not saved - show save icon
                saveBtn.innerHTML = '💾';
                saveBtn.className = 'message-action-btn save-btn';
                saveBtn.title = 'Save message';
                saveBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (typeof saveMessage === 'function') {
                        saveMessage(message, e);
                    }
                };
            }
            actionsDiv.appendChild(saveBtn);
        }
    }

    // Forward button (for received messages or if it's your message)
    const forwardBtn = document.createElement('button');
    forwardBtn.className = 'message-action-btn forward-btn';
    forwardBtn.innerHTML = '➡️';
    forwardBtn.title = 'Forward';
    forwardBtn.onclick = (e) => {
        e.stopPropagation();
        forwardMessage(message);
    };

    actionsDiv.appendChild(reactionBtn);
    actionsDiv.appendChild(forwardBtn);

    // Add recall/delete button for sent messages only
    if (message.type === 'sent') {
        const recallBtn = document.createElement('button');
        recallBtn.className = 'message-action-btn recall-btn';
        recallBtn.innerHTML = '🗑️';
        recallBtn.title = 'Recall message (delete for everyone)';
        recallBtn.onclick = async (e) => {
            e.stopPropagation();
            // Direct recall - no confirmation modal
            // Ensure we have a valid message ID
            const msgId = message.id || message.messageId || message.message_id;
            
            if (!msgId) {
                console.error('No message ID found for recall');
                if (typeof showNotification === 'function') {
                    showNotification('Error: Message ID not found', 'error');
                }
                return;
            }
            
            if (typeof performDeleteMessage === 'function') {
                await performDeleteMessage(msgId, messageDiv);
            } else {
                console.error('performDeleteMessage function not available');
                if (typeof showNotification === 'function') {
                    showNotification('Error: Recall function not available', 'error');
                }
            }
        };
        actionsDiv.appendChild(recallBtn);
    }

    messageDiv.appendChild(actionsDiv);

    // Show/hide actions on hover
    messageDiv.addEventListener('mouseenter', () => {
        actionsDiv.style.display = 'flex';
    });

    messageDiv.addEventListener('mouseleave', () => {
        actionsDiv.style.display = 'none';
    });
}

/**
 * Enhanced Image Viewer with better UX
 */
function openImageViewer(imagePath, filename) {
    // Create modal overlay with improved styling
    const overlay = document.createElement('div');
    overlay.className = 'enhanced-image-viewer';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
    overlay.style.zIndex = '10000';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.cursor = 'pointer';
    overlay.style.backdropFilter = 'blur(10px)';

    // Create image container with controls
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-viewer-container';
    imageContainer.style.position = 'relative';
    imageContainer.style.maxWidth = '95%';
    imageContainer.style.maxHeight = '95%';
    imageContainer.style.display = 'flex';
    imageContainer.style.flexDirection = 'column';
    imageContainer.style.alignItems = 'center';

    // Create image element with enhanced features
    const img = document.createElement('img');
    img.src = imagePath;
    img.alt = filename;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '12px';
    img.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
    img.style.transition = 'transform 0.3s ease';

    // Add zoom functionality
    let scale = 1;
    img.onwheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        scale = Math.max(0.5, Math.min(3, scale * delta));
        img.style.transform = `scale(${scale})`;
    };

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.className = 'image-viewer-close';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '-40px';
    closeBtn.style.right = '0';
    closeBtn.style.background = 'rgba(255,255,255,0.2)';
    closeBtn.style.border = 'none';
    closeBtn.style.color = 'white';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.width = '40px';
    closeBtn.style.height = '40px';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.transition = 'all 0.2s ease';

    closeBtn.onmouseenter = () => {
        closeBtn.style.background = 'rgba(255,255,255,0.3)';
        closeBtn.style.transform = 'scale(1.1)';
    };

    closeBtn.onmouseleave = () => {
        closeBtn.style.background = 'rgba(255,255,255,0.2)';
        closeBtn.style.transform = 'scale(1)';
    };

    // Add filename display
    const filenameDiv = document.createElement('div');
    filenameDiv.className = 'image-viewer-filename';
    filenameDiv.textContent = filename || 'Image';
    filenameDiv.style.color = 'white';
    filenameDiv.style.marginTop = '16px';
    filenameDiv.style.fontSize = '14px';
    filenameDiv.style.opacity = '0.8';
    filenameDiv.style.textAlign = 'center';

    // Close on click outside image
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    };

    // Close on close button
    closeBtn.onclick = () => {
        document.body.removeChild(overlay);
    };

    // Assemble and display
    imageContainer.appendChild(closeBtn);
    imageContainer.appendChild(img);
    imageContainer.appendChild(filenameDiv);
    overlay.appendChild(imageContainer);
    document.body.appendChild(overlay);

    // Close on escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(overlay);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);

    // Add loading state
    img.onload = () => {
        img.style.opacity = '1';
    };

    img.onerror = () => {
        imageContainer.innerHTML = `
            <div style="color: white; text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px;">📷</div>
                <div style="font-size: 18px; margin-bottom: 8px;">Failed to load image</div>
                <div style="font-size: 14px; opacity: 0.7;">The image could not be displayed</div>
            </div>
        `;
    };
}

/**
 * Show reaction picker
 */
function showReactionPicker(messageId, button) {
    const reactions = ['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🔥'];

    // Remove existing picker
    const existing = document.querySelector('.reaction-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.position = 'absolute';
    picker.style.background = 'white';
    picker.style.border = '1px solid #ddd';
    picker.style.borderRadius = '20px';
    picker.style.padding = '8px';
    picker.style.display = 'flex';
    picker.style.gap = '4px';
    picker.style.zIndex = '1000';
    picker.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';

    reactions.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.style.border = 'none';
        btn.style.background = 'transparent';
        btn.style.fontSize = '18px';
        btn.style.padding = '4px';
        btn.style.borderRadius = '8px';
        btn.style.cursor = 'pointer';
        btn.onmouseenter = () => btn.style.background = '#f0f0f0';
        btn.onmouseleave = () => btn.style.background = 'transparent';
        btn.onclick = () => {
            addReaction(messageId, emoji);
            picker.remove();
        };
        picker.appendChild(btn);
    });

    // Position near the button
    const rect = button.getBoundingClientRect();
    picker.style.left = `${rect.left}px`;
    picker.style.top = `${rect.top - 50}px`;

    document.body.appendChild(picker);

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function closeReactionPicker(e) {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', closeReactionPicker);
            }
        });
    }, 100);
}

/**
 * Add reaction to message
 */
function addReaction(messageId, emoji) {
    if (typeof showNotification === 'function') {
        showNotification(`Added ${emoji} reaction`, 'success');
    }

    // Here you would typically send to server
    // For now, just show visual feedback
}

/**
 * Get full message data including attachments from DOM or conversation state
 */
function getFullMessageData(messageDiv, message) {
    // First, try to get from conversation messages (most reliable)
    const conversations = typeof TalkState !== 'undefined' && TalkState.getConversations ? TalkState.getConversations() : {};
    const currentConversation = typeof TalkState !== 'undefined' && TalkState.getCurrentConversation ? TalkState.getCurrentConversation() : null;
    
    if (currentConversation && conversations[currentConversation] && conversations[currentConversation].messages) {
        const fullMsg = conversations[currentConversation].messages.find(m => m.id == message.id);
        if (fullMsg) {
            // If full message has attachments, use it
            if (fullMsg.attachments && fullMsg.attachments.length > 0) {
                return fullMsg;
            }
            
            // Merge attachments from original message if they exist
            if (message.attachments && message.attachments.length > 0) {
                return { ...fullMsg, attachments: message.attachments, hasAttachments: true };
            }
            
            // Otherwise merge with original message but keep fullMsg data
            return { ...fullMsg, ...message };
        }
    }
    
    // Try to get attachments from DOM as fallback
    if (messageDiv) {
        const attachmentsDiv = messageDiv.querySelector('.message-attachments');
        if (attachmentsDiv) {
            const imageElements = attachmentsDiv.querySelectorAll('.message-image-wrapper img, .message-image-clean, img.message-image');
            
            if (imageElements.length > 0) {
                const attachments = [];
                imageElements.forEach((img, index) => {
                    const src = img.src || img.getAttribute('src') || img.getAttribute('data-src');
                    if (src) {
                        // Extract path from full URL or use as-is if already a path
                        let path = src;
                        if (src.includes('http://') || src.includes('https://')) {
                            // Extract path from full URL
                            try {
                                const urlObj = new URL(src);
                                path = urlObj.pathname;
                            } catch (e) {
                                // If URL parsing fails, try to extract path manually
                                const match = src.match(/\/(uploads\/[^?#]+)/);
                                if (match) path = match[1];
                            }
                        } else if (!path.startsWith('/')) {
                            path = '/' + path;
                        }
                        
                        attachments.push({
                            attachment_type: 'image',
                            file_path: path,
                            thumbnail_path: path,
                            original_filename: img.alt || img.getAttribute('data-filename') || img.getAttribute('data-original-filename') || `image_${index + 1}.jpg`
                        });
                    }
                });
                if (attachments.length > 0) {
                    return {
                        ...message,
                        attachments: attachments,
                        hasAttachments: true,
                        attachment_count: attachments.length
                    };
                }
            }
        }
    }
    
    // If original message has attachments, use them
    if (message.attachments && message.attachments.length > 0) {
        return message;
    }
    
    // Return original message if no attachments found
    return message;
}

/**
 * Start reply to message
 */
function startReply(message) {
    const input = document.getElementById('messageInput');
    if (!input) return;

    // Get the actual message text from various possible fields
    const messageText = message.text || message.content || '';

    // Check for image attachments
    const hasImageAttachments = (message.attachments && message.attachments.length > 0) ||
        (message.attachment_count && message.attachment_count > 0) ||
        message.hasAttachments;
    
    // Get the first image attachment if available
    const imageAttachment = hasImageAttachments && message.attachments && message.attachments.length > 0
        ? message.attachments.find(att => att.attachment_type === 'image')
        : null;

    // Check if it's an image placeholder message
    const isImagePlaceholder = messageText === '📷' ||
        (messageText && messageText.startsWith('📷 Shared')) ||
        (messageText && messageText.startsWith('📷 Image')) ||
        (messageText && messageText.match(/^📷\s*(Image|Shared)/i)) ||
        hasImageAttachments;

    // Determine the reply text to show
    let replyText;
    if (isImagePlaceholder || !messageText.trim()) {
        replyText = 'Image';
    } else {
        replyText = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText;
    }

    // Store the reply information with attachment data
    // Ensure attachments are properly structured
    let replyAttachments = [];
    if (message.attachments && Array.isArray(message.attachments) && message.attachments.length > 0) {
        replyAttachments = message.attachments.map(att => {
            // Ensure attachment has required fields
            return {
                attachment_type: att.attachment_type || 'image',
                file_path: att.file_path || att.path || '',
                thumbnail_path: att.thumbnail_path || att.thumbnailPath || att.file_path || att.path || '',
                original_filename: att.original_filename || att.originalFilename || att.filename || att.name || 'Image',
                stored_filename: att.stored_filename || att.storedFilename || att.filename || '',
                file_size: att.file_size || att.fileSize || 0
            };
        });
    }
    
    window.currentReply = {
        id: message.id,
        text: isImagePlaceholder || !messageText.trim() ? 'Image' : messageText,
        sender_id: message.sender_id,
        timestamp: message.timestamp,
        hasImage: hasImageAttachments,
        attachments: replyAttachments
    };

    // Show reply preview with image if available
    showReplyPreview(message, replyText, imageAttachment);

    // Focus input
    input.focus();
}

/**
 * Show reply preview above input
 */
function showReplyPreview(message, previewText, imageAttachment = null) {
    // Remove existing preview
    const existing = document.querySelector('.reply-preview');
    if (existing) existing.remove();

    const preview = document.createElement('div');
    preview.className = 'reply-preview';
    preview.style.background = '#f8f9fa';
    preview.style.border = '1px solid #dee2e6';
    preview.style.borderRadius = '8px';
    preview.style.padding = '8px 12px';
    preview.style.margin = '8px 0';
    preview.style.fontSize = '14px';
    preview.style.display = 'flex';
    preview.style.alignItems = 'center';
    preview.style.justifyContent = 'space-between';
    preview.style.gap = '8px';

    // Build preview content with optional image
    let previewContent = `
        <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
            <div style="flex: 1;">
                <div class="reply-to-text">Replying to:</div>
                <div class="reply-to-text" style="color: #6c757d;">${previewText}</div>
            </div>
    `;
    
    // Add image thumbnail if available
    if (imageAttachment) {
        const thumbnailPath = imageAttachment.thumbnail_path || imageAttachment.file_path;
        if (thumbnailPath) {
            const imagePath = thumbnailPath.startsWith('/') ? thumbnailPath : '/' + thumbnailPath;
            previewContent += `
                <img src="${imagePath}" 
                     style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;"
                     onerror="this.style.display='none'"
                     alt="Preview">
            `;
        }
    }
    
    previewContent += `
        </div>
        <button onclick="cancelReply()" style="background: none; border: none; color: #6c757d; font-size: 16px; cursor: pointer; flex-shrink: 0;">✕</button>
    `;

    preview.innerHTML = previewContent;

    const inputArea = document.getElementById('messageInputArea');
    if (inputArea) {
        inputArea.insertBefore(preview, inputArea.firstChild);
    }
}

/**
 * Cancel reply
 */
function cancelReply() {
    const preview = document.querySelector('.reply-preview');
    if (preview) preview.remove();
    window.currentReply = null; // Clear reply information
}

/**
 * Forward message
 */
function forwardMessage(message) {
    if (typeof showNotification === 'function') {
        showNotification('Forward feature coming soon!', 'info');
    }

    // Here you would show a conversation picker
    // For now, just show notification
}

/**
 * Reply to message function - maps to startReply
 */
function replyToMessage(messageId) {
    // Find the message element
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) {
        return;
    }

    // Extract message data
    const message = {
        id: messageId,
        text: messageElement.querySelector('.message-text')?.textContent || '',
        type: messageElement.classList.contains('sent') ? 'sent' : 'received'
    };

    // Call the existing startReply function
    startReply(message);
}

/**
 * Show confirmation modal
 * DISABLED: Modal has been completely removed - this function now immediately deletes without modal
 */
function showConfirmationModal(messageId, messageElement) {
    // CRITICAL: Modal HTML has been completely removed from the page
    // This function should not be called, but if it is, immediately proceed with deletion
    
    // Immediately proceed with deletion - NO MODAL ACCESS - modal doesn't exist
    if (!messageId) {
        console.error('showConfirmationModal: messageId is missing');
        return;
    }
    
    if (typeof performDeleteMessage === 'function') {
        const element = messageElement || document.querySelector(`[data-message-id="${messageId}"]`);
        // Call performDeleteMessage immediately - no modal
        performDeleteMessage(messageId, element || null);
    } else {
        console.error('showConfirmationModal: performDeleteMessage function not available');
        if (typeof showNotification === 'function') {
            showNotification('Error: Delete function not available', 'error');
        }
    }
}

/**
 * Close confirmation modal
 */
function closeConfirmationModal() {
    const modal = document.getElementById('confirmationModal');
    if (!modal) return;
    
    modal.classList.remove('show');

    // Clean up event listeners
    if (modal._keyHandler) {
        document.removeEventListener('keydown', modal._keyHandler);
        modal._keyHandler = null;
    }

    // Re-enable background scrolling
    document.body.style.overflow = '';

    // Clear modal state immediately (don't wait for timeout)
    modal.onclick = null;

    setTimeout(() => {
        modal.style.display = 'none';
        modal.dataset.messageId = '';
        modal.dataset.messageElement = '';
    }, 300);
}

/**
 * Confirm delete action
 */
async function confirmDelete(messageId, messageElement) {
    // Close modal first
    closeConfirmationModal();

    // Proceed with deletion using the passed parameters
    if (typeof performDeleteMessage === 'function') {
        await performDeleteMessage(messageId, messageElement);
    }
}

/**
 * Confirm delete from modal button click
 * DISABLED: Modal is no longer used for recall operations
 */
async function confirmDeleteFromModal() {
    // Modal is disabled - do nothing if somehow triggered
    const modal = document.getElementById('confirmationModal');
    if (modal) {
        // Ensure modal stays hidden
        modal.style.display = 'none';
        modal.style.visibility = 'hidden';
    }
    return;
}

/**
 * Delete/Recall message - now shows custom confirmation modal
 */
async function deleteMessage(messageId, messageElement) {
    // CRITICAL: This function should NOT be called for recall operations anymore
    // Recall button now directly calls performDeleteMessage
    // This function exists for backward compatibility only

    // Ensure we have a valid messageElement - try to find it fresh from DOM
    if (!messageElement || !messageElement.parentNode) {
        // Try to find the element fresh from DOM
        messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) {
            // Try with numeric ID
            const numericId = parseInt(messageId);
            if (!isNaN(numericId)) {
                messageElement = document.querySelector(`[data-message-id="${numericId}"]`);
            }
        }
    }

    // For real messages, proceed with direct deletion immediately (no confirmation modal)
    // CRITICAL: Do NOT call showConfirmationModal - modal has been removed from the page
    // Directly call performDeleteMessage instead
    if (typeof performDeleteMessage === 'function') {
        await performDeleteMessage(messageId, messageElement);
    } else {
        console.error('performDeleteMessage function not available');
        if (typeof showNotification === 'function') {
            showNotification('Error: Delete function not available', 'error');
        }
    }
}

// Make functions globally available
window.addMessageActions = addMessageActions;
window.openImageViewer = openImageViewer;
window.showReactionPicker = showReactionPicker;
window.addReaction = addReaction;
window.startReply = startReply;
window.showReplyPreview = showReplyPreview;
window.cancelReply = cancelReply;
window.forwardMessage = forwardMessage;
window.replyToMessage = replyToMessage;
window.getFullMessageData = getFullMessageData;
window.showConfirmationModal = showConfirmationModal;
window.closeConfirmationModal = closeConfirmationModal;
window.confirmDelete = confirmDelete;
window.confirmDeleteFromModal = confirmDeleteFromModal;
window.deleteMessage = deleteMessage;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        addMessageActions,
        openImageViewer,
        showReactionPicker,
        addReaction,
        startReply,
        showReplyPreview,
        cancelReply,
        forwardMessage,
        replyToMessage,
        showConfirmationModal,
        closeConfirmationModal,
        confirmDelete,
        confirmDeleteFromModal,
        deleteMessage
    };
}













