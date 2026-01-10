/**
 * TALK SEARCH PANEL
 * Search panel UI management and search result filtering
 * Extracted from talk.html (lines 1456-1779, 1782-1916, 1919-1958, 7969-7989)
 * 
 * Dependencies: 
 * - TalkState (talk_state.js)
 * - getCurrentSearchSenderFilter, renderSearchResults (talk_search-results.js)
 * - loadMessages (global function - to be extracted in later phase)
 * - getUserIdFromToken (global function)
 */

/**
 * Update Search-in-chat results based on sender filter and search text
 */
async function updateSearchPanelResults() {
    const resultsList = document.getElementById('searchResultsList');
    const emptyEl = document.getElementById('searchResultsEmpty');
    if (!resultsList || !emptyEl) return;

    const currentConversation = TalkState.getCurrentConversation();
    const conversations = TalkState.getConversations();

    // No conversation selected
    if (!currentConversation || !conversations[currentConversation]) {
        resultsList.innerHTML = '';
        emptyEl.textContent = 'Select a conversation to search messages.';
        resultsList.appendChild(emptyEl);
        const statsTextEl = document.getElementById('searchResultsStatsText');
        const clearBtn = document.getElementById('clearMessagesBtn');
        if (statsTextEl) statsTextEl.textContent = '';
        if (clearBtn) clearBtn.style.display = 'none';
        const viewMoreContainer = document.getElementById('viewMoreContainer');
        if (viewMoreContainer) viewMoreContainer.style.display = 'none';
        return;
    }

    const conv = conversations[currentConversation];

    // Ensure messages are loaded for this conversation
    if (!conv.messages || !Array.isArray(conv.messages) || conv.messages.length === 0) {
        try {
            if (typeof loadMessages === 'function') {
                await loadMessages(conv, { forceRefresh: true, offset: 0, limit: 10 });
            } else {
                throw new Error('loadMessages function not available');
            }
        } catch (e) {
            resultsList.innerHTML = '';
            emptyEl.textContent = 'Failed to load messages for search.';
            resultsList.appendChild(emptyEl);
            const statsTextEl = document.getElementById('searchResultsStatsText');
            const clearBtn = document.getElementById('clearMessagesBtn');
            if (statsTextEl) statsTextEl.textContent = '';
            if (clearBtn) clearBtn.style.display = 'none';
            const viewMoreContainer = document.getElementById('viewMoreContainer');
            if (viewMoreContainer) viewMoreContainer.style.display = 'none';
            return;
        }
    }

    const messages = (conv.messages || []).slice();
    if (messages.length === 0) {
        resultsList.innerHTML = '';
        emptyEl.textContent = 'No messages found in this conversation.';
        resultsList.appendChild(emptyEl);
        const statsTextEl = document.getElementById('searchResultsStatsText');
        const clearBtn = document.getElementById('clearMessagesBtn');
        if (statsTextEl) statsTextEl.textContent = '';
        if (clearBtn) clearBtn.style.display = 'none';
        const viewMoreContainer = document.getElementById('viewMoreContainer');
        if (viewMoreContainer) viewMoreContainer.style.display = 'none';
        return;
    }

    // Check cache first
    const searchInput = document.getElementById('searchPanelInput');
    const queryRaw = (searchInput?.value || '').trim();
    const query = queryRaw.toLowerCase();
    const currentDateRange = TalkState.getCurrentDateRange();
    const cacheKey = `${currentConversation}_${getCurrentSearchSenderFilter()}_${queryRaw}_${currentDateRange.start || 'null'}_${currentDateRange.end || 'null'}`;
    
    // Reset pagination if this is a new search (different from last)
    // But don't reset if we're just changing pages
    const lastSearchKey = TalkState.getLastSearchKey();
    const isNewSearch = cacheKey !== lastSearchKey;
    if (isNewSearch) {
        TalkState.setCurrentMessagesDisplayed(TalkState.getMessagesPerLoad());
        TalkState.setLastSearchKey(cacheKey);
    }
    
    // Use cache if available
    const searchCache = TalkState.getSearchCache();
    if (searchCache.has(cacheKey)) {
        const cached = searchCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 30000) { // 30 second cache
            renderSearchResults(cached.filtered, queryRaw, conv);
            return;
        }
    }

    const senderFilter = getCurrentSearchSenderFilter();

    // Prepare display names for header and avatars
    const partnerName = conv.name || `User ${conv.partnerId || conv.id}`;
    const currentUserName = (window.currentUser && (window.currentUser.real_name || window.currentUser.real_name)) || 'You';
    const currentUserAvatar = (window.currentUser && window.currentUser.avatar) || '';

    // Resolve numeric IDs for current user and conversation partner
    const myIdRaw = (window.currentUser && window.currentUser.id) || (typeof getUserIdFromToken === 'function' ? getUserIdFromToken() : null);
    const myId = myIdRaw != null ? parseInt(myIdRaw) : null;
    const partnerIdRaw = conv.partnerId || conv.id;
    const partnerId = partnerIdRaw != null ? parseInt(partnerIdRaw) : null;

    // Update the "Messages" header to reflect the current sender filter
    const headerTitleEl = document.getElementById('searchResultsTitle');
    if (headerTitleEl) {
        const headerName = senderFilter === 'me' ? currentUserName : partnerName;
        headerTitleEl.textContent = `Messages ${headerName}`;
    }

    // Filter messages ONLY by direction (who sent) within this conversation:
    // - "me"      → all messages with type === 'sent'     (sent by the logged-in user)
    // - "partner" → all messages with type === 'received' (sent by the current partner)
    let filtered = messages.filter(msg => {
        if (!msg || !msg.type) return false;
        if (senderFilter === 'me') {
            return msg.type === 'sent';
        }
        return msg.type === 'received';
    });

    // Filter by date range - also check input values directly as fallback
    const startDateInputEl = document.getElementById('startDate');
    const endDateInputEl = document.getElementById('endDate');
    const actualStartDate = (startDateInputEl && startDateInputEl.value) ? startDateInputEl.value : currentDateRange.start;
    const actualEndDate = (endDateInputEl && endDateInputEl.value) ? endDateInputEl.value : currentDateRange.end;
    
    if (actualStartDate || actualEndDate) {
        // Update currentDateRange to match actual input values
        if (actualStartDate !== currentDateRange.start) {
            TalkState.setCurrentDateRange({ ...currentDateRange, start: actualStartDate });
        }
        if (actualEndDate !== currentDateRange.end) {
            TalkState.setCurrentDateRange({ ...currentDateRange, end: actualEndDate });
        }
        
        filtered = filtered.filter(msg => {
            if (!msg.timestamp) return false;
            
            // Handle different timestamp formats (number, string, Date object)
            let msgDate;
            if (typeof msg.timestamp === 'number') {
                msgDate = new Date(msg.timestamp);
            } else if (typeof msg.timestamp === 'string') {
                msgDate = new Date(msg.timestamp);
            } else {
                msgDate = new Date(msg.timestamp);
            }
            
            // Check if date is valid
            if (isNaN(msgDate.getTime())) return false;
            
            // Get date-only (midnight local time) for comparison
            const msgYear = msgDate.getFullYear();
            const msgMonth = msgDate.getMonth();
            const msgDay = msgDate.getDate();
            const msgDateOnly = new Date(msgYear, msgMonth, msgDay).getTime();
            
            if (actualStartDate) {
                // Parse start date (should be in YYYY-MM-DD format from date input)
                const startDateStr = actualStartDate;
                const startParts = startDateStr.split('-');
                if (startParts.length === 3) {
                    const startYear = parseInt(startParts[0], 10);
                    const startMonth = parseInt(startParts[1], 10) - 1; // Month is 0-indexed
                    const startDay = parseInt(startParts[2], 10);
                    // Create date at midnight local time
                    const startDateOnly = new Date(startYear, startMonth, startDay).getTime();
                    if (msgDateOnly < startDateOnly) {
                        return false; // Message is before start date
                    }
                } else {
                    // Fallback for other formats
                    const startDate = new Date(startDateStr);
                    if (!isNaN(startDate.getTime())) {
                        const startYear = startDate.getFullYear();
                        const startMonth = startDate.getMonth();
                        const startDay = startDate.getDate();
                        const startDateOnly = new Date(startYear, startMonth, startDay).getTime();
                        if (msgDateOnly < startDateOnly) {
                            return false; // Message is before start date
                        }
                    }
                }
            }
            if (actualEndDate) {
                // Parse end date (should be in YYYY-MM-DD format from date input)
                const endDateStr = actualEndDate;
                const endParts = endDateStr.split('-');
                if (endParts.length === 3) {
                    const endYear = parseInt(endParts[0], 10);
                    const endMonth = parseInt(endParts[1], 10) - 1; // Month is 0-indexed
                    const endDay = parseInt(endParts[2], 10);
                    // Create date at midnight of the day AFTER end date for comparison
                    // This way, messages on the end date (at midnight) will be included
                    // but messages on the day after will be excluded
                    const endDateOnly = new Date(endYear, endMonth, endDay + 1, 0, 0, 0, 0).getTime();
                    // If message date is >= the day after end date, exclude it
                    if (msgDateOnly >= endDateOnly) {
                        return false; // Exclude messages on or after the day after end date
                    }
                } else {
                    // Fallback for other formats
                    const endDate = new Date(endDateStr);
                    if (!isNaN(endDate.getTime())) {
                        const endYear = endDate.getFullYear();
                        const endMonth = endDate.getMonth();
                        const endDay = endDate.getDate();
                        const endDateOnly = new Date(endYear, endMonth, endDay + 1, 0, 0, 0, 0).getTime();
                        if (msgDateOnly >= endDateOnly) {
                            return false; // Exclude messages on or after the day after end date
                        }
                    }
                }
            }
            return true; // Message is within date range
        });
    }

    // Filter by search text if provided
    if (query) {
        filtered = filtered.filter(msg => {
            const text = (msg.text || msg.message || msg.content || '').toLowerCase();
            return text.includes(query);
        });
    }

    // Sort newest first
    filtered.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
    });

    // Cache results
    searchCache.set(cacheKey, {
        filtered: filtered,
        query: queryRaw,
        timestamp: Date.now()
    });
    if (searchCache.size > 50) {
        const firstKey = searchCache.keys().next().value;
        searchCache.delete(firstKey);
    }

    // Use enhanced renderer with highlighting, context, pagination
    renderSearchResults(filtered, queryRaw, conv);
}

/**
 * Filter currently displayed messages based on search input and date range
 */
function filterDisplayedMessages() {
    const searchInput = document.getElementById('searchMessagesInput');
    const resultsList = document.getElementById('searchResultsList');
    if (!searchInput || !resultsList) return;

    const searchQuery = (searchInput.value || '').trim().toLowerCase();
    const messageItems = resultsList.querySelectorAll('.search-result-item');
    
    if (!messageItems.length) return;

    // Get current date range from inputs
    const startDateInputEl = document.getElementById('startDate');
    const endDateInputEl = document.getElementById('endDate');
    const currentDateRange = TalkState.getCurrentDateRange();
    const actualStartDate = (startDateInputEl && startDateInputEl.value) ? startDateInputEl.value : currentDateRange.start;
    const actualEndDate = (endDateInputEl && endDateInputEl.value) ? endDateInputEl.value : currentDateRange.end;

    let visibleCount = 0;

    messageItems.forEach(item => {
        let shouldShow = true;

        // Filter by text search query
        if (searchQuery) {
            const textDiv = item.querySelector('.search-result-text');
            const textContent = textDiv ? (textDiv.textContent || textDiv.innerText || '').toLowerCase() : '';
            if (!textContent.includes(searchQuery)) {
                shouldShow = false;
            }
        }

        // Filter by date range
        if (shouldShow && (actualStartDate || actualEndDate)) {
            const timestampAttr = item.getAttribute('data-timestamp');
            if (!timestampAttr) {
                shouldShow = false; // Hide if no timestamp
            } else {
                // Parse message timestamp
                let msgDate;
                const timestampNum = parseInt(timestampAttr, 10);
                if (!isNaN(timestampNum)) {
                    msgDate = new Date(timestampNum);
                } else {
                    msgDate = new Date(timestampAttr);
                }

                if (isNaN(msgDate.getTime())) {
                    shouldShow = false;
                } else {
                    // Get date-only (midnight local time) for comparison
                    const msgYear = msgDate.getFullYear();
                    const msgMonth = msgDate.getMonth();
                    const msgDay = msgDate.getDate();
                    const msgDateOnly = new Date(msgYear, msgMonth, msgDay).getTime();

                    // Check start date
                    if (actualStartDate) {
                        const startParts = actualStartDate.split('-');
                        if (startParts.length === 3) {
                            const startYear = parseInt(startParts[0], 10);
                            const startMonth = parseInt(startParts[1], 10) - 1;
                            const startDay = parseInt(startParts[2], 10);
                            const startDateOnly = new Date(startYear, startMonth, startDay).getTime();
                            if (msgDateOnly < startDateOnly) {
                                shouldShow = false;
                            }
                        }
                    }

                    // Check end date
                    if (shouldShow && actualEndDate) {
                        const endParts = actualEndDate.split('-');
                        if (endParts.length === 3) {
                            const endYear = parseInt(endParts[0], 10);
                            const endMonth = parseInt(endParts[1], 10) - 1;
                            const endDay = parseInt(endParts[2], 10);
                            const endDateOnly = new Date(endYear, endMonth, endDay + 1, 0, 0, 0, 0).getTime();
                            if (msgDateOnly >= endDateOnly) {
                                shouldShow = false;
                            }
                        }
                    }
                }
            }
        }

        // Show or hide the item
        if (shouldShow) {
            item.style.display = '';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    // Update stats - get original count from cache if available
    const statsTextEl = document.getElementById('searchResultsStatsText');
    if (statsTextEl) {
        if (searchQuery) {
            const totalCount = messageItems.length;
            statsTextEl.textContent = `Showing ${visibleCount} of ${totalCount} message${totalCount !== 1 ? 's' : ''} on this page`;
        } else {
            // Restore original stats if search is cleared
            const searchInputMain = document.getElementById('searchPanelInput');
            const queryRaw = (searchInputMain?.value || '').trim();
            const currentConversation = TalkState.getCurrentConversation();
            const cacheKey = `${currentConversation}_${getCurrentSearchSenderFilter()}_${queryRaw}_${currentDateRange.start}_${currentDateRange.end}`;
            const searchCache = TalkState.getSearchCache();
            const cached = searchCache.get(cacheKey);
            if (cached && cached.filtered) {
                statsTextEl.textContent = `Found ${cached.filtered.length} message${cached.filtered.length !== 1 ? 's' : ''}`;
            } else {
                const totalCount = messageItems.length;
                statsTextEl.textContent = `Found ${totalCount} message${totalCount !== 1 ? 's' : ''}`;
            }
        }
    }

    // Show/hide empty message if no results
    const emptyEl = document.getElementById('searchResultsEmpty');
    if (emptyEl) {
        if (visibleCount === 0 && (searchQuery || actualStartDate || actualEndDate)) {
            if (searchQuery && (actualStartDate || actualEndDate)) {
                emptyEl.textContent = 'No messages found';
            } else if (searchQuery) {
                emptyEl.textContent = 'No messages found';
            } else if (actualStartDate || actualEndDate) {
                emptyEl.textContent = 'No messages found';
            }
            emptyEl.style.display = '';
            if (!resultsList.contains(emptyEl)) {
                resultsList.appendChild(emptyEl);
            }
        } else {
            emptyEl.style.display = 'none';
        }
    }
}

/**
 * Clear current search results messages
 */
function clearCurrentMessages() {
    const resultsList = document.getElementById('searchResultsList');
    const statsTextEl = document.getElementById('searchResultsStatsText');
    const clearBtn = document.getElementById('clearMessagesBtn');
    const viewMoreContainer = document.getElementById('viewMoreContainer');
    const searchMessagesInput = document.getElementById('searchMessagesInput');
    
    if (!resultsList) return;
    
    // Clear search input
    if (searchMessagesInput) {
        searchMessagesInput.value = '';
    }
    
    // Reset display count
    TalkState.setCurrentMessagesDisplayed(TalkState.getMessagesPerLoad());
    
    // Force clear all content - remove all child nodes
    while (resultsList.firstChild) {
        resultsList.removeChild(resultsList.firstChild);
    }
    
    // Create and add empty message element
    const emptyEl = document.createElement('div');
    emptyEl.className = 'search-results-empty';
    emptyEl.id = 'searchResultsEmpty';
    emptyEl.textContent = 'Messages cleared. Select a conversation or change filter to load again.';
    resultsList.appendChild(emptyEl);
    
    // Clear stats and hide clear button
    if (statsTextEl) {
        statsTextEl.textContent = '';
    }
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
    if (viewMoreContainer) {
        viewMoreContainer.style.display = 'none';
    }
}

/**
 * Open search panel
 */
function openSearchPanel() {
    const searchPanel = document.getElementById('searchPanel');
    const searchPanelBtn = document.getElementById('searchPanelBtn');
    
    if (!searchPanel) {
        console.error('searchPanel element not found');
        return;
    }
    if (!searchPanelBtn) {
        console.error('searchPanelBtn element not found');
        return;
    }
    
    // First, ensure panel is hidden by removing show class and resetting transform
    searchPanel.classList.remove('show');
    searchPanel.style.removeProperty('transform');
    
    // Force a reflow to ensure the removal is processed
    searchPanel.offsetHeight;
    
    // Now add the show class
    searchPanel.classList.add('show');
    searchPanelBtn.classList.add('active');
    
    // Immediately set transform with !important to override CSS
    // Use matrix(1, 0, 0, 1, 0, 0) which is equivalent to translateX(0) but more explicit
    searchPanel.style.setProperty('transform', 'matrix(1, 0, 0, 1, 0, 0)', 'important');
    
    // Verify and fix if needed using requestAnimationFrame
    requestAnimationFrame(() => {
        const computed = window.getComputedStyle(searchPanel);
        const transformValue = computed.transform;
        
        if (transformValue && transformValue !== 'none') {
            // Parse matrix to check X translation (5th value in matrix)
            const matrixMatch = transformValue.match(/matrix\([^)]+\)/);
            if (matrixMatch) {
                const matrixValues = matrixMatch[0].match(/[\d.-]+/g);
                if (matrixValues && matrixValues.length >= 5) {
                    const translateX = parseFloat(matrixValues[4]);
                    // If translateX is not 0 (or very close to 0), force it
                    if (Math.abs(translateX) > 0.5) {
                        // Directly set the matrix to ensure zero translation
                        searchPanel.style.setProperty('transform', 'matrix(1, 0, 0, 1, 0, 0)', 'important');
                    }
                }
            }
        }
    });
    
    setTimeout(() => {
        const searchInput = document.getElementById('searchPanelInput');
        if (searchInput) {
            searchInput.focus();
        }
    }, 300);
    
    // Refresh results whenever the panel opens
    if (typeof updateSearchPanelResults === 'function') {
        updateSearchPanelResults();
    }
}

/**
 * Close search panel
 */
function closeSearchPanel() {
    const searchPanel = document.getElementById('searchPanel');
    const searchPanelBtn = document.getElementById('searchPanelBtn');
    
    if (searchPanel) {
        searchPanel.classList.remove('show');
        // Reset transform to hide the panel (with !important)
        // Use matrix to ensure it works: matrix(1, 0, 0, 1, 455, 0) for 455px translation
        const panelWidth = searchPanel.offsetWidth || 455;
        searchPanel.style.setProperty('transform', `translateX(${panelWidth}px)`, 'important');
    }
    if (searchPanelBtn) {
        searchPanelBtn.classList.remove('active');
    }
    
    if (typeof closeAllDropdowns === 'function') {
        closeAllDropdowns();
    }
}

// Make functions globally available (for inline onclick handlers and DOM event listeners)
window.openSearchPanel = openSearchPanel;
window.closeSearchPanel = closeSearchPanel;
window.updateSearchPanelResults = updateSearchPanelResults;
window.filterDisplayedMessages = filterDisplayedMessages;
window.clearCurrentMessages = clearCurrentMessages;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        updateSearchPanelResults,
        filterDisplayedMessages,
        clearCurrentMessages,
        openSearchPanel,
        closeSearchPanel
    };
}
















