/**
 * TALK MESSAGE FACTORY
 * Creates message DOM elements (system, image, text messages)
 * Extracted from talk.html (lines 1066-1533)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - CONFIG (talk_config.js)
 * - Utils (talk_utils.js)
 * - Global functions: processMessageText, isMessageSentByMe, createEnhancedLoadingPlaceholder,
 *   addMessageActions, formatMessageTime, openImageViewer
 */

/**
 * Process message text (convert URLs to links)
 */
function processMessageText(text) {
    if (!text) return '';

    // Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const processedText = text.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="message-link">${url}</a>`;
    });

    // Convert emojis to proper display (if needed)
    return processedText;
}

/**
 * Check if message is sent by current user
 */
function isMessageSentByMe(message) {
    const currentUserId = TalkState.getCurrentUserId() || window.currentUser?.id || (typeof getUserIdFromToken === 'function' ? getUserIdFromToken() : null);
    
    if (!currentUserId) {
        const token = typeof getSessionToken === 'function' ? getSessionToken() : null;
        const currentUserIdFromToken = token ? parseInt(token) : null;
        const senderIdNum = parseInt(message.sender_id);
        return currentUserIdFromToken && senderIdNum === currentUserIdFromToken;
    }

    const senderIdNum = parseInt(message.sender_id);
    return senderIdNum === currentUserId;
}

/**
 * Message Factory - Creates message DOM elements
 */
const MessageFactory = {
    applyHelperClasses: function (element, message, options = {}) {
        if (!element) return;
        const type = (message?.type || '').toLowerCase();

        if (type === 'sent') {
            element.classList.add('message--sent');
        }

        if (type === 'system') {
            element.classList.add('message--system');
        }

        if (options.isImageMessage) {
            element.classList.add('message--image');
        }
    },
    // Create message element
    create: function (message) {
        // Handle system messages
        if (message.type === 'system') {
            return this.createSystemMessage(message);
        }

        const messageText = message.text || message.content || '';
        // Check if we have image attachments - filter by attachment_type === 'image' or assume all are images if attachment_type is not set
        const imageAttachmentsForCheck = message.attachments ? message.attachments.filter(att => 
            att.attachment_type === 'image' || !att.attachment_type // If no attachment_type, assume it's an image
        ) : [];
        // Only consider it has image attachments if we actually have attachments with valid paths
        const hasValidImageAttachments = imageAttachmentsForCheck.length > 0 && 
            imageAttachmentsForCheck.some(att => att.thumbnail_path || att.file_path);
        // Also check for recalled image messages (they may have recall_type and attachment_count but empty attachments array)
        const isRecalledImageWithAttachments = message.recall_type && message.recall_type !== 'none' && 
                                               (message.attachment_count > 0 || message.hasAttachments || hasValidImageAttachments);
        const hasImageAttachments = hasValidImageAttachments || 
            (message.isUploading && (message.attachment_count > 0 || message.hasAttachments)) ||
            (message.attachment_count > 0 && imageAttachmentsForCheck.length > 0) ||
            isRecalledImageWithAttachments;

        // Consistent placeholder pattern matching (same as createTextMessage)
        const placeholderPatterns = [
            /^📷\s*$/,
            /^📷\s*Shared\s+\d+\s+image\(s?\)$/i,
            /^📷\s*Image$/i,
            /^📷\s*Shared\s+image$/i,
            /^📷\s*Image\s+shared$/i,
            /^📷\s*[A-Za-z\s]*image/i
        ];
        
        const isImagePlaceholder = !messageText || 
            messageText.trim() === '' ||
            messageText === '📷' ||
            (messageText && messageText.startsWith('📷 Shared')) ||
            (messageText && messageText.startsWith('📷 Image')) ||
            placeholderPatterns.some(pattern => pattern.test(messageText));

        // If it's an image-only message (has attachments and no real text), create separate image message
        if (hasImageAttachments && isImagePlaceholder) {
            return this.createImageMessage(message);
        }

        // Otherwise create regular text message
        return this.createTextMessage(message);
    },

    // Create system message element
    createSystemMessage: function (message) {
        const messageDiv = Utils.dom.createElement('div', 'message system', {
            'data-message-id': message.id
        });

        this.applyHelperClasses(messageDiv, message);

        const contentDiv = Utils.dom.createElement('div', 'message-content');
        contentDiv.textContent = message.text || message.content || '';

        messageDiv.appendChild(contentDiv);
        return messageDiv;
    },

    // Create image message element
    createImageMessage: function (message) {
        const messageDiv = Utils.dom.createElement('div', `message ${message.type} image-message`, {
            'data-message-id': message.id
        });

        this.applyHelperClasses(messageDiv, message, { isImageMessage: true });
        
        // Note: Timestamp removal is handled just before adding new timestamp to prevent duplicates

        if (message.recall_type && message.recall_type !== 'none') {
            messageDiv.classList.add('recalled-message');
            messageDiv.setAttribute('data-recalled', 'true');
            messageDiv.setAttribute('data-recall-type', message.recall_type);
        }

        if (message.type === 'received') {
            messageDiv.classList.add(message.isRead ? 'read' : 'unread');

            // Add avatar for received messages
            const currentConversation = TalkState.getCurrentConversation();
            const conversations = TalkState.getConversations();
            if (currentConversation && conversations[currentConversation]) {
                const conversation = conversations[currentConversation];
                if (conversation.avatar && typeof conversation.avatar === 'string' && conversation.avatar.length > 1) {
                    // Check if it's a valid image path (not a single letter)
                    const isValidImagePath = conversation.avatar.startsWith('/uploads/') || conversation.avatar.startsWith('uploads/');
                    if (isValidImagePath) {
                        const avatar = Utils.dom.createElement('img', 'message-avatar', {
                            src: conversation.avatar.startsWith('/') ? conversation.avatar : '/' + conversation.avatar,
                            alt: conversation.name || 'User'
                        });
                        avatar.style.cssText = 'width:48px;height:48px;border-radius:50%;margin-right:8px;float:left;';
                        avatar.onerror = function () {
                            // Fallback to letter avatar if image fails
                            const letterAvatar = Utils.dom.createElement('div', 'message-avatar-letter');
                            letterAvatar.textContent = (conversation.name || 'U').charAt(0).toUpperCase();
                            letterAvatar.style.cssText = 'width:48px;height:48px;border-radius:50%;margin-right:8px;float:left;background:#007bff;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;';
                            messageDiv.insertBefore(letterAvatar, messageDiv.firstChild);
                            this.remove();
                        };
                        messageDiv.insertBefore(avatar, messageDiv.firstChild);
                    } else {
                        // Not a valid image path, use letter avatar
                        const letterAvatar = Utils.dom.createElement('div', 'message-avatar-letter');
                        letterAvatar.textContent = (conversation.name || 'U').charAt(0).toUpperCase();
                        letterAvatar.style.cssText = 'width:48px;height:48px;border-radius:50%;margin-right:8px;float:left;background:#007bff;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;';
                        messageDiv.insertBefore(letterAvatar, messageDiv.firstChild);
                    }
                } else {
                    // No avatar or invalid avatar, use letter avatar fallback
                    const letterAvatar = Utils.dom.createElement('div', 'message-avatar-letter');
                    letterAvatar.textContent = (conversation.name || 'U').charAt(0).toUpperCase();
                    letterAvatar.style.cssText = 'width:32px;height:32px;border-radius:50%;margin-right:8px;float:left;background:#007bff;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;';
                    messageDiv.insertBefore(letterAvatar, messageDiv.firstChild);
                }
            }
        }

        if (message.replyTo) {
            const replyDiv = Utils.dom.createElement('div', 'message-reply-info');
            replyDiv.style.cssText = `
                background: rgba(0, 123, 255, 0.1);
                border-left: 3px solid #007bff;
                padding: 8px 12px;
                margin-bottom: 8px;
                border-radius: 4px;
                font-size: 13px;
                color: #6c757d;
                max-width: 300px;
            `;
            
            // Check if the original message had images
            // First check if replyTo already has the data
            let hasImage = message.replyTo.hasImage || (message.replyTo.attachments && message.replyTo.attachments.some(att => att.attachment_type === 'image'));
            let imageAttachment = hasImage && message.replyTo.attachments ? message.replyTo.attachments.find(att => att.attachment_type === 'image') : null;
            
            // If replyTo doesn't have attachments, try to look up the original message from conversation state
            if (!hasImage || !imageAttachment) {
                const conversations = TalkState.getConversations();
                const currentConversation = TalkState.getCurrentConversation();
                if (currentConversation && conversations[currentConversation] && conversations[currentConversation].messages) {
                    const originalMsg = conversations[currentConversation].messages.find(m => m.id == message.replyTo.id);
                    if (originalMsg && originalMsg.attachments && originalMsg.attachments.length > 0) {
                        const imageAttachments = originalMsg.attachments.filter(att => att.attachment_type === 'image');
                        if (imageAttachments.length > 0) {
                            hasImage = true;
                            imageAttachment = imageAttachments[0];
                            // Update replyTo object with the found data
                            if (!message.replyTo.attachments) {
                                message.replyTo.attachments = [];
                            }
                            message.replyTo.attachments = imageAttachments;
                            message.replyTo.hasImage = true;
                        }
                    }
                }
            }
            
            let replyContent = '';
            if (hasImage && imageAttachment && (imageAttachment.thumbnail_path || imageAttachment.file_path)) {
                // Show image thumbnail in reply
                const thumbnailPath = imageAttachment.thumbnail_path || imageAttachment.file_path;
                const imagePath = imageAttachment.file_path || thumbnailPath;
                replyContent = `
                    <div class="reply-to-text" style="margin-bottom: 4px;">↩️ Replying to:</div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${thumbnailPath.startsWith('/') ? thumbnailPath : '/' + thumbnailPath}" 
                             alt="Reply image" 
                             style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; cursor: pointer; flex-shrink: 0;"
                             onerror="this.style.display='none'; this.parentElement.querySelector('.reply-image-fallback').style.display='inline-flex';"
                             onclick="if(typeof openImageViewer === 'function') openImageViewer('${imagePath.startsWith('/') ? imagePath : '/' + imagePath}', '${imageAttachment.original_filename || 'Image'}')">
                        <span class="reply-image-fallback" style="display: none; width: 40px; height: 40px; background: #f0f0f0; border-radius: 4px; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">📷</span>
                        <div class="reply-to-text" style="opacity: 0.8; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${message.replyTo.text && message.replyTo.text !== 'Image' ? (message.replyTo.text.length > 30 ? message.replyTo.text.substring(0, 30) + '...' : message.replyTo.text) : 'Image'}</div>
                    </div>
                `;
            } else if (hasImage) {
                // Show image placeholder if attachment was filtered out
                replyContent = `
                    <div class="reply-to-text" style="margin-bottom: 4px;">↩️ Replying to:</div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-flex; width: 40px; height: 40px; background: #f0f0f0; border-radius: 4px; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">📷</span>
                        <div class="reply-to-text" style="opacity: 0.8; flex: 1;">${message.replyTo.text && message.replyTo.text !== 'Image' ? (message.replyTo.text.length > 30 ? message.replyTo.text.substring(0, 30) + '...' : message.replyTo.text) : 'Image'}</div>
                    </div>
                `;
            } else {
                // Show text only
                replyContent = `
                    <div class="reply-to-text" style="margin-bottom: 2px;">↩️ Replying to:</div>
                    <div class="reply-to-text" style="opacity: 0.8;">${message.replyTo.text.length > 50 ? message.replyTo.text.substring(0, 50) + '...' : message.replyTo.text}</div>
                `;
            }
            
            replyDiv.innerHTML = replyContent;
            const replyImg2 = replyDiv.querySelector('.reply-image-thumb');
            if (replyImg2) {
                replyImg2.addEventListener('error', function() {
                    this.style.display = 'none';
                    this.parentElement.querySelector('.reply-image-fallback').style.display = 'inline-flex';
                });
                replyImg2.addEventListener('click', function() {
                    if (typeof openImageViewer === 'function') {
                        openImageViewer(this.dataset.imagePath, this.dataset.imageFilename);
                    }
                });
            }
            messageDiv.appendChild(replyDiv);
        }

        // Check for image attachments early (needed for recalled image detection)
        const imageAttachmentsForCheck = message.attachments ? message.attachments.filter(att => 
            att.attachment_type === 'image' || !att.attachment_type
        ) : [];
        const hasValidImageAttachmentsForRecall = imageAttachmentsForCheck.length > 0 && 
            imageAttachmentsForCheck.some(att => att.thumbnail_path || att.file_path);
        // For recalled images, also check recall_type and attachment_count/hasAttachments
        const isRecalledImageWithAttachments = message.recall_type && message.recall_type !== 'none' && 
                                               (message.attachment_count > 0 || message.hasAttachments);
        const hasImageAttachmentsForRecall = hasValidImageAttachmentsForRecall || 
                                            (message.attachment_count > 0 && imageAttachmentsForCheck.length > 0) ||
                                            isRecalledImageWithAttachments;

        // Check if this is a recalled IMAGE message by the current user
        // Only show "Image recalled" if it actually has image attachments
        const isRecalledImageMessage = message.recall_type && message.recall_type !== 'none' && isMessageSentByMe(message) && 
                                       hasImageAttachmentsForRecall;
        
        if (isRecalledImageMessage) {
            // For recalled image messages by sender, show "Image recalled" placeholder
            const recalledContainer = Utils.dom.createElement('div', 'message-images-container');
            const recalledPlaceholder = Utils.dom.createElement('div', 'recalled-image-placeholder');
            recalledPlaceholder.innerHTML = `
                <div class="recalled-content">
                    <span class="recalled-icon">🗑️</span>
                    <span class="recalled-text">Image recalled</span>
                </div>
            `;
            recalledContainer.appendChild(recalledPlaceholder);
            messageDiv.appendChild(recalledContainer);
        } else {
            // For non-recalled messages or recalled messages for recipients, show the original images
            const imageContainer = Utils.dom.createElement('div', 'message-images-container');
            let hasValidImages = false;

            if (message.attachments && message.attachments.length > 0) {
                message.attachments.forEach((attachment) => {
                    // Accept attachments with attachment_type === 'image' or no attachment_type (assume image)
                    if (attachment.attachment_type === 'image' || !attachment.attachment_type) {
                        const imagePaths = [];
                        if (attachment.thumbnail_path) {
                            imagePaths.push(attachment.thumbnail_path);
                        }
                        if (attachment.file_path && attachment.file_path !== attachment.thumbnail_path) {
                            imagePaths.push(attachment.file_path);
                        }

                        // Only create image if we have at least one valid path
                        if (imagePaths.length > 0) {
                            const imgWrapper = Utils.dom.createElement('div', 'message-image-wrapper');

                            const img = Utils.dom.createElement('img', 'message-image-clean message__image-clean', {
                                alt: attachment.original_filename || 'Image'
                            });
                            img.style.cursor = 'pointer';
                            img.style.opacity = '0';
                            imgWrapper.classList.add('loading');

                            img.onload = function () {
                                this.style.transition = 'all 0.3s ease';
                                this.style.opacity = '1';
                                imgWrapper.classList.remove('loading');
                            };

                            img.onerror = function () {
                                imgWrapper.innerHTML = `
                                    <div class="image-error-clean">
                                        <span>📷 Image unavailable</span>
                                    </div>
                                `;
                            };

                            Utils.image.loadWithFallback(img, imagePaths);

                            img.onclick = () => {
                                if (typeof openImageViewer === 'function') {
                                    openImageViewer(attachment.file_path || attachment.thumbnail_path, attachment.original_filename);
                                }
                            };

                            imgWrapper.appendChild(img);
                            imageContainer.appendChild(imgWrapper);
                            hasValidImages = true;
                        }
                    }
                });
            } else if (message.isUploading) {
                // Create empty container for uploading - images will be added when upload completes
                hasValidImages = true;
            }

            // Append container if it has content or is uploading (for replaceProgressWithImages to find)
            if (hasValidImages) {
                messageDiv.appendChild(imageContainer);
            }
        }

        if (!message.isUploading) {
            if (typeof addMessageActions === 'function') {
                addMessageActions(messageDiv, message);
            }
        } else {
            // No loading placeholder timeout needed
        }

        // CRITICAL: Remove any existing timestamps before adding new one (prevent duplicates)
        const existingTimeElements = messageDiv.querySelectorAll('.message-time');
        existingTimeElements.forEach(el => el.remove());

        // Add timestamp for all image messages (including recalled images) - use ONLY database timestamp
        const timeDiv = Utils.dom.createElement('div', 'message-time');
        // CRITICAL: Only use database timestamp, never extract from DOM (message.time could be from DOM)
        const timeText = message.timestamp 
            ? (typeof formatMessageTime === 'function' ? formatMessageTime(message.timestamp) : new Date(message.timestamp).toLocaleTimeString())
            : (message.time || new Date().toLocaleTimeString()); // Fallback only if no timestamp
        // Check if it's HTML (contains spans) or plain text
        if (timeText.includes('<span')) {
            timeDiv.innerHTML = timeText;
        } else {
            timeDiv.textContent = timeText;
        }
        
        // Read counter badge removed - no longer showing blue box with "1"
        
        messageDiv.appendChild(timeDiv);

        return messageDiv;
    },

    // Create text message element
    createTextMessage: function (message) {
        const messageDiv = Utils.dom.createElement('div', `message ${message.type}`, {
            'data-message-id': message.id
        });

        this.applyHelperClasses(messageDiv, message);

        if (message.recall_type && message.recall_type !== 'none') {
            messageDiv.classList.add('recalled-message');
            messageDiv.setAttribute('data-recalled', 'true');
            messageDiv.setAttribute('data-recall-type', message.recall_type);
        }

        if (message.type === 'received') {
            messageDiv.classList.add(message.isRead ? 'read' : 'unread');

            // Add avatar for received messages
            const currentConversation = TalkState.getCurrentConversation();
            const conversations = TalkState.getConversations();
            if (currentConversation && conversations[currentConversation]) {
                const conversation = conversations[currentConversation];
                // CRITICAL: Validate avatar is a valid image path, not a single letter
                if (conversation.avatar && typeof conversation.avatar === 'string' && conversation.avatar.length > 1) {
                    const isValidImagePath = conversation.avatar.startsWith('/uploads/') || conversation.avatar.startsWith('uploads/');
                    if (isValidImagePath) {
                        const avatar = Utils.dom.createElement('img', 'message-avatar', {
                            src: conversation.avatar.startsWith('/') ? conversation.avatar : '/' + conversation.avatar,
                            alt: conversation.name || 'User'
                        });
                        avatar.style.cssText = 'width:48px;height:48px;border-radius:50%;margin-right:8px;float:left;';
                        avatar.onerror = function () {
                            // Fallback to letter avatar if image fails
                            const letterAvatar = Utils.dom.createElement('div', 'message-avatar-letter');
                            letterAvatar.textContent = (conversation.name || 'U').charAt(0).toUpperCase();
                            letterAvatar.style.cssText = 'width:48px;height:48px;border-radius:50%;margin-right:8px;float:left;background:#007bff;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;';
                            messageDiv.insertBefore(letterAvatar, messageDiv.firstChild);
                            this.remove();
                        };
                        messageDiv.insertBefore(avatar, messageDiv.firstChild);
                    } else {
                        // Not a valid image path, use letter avatar
                        const letterAvatar = Utils.dom.createElement('div', 'message-avatar-letter');
                        letterAvatar.textContent = (conversation.name || 'U').charAt(0).toUpperCase();
                        letterAvatar.style.cssText = 'width:48px;height:48px;border-radius:50%;margin-right:8px;float:left;background:#007bff;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;';
                        messageDiv.insertBefore(letterAvatar, messageDiv.firstChild);
                    }
                } else {
                    // No avatar or invalid avatar (single letter), use letter avatar fallback
                    const letterAvatar = Utils.dom.createElement('div', 'message-avatar-letter');
                    letterAvatar.textContent = (conversation.name || 'U').charAt(0).toUpperCase();
                    letterAvatar.style.cssText = 'width:32px;height:32px;border-radius:50%;margin-right:8px;float:left;background:#007bff;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;';
                    messageDiv.insertBefore(letterAvatar, messageDiv.firstChild);
                }
            }
        }

        if (message.replyTo) {
            const replyDiv = Utils.dom.createElement('div', 'message-reply-info');
            replyDiv.style.cssText = `
                background: rgba(0, 123, 255, 0.1);
                border-left: 3px solid #007bff;
                padding: 8px 12px;
                margin-bottom: 8px;
                border-radius: 4px;
                font-size: 13px;
                color: #6c757d;
            `;
            
            // Check if reply has image attachments
            const hasImage = message.replyTo.hasImage || (message.replyTo.attachments && message.replyTo.attachments.some(att => att.attachment_type === 'image'));
            const imageAttachment = hasImage && message.replyTo.attachments ? message.replyTo.attachments.find(att => att.attachment_type === 'image') : null;
            
            let replyContent = '';
            if (hasImage && imageAttachment && imageAttachment.thumbnail_path) {
                // Show image thumbnail in reply
                const thumbnailPath = imageAttachment.thumbnail_path || imageAttachment.file_path;
                const imagePath = imageAttachment.file_path || thumbnailPath;
                replyContent = `
                    <div class="reply-to-text" style="margin-bottom: 4px;">↩️ Replying to:</div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${thumbnailPath.startsWith('/') ? thumbnailPath : '/' + thumbnailPath}" 
                             alt="Reply image" 
                             style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; cursor: pointer; flex-shrink: 0;"
                             onerror="this.style.display='none'; this.parentElement.querySelector('.reply-image-fallback').style.display='inline-flex';"
                             onclick="if(typeof openImageViewer === 'function') openImageViewer('${imagePath.startsWith('/') ? imagePath : '/' + imagePath}', '${imageAttachment.original_filename || 'Image'}')">
                        <span class="reply-image-fallback" style="display: none; width: 40px; height: 40px; background: #f0f0f0; border-radius: 4px; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">📷</span>
                        <div class="reply-to-text" style="opacity: 0.8; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${message.replyTo.text && message.replyTo.text !== 'Image' ? (message.replyTo.text.length > 30 ? message.replyTo.text.substring(0, 30) + '...' : message.replyTo.text) : 'Image'}</div>
                    </div>
                `;
            } else if (hasImage) {
                // Show image placeholder if attachment was filtered out
                replyContent = `
                    <div class="reply-to-text" style="margin-bottom: 4px;">↩️ Replying to:</div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-flex; width: 40px; height: 40px; background: #f0f0f0; border-radius: 4px; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">📷</span>
                        <div class="reply-to-text" style="opacity: 0.8; flex: 1;">${message.replyTo.text && message.replyTo.text !== 'Image' ? (message.replyTo.text.length > 30 ? message.replyTo.text.substring(0, 30) + '...' : message.replyTo.text) : 'Image'}</div>
                    </div>
                `;
            } else {
                // Show text only
                replyContent = `
                    <div class="reply-to-text" style="margin-bottom: 2px;">↩️ Replying to:</div>
                    <div class="reply-to-text" style="opacity: 0.8;">${message.replyTo.text.length > 50 ? message.replyTo.text.substring(0, 50) + '...' : message.replyTo.text}</div>
                `;
            }
            
            replyDiv.innerHTML = replyContent;
            const replyImg2 = replyDiv.querySelector('.reply-image-thumb');
            if (replyImg2) {
                replyImg2.addEventListener('error', function() {
                    this.style.display = 'none';
                    this.parentElement.querySelector('.reply-image-fallback').style.display = 'inline-flex';
                });
                replyImg2.addEventListener('click', function() {
                    if (typeof openImageViewer === 'function') {
                        openImageViewer(this.dataset.imagePath, this.dataset.imageFilename);
                    }
                });
            }
            messageDiv.appendChild(replyDiv);
        }

        const messageText = message.text || message.content || '';
        // Check if we have image attachments - filter by attachment_type === 'image' or assume all are images if attachment_type is not set
        const imageAttachmentsForTextCheck = message.attachments ? message.attachments.filter(att => 
            att.attachment_type === 'image' || !att.attachment_type // If no attachment_type, assume it's an image
        ) : [];
        const hasImageAttachments = imageAttachmentsForTextCheck.length > 0 || (message.attachment_count && message.attachment_count > 0);

        const placeholderPatterns = [
            /^📷\s*$/,
            /^📷\s*Shared\s+\d+\s+image\(s?\)$/i,
            /^📷\s*Image$/i,
            /^📷\s*Shared\s+image$/i,
            /^📷\s*Image\s+shared$/i,
            /^📷\s*[A-Za-z\s]*image/i
        ];

        const isImagePlaceholder = !messageText || 
            messageText.trim() === '' ||
            messageText === '📷' ||
            (messageText && messageText.startsWith('📷 Shared')) ||
            (messageText && messageText.startsWith('📷 Image')) ||
            placeholderPatterns.some(pattern => pattern.test(messageText));

        // If message is image-only (has attachments but no real text), use thumbnail container instead of bubble
        const isImageOnlyMessage = hasImageAttachments && isImagePlaceholder;

        // Use thumbnail container for image-only messages, bubble for text messages
        const bubble = Utils.dom.createElement('div', isImageOnlyMessage ? 'thumbnail-message-container' : 'message-bubble');

        // Add recalled-bubble class only if message is recalled by the current user (sender sees grey bubble)
        if (message.recall_type && message.recall_type !== 'none' && isMessageSentByMe(message)) {
            bubble.classList.add('recalled-bubble');
        }

        // Check if this is a recalled image message - if so, don't show text recall (image recall is handled in createImageMessage)
        const isRecalledImageMessage = message.recall_type && message.recall_type !== 'none' && isMessageSentByMe(message) && 
                                       (hasImageAttachments || message.attachment_count > 0 || (message.attachments && message.attachments.length > 0));
        
        if (messageText && (!isImagePlaceholder || !hasImageAttachments)) {
            const textDiv = Utils.dom.createElement('div', 'message-text');

            // Check if this is a recalled message from the current user (but not an image message)
            if (message.recall_type && message.recall_type !== 'none' && isMessageSentByMe(message) && !isRecalledImageMessage) {
                // For recalled text messages by sender, show only "Message recalled"
                textDiv.innerHTML = `
                    <div class="recalled-content">
                        <span class="recalled-icon">🗑️</span>
                        <span class="recalled-text">Message recalled</span>
                    </div>
                `;
            } else {
                // For non-recalled messages or recalled messages for recipients, show the original content
                const processedText = typeof processMessageText === 'function' ? processMessageText(messageText) : messageText;
                textDiv.innerHTML = processedText;
            }

            bubble.appendChild(textDiv);
        }

        if (hasImageAttachments) {
            const attachmentsDiv = Utils.dom.createElement('div', 'message-attachments');

            if (message.attachments && message.attachments.length > 0) {
                // Filter for image attachments, or if no attachment_type is set, assume it's an image
                const imageAttachments = message.attachments.filter(att => 
                    att.attachment_type === 'image' || !att.attachment_type
                );

                if (imageAttachments.length === 1) {
                    const attachment = imageAttachments[0];
                    const imageContainer = Utils.image.createContainer(attachment, true, 0, message.type);
                    attachmentsDiv.appendChild(imageContainer);
                } else if (imageAttachments.length <= 4) {
                    imageAttachments.forEach((attachment, index) => {
                        const imageContainer = Utils.image.createContainer(attachment, false, index, message.type);
                        attachmentsDiv.appendChild(imageContainer);
                    });
                } else {
                    imageAttachments.slice(0, 4).forEach((attachment, index) => {
                        const imageContainer = Utils.image.createContainer(attachment, false, index, message.type);

                        if (index === 3) {
                            const countOverlay = Utils.dom.createElement('div', 'image-count-overlay');
                            countOverlay.innerHTML = `+${imageAttachments.length - 4}`;
                            imageContainer.appendChild(countOverlay);
                        }

                        attachmentsDiv.appendChild(imageContainer);
                    });
                }
            }
            // No loading placeholder - attachments will appear when ready

            bubble.appendChild(attachmentsDiv);
        }

        if (!message.isUploading) {
            if (typeof addMessageActions === 'function') {
                addMessageActions(messageDiv, message);
            }
        }

        messageDiv.appendChild(bubble);

        // CRITICAL: Remove any existing timestamps before adding new one (prevent duplicates)
        const existingTimeElements = messageDiv.querySelectorAll('.message-time');
        existingTimeElements.forEach(el => el.remove());

        // Add timestamp for all messages (including recalled images and text messages) - use ONLY database timestamp
        const timeDiv = Utils.dom.createElement('div', 'message-time');
        // CRITICAL: Only use database timestamp, never extract from DOM (message.time could be from DOM)
        const timeText = message.timestamp 
            ? (typeof formatMessageTime === 'function' ? formatMessageTime(message.timestamp) : new Date(message.timestamp).toLocaleTimeString())
            : (message.time || new Date().toLocaleTimeString()); // Fallback only if no timestamp
        // Check if it's HTML (contains spans) or plain text
        if (timeText.includes('<span')) {
            timeDiv.innerHTML = timeText;
        } else {
            timeDiv.textContent = timeText;
        }
        
        // Read counter badge removed - no longer showing blue box with "1"
        
        messageDiv.appendChild(timeDiv);

        return messageDiv;
    }
};

/**
 * Create message element (wrapper for MessageFactory)
 */
function createMessageElement(message) {
    return MessageFactory.create(message);
}

// Make functions globally available
window.MessageFactory = MessageFactory;
window.createMessageElement = createMessageElement;
window.processMessageText = processMessageText;
window.isMessageSentByMe = isMessageSentByMe;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MessageFactory,
        createMessageElement,
        processMessageText,
        isMessageSentByMe
    };
}
