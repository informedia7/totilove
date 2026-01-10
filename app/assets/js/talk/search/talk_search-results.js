/**
 * TALK SEARCH RESULTS
 * Search results rendering, highlighting, and context utilities
 * Extracted from talk.html (lines 1426-1453, 1960-2160)
 * 
 * Dependencies: TalkState (talk_state.js), Utils (talk_utils.js), formatMessageTime (global)
 */

/**
 * Helper to get current sender filter value for the Search-in-chat panel
 */
function getCurrentSearchSenderFilter() {
    return TalkState.getCurrentSearchSenderFilter() || 'me';
}

/**
 * Highlight search terms in text
 */
function highlightSearchTerms(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}

/**
 * Get search context (surrounding messages)
 */
function getSearchContext(messages, currentIndex, query, contextSize = 1) {
    const context = [];
    const start = Math.max(0, currentIndex - contextSize);
    const end = Math.min(messages.length - 1, currentIndex + contextSize);
    
    for (let i = start; i <= end; i++) {
        if (i !== currentIndex) {
            const msg = messages[i];
            const text = (msg.text || msg.message || msg.content || '').substring(0, 100);
            if (text) {
                context.push({
                    text: query ? highlightSearchTerms(text, query) : text,
                    timestamp: msg.timestamp,
                    isBefore: i < currentIndex
                });
            }
        }
    }
    return context;
}

/**
 * Render search results with highlighting, context, and "View more"
 */
function renderSearchResults(filtered, query, conv) {
    const resultsList = document.getElementById('searchResultsList');
    const statsEl = document.getElementById('searchResultsStats');
    const viewMoreContainer = document.getElementById('viewMoreContainer');
    
    if (!resultsList) return;

    // Clear existing messages only if starting fresh (not loading more)
    const existingItems = resultsList.querySelectorAll('.search-result-item');
    const existingCount = existingItems.length;
    const isNewSearch = existingCount === 0;
    
    // Remove empty message element if it exists (it will be re-added if needed)
    const emptyEl = document.getElementById('searchResultsEmpty');
    if (emptyEl && emptyEl.parentNode === resultsList) {
        emptyEl.remove();
    }
    
    // Only clear the list if this is a completely new search
    if (isNewSearch) {
        // Clear all items but keep the structure
        while (resultsList.firstChild) {
            resultsList.removeChild(resultsList.firstChild);
        }
    }

    if (!filtered.length) {
        if (isNewSearch) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'search-results-empty';
            emptyEl.id = 'searchResultsEmpty';
            emptyEl.textContent = 'No messages found';
            resultsList.appendChild(emptyEl);
        }
        const statsTextEl = document.getElementById('searchResultsStatsText');
        const clearBtn = document.getElementById('clearMessagesBtn');
        if (statsTextEl) statsTextEl.textContent = '';
        if (clearBtn) clearBtn.style.display = 'none';
        if (viewMoreContainer) viewMoreContainer.style.display = 'none';
        return;
    }

    // Update stats (store original count for search filter)
    const statsTextEl = document.getElementById('searchResultsStatsText');
    const clearBtn = document.getElementById('clearMessagesBtn');
    const searchMessagesInput = document.getElementById('searchMessagesInput');
    const hasSearchFilter = searchMessagesInput && searchMessagesInput.value.trim();
    
    if (statsTextEl && !hasSearchFilter) {
        statsTextEl.textContent = `Found ${filtered.length} message${filtered.length !== 1 ? 's' : ''}`;
    }
    if (statsEl) {
        statsEl.setAttribute('aria-live', 'polite');
    }
    if (clearBtn) {
        clearBtn.style.display = 'inline-block';
    }

    // Determine how many messages to show
    const messagesToShow = Math.min(TalkState.getCurrentMessagesDisplayed(), filtered.length);
    
    let messagesToRender;
    if (isNewSearch || existingCount === 0) {
        // New search - render from beginning
        messagesToRender = filtered.slice(0, messagesToShow);
    } else {
        // Loading more - only render new messages (from existingCount to messagesToShow)
        if (existingCount < messagesToShow) {
            messagesToRender = filtered.slice(existingCount, messagesToShow);
        } else {
            // Already showing all requested messages - just update button
            if (viewMoreContainer) {
                viewMoreContainer.style.display = messagesToShow < filtered.length ? 'block' : 'none';
            }
            return; // Don't render anything new
        }
    }
    
    // If no messages to render, return early
    if (!messagesToRender || messagesToRender.length === 0) {
        if (viewMoreContainer) {
            viewMoreContainer.style.display = messagesToShow < filtered.length ? 'block' : 'none';
        }
        return;
    }
    

    // Show "View more" button if there are more messages
    if (viewMoreContainer) {
        if (messagesToShow < filtered.length) {
            viewMoreContainer.style.display = 'block';
        } else {
            viewMoreContainer.style.display = 'none';
        }
    }

    const senderFilter = getCurrentSearchSenderFilter();
    const partnerName = conv.name || `User ${conv.partnerId || conv.id}`;
    const currentUserName = (window.currentUser && (window.currentUser.real_name || window.currentUser.real_name)) || 'You';
    const currentUserAvatar = (window.currentUser && window.currentUser.avatar) || '';
    const queryLower = query ? query.toLowerCase() : '';

    const fragment = document.createDocumentFragment();

    messagesToRender.forEach((msg, idx) => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.setAttribute('role', 'listitem');
        item.setAttribute('tabindex', '0');

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'search-result-avatar';
        avatarDiv.setAttribute('aria-hidden', 'true');

        const useMyAvatar = senderFilter === 'me';
        const avatarSrc = useMyAvatar ? currentUserAvatar : conv.avatar;
        const nameForAvatar = useMyAvatar ? currentUserName : partnerName;

        const isValidImagePath = avatarSrc &&
            (avatarSrc.startsWith('/uploads/') || avatarSrc.startsWith('uploads/')) &&
            avatarSrc.includes('.') &&
            avatarSrc.length > 15 &&
            !avatarSrc.startsWith('images/');

        if (isValidImagePath) {
            const img = document.createElement('img');
            img.src = avatarSrc.startsWith('/') ? avatarSrc : `/${avatarSrc}`;
            img.alt = nameForAvatar;
            avatarDiv.appendChild(img);
        } else {
            avatarDiv.textContent = (nameForAvatar.charAt(0) || 'U').toUpperCase();
        }

        const mainDiv = document.createElement('div');
        mainDiv.className = 'search-result-main';

        const headerRow = document.createElement('div');
        headerRow.className = 'search-result-header-row';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'search-result-name';
        nameSpan.textContent = senderFilter === 'me' ? currentUserName : partnerName;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'search-result-time';
        const ts = msg.timestamp ? new Date(msg.timestamp) : null;
        timeSpan.textContent = ts ? (typeof formatMessageTime === 'function' ? formatMessageTime(ts).replace(/<[^>]*>/g, '') : ts.toLocaleString()) : '';

        headerRow.appendChild(nameSpan);
        headerRow.appendChild(timeSpan);

        // Show attachment indicator
        if (msg.hasAttachments || (msg.attachments && msg.attachments.length > 0)) {
            const attachBadge = document.createElement('span');
            attachBadge.className = 'attachment-badge';
            attachBadge.textContent = `📎 ${msg.attachments?.length || 1} attachment${(msg.attachments?.length || 1) !== 1 ? 's' : ''}`;
            attachBadge.style.cssText = 'font-size: 11px; color: #6c757d; margin-left: 8px;';
            headerRow.appendChild(attachBadge);
        }

        const textDiv = document.createElement('div');
        textDiv.className = 'search-result-text';
        const textContent = msg.text || msg.message || msg.content || '';
        // Highlight search terms
        if (query) {
            textDiv.innerHTML = highlightSearchTerms(textContent, query);
        } else {
            textDiv.textContent = textContent;
        }

        // Add context snippet if query exists
        if (query && filtered.length > 1) {
            const msgIndex = filtered.indexOf(msg);
            if (msgIndex !== -1) {
                const context = getSearchContext(filtered, msgIndex, query, 1);
                if (context.length > 0) {
                    const contextDiv = document.createElement('div');
                    contextDiv.className = 'search-result-context';
                    contextDiv.setAttribute('aria-label', 'Message context');
                    const contextText = context.map(c => 
                        `${c.isBefore ? '↑' : '↓'} ${c.text}`
                    ).join(' • ');
                    contextDiv.innerHTML = contextText;
                    mainDiv.appendChild(contextDiv);
                }
            }
        }

        mainDiv.appendChild(headerRow);
        mainDiv.appendChild(textDiv);

        item.appendChild(avatarDiv);
        item.appendChild(mainDiv);

        fragment.appendChild(item);
    });

    resultsList.appendChild(fragment);
}

// Make functions globally available (for use by other modules and inline handlers)
window.getCurrentSearchSenderFilter = getCurrentSearchSenderFilter;
window.highlightSearchTerms = highlightSearchTerms;
window.getSearchContext = getSearchContext;
window.renderSearchResults = renderSearchResults;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getCurrentSearchSenderFilter,
        highlightSearchTerms,
        getSearchContext,
        renderSearchResults
    };
}
















