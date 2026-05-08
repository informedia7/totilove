/**
 * TALK MESSAGE ACTIONS
 * Handles message actions (reactions, replies, delete, image viewer)
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

const messageReactions = new Map();
const messageReactionSummaries = new Map();

function normalizeReactionList(reactions) {
    if (typeof reactions === 'string') {
        const trimmed = reactions.trim();
        return trimmed ? [trimmed] : [];
    }

    if (!Array.isArray(reactions)) return [];

    const unique = new Set();
    reactions.forEach(value => {
        if (typeof value !== 'string') return;
        const trimmed = value.trim();
        if (!trimmed) return;
        unique.add(trimmed);
    });

    return Array.from(unique);
}

function normalizeMessageId(messageId) {
    if (messageId === undefined || messageId === null) return '';
    return String(messageId);
}

function getInitialReactionsFromMessage(message) {
    if (!message || typeof message !== 'object') return [];

    const explicitList = normalizeReactionList(message.my_reactions);
    if (explicitList.length > 0) return explicitList;

    if (typeof message.my_reaction === 'string' && message.my_reaction.trim()) return [message.my_reaction.trim()];
    if (typeof message.user_reaction === 'string' && message.user_reaction.trim()) return [message.user_reaction.trim()];
    if (typeof message.reaction_emoji === 'string' && message.reaction_emoji.trim()) return [message.reaction_emoji.trim()];
    if (typeof message.reaction === 'string' && message.reaction.trim()) return [message.reaction.trim()];

    if (Array.isArray(message.reactions)) {
        const mine = message.reactions.find(reaction => reaction && (reaction.is_mine || reaction.isMine) && typeof reaction.emoji === 'string' && reaction.emoji.trim());
        if (mine) return [mine.emoji.trim()];

        const first = message.reactions.find(reaction => reaction && typeof reaction.emoji === 'string' && reaction.emoji.trim());
        if (first) return [first.emoji.trim()];
    }

    return [];
}

function seedReactionFromMessage(message) {
    const messageKey = normalizeMessageId(message && message.id);
    if (!messageKey) return;

    if (!messageReactions.has(messageKey)) {
        const initialReactions = getInitialReactionsFromMessage(message);
        if (initialReactions.length > 0) {
            messageReactions.set(messageKey, initialReactions);
        }
    }

    if (!messageReactionSummaries.has(messageKey) && Array.isArray(message && message.reactions) && message.reactions.length > 0) {
        messageReactionSummaries.set(messageKey, message.reactions);
    }
}

function updateConversationReaction(messageId, emojis) {
    if (typeof TalkState === 'undefined' || typeof TalkState.getConversations !== 'function' || typeof TalkState.getCurrentConversation !== 'function') {
        return;
    }

    const conversations = TalkState.getConversations();
    const currentConversationId = TalkState.getCurrentConversation();
    if (!conversations || !currentConversationId || !conversations[currentConversationId] || !Array.isArray(conversations[currentConversationId].messages)) {
        return;
    }

    const target = conversations[currentConversationId].messages.find(msg => normalizeMessageId(msg && msg.id) === normalizeMessageId(messageId));
    if (!target) {
        return;
    }

    const normalized = normalizeReactionList(emojis);

    if (normalized.length > 0) {
        target.my_reaction = normalized[0];
        target.my_reactions = normalized;
        target.reaction_emoji = normalized[0];
    } else {
        delete target.my_reaction;
        delete target.my_reactions;
        delete target.reaction_emoji;
    }

    if (messageReactionSummaries.has(normalizeMessageId(messageId))) {
        target.reactions = messageReactionSummaries.get(normalizeMessageId(messageId));
    }
}

function getReactionRequestHeaders(currentUserId) {
    return {
        'Content-Type': 'application/json',
        'X-User-ID': String(currentUserId)
    };
}

async function persistReaction(messageId, emoji, removeSpecificEmoji = false) {
    const currentUserId = typeof TalkState !== 'undefined' && typeof TalkState.getCurrentUserId === 'function'
        ? TalkState.getCurrentUserId()
        : (window.currentUser && window.currentUser.id);

    if (!currentUserId) {
        throw new Error('User ID is missing');
    }

    const endpoint = `/api/messages/${encodeURIComponent(messageId)}/reaction`;

    const response = (!removeSpecificEmoji && emoji)
        ? await fetch(endpoint, {
            method: 'POST',
            headers: getReactionRequestHeaders(currentUserId),
            body: JSON.stringify({ reactionEmoji: emoji })
        })
        : await fetch(endpoint, {
            method: 'DELETE',
            headers: getReactionRequestHeaders(currentUserId),
            body: removeSpecificEmoji && emoji ? JSON.stringify({ reactionEmoji: emoji }) : undefined
        });

    let payload = null;
    try {
        payload = await response.json();
    } catch (e) {
        payload = null;
    }

    if (!response.ok || !payload || !payload.success) {
        throw new Error(payload && payload.error ? payload.error : `Reaction request failed (${response.status})`);
    }

    return payload.data || null;
}

function renderMessageReaction(messageElement, messageId) {
    if (!messageElement) return;

    const messageKey = normalizeMessageId(messageId);
    if (!messageKey) return;

    const isRecalled = messageElement.getAttribute('data-recalled') === 'true' || messageElement.classList.contains('recalled-message');
    const isSenderMessage = messageElement.classList.contains('sent') || messageElement.classList.contains('message--sent');
    const timeElement = messageElement.querySelector('.message-time');
    let reactionsContainer = messageElement.querySelector('.message-reactions');

    if (isRecalled && isSenderMessage) {
        if (reactionsContainer) reactionsContainer.remove();
        messageReactions.delete(messageKey);
        messageReactionSummaries.delete(messageKey);
        messageElement.classList.remove('has-reactions');
        return;
    }

    const myReactions = normalizeReactionList(messageReactions.get(messageKey));
    const myReactionSet = new Set(myReactions);
    const summary = Array.isArray(messageReactionSummaries.get(messageKey)) ? messageReactionSummaries.get(messageKey) : [];
    const normalizedSummary = summary
        .filter(item => item && typeof item.emoji === 'string' && item.emoji.trim())
        .map(item => ({
            emoji: item.emoji.trim(),
            count: Math.max(0, parseInt(item.count, 10) || 0)
        }))
        .filter(item => item.count > 0);

    if (normalizedSummary.length === 0 && myReactions.length > 0) {
        myReactions.forEach(emoji => {
            normalizedSummary.push({ emoji: String(emoji).trim(), count: 1 });
        });
    }

    const aggregatedMap = new Map();
    normalizedSummary.forEach(item => {
        const key = item.emoji;
        const current = aggregatedMap.get(key) || 0;
        aggregatedMap.set(key, current + item.count);
    });

    myReactions.forEach(emoji => {
        const key = String(emoji).trim();
        if (!key) return;
        if (!aggregatedMap.has(key)) {
            aggregatedMap.set(key, 1);
        }
    });

    const aggregatedSummary = Array.from(aggregatedMap.entries())
        .map(([emoji, count]) => ({ emoji, count }))
        .filter(item => item.count > 0);

    if (aggregatedSummary.length === 0) {
        if (reactionsContainer) reactionsContainer.remove();
        messageElement.classList.remove('has-reactions');
        return;
    }

    messageElement.classList.add('has-reactions');

    if (!reactionsContainer) {
        reactionsContainer = document.createElement('div');
        reactionsContainer.className = 'message-reactions';
    }

    if (timeElement && reactionsContainer.parentElement === messageElement) {
        if (timeElement.nextSibling !== reactionsContainer) {
            messageElement.insertBefore(reactionsContainer, timeElement.nextSibling);
        }
    } else if (reactionsContainer.parentElement !== messageElement) {
        messageElement.appendChild(reactionsContainer);
    }

    reactionsContainer.innerHTML = aggregatedSummary.map(item => {
        const safeEmoji = item.emoji;
        const safeCount = item.count;
        const titleText = safeCount > 1 ? `Reaction ${safeEmoji} (${safeCount})` : `Reaction ${safeEmoji}`;
        const mineClass = myReactionSet.has(safeEmoji) ? ' is-mine' : '';

        return `
            <button type="button" class="message-reaction-chip${mineClass}" title="${titleText}" aria-label="Message reaction ${safeEmoji} ${safeCount}">
                <span class="message-reaction-emoji">${safeEmoji}</span>
                ${safeCount > 1 ? `<span class="message-reaction-count">${safeCount}</span>` : ''}
            </button>
        `;
    }).join('');
}

function applyIncomingMessageReactionUpdate(payload) {
    if (!payload || !payload.messageId) return;

    const messageKey = normalizeMessageId(payload.messageId);
    if (!messageKey) return;

    const myReactions = normalizeReactionList(
        Array.isArray(payload.my_reactions) ? payload.my_reactions : payload.my_reaction
    );

    if (myReactions.length > 0) {
        messageReactions.set(messageKey, myReactions);
    } else {
        messageReactions.delete(messageKey);
    }

    if (Array.isArray(payload.reactions)) {
        if (payload.reactions.length > 0) {
            messageReactionSummaries.set(messageKey, payload.reactions);
        } else {
            messageReactionSummaries.delete(messageKey);
        }
    }

    const messageElement = document.querySelector(`[data-message-id="${messageKey}"]`);
    renderMessageReaction(messageElement, messageKey);
    updateConversationReaction(messageKey, myReactions);
}

/**
 * Add message action buttons (reactions, reply, delete)
 */
function addMessageActions(messageDiv, message) {
    // Don't add actions if they already exist
    if (messageDiv.querySelector('.message-actions')) {
        seedReactionFromMessage(message);
        renderMessageReaction(messageDiv, message && message.id);
        return;
    }

    seedReactionFromMessage(message);

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
        renderMessageReaction(messageDiv, message && message.id);
        return;
    }

    // Determine the best anchor element (bubble or media container)
    const anchor = messageDiv.querySelector(
        '.message-bubble, .thumbnail-message-container, .message-images-container, .message-attachments, .message-content'
    ) || messageDiv;

    anchor.classList.add('message-action-anchor');

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

    actionsDiv.appendChild(reactionBtn);

    // Add recall/delete button for sent messages only
    if (message.type === 'sent') {
        const recallBtn = document.createElement('button');
        recallBtn.className = 'message-action-btn recall-btn';
        recallBtn.innerHTML = '🗑️';
        recallBtn.title = 'Recall message (delete for everyone)';
        recallBtn.onclick = async (e) => {
            e.stopPropagation();

            if (isPortraitMobileTouch() && actionsDiv.dataset.armed !== '1') {
                return;
            }

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

    anchor.appendChild(actionsDiv);

    const interactiveSelector = [
        '.message-bubble',
        '.thumbnail-message-container',
        '.message-attachments',
        '.message-images-container',
        '.message-image-container',
        '.message-image-wrapper',
        '.message-image-clean',
        '.message-image'
    ].join(', ');

    const isElement = (node) => node && typeof node.closest === 'function';
    const isInteractiveArea = (node) => isElement(node) && Boolean(node.closest(interactiveSelector));
    const isActionsArea = (node) => isElement(node) && (node === actionsDiv || actionsDiv.contains(node));

    const isPortraitMobileTouch = () => (
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches &&
        (
            window.matchMedia('(pointer: coarse)').matches ||
            'ontouchstart' in window ||
            (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
        )
    );

    const showActions = (armForTap = false) => {
        actionsDiv.style.display = 'flex';
        actionsDiv.style.pointerEvents = 'auto';
        actionsDiv.classList.add('is-visible');
        if (isPortraitMobileTouch()) {
            actionsDiv.dataset.armed = armForTap ? '1' : '0';
        }
    };

    const hideActions = () => {
        actionsDiv.style.display = 'none';
        actionsDiv.style.pointerEvents = 'none';
        actionsDiv.classList.remove('is-visible');
        if (isPortraitMobileTouch()) {
            delete actionsDiv.dataset.armed;
        }
    };

    // Start in a truly non-interactive hidden state.
    hideActions();

    let hideTimeout = null;
    const cancelHide = () => {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
    };

    const scheduleHide = () => {
        cancelHide();
        hideTimeout = setTimeout(() => {
            hideActions();
        }, 100);
    };

    const interactiveElements = new Set([actionsDiv]);

    const primaryInteractiveRoot = anchor || messageDiv;
    if (primaryInteractiveRoot) {
        interactiveElements.add(primaryInteractiveRoot);
        primaryInteractiveRoot.querySelectorAll(interactiveSelector).forEach(element => {
            interactiveElements.add(element);
        });
    } else {
        interactiveElements.add(messageDiv);
    }

    interactiveElements.forEach(element => {
        if (!element) return;
        element.addEventListener('mouseenter', (event) => {
            if (isPortraitMobileTouch()) return;
            cancelHide();
            showActions();
        });

        element.addEventListener('mouseleave', (event) => {
            if (isPortraitMobileTouch()) return;
            cancelHide();
            const next = event.relatedTarget;
            if (isInteractiveArea(next) || isActionsArea(next)) {
                return;
            }
            scheduleHide();
        });
    });

    if (primaryInteractiveRoot) {
        let lastTouchToggleAt = 0;

        const handleMobileToggle = (event) => {
            if (!isPortraitMobileTouch()) return;

            const isBtn = isElement(event.target) && Boolean(event.target.closest('.message-action-btn'));
            const isEyeBtn = isElement(event.target) && Boolean(event.target.closest('.mobile-eye-btn'));
            if (isActionsArea(event.target) || isBtn || isEyeBtn) {
                return;
            }

            const isImageTap = isElement(event.target) && Boolean(event.target.closest(
                '.message-image-container, .message-image, .message-image-clean, .message-image-wrapper'
            ));

            if (event.type === 'click' && Date.now() - lastTouchToggleAt < 450) {
                return;
            }

            if (isImageTap) {
                if (event.type === 'touchend') {
                    lastTouchToggleAt = Date.now();
                    event.preventDefault();
                }

                const imageContainer = event.target.closest('.message-image-container');
                const imageWrapper = event.target.closest('.message-image-wrapper');
                const targetImageSurface = imageContainer || imageWrapper;
                if (targetImageSurface) {
                    document.querySelectorAll('.message-image-container.show-mobile-actions, .message-image-wrapper.show-mobile-actions')
                        .forEach((container) => {
                            if (container !== targetImageSurface) {
                                container.classList.remove('show-mobile-actions');
                            }
                        });
                    targetImageSurface.classList.add('show-mobile-actions');
                }

                cancelHide();
                showActions(true);
                return;
            }

            if (event.type === 'touchend') {
                lastTouchToggleAt = Date.now();
                event.preventDefault();
            }

            cancelHide();
            if (actionsDiv.classList.contains('is-visible')) {
                hideActions();
            } else {
                showActions(true);
            }
        };

        primaryInteractiveRoot.addEventListener('click', handleMobileToggle);
        primaryInteractiveRoot.addEventListener('touchend', handleMobileToggle, { passive: false });

        const handleDocumentMobileClose = (event) => {
            if (!isPortraitMobileTouch()) return;
            if (!isElement(event.target) || !event.target.closest('.message-image-container, .message-image-wrapper')) {
                document.querySelectorAll('.message-image-container.show-mobile-actions, .message-image-wrapper.show-mobile-actions')
                    .forEach((container) => container.classList.remove('show-mobile-actions'));
            }
            if (isActionsArea(event.target) || isInteractiveArea(event.target)) {
                return;
            }
            hideActions();
        };

        document.addEventListener('click', handleDocumentMobileClose);
        document.addEventListener('touchstart', handleDocumentMobileClose, { passive: true });
    }

    renderMessageReaction(messageDiv, message && message.id);
}

/**
 * Enhanced Image Viewer with optional gallery navigation.
 */
function openImageViewer(imagePath, filename, galleryItems = null, startIndex = 0) {
    const items = Array.isArray(galleryItems) && galleryItems.length > 0
        ? galleryItems.map((item) => ({
            imagePath: item.imagePath || item.file_path || item.thumbnail_path || '',
            filename: item.filename || item.original_filename || 'Image'
        })).filter((item) => item.imagePath)
        : [{ imagePath, filename: filename || 'Image' }];

    if (items.length === 0) {
        items.push({ imagePath, filename: filename || 'Image' });
    }

    let currentIndex = Math.max(0, Math.min(startIndex, items.length - 1));
    let touchStartX = 0;

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
    imageContainer.style.width = '100%';
    imageContainer.style.maxWidth = '1200px';
    imageContainer.style.maxHeight = '95%';
    imageContainer.style.display = 'flex';
    imageContainer.style.flexDirection = 'column';
    imageContainer.style.alignItems = 'center';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'image-viewer-wrap';
    imageWrap.style.position = 'relative';
    imageWrap.style.display = 'flex';
    imageWrap.style.alignItems = 'center';
    imageWrap.style.justifyContent = 'center';
    imageWrap.style.width = '100%';
    imageWrap.style.maxWidth = '1200px';
    imageWrap.style.maxHeight = '90vh';
    imageWrap.style.overflow = 'hidden';

    // Create image element with enhanced features
    const img = document.createElement('img');
    img.src = items[currentIndex].imagePath;
    img.alt = '';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '90vh';
    img.style.width = 'auto';
    img.style.height = 'auto';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '12px';
    img.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
    img.style.transition = 'transform 0.3s ease';
    img.style.display = 'block';
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';

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
    closeBtn.style.position = 'fixed';
    closeBtn.style.top = '12px';
    closeBtn.style.right = '12px';
    closeBtn.style.background = 'rgba(255,255,255,0.15)';
    closeBtn.style.border = 'none';
    closeBtn.style.color = 'white';
    closeBtn.style.fontSize = '1.5rem';
    closeBtn.style.width = '36px';
    closeBtn.style.height = '36px';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.zIndex = '3';
    closeBtn.style.touchAction = 'manipulation';

    const counterDiv = document.createElement('div');
    counterDiv.className = 'image-viewer-counter';
    counterDiv.style.color = 'white';
    counterDiv.style.marginTop = '8px';
    counterDiv.style.fontSize = '13px';
    counterDiv.style.opacity = '0.75';
    counterDiv.style.textAlign = 'center';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'image-viewer-prev';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.style.position = 'absolute';
    prevBtn.style.left = '8px';
    prevBtn.style.top = '50%';
    prevBtn.style.transform = 'translateY(-50%)';
    prevBtn.style.background = 'rgba(0,0,0,0.55)';
    prevBtn.style.border = 'none';
    prevBtn.style.color = '#fff';
    prevBtn.style.fontSize = '1.2rem';
    prevBtn.style.width = '44px';
    prevBtn.style.height = '44px';
    prevBtn.style.borderRadius = '50%';
    prevBtn.style.cursor = 'pointer';
    prevBtn.style.display = items.length > 1 ? 'flex' : 'none';
    prevBtn.style.alignItems = 'center';
    prevBtn.style.justifyContent = 'center';
    prevBtn.style.zIndex = '2';
    prevBtn.style.touchAction = 'manipulation';

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'image-viewer-next';
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.style.position = 'absolute';
    nextBtn.style.right = '8px';
    nextBtn.style.top = '50%';
    nextBtn.style.transform = 'translateY(-50%)';
    nextBtn.style.background = 'rgba(0,0,0,0.55)';
    nextBtn.style.border = 'none';
    nextBtn.style.color = '#fff';
    nextBtn.style.fontSize = '1.2rem';
    nextBtn.style.width = '44px';
    nextBtn.style.height = '44px';
    nextBtn.style.borderRadius = '50%';
    nextBtn.style.cursor = 'pointer';
    nextBtn.style.display = items.length > 1 ? 'flex' : 'none';
    nextBtn.style.alignItems = 'center';
    nextBtn.style.justifyContent = 'center';
    nextBtn.style.zIndex = '2';
    nextBtn.style.touchAction = 'manipulation';

    const renderCurrentImage = () => {
        const currentItem = items[currentIndex] || items[0];
        scale = 1;
        img.style.transform = 'scale(1)';
        img.src = currentItem.imagePath;
        img.alt = '';
        counterDiv.textContent = items.length > 1 ? `${currentIndex + 1} / ${items.length}` : '';
    };

    const showPrevious = (event) => {
        if (event) {
            event.stopPropagation();
        }
        currentIndex = (currentIndex - 1 + items.length) % items.length;
        renderCurrentImage();
    };

    const showNext = (event) => {
        if (event) {
            event.stopPropagation();
        }
        currentIndex = (currentIndex + 1) % items.length;
        renderCurrentImage();
    };

    prevBtn.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        showPrevious();
    });
    nextBtn.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        showNext();
    });

    // Close on click outside image
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    };

    // Close on close button
    closeBtn.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        document.body.removeChild(overlay);
    });

    // Assemble and display
    imageWrap.appendChild(img);
    imageWrap.appendChild(prevBtn);
    imageWrap.appendChild(nextBtn);
    imageContainer.appendChild(imageWrap);
    imageContainer.appendChild(counterDiv);
    overlay.appendChild(closeBtn);
    overlay.appendChild(imageContainer);
    document.body.appendChild(overlay);

    if (items.length > 1) {
        imageWrap.addEventListener('touchstart', (event) => {
            touchStartX = event.touches[0].clientX;
        }, { passive: true });

        imageWrap.addEventListener('touchend', (event) => {
            const deltaX = event.changedTouches[0].clientX - touchStartX;
            if (Math.abs(deltaX) > 40) {
                if (deltaX < 0) {
                    showNext();
                } else {
                    showPrevious();
                }
            }
        }, { passive: true });
    }

    // Close on escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(overlay);
            document.removeEventListener('keydown', handleEscape);
        } else if (e.key === 'ArrowLeft' && items.length > 1) {
            showPrevious();
        } else if (e.key === 'ArrowRight' && items.length > 1) {
            showNext();
        }
    };
    document.addEventListener('keydown', handleEscape);

    renderCurrentImage();

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
    const messageKey = normalizeMessageId(messageId);
    if (!messageKey) {
        if (typeof showNotification === 'function') {
            showNotification('Unable to react: missing message id', 'error');
        }
        return;
    }

    const reactions = ['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🔥'];
    const selectedEmojis = new Set(normalizeReactionList(messageReactions.get(messageKey)));

    // Remove existing picker
    const existing = document.querySelector('.reaction-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.setAttribute('role', 'menu');

    reactions.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reaction-picker-btn';
        if (selectedEmojis.has(emoji)) {
            btn.classList.add('is-selected');
        }
        btn.textContent = emoji;
        btn.setAttribute('aria-label', `React ${emoji}`);
        btn.onclick = () => {
            addReaction(messageKey, emoji);
            picker.remove();
        };
        picker.appendChild(btn);
    });

    // Add first so we can measure actual size before clamping to viewport.
    picker.style.left = '0px';
    picker.style.top = '0px';
    picker.style.visibility = 'hidden';
    document.body.appendChild(picker);

    // Position near the button, but keep picker fully inside viewport.
    const rect = button.getBoundingClientRect();
    const pickerWidth = picker.offsetWidth || 220;
    const pickerHeight = picker.offsetHeight || 48;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportPadding = 8;

    const messageElement = button.closest('.message');
    const isSentMessage = Boolean(
        messageElement && (messageElement.classList.contains('sent') || messageElement.classList.contains('message--sent'))
    );

    // Sent messages should bias left so the picker grows inside the page.
    let pickerLeft = isSentMessage
        ? (rect.right + window.scrollX - pickerWidth)
        : (rect.left + window.scrollX);

    const minLeft = window.scrollX + viewportPadding;
    const maxLeft = window.scrollX + viewportWidth - pickerWidth - viewportPadding;
    pickerLeft = Math.max(minLeft, Math.min(pickerLeft, maxLeft));

    // Prefer above button; if no room, place below.
    let pickerTop = rect.top + window.scrollY - pickerHeight - 8;
    if (pickerTop < window.scrollY + viewportPadding) {
        pickerTop = rect.bottom + window.scrollY + 8;
    }

    const maxTop = window.scrollY + viewportHeight - pickerHeight - viewportPadding;
    pickerTop = Math.min(pickerTop, maxTop);

    picker.style.left = `${pickerLeft}px`;
    picker.style.top = `${pickerTop}px`;
    picker.style.visibility = 'visible';

    // Close on click outside
    const closeReactionPicker = (e) => {
        if (!picker.contains(e.target) && e.target !== button) {
            picker.remove();
            document.removeEventListener('click', closeReactionPicker);
        }
    };

    setTimeout(() => {
        document.addEventListener('click', closeReactionPicker);
    }, 100);
}

/**
 * Add reaction to message
 */
async function addReaction(messageId, emoji) {
    const messageKey = normalizeMessageId(messageId);
    if (!messageKey) {
        if (typeof showNotification === 'function') {
            showNotification('Unable to react: missing message id', 'error');
        }
        return;
    }

    const currentReactions = normalizeReactionList(messageReactions.get(messageKey));
    const hasReaction = currentReactions.includes(emoji);
    if (hasReaction) {
        // Reaction already exists — do not remove it
        return;
    }
    const nextReactions = [...currentReactions, emoji];
    const previousReactions = currentReactions;

    if (nextReactions.length > 0) {
        messageReactions.set(messageKey, nextReactions);
    } else {
        messageReactions.delete(messageKey);
    }

    const messageElement = document.querySelector(`[data-message-id="${messageKey}"]`);
    renderMessageReaction(messageElement, messageKey);
    updateConversationReaction(messageKey, nextReactions);

    try {
        const persisted = await persistReaction(messageKey, emoji, hasReaction);
        if (persisted && Array.isArray(persisted.reactions)) {
            if (persisted.reactions.length > 0) {
                messageReactionSummaries.set(messageKey, persisted.reactions);
            } else {
                messageReactionSummaries.delete(messageKey);
            }
        }
        const confirmedReactions = normalizeReactionList(
            persisted && typeof persisted.my_reactions !== 'undefined'
                ? persisted.my_reactions
                : (persisted && typeof persisted.my_reaction !== 'undefined' ? persisted.my_reaction : nextReactions)
        );

        if (confirmedReactions.length > 0) {
            messageReactions.set(messageKey, confirmedReactions);
        } else {
            messageReactions.delete(messageKey);
        }

        renderMessageReaction(messageElement, messageKey);
        updateConversationReaction(messageKey, confirmedReactions);
    } catch (error) {
        if (previousReactions.length > 0) {
            messageReactions.set(messageKey, previousReactions);
        } else {
            messageReactions.delete(messageKey);
        }

        renderMessageReaction(messageElement, messageKey);
        updateConversationReaction(messageKey, previousReactions);

        if (typeof showNotification === 'function') {
            showNotification(error.message || 'Failed to save reaction', 'error');
        }
        return;
    }

    if (typeof showNotification === 'function') {
        if (!hasReaction) {
            showNotification(`Added ${emoji} reaction`, 'success');
        } else {
            showNotification('Reaction removed', 'info');
        }
    }
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

    // Build preview content with optional image
    let previewContent = `
        <div class="reply-preview-content">
            <div class="reply-preview-text">
                <div class="reply-to-text">Replying to:</div>
                <div class="reply-to-text reply-preview-value">${previewText}</div>
            </div>
    `;
    
    // Add image thumbnail if available
    if (imageAttachment) {
        const thumbnailPath = imageAttachment.thumbnail_path || imageAttachment.file_path;
        if (thumbnailPath) {
            const imagePath = thumbnailPath.startsWith('/') ? thumbnailPath : '/' + thumbnailPath;
            previewContent += `
                <img src="${imagePath}" 
                     class="reply-preview-thumbnail"
                     onerror="this.style.display='none'"
                     alt="Preview">
            `;
        }
    }
    
    previewContent += `
        </div>
        <button onclick="cancelReply()" class="reply-preview-close">✕</button>
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
window.applyIncomingMessageReactionUpdate = applyIncomingMessageReactionUpdate;
window.startReply = startReply;
window.showReplyPreview = showReplyPreview;
window.cancelReply = cancelReply;
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
        applyIncomingMessageReactionUpdate,
        startReply,
        showReplyPreview,
        cancelReply,
        replyToMessage,
        showConfirmationModal,
        closeConfirmationModal,
        confirmDelete,
        confirmDeleteFromModal,
        deleteMessage
    };
}













