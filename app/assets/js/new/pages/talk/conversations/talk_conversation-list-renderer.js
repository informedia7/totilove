/**
 * TALK CONVERSATION RENDERER
 * Handles rendering conversation list UI
 * Extracted from talk.html (lines 948-1048)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - CONFIG (talk_config.js)
 * - Global functions: getCurrentFilter, filterConversations, getSavedMessagePreview, selectConversation
 */

const CONVERSATION_VIRTUALIZATION_THRESHOLD = 40;
const LAST_SELECTED_CONVERSATION_KEY = '__talkLastSelectedConversationId';
let conversationVirtualizer = null;
let conversationListClickBound = false;

function getStoredLastConversationId() {
    const stored = window[LAST_SELECTED_CONVERSATION_KEY];
    return stored ? String(stored) : null;
}

/**
 * Render conversations list
 */
function renderConversations() {
    const conversationsList = document.getElementById('conversationsList');
    if (!conversationsList) return;

    ensureConversationListClickHandler(conversationsList);

    // Preserve current filter state when rendering
    const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';

    // If we're on a filtered view (not 'all'), reapply the filter to ensure consistency
    if (currentFilter !== 'all' && typeof filterConversations === 'function') {
        filterConversations(currentFilter, true); // Skip render to prevent infinite loop
    }

    const filteredConversations = TalkState.getFilteredConversations();

    if (filteredConversations.length === 0) {
        teardownConversationVirtualizer();
        conversationsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6c757d;">
                <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                <div style="font-weight: 600; margin-bottom: 8px;">No conversations found</div>
                <div style="font-size: 14px;">Try adjusting your search or filters</div>
            </div>
        `;
        return;
    }

    const useVirtualization = shouldVirtualizeConversations(filteredConversations.length, conversationsList);
    if (useVirtualization) {
        const virtualizer = getConversationVirtualizer(conversationsList);
        virtualizer.setItems(filteredConversations);
        return;
    }

    teardownConversationVirtualizer();
    conversationsList.innerHTML = '';

    // PERFORMANCE: Use DocumentFragment for batch DOM updates
    const fragment = document.createDocumentFragment();
    filteredConversations.forEach(conversation => {
        const conversationElement = createConversationElement(conversation);
        fragment.appendChild(conversationElement);
    });
    conversationsList.appendChild(fragment);

    // Register online indicators with the new Presence engine after rendering
    setTimeout(() => {
        if (typeof registerOnlineIndicators === 'function') {
            registerOnlineIndicators();
        }
    }, 100);
}

/**
 * Create conversation element
 */
function createConversationElement(conversation) {
    const div = document.createElement('div');
    div.className = 'conversation-item';
    div.setAttribute('data-conversation-id', conversation.id);

    const presenceEnabled = typeof isPresenceSystemEnabled === 'function'
        ? isPresenceSystemEnabled()
        : true;

    // Add active class if this is the currently selected conversation
    const currentConversation = TalkState.getCurrentConversation();
    const conversationIdString = String(conversation.id);
    const activeConversationId = currentConversation ? String(currentConversation) : null;
    let shouldMarkActive = false;

    if (activeConversationId && conversationIdString === activeConversationId) {
        shouldMarkActive = true;
    } else if (!activeConversationId) {
        const stackedLayout = typeof isStackedViewport === 'function'
            ? isStackedViewport()
            : window.innerWidth <= 768;
        if (stackedLayout) {
            const storedConversationId = getStoredLastConversationId();
            if (storedConversationId && conversationIdString === storedConversationId) {
                shouldMarkActive = true;
            }
        }
    }

    if (shouldMarkActive) {
        div.classList.add('active');
    }

    // Check if avatar is a valid profile image path or just a letter
    // CRITICAL: Reject single letters and short strings to prevent /M, /S, /R requests
    const isValidImagePath = conversation.avatar &&
        typeof conversation.avatar === 'string' &&
        conversation.avatar.length > 15 && // Must be longer than single letter
        (conversation.avatar.startsWith('/uploads/') || conversation.avatar.startsWith('uploads/')) &&
        conversation.avatar.includes('.') &&
        !conversation.avatar.startsWith('images/'); // Exclude malformed paths

    const avatarHtml = isValidImagePath
        ? `<img src="${conversation.avatar.startsWith('/') ? conversation.avatar : '/' + conversation.avatar}" alt="${conversation.name}" class="conversation-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
        : '';

    // Get the letter to display (first letter of real_name or the avatar value if it's a letter)
    const displayLetter = isValidImagePath
        ? conversation.name.charAt(0).toUpperCase()
        : (conversation.avatar && conversation.avatar.length === 1 ? conversation.avatar : conversation.name.charAt(0).toUpperCase());

    // Check if user is online - use is_online property if available, otherwise check status string
    const isOnline = conversation.is_online !== undefined 
        ? conversation.is_online 
        : (conversation.status && conversation.status.toLowerCase().includes('online'));
    
    // Check if user is deleted
    const isDeleted = conversation.isDeleted || conversation.name === 'Deleted User' || conversation.name === 'Account Deactivated';
    
    // IMPORTANT: Check if conversation is blocked (for visual indicator)
    const isBlocked = conversation.isBlocked || false;
    const blockedStyle = isBlocked ? 'opacity: 0.6; filter: grayscale(50%);' : '';

    const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
    let savedPreview = (currentFilter === 'saved' && conversation.savedMessageCount > 0 && typeof getSavedMessagePreview === 'function')
        ? getSavedMessagePreview(conversation.partnerId)
        : (conversation.lastMessage || 'No messages yet');

    // Use account_deactivated.svg for deleted users
    const deletedAvatarHtml = isDeleted 
        ? `<img src="/assets/images/account_deactivated.svg" alt="Account Deactivated" class="conversation-avatar-img">`
        : avatarHtml;
    
    // For deleted users, show real real_name (no blur)
    const displayName = conversation.name;
    
    // Add deleted class to conversation item
    if (isDeleted) {
        div.classList.add('conversation-item-deleted');
    }

    const onlineIndicatorHtml = (!isDeleted && presenceEnabled)
        ? `<div class="online-indicator" data-user-id="${conversation.partnerId}" style="display: ${isOnline ? 'block' : 'none'};"></div>`
        : '';

    div.innerHTML = `
        <div class="conversation-avatar" style="${blockedStyle}">
            ${deletedAvatarHtml}
            <div class="conversation-avatar-letter" ${(isValidImagePath && !isDeleted) ? 'style="display: none;"' : (isDeleted ? 'style="display: none;"' : '')}>${isDeleted ? '⚠️' : displayLetter}</div>
            ${onlineIndicatorHtml}
            ${isBlocked ? '<div style="position: absolute; top: 0; right: 0; background: #dc3545; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; border: 2px solid white;">🚫</div>' : ''}
            ${isDeleted ? '<div style="position: absolute; top: 0; right: 0; background: #ff9800; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; border: 2px solid white;">⚠️</div>' : ''}
        </div>
        <div class="conversation-info" style="${blockedStyle}">
            <div class="conversation-name">
                ${displayName}
                ${isBlocked ? '<span style="margin-left: 8px; color: #dc3545; font-size: 12px;">🚫 Blocked</span>' : ''}
            </div>
            <div class="conversation-preview">
                ${savedPreview}
            </div>
            <div class="conversation-time">${conversation.lastMessageTime || ''}</div>
            ${conversation.savedMessageCount > 0 ? `<div class="conversation-saved-count">⭐ ${conversation.savedMessageCount} saved</div>` : ''}
        </div>
        ${conversation.unread > 0 ? `<div class="conversation-badge">${conversation.unread}</div>` : ''}
        ${isDeleted ? `<button class="clear-deleted-btn" data-clear-user-id="${conversation.partnerId}" onclick="event.stopPropagation(); if (typeof clearConversationWithDeletedUser === 'function') clearConversationWithDeletedUser(${conversation.partnerId});" style="
            position: absolute;
            top: 8px;
            right: 8px;
            background: #e74c3c;
            color: white;
            border: none;
            padding: 0.4rem 0.8rem;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            z-index: 10;
            transition: all 0.2s ease;
        " onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='#e74c3c'">
            <i class="fas fa-trash"></i> Clear
        </button>` : ''}
    `;

    return div;
}

/**
 * Register online indicators with Presence engine
 * Follows layout.html pattern for real-time status updates
 */
function registerOnlineIndicators() {
    const presenceEnabled = typeof isPresenceSystemEnabled === 'function'
        ? isPresenceSystemEnabled()
        : true;

    if (!presenceEnabled) {
        document.querySelectorAll('.online-indicator').forEach(el => {
            el.style.display = 'none';
        });
        return;
    }

    const statusElements = document.querySelectorAll('.online-indicator[data-user-id]');
    if (window.Presence) {
        statusElements.forEach(element => {
            const userId = element.dataset.userId;
            if (userId) {
                window.Presence.bindIndicator(element, userId, { variant: 'dot' });
            }
        });
        return;
    }

    setTimeout(() => {
        if (window.Presence) {
            registerOnlineIndicators();
        }
    }, 200);
}

function shouldVirtualizeConversations(count, container) {
    if (!window.VirtualizedPresenceList || !container) {
        return false;
    }
    if (container.dataset.virtualize === 'false') {
        return false;
    }
    const threshold = parseInt(container.dataset.virtualThreshold, 10) || CONVERSATION_VIRTUALIZATION_THRESHOLD;
    return count >= threshold;
}

function getConversationVirtualizer(container) {
    if (!conversationVirtualizer) {
        conversationVirtualizer = new window.VirtualizedPresenceList(container, {
            itemHeight: parseInt(container.dataset.virtualRowHeight, 10) || 96,
            overscan: 6,
            renderItem: (conversation) => createConversationElement(conversation),
            onRangeRendered: () => {
                if (typeof registerOnlineIndicators === 'function') {
                    requestAnimationFrame(() => registerOnlineIndicators());
                }
            }
        });
    }
    return conversationVirtualizer;
}

function teardownConversationVirtualizer() {
    if (conversationVirtualizer) {
        conversationVirtualizer.destroy();
        conversationVirtualizer = null;
    }
}

function ensureConversationListClickHandler(container) {
    if (conversationListClickBound || !container) {
        return;
    }

    container.addEventListener('click', (event) => {
        const item = event.target.closest('.conversation-item');
        if (!item) {
            return;
        }

        const conversationId = item.dataset.conversationId;
        if (!conversationId) {
            return;
        }

        if (typeof selectConversation === 'function') {
            selectConversation(conversationId, event);
        }
    });

    conversationListClickBound = true;
}

// Make functions globally available
window.renderConversations = renderConversations;
window.createConversationElement = createConversationElement;
window.registerOnlineIndicators = registerOnlineIndicators;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderConversations,
        createConversationElement,
        registerOnlineIndicators
    };
}
