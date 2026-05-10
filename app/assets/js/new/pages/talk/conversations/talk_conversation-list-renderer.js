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

function hasTalkProfilePhoto(avatarSrc) {
    const s = (avatarSrc || '').trim();
    if (!s) {
        return false;
    }
    if (/^https?:\/\//i.test(s)) {
        return true;
    }
    if (s.length === 1 && !/[./\\]/.test(s)) {
        return false;
    }
    if (s.startsWith('/uploads/') || s.startsWith('uploads/')) {
        return true;
    }
    const lower = s.toLowerCase();
    if (s.startsWith('/assets/') || s.startsWith('assets/')) {
        if (lower.includes('default_profile')) {
            return false;
        }
        if (lower.includes('account_deactivated')) {
            return false;
        }
        return true;
    }
    return false;
}

function getTalkAvatarInitialFromRealName(conversation) {
    const raw = ((conversation && (conversation.real_name || conversation.name)) || '').trim();
    if (!raw) {
        return '?';
    }
    const token = raw.split(/\s+/).filter(Boolean)[0] || raw;
    const ch = token.charAt(0);
    return ch ? ch.toLocaleUpperCase() : '?';
}

function buildConversationAvatarCandidateUrls(avatarSrc) {
    const candidates = [];
    const pushUnique = (value) => {
        if (!value) return;
        if (!candidates.includes(value)) {
            candidates.push(value);
        }
    };

    const normalizedSrc = typeof window.normalizeTalkAvatarUrlToPath === 'function'
        ? window.normalizeTalkAvatarUrlToPath((avatarSrc || '').trim())
        : (avatarSrc || '').trim();
    if (!hasTalkProfilePhoto(normalizedSrc)) {
        return candidates;
    }

    if (/^https?:\/\//i.test(normalizedSrc)) {
        pushUnique(normalizedSrc);
        pushUnique('/assets/images/default_profile_male.svg');
        return candidates;
    }

    const assetPath = normalizedSrc.startsWith('/') ? normalizedSrc : `/${normalizedSrc}`;
    if (assetPath.startsWith('/assets/')) {
        pushUnique(assetPath);
        pushUnique('/assets/images/default_profile_male.svg');
        return candidates;
    }

    const isUploadPath = normalizedSrc.startsWith('/uploads/') || normalizedSrc.startsWith('uploads/');

    if (isUploadPath) {
        const normalizedPath = normalizedSrc.startsWith('/') ? normalizedSrc : `/${normalizedSrc}`;

        const withThumbSizeMatch = normalizedPath.match(/^(.*)_thumb_(small|medium|normal)(\.[^./]+)$/i);
        if (withThumbSizeMatch) {
            const base = withThumbSizeMatch[1];
            const ext = withThumbSizeMatch[3];
            pushUnique(`${base}_thumb_small${ext}`);
            pushUnique(`${base}_thumb_medium${ext}`);
            pushUnique(`${base}${ext}`);
        } else {
            const plainFileMatch = normalizedPath.match(/^(.*)(\.[^./]+)$/i);
            if (plainFileMatch) {
                const base = plainFileMatch[1];
                const ext = plainFileMatch[2];
                pushUnique(`${base}_thumb_small${ext}`);
                pushUnique(`${base}_thumb_medium${ext}`);
                pushUnique(`${base}${ext}`);
            }
        }
    }

    pushUnique('/assets/images/default_profile_male.svg');
    return candidates;
}

function getStoredLastConversationId() {
    const stored = window[LAST_SELECTED_CONVERSATION_KEY];
    return stored ? String(stored) : null;
}

function isTalkLocationLookupEnabled() {
    return window.TalkLocationConfig?.enabled !== false;
}

/**
 * Fill geo lines under names (same source as chat header: /api/user + city/country).
 */
async function hydrateConversationListLocations(root) {
    if (!isTalkLocationLookupEnabled() || !root) {
        return;
    }
    const getter = typeof window.getTalkUserLocationString === 'function'
        ? window.getTalkUserLocationString
        : null;
    if (!getter) {
        return;
    }

    const rows = root.querySelectorAll('.conversation-list-location[data-partner-id]');
    await Promise.allSettled(Array.from(rows, async (el) => {
        const id = el.getAttribute('data-partner-id');
        if (!id) {
            return;
        }
        const textEl = el.querySelector('.conversation-list-location-text');
        const str = await getter(id);
        if (str && textEl) {
            textEl.textContent = str;
            el.classList.remove('chat-meta-hidden');
            el.setAttribute('aria-hidden', 'false');
        } else {
            if (textEl) {
                textEl.textContent = '';
            }
            el.classList.add('chat-meta-hidden');
            el.setAttribute('aria-hidden', 'true');
        }
    }));
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

    hydrateConversationListLocations(conversationsList).catch(() => {});

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

    const isOnline = typeof normalizeConversationIsOnline === 'function'
        ? normalizeConversationIsOnline(conversation)
        : (conversation.is_online !== undefined
            ? conversation.is_online
            : (conversation.status && conversation.status.toLowerCase().includes('online')));
    
    // Check if user is deleted
    const isDeleted = conversation.isDeleted || conversation.name === 'Deleted User' || conversation.name === 'Account Deactivated';

    const accountStatus = String(conversation.account_status || '').trim().toLowerCase();
    const isSuspended = conversation.is_suspended === true || conversation.is_suspended === 'true' || conversation.is_suspended === 1 || conversation.is_suspended === '1';
    const isUnavailable = !isDeleted && (isSuspended || accountStatus === 'paused');
    
    // IMPORTANT: Check if conversation is blocked (for visual indicator)
    const isBlocked = conversation.isBlocked || false;
    const blockedStyle = isBlocked ? 'opacity: 0.6; filter: grayscale(50%);' : '';

    const currentFilter = typeof getCurrentFilter === 'function' ? getCurrentFilter() : 'all';
    let savedPreview = (currentFilter === 'saved' && conversation.savedMessageCount > 0 && typeof getSavedMessagePreview === 'function')
        ? getSavedMessagePreview(conversation.partnerId)
        : (conversation.lastMessage || 'No messages yet');

    const rawAvatar = conversation.avatar || '';
    const hasPhoto = !isDeleted && hasTalkProfilePhoto(rawAvatar);
    const avatarCandidates = hasPhoto ? buildConversationAvatarCandidateUrls(rawAvatar) : [];
    const primaryAvatarSrc = isDeleted
        ? '/assets/images/account_deactivated.svg'
        : (hasPhoto ? avatarCandidates[0] : '');

    const letterHtml = !isDeleted && !hasPhoto
        ? `<span class="conversation-avatar-letter${isUnavailable ? ' conversation-avatar-letter-unavailable' : ''}" aria-hidden="true">${getTalkAvatarInitialFromRealName(conversation)}</span>`
        : '';
    const imgHtml = isDeleted || hasPhoto
        ? `<img src="${primaryAvatarSrc}" alt="" class="conversation-avatar-img">`
        : '';

    // For deleted users, show real real_name (no blur)
    const displayName = conversation.name;
    const displayNameHtml = isUnavailable
        ? `<span class="conversation-partner-name-unavailable">${displayName}</span>`
        : displayName;
    const genderIconHtml =
        !isDeleted && typeof window.renderTalkGenderIconHtml === 'function'
            ? window.renderTalkGenderIconHtml(conversation.gender)
            : '';
    
    // Add deleted class to conversation item
    if (isDeleted) {
        div.classList.add('conversation-item-deleted');
    }
    if (isUnavailable) {
        div.classList.add('conversation-item-unavailable');
        div.dataset.accountSuspended = isSuspended ? 'true' : 'false';
        div.dataset.accountPaused = accountStatus === 'paused' ? 'true' : 'false';
    }

    const availabilityBadgeHtml = isUnavailable
        ? `<span class="conversation-unavailable-badge">Unavailable</span>`
        : '';

    const ageNum = conversation.age != null && conversation.age !== '' ? Number(conversation.age) : NaN;
    const ageBadgeHtml = !isDeleted && Number.isFinite(ageNum) && ageNum > 0 && ageNum < 130
        ? `<span class="talk-partner-age-badge" title="Age ${ageNum}">${ageNum}</span>`
        : '';

    const partnerNumeric = Number(conversation.partnerId);
    const partnerIdAttr = Number.isFinite(partnerNumeric) && partnerNumeric > 0 ? String(partnerNumeric) : '';
    const locationRowHtml = !isDeleted && partnerIdAttr && isTalkLocationLookupEnabled()
        ? `<div class="conversation-list-location chat-location chat-meta chat-meta-hidden" data-partner-id="${partnerIdAttr}" aria-hidden="true"><i class="fas fa-map-marker-alt"></i><span class="conversation-list-location-text"></span></div>`
        : '';

    const onlineIndicatorHtml = (!isDeleted && presenceEnabled)
        ? `<div class="online-indicator" data-user-id="${conversation.partnerId}" style="display: ${isOnline ? 'block' : 'none'};"></div>`
        : '';

    div.innerHTML = `
        <div class="conversation-avatar" style="${blockedStyle}">
            ${imgHtml}
            ${letterHtml}
            ${onlineIndicatorHtml}
            ${isBlocked ? '<div style="position: absolute; top: 0; right: 0; background: #dc3545; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; border: 2px solid white;">🚫</div>' : ''}
            ${isDeleted ? '<div style="position: absolute; top: 0; right: 0; background: #ff9800; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; border: 2px solid white;">⚠️</div>' : ''}
        </div>
        <div class="conversation-info" style="${blockedStyle}">
            <div class="conversation-name">
                <span class="conversation-name-row">
                    <span class="conversation-name-text">${displayNameHtml}</span>
                    ${genderIconHtml}
                    ${ageBadgeHtml}
                    ${availabilityBadgeHtml}
                </span>
                ${isBlocked ? '<span style="margin-left: 8px; color: #dc3545; font-size: 12px;">🚫 Blocked</span>' : ''}
            </div>
            ${locationRowHtml}
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

    if (!isDeleted && hasPhoto && avatarCandidates.length > 0) {
        const avatarImg = div.querySelector('.conversation-avatar-img');
        const avatarWrap = div.querySelector('.conversation-avatar');
        if (avatarImg && avatarWrap) {
            let index = 1;
            avatarImg.addEventListener('error', () => {
                if (index >= avatarCandidates.length) {
                    avatarImg.remove();
                    if (!avatarWrap.querySelector('.conversation-avatar-letter')) {
                        const span = document.createElement('span');
                        span.className = 'conversation-avatar-letter'
                            + (isUnavailable ? ' conversation-avatar-letter-unavailable' : '');
                        span.setAttribute('aria-hidden', 'true');
                        span.textContent = getTalkAvatarInitialFromRealName(conversation);
                        const indicator = avatarWrap.querySelector('.online-indicator');
                        if (indicator) {
                            avatarWrap.insertBefore(span, indicator);
                        } else {
                            avatarWrap.appendChild(span);
                        }
                    }
                    return;
                }
                avatarImg.src = avatarCandidates[index];
                index += 1;
            });
        }
    }

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

    // Only the sidebar list: rebinding #chatAvatar / header dots breaks visibility counts
    // and makes one partner's presence cancel another's.
    const listRoot = document.getElementById('conversationsList');
    const statusElements = listRoot
        ? listRoot.querySelectorAll('.online-indicator[data-user-id]')
        : document.querySelectorAll('.conversation-item .online-indicator[data-user-id]');
    if (window.Presence) {
        statusElements.forEach(element => {
            const raw = element.dataset.userId;
            const s = raw != null ? String(raw).trim() : '';
            if (!s || !/^\d+$/.test(s)) {
                return;
            }
            const userId = parseInt(s, 10);
            if (!Number.isInteger(userId) || userId < 1) {
                return;
            }
            window.Presence.bindIndicator(element, userId, { variant: 'dot' });
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
    // Conversation rows have variable heights (badges, saved-state, deleted-state, previews).
    // The current virtualizer assumes a fixed item height, which creates scroll jitter.
    // Use native scrolling for stable behavior across desktop and mobile.
    return false;
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
                if (container) {
                    hydrateConversationListLocations(container).catch(() => {});
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
