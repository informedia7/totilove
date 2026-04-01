/**
 * MESSAGE PAGINATION
 * Handles pagination controls for messages (page numbers)
 * Supports both page navigation and scroll-based loading
 */

const MESSAGES_PER_PAGE = 10;

let currentPage = 1;
let totalPages = 1;
let currentConversationId = null;
let totalMessageCount = 0;
let isNavigating = false; // Flag to prevent reloads during pagination

/**
 * Initialize pagination for a conversation
 */
function initPagination(conversationId, messageCount) {
    currentConversationId = conversationId;
    totalMessageCount = messageCount;
    totalPages = Math.ceil(totalMessageCount / MESSAGES_PER_PAGE);
    currentPage = 1; // Always start on page 1
    isNavigating = false; // Reset navigation flag
    
    updatePaginationUI();
}

/**
 * Reset pagination to page 1 (used when switching conversations)
 */
function resetPagination() {
    // CRITICAL: Always reset to page 1
    currentPage = 1;
    totalPages = 1;
    currentConversationId = null;
    totalMessageCount = 0;
    isNavigating = false;
    
    const paginationContainer = document.getElementById('messagePagination');
    if (paginationContainer) {
        paginationContainer.style.display = 'none';
    }
    
    // Also clear any scroll loading state to prevent immediate triggers
    const messagesArea = document.getElementById('messagesArea');
    if (messagesArea && messagesArea._scrollLoadingState) {
        const state = messagesArea._scrollLoadingState;
        if (state.observer && state.sentinel) {
            state.observer.unobserve(state.sentinel);
        }
        messagesArea._scrollLoadingState = null;
    }
}

/**
 * Update pagination UI
 * NOTE: UI is hidden - only internal state is maintained for scroll functionality
 */
function updatePaginationUI() {
    // Always hide pagination UI - we only use scroll-based loading
    const paginationContainer = document.getElementById('messagePagination');
    if (paginationContainer) {
        paginationContainer.style.display = 'none';
    }
    
    // Refresh scroll lazy loading state after pagination update
    if (typeof refreshScrollLazyLoadingState === 'function') {
        refreshScrollLazyLoadingState();
    }
}

/**
 * Go to a specific page
 */
async function goToPage(page) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    if (isNavigating) return; // Prevent concurrent navigation
    
    isNavigating = true;
    
    try {
        currentPage = page;
        updatePaginationUI();
        
        // Calculate offset
        const offset = (page - 1) * MESSAGES_PER_PAGE;
        
        // Get current conversation
        const conversations = TalkState.getConversations();
        const conversation = conversations[currentConversationId];
        
        if (!conversation) {
            isNavigating = false;
            return;
        }
        
        // Clear message cache for this conversation to force fresh fetch
        const messageCache = TalkState.getMessageCache ? TalkState.getMessageCache() : null;
        if (messageCache) {
            const currentUserId = TalkState.getCurrentUserId();
            const cacheKey = `${currentUserId}_${conversation.partnerId}`;
            messageCache.delete(cacheKey);
        }
        
        const messagesArea = document.getElementById('messagesArea');
        const isPage1 = page === 1;
        const shouldPrepend = !isPage1; // Prepend for page 2+, replace for page 1
        
        if (isPage1) {
            // Page 1: Clear existing messages and replace
            conversation.messages = [];
            TalkState.setConversations(conversations);
            
            if (messagesArea) {
                messagesArea.innerHTML = '';
            }
        } else {
            // Page 2+: Keep existing messages, will prepend new ones
            // Temporarily disconnect scroll observer to prevent triggers during loading
            if (messagesArea && messagesArea._scrollLoadingState && messagesArea._scrollLoadingState.observer) {
                const state = messagesArea._scrollLoadingState;
                if (state.sentinel) {
                    state.observer.unobserve(state.sentinel);
                    state.observer._isObserving = false;
                }
            }
        }
        
        // Load messages: prepend for page 2+, replace for page 1
        if (typeof loadMessages === 'function') {
            // Track message count before loading (for prepend loads)
            const messagesBeforeLoad = shouldPrepend ? (conversation.messages?.length || 0) : 0;
            
            await loadMessages(conversation, {
                forceRefresh: true,  // Force fresh fetch from database
                offset: offset,
                limit: MESSAGES_PER_PAGE,
                prepend: shouldPrepend  // Prepend for page 2+, replace for page 1
            });
            
            // CRITICAL: Update pagination state after loading (even for prepend loads)
            // This ensures totalPages is updated correctly for scroll-based loading
            if (typeof updatePaginationAfterLoad === 'function' && conversation) {
                let loadedCount;
                if (shouldPrepend) {
                    // For prepend: calculate how many NEW messages were added
                    const messagesAfterLoad = conversation.messages?.length || 0;
                    loadedCount = messagesAfterLoad - messagesBeforeLoad;
                } else {
                    // For replace: use total count (this is page 1)
                    loadedCount = conversation.messages?.length || 0;
                }
                updatePaginationAfterLoad(conversation, loadedCount);
                
                // CRITICAL: Explicitly refresh scroll loading state after pagination update
                // This ensures hasMore is updated immediately for scroll loading
                if (typeof refreshScrollLazyLoadingState === 'function') {
                    refreshScrollLazyLoadingState();
                }
            }
            
            if (isPage1) {
                // Page 1: Scroll to bottom to show newest messages
                if (messagesArea) {
                    messagesArea.scrollTop = messagesArea.scrollHeight;
                }
                
                // Wait for messages to render, then setup scroll lazy loading
                await new Promise(resolve => setTimeout(resolve, 100));
                
                if (messagesArea && typeof setupScrollLazyLoading === 'function') {
                    setupScrollLazyLoading(messagesArea);
                }
            } else {
                // Page 2+: Messages are prepended, restore scroll position
                // Scroll position is maintained by renderMessages when prepend=true
                // Wait for DOM to update, then refresh state and reconnect observer
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Refresh scroll loading state to ensure hasMore is updated
                if (typeof refreshScrollLazyLoadingState === 'function') {
                    refreshScrollLazyLoadingState();
                }
                
                // Reconnect observer if we have more messages
                if (messagesArea && messagesArea._scrollLoadingState && messagesArea._scrollLoadingState.observer) {
                    const state = messagesArea._scrollLoadingState;
                    if (state.sentinel && state.hasMore && !state.isLoading) {
                        const scrollTop = messagesArea.scrollTop;
                        const scrollHeight = messagesArea.scrollHeight;
                        const clientHeight = messagesArea.clientHeight;
                        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
                        
                        // Only reconnect if user is scrolled up (not at bottom)
                        if (!isAtBottom && !state.observer._isObserving) {
                            state.observer.observe(state.sentinel);
                            state.observer._isObserving = true;
                        }
                    }
                }
            }
        }
    } finally {
        isNavigating = false;
    }
}

/**
 * Get total message count for a conversation
 * Estimates by checking if there are more messages beyond the current page
 */
async function getTotalMessageCount(userId1, userId2, currentCount = 0) {
    try {
        // If we already have messages, check if there are more
        if (currentCount > 0) {
            // Check if there are more messages by requesting the next page
            const testOffset = currentCount;
            const response = await fetch(`/api/messages/conversation/${userId1}/${userId2}?limit=1&offset=${testOffset}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': userId1
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.messages && data.messages.length > 0) {
                    // There are more messages - return estimate that allows continued loading
                    // Add buffer to ensure pagination continues discovering messages
                    return currentCount + MESSAGES_PER_PAGE; // Estimate allows for more pages
                }
            }
            // No more messages, so currentCount is the total
            return currentCount;
        }
        
        // Initial load - check first page
        const response = await fetch(`/api/messages/conversation/${userId1}/${userId2}?limit=${MESSAGES_PER_PAGE}&offset=0`, {
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId1
            }
        });
        
        if (!response.ok) return 0;
        
        const data = await response.json();
        const firstPageCount = data.messages ? data.messages.length : 0;
        
        if (firstPageCount < MESSAGES_PER_PAGE) {
            // Got less than a full page, so this is all messages
            return firstPageCount;
        }
        
        // Got a full page, check if there are more
        const nextResponse = await fetch(`/api/messages/conversation/${userId1}/${userId2}?limit=1&offset=${MESSAGES_PER_PAGE}`, {
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId1
            }
        });
        
        if (nextResponse.ok) {
            const nextData = await nextResponse.json();
            if (nextData.messages && nextData.messages.length > 0) {
                // There are more messages - check multiple pages ahead to get better estimate
                let estimatedTotal = MESSAGES_PER_PAGE * 2; // At least 2 pages
                let testOffset = MESSAGES_PER_PAGE * 2;
                let hasMore = true;
                
                // Check up to 10 pages ahead (100 messages) to get better estimate
                while (hasMore && testOffset < MESSAGES_PER_PAGE * 10) {
                    const checkResponse = await fetch(`/api/messages/conversation/${userId1}/${userId2}?limit=1&offset=${testOffset}`, {
                        headers: {
                            'Content-Type': 'application/json',
                            'X-User-ID': userId1
                        }
                    });
                    
                    if (checkResponse.ok) {
                        const checkData = await checkResponse.json();
                        if (checkData.messages && checkData.messages.length > 0) {
                            estimatedTotal = testOffset + 1;
                            testOffset += MESSAGES_PER_PAGE;
                        } else {
                            hasMore = false;
                        }
                    } else {
                        hasMore = false;
                    }
                }
                
                // If still finding messages, add buffer for continued discovery
                if (hasMore) {
                    estimatedTotal += MESSAGES_PER_PAGE;
                }
                
                return estimatedTotal;
            }
        }
        
        // Only one page
        return firstPageCount;
    } catch (error) {
        // On error, return current count or minimum estimate that allows discovery
        return currentCount > 0 ? currentCount + MESSAGES_PER_PAGE : MESSAGES_PER_PAGE;
    }
}

/**
 * Setup pagination when conversation is selected
 */
async function setupPagination(conversation) {
    if (!conversation) {
        hidePagination();
        return;
    }
    
    const currentUserId = TalkState.getCurrentUserId();
    if (!currentUserId || !conversation.partnerId) {
        hidePagination();
        return;
    }
    
    // CRITICAL: Always reset to page 1 before setting up pagination
    currentPage = 1;
    isNavigating = false;
    
    // Get current message count from conversation state
    const currentCount = conversation.messages ? conversation.messages.length : 0;
    
    // Get total message count estimate
    const count = await getTotalMessageCount(currentUserId, conversation.partnerId, currentCount);
    
    if (count > 0) {
        initPagination(conversation.id || conversation.partnerId, count);
        // Ensure we're on page 1 after initialization
        currentPage = 1;
        updatePaginationUI();
    } else {
        hidePagination();
    }
}

/**
 * Update pagination after loading messages
 * CORRECT LONG-TERM FIX: Track pages loaded, not inferred totals
 * This model cannot break - only tracks what we know: pages loaded and last fetch result
 */
function updatePaginationAfterLoad(conversation, loadedCount) {
    if (!conversation) return;
    
    const conversationId = conversation.id || conversation.partnerId;
    if (conversationId !== currentConversationId) return;
    
    // CORRECT MODEL: Only two things matter:
    // 1. How many pages we've loaded
    // 2. Whether the last fetch returned a full page
    
    if (loadedCount === MESSAGES_PER_PAGE) {
        // Got a full page - we've discovered at least one more page exists
        // Update totalPages to allow loading the next page
        totalPages = Math.max(totalPages, currentPage + 1);
        
        // Update totalMessageCount for UI consistency (but not used for pagination logic)
        totalMessageCount = currentPage * MESSAGES_PER_PAGE;
        
        updatePaginationUI();
    } else if (loadedCount < MESSAGES_PER_PAGE) {
        // Got less than a full page, this is the last page
        // Set totalPages to current page (we're on the last page)
        totalPages = currentPage;
        
        // Update totalMessageCount for UI consistency
        totalMessageCount = (currentPage - 1) * MESSAGES_PER_PAGE + loadedCount;
        
        updatePaginationUI();
    }
    
    // Stop condition: hasMore = loadedCount === MESSAGES_PER_PAGE
    // This is checked in refreshScrollLazyLoadingState()
}

/**
 * Hide pagination
 */
function hidePagination() {
    const paginationContainer = document.getElementById('messagePagination');
    if (paginationContainer) {
        paginationContainer.style.display = 'none';
    }
}

/**
 * Create a page number button (not used - UI is hidden)
 */
function createPageButton(pageNum) {
    const btn = document.createElement('button');
    btn.className = 'pagination-btn';
    if (pageNum === currentPage) {
        btn.classList.add('active');
    }
    btn.textContent = pageNum;
    btn.onclick = () => goToPage(pageNum);
    return btn;
}

/**
 * Get current page number
 */
function getCurrentPage() {
    return currentPage;
}

/**
 * Check if pagination is currently navigating
 */
function isNavigatingPage() {
    return isNavigating;
}

/**
 * Get total pages
 */
function getTotalPages() {
    return totalPages;
}

/**
 * Go to next page (for scroll-to-top navigation)
 * Next page means older messages (page 1 -> 2 -> 3...)
 */
async function goToNextPage() {
    if (currentPage < totalPages) {
        await goToPage(currentPage + 1);
    }
}

// Make functions globally available
window.initPagination = initPagination;
window.updatePaginationUI = updatePaginationUI;
window.goToPage = goToPage;
window.setupPagination = setupPagination;
window.hidePagination = hidePagination;
window.updatePaginationAfterLoad = updatePaginationAfterLoad;
window.getCurrentPage = getCurrentPage;
window.getTotalPages = getTotalPages;
window.goToNextPage = goToNextPage;
window.isNavigatingPage = isNavigatingPage;
window.resetPagination = resetPagination;

