/**
 * TALK CONVERSATION SELECTOR
 * Handles conversation selection and filter-based message loading
 * Extracted from talk.html (lines 1051-1607)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - CONFIG (talk_config.js)
 * - Global functions: getCurrentFilter, populateSenderFilterFromConversations, cancelReply,
 *   updateLastSeen, formatMessageTime, renderMessages, loadMessages, markConversationAsRead,
 *   renderConversations, updateCurrentChatStatus, checkIfBlocked
 */

const MOBILE_LAST_CONVERSATION_KEY = '__talkMobileLastConversationId';

function rememberMobileConversation(conversationId) {
    if (!isStackedViewport()) {
        window[MOBILE_LAST_CONVERSATION_KEY] = null;
        return;
    }
    window[MOBILE_LAST_CONVERSATION_KEY] = conversationId ? String(conversationId) : null;
}

function getRememberedMobileConversation() {
    const stored = window[MOBILE_LAST_CONVERSATION_KEY];
    return stored ? String(stored) : null;
}

function highlightConversationById(conversationId, options = {}) {
    const normalizedId = conversationId ? String(conversationId) : null;
    let matchedElement = null;

    document.querySelectorAll('.conversation-item').forEach(item => {
        const matches = normalizedId && item.getAttribute('data-conversation-id') === normalizedId;
        item.classList.toggle('active', Boolean(matches));
        if (matches) {
            matchedElement = item;
        }
    });

    if (options.scroll && matchedElement && typeof matchedElement.scrollIntoView === 'function') {
        requestAnimationFrame(() => {
            matchedElement.scrollIntoView({
                behavior: options.behavior || 'auto',
                block: options.block || 'center'
            });
        });
    }
}

function applyBodyNavState(state) {
    if (!document || !document.body) {
        return;
    }
    const normalized = state === 'NAV_CHAT' ? 'NAV_CHAT' : 'NAV_CONVERSATIONS_LIST';
    document.body.dataset.navState = normalized;
    document.body.classList.toggle('nav-chat', normalized === 'NAV_CHAT');
    document.body.classList.toggle('nav-conversations', normalized !== 'NAV_CHAT');
}

function isStackedViewport() {
    const portraitMatches = typeof window.matchMedia === 'function'
        ? window.matchMedia('(orientation: portrait)').matches
        : window.innerHeight >= window.innerWidth;
    const isPortraitTablet = portraitMatches && window.innerWidth <= 1024;
    return window.innerWidth <= 768 || isPortraitTablet;
}

function toggleMobileBackButtons(shouldShow) {
    const displayValue = shouldShow && isStackedViewport() ? 'flex' : 'none';
    const button = document.getElementById('chatBackBtn');
    if (button) {
        button.style.display = displayValue;
    }
}

function showChatViewOnMobile() {
    if (!isStackedViewport()) {
        return;
    }
    toggleMobileBackButtons(true);
    if (window.TalkNavigationState && typeof window.TalkNavigationState.setState === 'function') {
        window.TalkNavigationState.setState('NAV_CHAT');
    } else {
        applyBodyNavState('NAV_CHAT');
    }
}

function showConversationListOnMobile() {
    if (!isStackedViewport()) {
        return;
    }
    toggleMobileBackButtons(false);
    if (window.TalkNavigationState && typeof window.TalkNavigationState.setState === 'function') {
        window.TalkNavigationState.setState('NAV_CONVERSATIONS_LIST');
    } else {
        applyBodyNavState('NAV_CONVERSATIONS_LIST');
    }
}

function presenceSystemEnabled() {
    return typeof isPresenceSystemEnabled === 'function'
        ? isPresenceSystemEnabled()
        : true;
}

/**
 * Helper function to update chat header (avatar, name, status)
 */
function updateChatHeader(conversation) {
    const chatName = document.getElementById('chatName');
    const chatStatus = document.getElementById('chatStatus');
    const chatAvatar = document.getElementById('chatAvatar');
    const chatActions = document.querySelector('.chat-actions');

    // Check if user is deleted
    const isDeleted = conversation.isDeleted || conversation.name === 'Deleted User' || conversation.name === 'Account Deactivated';
    
    // Check if user is online
    const isOnline = conversation.is_online !== undefined && conversation.is_online !== null && conversation.is_online === true;
    const presenceEnabled = presenceSystemEnabled();

    if (chatName) {
        // Show real real_name for deleted users (no blur)
        chatName.textContent = conversation.name;
        // Add click handler to open profile modal and store partnerId (only if not deleted)
        if (conversation.partnerId && !isDeleted) {
            chatName.setAttribute('data-partner-id', conversation.partnerId);
            chatName.style.cursor = 'pointer';
            chatName.style.userSelect = 'none';
            chatName.onclick = (e) => {
                e.stopPropagation();
                if (typeof openProfileModal === 'function') {
                    openProfileModal(conversation.partnerId);
                }
            };
        } else {
            chatName.style.cursor = 'default';
            chatName.onclick = null;
        }
    }
    // chatStatus will be updated by updateCurrentChatStatus - don't set it here

    if (chatAvatar) {
        if (isDeleted) {
            // Show deactivated account image
            chatAvatar.innerHTML = '<img src="/assets/images/account_deactivated.svg" alt="Account Deactivated" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">';
            chatAvatar.style.display = 'block';
            chatAvatar.style.cursor = 'default';
            chatAvatar.onclick = null;
        } else {
            const isValidImagePath = conversation.avatar &&
                typeof conversation.avatar === 'string' &&
                conversation.avatar.length > 15 && // CRITICAL: Reject single letters
                (conversation.avatar.startsWith('/uploads/') || conversation.avatar.startsWith('uploads/')) &&
                conversation.avatar.includes('.') &&
                !conversation.avatar.startsWith('images/');

            if (isValidImagePath) {
                // CRITICAL: Never use single letters (length <= 1) as image sources
                if (!conversation.avatar || typeof conversation.avatar !== 'string' || conversation.avatar.length <= 1) {
                    // Single letter or invalid - use text fallback
                    const displayLetter = (conversation.name || 'U').charAt(0).toUpperCase();
                    chatAvatar.innerHTML = `
                        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold;">${displayLetter}</div>
                        ${(!isDeleted && isOnline && presenceEnabled) ? `<div class="online-indicator" data-user-id="${conversation.partnerId}" style="display: block;"></div>` : ''}
                    `;
                    chatAvatar.style.display = 'flex';
                } else {
                    const img = document.createElement('img');
                    img.src = conversation.avatar.startsWith('/') ? conversation.avatar : '/' + conversation.avatar;
                    img.alt = conversation.name;
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 50%;';
                    img.addEventListener('error', function() {
                        this.style.display = 'none';
                        this.parentElement.textContent = conversation.name.charAt(0).toUpperCase();
                    });
                    chatAvatar.innerHTML = (!isDeleted && isOnline && presenceEnabled) ? `<div class="online-indicator" data-user-id="${conversation.partnerId}" style="display: block;"></div>` : '';
                    chatAvatar.appendChild(img);
                    chatAvatar.style.display = 'block';
                }
            } else {
                chatAvatar.innerHTML = '';
                chatAvatar.textContent = (conversation.name || 'U').charAt(0).toUpperCase();
                chatAvatar.style.display = 'flex';
            }
            
            // Add click handler to open profile modal (only if not deleted)
            if (conversation.partnerId && !isDeleted) {
                chatAvatar.setAttribute('data-partner-id', conversation.partnerId);
                chatAvatar.style.cursor = 'pointer';
                chatAvatar.onclick = (e) => {
                    e.stopPropagation();
                    if (typeof openProfileModal === 'function') {
                        openProfileModal(conversation.partnerId);
                    }
                };
            } else {
                chatAvatar.style.cursor = 'default';
                chatAvatar.onclick = null;
            }
        }
    }

    // Add Clear button for deleted users in chat actions
    if (chatActions) {
        // Remove existing clear button if any
        const existingClearBtn = chatActions.querySelector('.clear-deleted-chat-btn');
        if (existingClearBtn) {
            existingClearBtn.remove();
        }

        if (isDeleted && conversation.partnerId) {
            // Hide other action buttons for deleted users
            const actionButtons = chatActions.querySelectorAll('.chat-action-btn');
            actionButtons.forEach(btn => {
                btn.style.display = 'none';
            });

            // Add Clear button
            const clearBtn = document.createElement('button');
            clearBtn.className = 'clear-deleted-chat-btn';
            clearBtn.innerHTML = '<i class="fas fa-trash"></i> Clear';
            clearBtn.title = 'Clear this deactivated account from your conversation list';
            clearBtn.style.cssText = `
                background: #e74c3c;
                color: white;
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 6px;
                font-size: 0.875rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            `;
            clearBtn.onmouseover = () => {
                clearBtn.style.background = '#c0392b';
            };
            clearBtn.onmouseout = () => {
                clearBtn.style.background = '#e74c3c';
            };
            clearBtn.onclick = (e) => {
                e.stopPropagation();
                if (typeof clearConversationWithDeletedUser === 'function') {
                    clearConversationWithDeletedUser(conversation.partnerId);
                }
            };
            chatActions.appendChild(clearBtn);
        } else {
            // Show normal action buttons for non-deleted users
            const actionButtons = chatActions.querySelectorAll('.chat-action-btn');
            actionButtons.forEach(btn => {
                btn.style.display = 'flex';
            });
        }
    }
}

/**
 * Select conversation
 */
async function selectConversation(conversationId, event) {
    // Don't preserve DOM state for conversations - always fetch fresh data for images
    // This ensures uploaded images are always loaded from database
    const currentConversation = TalkState.getCurrentConversation();
    if (currentConversation && currentConversation !== conversationId) {
        const oldMessagesArea = document.getElementById('messagesArea');
        if (oldMessagesArea) {
            // Clean up blob URLs when switching conversations
            // Blob URLs are used for image previews and should be cleaned up
            const blobImages = oldMessagesArea.querySelectorAll('img[src^="blob:"]');
            blobImages.forEach(img => {
                URL.revokeObjectURL(img.src);
            });
        }
        
        // Clear reply state when switching conversations
        if (window.currentReply && typeof cancelReply === 'function') {
            cancelReply();
        }

        // Drop any pending image uploads when hopping to another chat
        if (typeof window.clearImagePreviews === 'function') {
            window.clearImagePreviews();
        } else if (Array.isArray(window.selectedImages)) {
            window.selectedImages.length = 0;
            const previewList = document.getElementById('imagePreviewList');
            if (previewList) {
                previewList.innerHTML = '';
            }
            const previewArea = document.getElementById('imagePreviewArea');
            if (previewArea) {
                previewArea.style.display = 'none';
            }
        }

        const imageInput = document.getElementById('imageInput');
        if (imageInput) {
            imageInput.value = '';
        }
    }

    // Update state
    TalkState.setCurrentConversation(conversationId);
    const conversations = TalkState.getConversations();
    const conversation = conversations[conversationId];

    if (!conversation) {
        // Hide pagination if conversation not found
        if (typeof hidePagination === 'function') {
            hidePagination();
        }
        return;
    }
    
    // Reset pagination to page 1 when switching conversations
    if (typeof resetPagination === 'function') {
        resetPagination();
    } else if (typeof hidePagination === 'function') {
        hidePagination();
    }

    showChatViewOnMobile();

    // Check if conversation partner is deleted - don't load messages, just show empty state
    if (conversation.isDeleted || conversation.name === 'Deleted User' || conversation.name === 'Account Deactivated') {
        // Show empty state instead of loading messages
        const messagesArea = document.getElementById('messagesArea');
        if (messagesArea) {
            messagesArea.innerHTML = '<div class="empty-state" id="emptyState"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Account Deactivated</div><div class="empty-state-text">This user\'s account has been deactivated. Their messages are no longer available. Use the "Clear" button in the chat header to remove this conversation from your list.</div></div>';
        }
        // Show chat header with deleted user info and Clear button
        const chatHeader = document.getElementById('chatHeader');
        const messageInputArea = document.getElementById('messageInputArea');
        if (chatHeader) {
            chatHeader.style.display = 'flex';
            chatHeader.classList.add('is-active');
        }
        if (messageInputArea) messageInputArea.style.display = 'none'; // Hide input for deleted users
        updateChatHeader(conversation);
        // Don't load messages for deleted users
        return;
    }

    // Update "Search in chat" sender filter to show just "You" and this partner
    if (typeof populateSenderFilterFromConversations === 'function') {
        populateSenderFilterFromConversations();
    }

    // Update UI
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });

    // Only try to add active class if event and target exist
    if (event && event.target) {
        const conversationItem = event.target.closest('.conversation-item');
        if (conversationItem) {
            conversationItem.classList.add('active');
        }
    }

      if (isStackedViewport()) {
          rememberMobileConversation(conversationId);
          highlightConversationById(conversationId);
      } else {
          rememberMobileConversation(null);
      }

    // Show chat interface
    const chatHeader = document.getElementById('chatHeader');
    const messageInputArea = document.getElementById('messageInputArea');
    const emptyState = document.getElementById('emptyState');

    if (chatHeader) {
        chatHeader.style.display = 'flex';
        chatHeader.classList.add('is-active');
    }
    if (messageInputArea) messageInputArea.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    // Initialize status bar
    if (typeof updateLastSeen === 'function' && conversation.lastActive) {
        updateLastSeen(conversation.lastActive);
    }

    // Check if we're on the saved tab or unread tab - if so, filter messages accordingly
    const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
    const currentUserId = TalkState.getCurrentUserId();
    
    // Handle unread tab - show only unread messages
    if (currentFilter === 'unread') {
        // On unread tab - render only unread messages
        try {
            // Fetch conversation messages
            const response = await fetch(`/api/messages/conversation/${currentUserId}/${conversation.partnerId}?limit=500&offset=0`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': currentUserId
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.messages) {
                    // Filter to only unread messages (received by current user and not read)
                    const unreadOnly = data.messages.filter(msg => {
                        const senderId = parseInt(msg.sender_id || msg.senderId);
                        const receiverId = parseInt(msg.receiver_id || msg.receiverId);
                        const isReceivedByMe = receiverId === currentUserId;
                        // Message is unread if read_at is null/undefined and is_read is false/undefined
                        const isUnread = !msg.read_at && (msg.is_read === false || msg.is_read === undefined || msg.isRead === false);
                        return isReceivedByMe && isUnread;
                    });
                    
                    // Convert to our format
                    const messages = unreadOnly.map((msg) => {
                        const senderId = msg.sender_id || msg.senderId;
                        const isSentByMe = parseInt(senderId) === currentUserId;
                        
                        return {
                            type: isSentByMe ? 'sent' : 'received',
                            text: msg.content,
                            time: typeof formatMessageTime === 'function' ? formatMessageTime(msg.timestamp) : new Date(msg.timestamp).toLocaleTimeString(),
                            id: msg.id,
                            isRead: false, // All are unread
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
                        const unreadHeader = {
                            type: 'system',
                            text: `Showing ${messages.length} unread message${messages.length > 1 ? 's' : ''} from this conversation`,
                            time: 'Now',
                            id: 'unread-header',
                            isRead: true,
                            content: `Showing ${messages.length} unread message${messages.length > 1 ? 's' : ''} from this conversation`,
                            timestamp: Date.now()
                        };
                        messages.unshift(unreadHeader);
                    }
                    
                    if (typeof renderMessages === 'function') {
                        renderMessages(messages);
                    }
                    
                    updateChatHeader(conversation);
                    return; // Don't proceed with normal loadMessages
                } else {
                    // No unread messages found
                    if (typeof renderMessages === 'function') {
                        renderMessages([{
                            type: 'system',
                            text: 'No unread messages in this conversation',
                            time: 'Now',
                            id: 'no-unread',
                            isRead: true,
                            content: 'No unread messages in this conversation',
                            timestamp: Date.now()
                        }]);
                    }
                    updateChatHeader(conversation);
                    return;
                }
            } else {
                // API response was not successful
                if (typeof renderMessages === 'function') {
                    renderMessages([{
                        type: 'system',
                        text: 'Failed to load unread messages',
                        time: 'Now',
                        id: 'error-unread',
                        isRead: true,
                        content: 'Failed to load unread messages',
                        timestamp: Date.now()
                    }]);
                }
                updateChatHeader(conversation);
                return;
            }
        } catch (error) {
            if (typeof renderMessages === 'function') {
                renderMessages([{
                    type: 'system',
                    text: 'Error loading unread messages',
                    time: 'Now',
                    id: 'error-unread',
                    isRead: true,
                    content: 'Error loading unread messages',
                    timestamp: Date.now()
                }]);
            }
            updateChatHeader(conversation);
            return;
        }
    }
    
    // Handle saved tab
    if (currentFilter === 'saved') {
        // On saved tab - render only saved messages without fetching all messages
        const savedMessages = CONFIG.USERS.SAVED_MESSAGES || [];
        const conversationSavedMessages = savedMessages.filter(msg => {
            const msgConvId = parseInt(msg.conversationId);
            const convPartnerId = parseInt(conversation.partnerId);
            return msgConvId === convPartnerId;
        });
        
        if (conversationSavedMessages.length > 0) {
            // Fetch only the saved message IDs from the conversation API
            // Convert to numbers for consistent comparison
            const savedMessageIds = conversationSavedMessages.map(msg => parseInt(msg.messageId)).filter(id => !isNaN(id));
            
            try {
                // Fetch conversation with a higher limit to include older saved messages
                // Use a limit of 500 to ensure we get all messages that might be saved
                const response = await fetch(`/api/messages/conversation/${currentUserId}/${conversation.partnerId}?limit=500&offset=0`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-ID': currentUserId
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.messages) {
                        // Filter to only saved messages - ensure both IDs are compared as numbers
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
                        }
                        
                        if (typeof renderMessages === 'function') {
                            renderMessages(messages);
                        }
                        
                        updateChatHeader(conversation);
                        return; // Don't proceed with normal loadMessages
                    } else {
                        // No saved messages found after filtering - show empty state
                        if (typeof renderMessages === 'function') {
                            renderMessages([{
                                type: 'system',
                                text: 'No saved messages found',
                                time: 'Now',
                                id: 'no-saved',
                                isRead: true,
                                content: 'No saved messages found',
                                timestamp: Date.now()
                            }]);
                        }
                        updateChatHeader(conversation);
                        return;
                    }
                } else {
                    // API response was not successful
                    if (typeof renderMessages === 'function') {
                        renderMessages([{
                            type: 'system',
                            text: 'Failed to load saved messages',
                            time: 'Now',
                            id: 'error-saved',
                            isRead: true,
                            content: 'Failed to load saved messages',
                            timestamp: Date.now()
                        }]);
                    }
                    updateChatHeader(conversation);
                    return;
                }
            } catch (error) {
                if (typeof renderMessages === 'function') {
                    renderMessages([{
                        type: 'system',
                        text: 'Error loading saved messages',
                        time: 'Now',
                        id: 'error-saved',
                        isRead: true,
                        content: 'Error loading saved messages',
                        timestamp: Date.now()
                    }]);
                }
                updateChatHeader(conversation);
                return;
            }
        } else {
            // No saved messages for this conversation
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
            updateChatHeader(conversation);
            return; // Don't proceed with normal loadMessages
        }
    }
    
    // CRITICAL: Double-check we're not on saved or unread tab before loading all messages
    // This prevents filtered messages from being replaced with all messages
    const currentFilterCheck = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
    if (currentFilterCheck === 'saved' || currentFilterCheck === 'unread') {
        // We're on saved/unread tab but no messages found or error occurred
        // Don't load all messages - just show empty state
        return;
    }
    
    // Normal flow - ALWAYS load page 1 (offset=0) on initial conversation selection
    // Ensure we're on page 1 before loading
    if (typeof resetPagination === 'function') {
        resetPagination();
    }
    
    if (typeof loadMessages === 'function') {
        // Explicitly load page 1 (offset=0) - newest messages
        await loadMessages(conversation, { forceRefresh: true, offset: 0, limit: 10 });
    }
    
    // Setup pagination controls (this will initialize to page 1)
    if (typeof setupPagination === 'function') {
        await setupPagination(conversation);
    }

    // Update chat header with special handling for chatAvatar
    const chatName = document.getElementById('chatName');
    const chatStatus = document.getElementById('chatStatus');
    const chatAvatar = document.getElementById('chatAvatar');

    if (chatName) {
        chatName.textContent = conversation.name;
        // Add click handler to open profile modal and store partnerId
        if (conversation.partnerId) {
            chatName.setAttribute('data-partner-id', conversation.partnerId);
            chatName.style.cursor = 'pointer';
            chatName.style.userSelect = 'none';
            chatName.onclick = (e) => {
                e.stopPropagation();
                if (typeof openProfileModal === 'function') {
                    openProfileModal(conversation.partnerId);
                }
            };
        }
    }
    // chatStatus will be updated by updateCurrentChatStatus - don't set it here

    // Update chat avatar - handle both image and letter avatars
    if (chatAvatar) {
        const presenceEnabled = presenceSystemEnabled();
        const isValidImagePath = conversation.avatar &&
            (conversation.avatar.startsWith('/uploads/') || conversation.avatar.startsWith('uploads/')) &&
            conversation.avatar.includes('.') &&
            conversation.avatar.length > 15 &&
            !conversation.avatar.startsWith('images/');

        // Check if user is online
        const isOnline = conversation.is_online !== undefined 
            ? conversation.is_online 
            : (conversation.status && conversation.status.toLowerCase().includes('online'));
        const isDeleted = conversation.isDeleted || conversation.name === 'Deleted User' || conversation.name === 'Account Deactivated';

        if (isValidImagePath) {
            // Display as image
            const imgSrc = conversation.avatar.startsWith('/') ? conversation.avatar : '/' + conversation.avatar;
            chatAvatar.innerHTML = (!isDeleted && isOnline && presenceEnabled) ? `<div class="online-indicator" data-user-id="${conversation.partnerId}" style="display: block;"></div>` : '';
            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = conversation.name;
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 50%;';
            img.addEventListener('error', function() {
                this.style.display = 'none';
                this.parentElement.textContent = conversation.name.charAt(0).toUpperCase();
            });
            chatAvatar.insertBefore(img, chatAvatar.firstChild);
        } else {
            // Display as letter
            const displayLetter = conversation.avatar && conversation.avatar.length === 1 ?
                conversation.avatar : conversation.name.charAt(0).toUpperCase();
            chatAvatar.innerHTML = `
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold;">${displayLetter}</div>
                ${(!isDeleted && isOnline && presenceEnabled) ? `<div class="online-indicator" data-user-id="${conversation.partnerId}" style="display: block;"></div>` : ''}
            `;
        }
        
        // Add click handler to open profile modal (only if not deleted)
        if (conversation.partnerId && !isDeleted) {
            chatAvatar.setAttribute('data-partner-id', conversation.partnerId);
            chatAvatar.style.cursor = 'pointer';
            chatAvatar.onclick = (e) => {
                e.stopPropagation();
                if (typeof openProfileModal === 'function') {
                    openProfileModal(conversation.partnerId);
                }
            };
        } else {
            chatAvatar.style.cursor = 'default';
            chatAvatar.onclick = null;
        }
        
        // Register online indicator with instantStatusManager
        if (!isDeleted && presenceEnabled && typeof registerOnlineIndicators === 'function') {
            setTimeout(() => {
                registerOnlineIndicators();
            }, 100);
        }
    }

    // Messages already loaded above with force refresh

    // Mark conversation as read if there are unread messages
    if (conversation.unread > 0) {
        if (typeof markConversationAsRead === 'function') {
            await markConversationAsRead(conversation.partnerId);
        }
        conversation.unread = 0;
        
        // If on unread tab, refresh the filtered conversations list to remove this conversation
        const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
        if (currentFilter === 'unread') {
            if (typeof filterConversations === 'function') {
                filterConversations('unread');
            }
        } else {
            if (typeof renderConversations === 'function') {
                renderConversations();
            }
        }
    }

    // Update the chat status display to ensure it's current with proper styling
    if (typeof updateCurrentChatStatus === 'function') {
        updateCurrentChatStatus();
    }
    
    // IMPORTANT: Check if user is blocked and disable input if so
    const messageInputEl = document.getElementById('messageInput');
    const messageInputAreaEl = document.getElementById('messageInputArea');
    if (messageInputEl && messageInputAreaEl) {
        try {
            if (typeof checkIfBlocked === 'function') {
                const isBlocked = await checkIfBlocked(currentUserId, conversation.partnerId);
                if (isBlocked) {
                    messageInputEl.disabled = true;
                    messageInputEl.placeholder = 'You cannot send messages to this user';
                    messageInputAreaEl.style.opacity = '0.6';
                } else {
                    messageInputEl.disabled = false;
                    messageInputEl.placeholder = 'Type a message...';
                    messageInputAreaEl.style.opacity = '1';
                }
            }
        } catch (error) {
            // Enable input if check fails (backend will enforce)
            messageInputEl.disabled = false;
            messageInputEl.placeholder = 'Type a message...';
            messageInputAreaEl.style.opacity = '1';
        }
    }
}

/**
 * Go back to conversation list (mobile only)
 * Hides chat interface and shows conversation list
 */
function goBackToConversations() {
    // Only work on stacked layouts (mobile + portrait tablets)
    if (!isStackedViewport()) {
        return;
    }

    const previousConversationId = TalkState.getCurrentConversation();

    showConversationListOnMobile();
    
    // Clear current conversation
    TalkState.setCurrentConversation(null);
    
    // Hide chat interface
    const chatHeader = document.getElementById('chatHeader');
    const messageInputArea = document.getElementById('messageInputArea');
    const emptyState = document.getElementById('emptyState');
    
    if (chatHeader) {
        chatHeader.style.display = 'none';
        chatHeader.classList.remove('is-active');
    }
    if (messageInputArea) messageInputArea.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    
    // Restore highlight for the last selected conversation when returning to the list
    if (previousConversationId) {
        rememberMobileConversation(previousConversationId);
    }
    const storedConversationId = getRememberedMobileConversation();
    if (storedConversationId) {
        highlightConversationById(storedConversationId, {
            scroll: true,
            behavior: 'smooth'
        });
    } else {
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
    }
    
    // Clear messages area
    const messagesArea = document.getElementById('messagesArea');
    if (messagesArea) {
        messagesArea.innerHTML = '';
    }
    
    // Cancel any active reply
    if (window.currentReply && typeof cancelReply === 'function') {
        cancelReply();
    }
    
    // Scroll to top only when no stored selection is available
    if (!storedConversationId) {
        const conversationsList = document.getElementById('conversationsList');
        if (conversationsList) {
            conversationsList.scrollTop = 0;
        }
    }
}

if (!window.__talkBackButtonResizeHooked) {
    window.__talkBackButtonResizeHooked = true;
    window.addEventListener('resize', () => {
        if (!isStackedViewport()) {
            toggleMobileBackButtons(false);
        }
    });
}

// Make functions globally available
window.selectConversation = selectConversation;
window.updateChatHeader = updateChatHeader;
window.goBackToConversations = goBackToConversations;
window.showChatViewOnMobile = showChatViewOnMobile;
window.showConversationListOnMobile = showConversationListOnMobile;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        selectConversation,
        updateChatHeader
    };
}





