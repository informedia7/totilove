/**
 * TALK SEARCH FILTERS
 * Filter dropdown management, sender filters, and date range filtering
 * Extracted from talk.html (lines 2162-2431, 7969-8766)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - getCurrentSearchSenderFilter, updateSearchPanelResults, filterDisplayedMessages, renderSearchResults (from other search modules)
 * - closeAllDropdowns (defined in this module)
 */

/**
 * Close all filter dropdowns
 */
function closeAllDropdowns() {
    document.querySelectorAll('.filter-dropdown-content').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
    document.querySelectorAll('.filter-dropdown-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const dateSuggestionDropdown = document.getElementById('dateSuggestionDropdown');
    if (dateSuggestionDropdown) {
        dateSuggestionDropdown.classList.remove('show');
    }
}

/**
 * Close other dropdowns (excluding the one being opened)
 */
function closeOtherDropdowns(excludeDropdown = null) {
    // Close sender filter dropdown (unless it's the one being opened)
    if (excludeDropdown !== 'sender') {
        const senderFilterContent = document.getElementById('senderFilterContent');
        if (senderFilterContent) {
            senderFilterContent.classList.remove('show');
        }
        const senderFilterBtn = document.getElementById('senderFilterBtn');
        if (senderFilterBtn) {
            senderFilterBtn.classList.remove('active');
        }
    }

    // Close time filter dropdown (unless it's the one being opened)
    if (excludeDropdown !== 'time') {
        const timeFilterContent = document.getElementById('timeFilterContent');
        if (timeFilterContent) {
            timeFilterContent.classList.remove('show');
        }
        const timeFilterBtn = document.getElementById('timeFilterBtn');
        if (timeFilterBtn) {
            timeFilterBtn.classList.remove('active');
        }
    }
}

/**
 * Ensure the "You" sender item reflects the logged-in user (name + avatar)
 */
function updateSenderFilterCurrentUserUI() {
    const meItem = document.querySelector('#senderFilterList .filter-dropdown-item[data-value="me"]');
    if (!meItem || !window.currentUser) return;

    const avatarDiv = meItem.querySelector('.filter-dropdown-avatar');
    const labelSpan = meItem.querySelector('span');

    const currentUserName = window.currentUser.real_name || window.currentUser.real_name || 'You';
    const currentUserAvatar = window.currentUser.avatar || '';

    // Update label to show the logged-in real_name
    if (labelSpan) {
        labelSpan.textContent = currentUserName;
    }

    // Update avatar to show the logged-in user's avatar (or initial fallback)
    if (avatarDiv) {
        avatarDiv.innerHTML = '';

        const avatarSrc = currentUserAvatar;
        const isValidImagePath = avatarSrc &&
            (avatarSrc.startsWith('/uploads/') || avatarSrc.startsWith('uploads/')) &&
            avatarSrc.includes('.') &&
            avatarSrc.length > 15 &&
            !avatarSrc.startsWith('images/');

        if (isValidImagePath) {
            const img = document.createElement('img');
            img.src = avatarSrc.startsWith('/') ? avatarSrc : `/${avatarSrc}`;
            img.alt = currentUserName;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '50%';
            avatarDiv.appendChild(img);
        } else {
            avatarDiv.textContent = (currentUserName.charAt(0) || 'U').toUpperCase();
        }
    }

    // Ensure "me" item is marked as selected by default
    document.querySelectorAll('#senderFilterList .filter-dropdown-item').forEach(i => i.classList.remove('selected'));
    meItem.classList.add('selected');
}

/**
 * Update the sender filter button (closed state) to show avatar + name
 */
function updateSenderFilterButtonDisplay(selectedType, selectedItem = null) {
    const senderFilterBtn = document.getElementById('senderFilterBtn');
    if (!senderFilterBtn) return;

    const labelContainer = document.getElementById('senderFilterDisplay') || senderFilterBtn.querySelector('span:first-child');
    if (!labelContainer) return;

    labelContainer.innerHTML = '';
    labelContainer.style.display = 'inline-flex';
    labelContainer.style.alignItems = 'center';

    let displayName = '';
    let avatarSrc = '';

    if (selectedType === 'me') {
        displayName = (window.currentUser && (window.currentUser.real_name || window.currentUser.real_name)) || 'You';
        avatarSrc = (window.currentUser && window.currentUser.avatar) || '';
    } else {
        // partner
        displayName = selectedItem?.querySelector('span')?.textContent || '';
        avatarSrc = selectedItem?.dataset.avatar || '';
    }

    const avatarWrapper = document.createElement('div');
    avatarWrapper.className = 'filter-dropdown-avatar filter-dropdown-avatar-small';

    const isValidImagePath = avatarSrc &&
        (avatarSrc.startsWith('/uploads/') || avatarSrc.startsWith('uploads/')) &&
        avatarSrc.includes('.') &&
        avatarSrc.length > 15 &&
        !avatarSrc.startsWith('images/');

    if (isValidImagePath) {
        const img = document.createElement('img');
        img.src = avatarSrc.startsWith('/') ? avatarSrc : `/${avatarSrc}`;
        img.alt = displayName || 'User';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        avatarWrapper.appendChild(img);
    } else {
        avatarWrapper.textContent = (displayName.charAt(0) || 'U').toUpperCase();
    }

    const textSpan = document.createElement('span');
    textSpan.textContent = displayName || (selectedType === 'me' ? 'You' : 'User');
    textSpan.style.marginLeft = '6px';

    labelContainer.appendChild(avatarWrapper);
    labelContainer.appendChild(textSpan);
}

/**
 * Populate the "Sender" filter in the Search-in-chat sidebar for the current conversation
 */
function populateSenderFilterFromConversations() {
    const list = document.getElementById('senderFilterList');
    if (!list) return;

    // Always keep the "You" item in sync with the logged-in user
    updateSenderFilterCurrentUserUI();

    // Keep only static "me" option; remove any previous dynamic entries (including old "all" if present)
    list.querySelectorAll('.filter-dropdown-item').forEach(item => {
        const value = item.getAttribute('data-value');
        if (value !== 'me') {
            item.remove();
        }
    });

    const currentConversation = TalkState.getCurrentConversation();
    const conversations = TalkState.getConversations();

    // Only add the currently selected conversation partner (if any)
    if (!currentConversation || !conversations[currentConversation]) {
        return;
    }

    const conv = conversations[currentConversation];
    const partnerId = conv.partnerId || conv.id;
    if (!partnerId) return;

    const item = document.createElement('div');
    item.className = 'filter-dropdown-item';
    // Logical sender filter values: "me" (current user) or "partner"
    item.dataset.value = 'partner';
    // Keep the actual partner ID and avatar separately
    item.dataset.partnerId = String(partnerId);
    item.dataset.avatar = conv.avatar || '';

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'filter-dropdown-avatar';

    // Reuse avatar logic from conversation list: image when path is valid, otherwise first letter
    const avatar = conv.avatar;
    const name = conv.name || `User ${partnerId}`;
    const isValidImagePath = avatar &&
        (avatar.startsWith('/uploads/') || avatar.startsWith('uploads/')) &&
        avatar.includes('.') &&
        avatar.length > 15 &&
        !avatar.startsWith('images/');

    if (isValidImagePath) {
        const img = document.createElement('img');
        img.src = avatar.startsWith('/') ? avatar : `/${avatar}`;
        img.alt = name;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        avatarDiv.appendChild(img);
    } else {
        avatarDiv.textContent = (name.charAt(0) || 'U').toUpperCase();
    }

    const labelSpan = document.createElement('span');
    labelSpan.textContent = name;

    item.appendChild(avatarDiv);
    item.appendChild(labelSpan);
    list.appendChild(item);

    // Default sender selection to current user ("You") when (re)building the list
    const senderFilterBtn = document.getElementById('senderFilterBtn');
    if (senderFilterBtn) {
        TalkState.setCurrentSearchSenderFilter('me');
        senderFilterBtn.dataset.value = 'me';
        // Show current user (me) in the closed button with avatar
        updateSenderFilterButtonDisplay('me');
    }
    
    // Mark "You" (me) as selected by default in dropdown
    const meItem = list.querySelector('.filter-dropdown-item[data-value="me"]');
    if (meItem) {
        list.querySelectorAll('.filter-dropdown-item').forEach(i => i.classList.remove('selected'));
        meItem.classList.add('selected');
    }

    // Attach click behavior to new items via event delegation
    const senderFilterContent = document.getElementById('senderFilterContent');
    if (senderFilterContent && senderFilterBtn && !senderFilterContent._senderDelegationAttached) {
        senderFilterContent.addEventListener('click', function (e) {
            const item = e.target.closest('.filter-dropdown-item');
            if (!item) return;
            e.stopPropagation();

            const value = item.getAttribute('data-value');
            const previousFilter = TalkState.getCurrentSearchSenderFilter();

            // Update explicit filter state and button label + avatar
            if (value === 'me') {
                TalkState.setCurrentSearchSenderFilter('me');
                updateSenderFilterButtonDisplay('me', item);
            } else if (value === 'partner') {
                TalkState.setCurrentSearchSenderFilter('partner');
                updateSenderFilterButtonDisplay('partner', item);
            }

            // Mark selected item
            senderFilterContent.querySelectorAll('.filter-dropdown-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');

            // Close dropdown
            closeAllDropdowns();

            // Persist current sender filter value (for safety / debugging)
            senderFilterBtn.dataset.value = value;

            // If filter changed, clear previous messages and reload
            if (previousFilter !== value) {
                // Clear search messages input
                const searchMessagesInput = document.getElementById('searchMessagesInput');
                if (searchMessagesInput) {
                    searchMessagesInput.value = '';
                }
                
                // Clear the current messages display
                const resultsList = document.getElementById('searchResultsList');
                if (resultsList) {
                    // Remove all message items but keep the structure
                    const itemsToRemove = resultsList.querySelectorAll('.search-result-item');
                    itemsToRemove.forEach(item => item.remove());
                    
                    // Show loading state
                    const emptyEl = document.getElementById('searchResultsEmpty');
                    if (emptyEl) {
                        emptyEl.textContent = 'Loading messages...';
                        if (!resultsList.contains(emptyEl)) {
                            resultsList.appendChild(emptyEl);
                        }
                    } else {
                        const newEmptyEl = document.createElement('div');
                        newEmptyEl.className = 'search-results-empty';
                        newEmptyEl.id = 'searchResultsEmpty';
                        newEmptyEl.textContent = 'Loading messages...';
                        resultsList.appendChild(newEmptyEl);
                    }
                }
                // Reset display count
                TalkState.setCurrentMessagesDisplayed(TalkState.getMessagesPerLoad());
                TalkState.setLastSearchKey(''); // Force new search
                // Clear cache for this conversation to force reload
                const searchCache = TalkState.getSearchCache();
                const cacheKeysToRemove = [];
                searchCache.forEach((val, key) => {
                    if (key.startsWith(`${currentConversation}_`)) {
                        cacheKeysToRemove.push(key);
                    }
                });
                cacheKeysToRemove.forEach(key => searchCache.delete(key));
                
                // Clear stats temporarily
                const statsTextEl = document.getElementById('searchResultsStatsText');
                const clearBtn = document.getElementById('clearMessagesBtn');
                if (statsTextEl) statsTextEl.textContent = '';
                if (clearBtn) clearBtn.style.display = 'none';
            }

            // Refresh search results with new sender filter
            if (typeof updateSearchPanelResults === 'function') {
                updateSearchPanelResults();
            }
        });

        // Flag so we don't attach the handler multiple times
        senderFilterContent._senderDelegationAttached = true;
    }
}

/**
 * Update time filter button display
 */
function updateTimeFilterButtonDisplay() {
    const timeFilterBtn = document.getElementById('timeFilterBtn');
    if (!timeFilterBtn) return;
    
    const currentDateRange = TalkState.getCurrentDateRange();
    if (currentDateRange.start && currentDateRange.end) {
        const startDate = new Date(currentDateRange.start);
        const endDate = new Date(currentDateRange.end);
        const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        timeFilterBtn.querySelector('span:first-child').textContent = `📅 ${startFormatted} - ${endFormatted}`;
    } else if (currentDateRange.start) {
        const startDate = new Date(currentDateRange.start);
        const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        timeFilterBtn.querySelector('span:first-child').textContent = `📅 From ${startFormatted}`;
    } else if (currentDateRange.end) {
        const endDate = new Date(currentDateRange.end);
        const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        timeFilterBtn.querySelector('span:first-child').textContent = `📅 Until ${endFormatted}`;
    } else {
        timeFilterBtn.querySelector('span:first-child').textContent = '📅 Time';
    }
}

/**
 * Trigger search when date range is set
 */
function triggerDateRangeSearch() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const currentDateRange = TalkState.getCurrentDateRange();
    
    // Get current values from inputs directly
    if (startDateInput && startDateInput.value) {
        TalkState.setCurrentDateRange({ ...currentDateRange, start: startDateInput.value });
    }
    if (endDateInput && endDateInput.value) {
        TalkState.setCurrentDateRange({ ...currentDateRange, end: endDateInput.value });
    }
    
    // Reset display count when date range changes
    TalkState.setCurrentMessagesDisplayed(TalkState.getMessagesPerLoad());
    // Clear search messages input
    const searchMessagesInput = document.getElementById('searchMessagesInput');
    if (searchMessagesInput) {
        searchMessagesInput.value = '';
    }
    
    // Clear cache for current conversation to force fresh search
    const currentConversation = TalkState.getCurrentConversation();
    if (currentConversation) {
        const searchCache = TalkState.getSearchCache();
        const keysToDelete = [];
        for (const [key, value] of searchCache.entries()) {
            if (key.startsWith(`${currentConversation}_`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => searchCache.delete(key));
        TalkState.setLastSearchKey(''); // Reset last search key to force new search
    }
    
    // Update button display
    updateTimeFilterButtonDisplay();
    
    // Trigger search update immediately - no debounce needed for date selection
    const conversations = TalkState.getConversations();
    if (currentConversation && conversations[currentConversation]) {
        // Force immediate update
        if (typeof updateSearchPanelResults === 'function') {
            updateSearchPanelResults();
        }
        // Also filter currently displayed messages if any are shown
        setTimeout(() => {
            if (typeof filterDisplayedMessages === 'function') {
                filterDisplayedMessages();
            }
        }, 100);
    } else {
        // If no conversation, try again after a short delay
        setTimeout(() => {
            if (currentConversation && conversations[currentConversation]) {
                if (typeof updateSearchPanelResults === 'function') {
                    updateSearchPanelResults();
                }
                if (typeof filterDisplayedMessages === 'function') {
                    filterDisplayedMessages();
                }
            }
        }, 100);
    }
}

/**
 * Setup filter dropdowns and event listeners
 */
function setupFilterDropdowns() {
    const senderFilterBtn = document.getElementById('senderFilterBtn');
    const senderFilterContent = document.getElementById('senderFilterContent');
    const timeFilterBtn = document.getElementById('timeFilterBtn');
    const timeFilterContent = document.getElementById('timeFilterContent');
    const senderSearchInput = document.getElementById('senderSearchInput');
    const searchPanelInput = document.getElementById('searchPanelInput');

    senderFilterBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = senderFilterContent.classList.contains('show');
        closeOtherDropdowns('sender');
        if (!isOpen) {
            senderFilterContent.classList.add('show');
            senderFilterBtn.classList.add('active');
            if (senderSearchInput) senderSearchInput.focus();
        } else {
            // Close if already open
            senderFilterContent.classList.remove('show');
            senderFilterBtn.classList.remove('active');
        }
    });

    // Update results when typing in the "Search in chat" input (debounced for instant results)
    if (searchPanelInput) {
        searchPanelInput.setAttribute('aria-label', 'Search messages');
        searchPanelInput.setAttribute('role', 'searchbox');
        searchPanelInput.addEventListener('input', function () {
            TalkState.clearSearchDebounceTimeout();
            const timeout = setTimeout(() => {
                if (typeof updateSearchPanelResults === 'function') {
                    updateSearchPanelResults();
                }
            }, CONFIG.TIMEOUTS.SEARCH_DEBOUNCE);
            TalkState.setSearchDebounceTimeout(timeout);
        });
        // Also trigger on Enter key
        searchPanelInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                TalkState.clearSearchDebounceTimeout();
                if (typeof updateSearchPanelResults === 'function') {
                    updateSearchPanelResults();
                }
            }
        });
    }

    timeFilterBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = timeFilterContent.classList.contains('show');
        closeOtherDropdowns('time');
        if (!isOpen) {
            timeFilterContent.classList.add('show');
            timeFilterBtn.classList.add('active');
            
            // Ensure date inputs are initialized when dropdown opens (fallback)
            setTimeout(() => {
                const startDateInputFallback = document.getElementById('startDate');
                const endDateInputFallback = document.getElementById('endDate');
                if (startDateInputFallback && !startDateInputFallback.hasAttribute('data-listener-attached')) {
                    startDateInputFallback.setAttribute('data-listener-attached', 'true');
                    startDateInputFallback.max = new Date().toISOString().split('T')[0];
                    const handleStartDateChange = function () {
                        const newStart = this.value || null;
                        const currentDateRange = TalkState.getCurrentDateRange();
                        if (currentDateRange.start !== newStart) {
                            TalkState.setCurrentDateRange({ ...currentDateRange, start: newStart });
                            triggerDateRangeSearch();
                        }
                    };
                    startDateInputFallback.addEventListener('change', handleStartDateChange);
                    startDateInputFallback.addEventListener('input', handleStartDateChange);
                }
                if (endDateInputFallback && !endDateInputFallback.hasAttribute('data-listener-attached')) {
                    endDateInputFallback.setAttribute('data-listener-attached', 'true');
                    endDateInputFallback.max = new Date().toISOString().split('T')[0];
                    const handleEndDateChange = function () {
                        const newEnd = this.value || null;
                        const currentDateRange = TalkState.getCurrentDateRange();
                        if (currentDateRange.end !== newEnd) {
                            TalkState.setCurrentDateRange({ ...currentDateRange, end: newEnd });
                            triggerDateRangeSearch();
                        }
                    };
                    endDateInputFallback.addEventListener('change', handleEndDateChange);
                    endDateInputFallback.addEventListener('input', handleEndDateChange);
                }
            }, 100);
        } else {
            // Close if already open
            timeFilterContent.classList.remove('show');
            timeFilterBtn.classList.remove('active');
        }
    });

    if (senderSearchInput) {
        senderSearchInput.addEventListener('input', function () {
            const searchTerm = this.value.toLowerCase();
            const items = document.querySelectorAll('#senderFilterList .filter-dropdown-item');
            items.forEach(item => {
                const text = item.querySelector('span').textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    document.querySelectorAll('.filter-dropdown-item').forEach(item => {
        item.addEventListener('click', function (e) {
            const dropdown = this.closest('.filter-dropdown-content');

            // Let the dedicated sender filter handler manage "You"/partner clicks
            if (dropdown && dropdown.id === 'senderFilterContent') {
                return;
            }

            e.stopPropagation();
            const value = this.dataset.value;
            const text = this.querySelector('span').textContent;
            const btn = dropdown.previousElementSibling;

            // Don't process clicks on date inputs
            if (this.closest('.date-input-container')) {
                return;
            }

            // Handle date suggestion trigger
            if (value === 'date-suggestion') {
                const dateSuggestionDropdown = document.getElementById('dateSuggestionDropdown');
                if (dateSuggestionDropdown) {
                    // Toggle the date suggestion dropdown
                    const isVisible = dateSuggestionDropdown.classList.contains('show');
                    if (isVisible) {
                        // Close the dropdown if it's open
                        dateSuggestionDropdown.classList.remove('show');
                    } else {
                        // Open the dropdown if it's closed
                        dateSuggestionDropdown.classList.add('show');
                    }
                }
                return; // Don't close dropdowns for date suggestion
            }

            // Update button text
            if (dropdown.id === 'senderFilterContent') {
                btn.querySelector('span:first-child').textContent = `👤 ${text}`;
            } else if (dropdown.id === 'timeFilterContent') {
                btn.querySelector('span:first-child').textContent = `📅 ${text}`;

                // Handle date suggestion selections
                if (value === 'last7days' || value === 'last30days' || value === 'last3months') {
                    const today = new Date();
                    let startDate = new Date();

                    switch (value) {
                        case 'last7days':
                            startDate.setDate(today.getDate() - 7);
                            break;
                        case 'last30days':
                            startDate.setDate(today.getDate() - 30);
                            break;
                        case 'last3months':
                            startDate.setMonth(today.getMonth() - 3);
                            break;
                    }

                    // Update date inputs
                    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
                    document.getElementById('endDate').value = today.toISOString().split('T')[0];

                    // Close the side dropdown
                    const dateSuggestionDropdown = document.getElementById('dateSuggestionDropdown');
                    if (dateSuggestionDropdown) {
                        dateSuggestionDropdown.classList.remove('show');
                    }
                }
            }

            // Update selected state
            dropdown.querySelectorAll('.filter-dropdown-item').forEach(i => i.classList.remove('selected'));
            this.classList.add('selected');

            // Close dropdown for regular items, but not for date suggestions or date inputs
            if (!this.classList.contains('date-suggestion') && !this.closest('.date-input-container')) {
                closeAllDropdowns();
            }
        });
    });


    // Handle date suggestion items
    document.querySelectorAll('.date-suggestion-item').forEach(item => {
        item.addEventListener('click', function (e) {
            e.stopPropagation();
            const value = this.getAttribute('data-value');
            const text = this.querySelector('span').textContent;
            const timeFilterBtn = document.getElementById('timeFilterBtn');

            // Update button text
            timeFilterBtn.querySelector('span:first-child').textContent = `📅 ${text}`;

            // Handle date calculations
            const today = new Date();
            let startDate = new Date();
            let endDate = today;

            switch (value) {
                case 'last7days':
                    startDate.setDate(today.getDate() - 7);
                    break;
                case 'last30days':
                    startDate.setDate(today.getDate() - 30);
                    break;
                case 'last3months':
                    startDate.setMonth(today.getMonth() - 3);
                    break;
            }

            // Update date inputs
            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = today.toISOString().split('T')[0];
            document.getElementById('startDate').value = startDateStr;
            document.getElementById('endDate').value = endDateStr;

            // Update currentDateRange and trigger search automatically
            const currentDateRange = TalkState.getCurrentDateRange();
            if (currentDateRange.start !== startDateStr || currentDateRange.end !== endDateStr) {
                TalkState.setCurrentDateRange({ start: startDateStr, end: endDateStr });
                // Trigger search with new date range
                triggerDateRangeSearch();
            }

            // Close the side dropdown
            const dateSuggestionDropdown = document.getElementById('dateSuggestionDropdown');
            if (dateSuggestionDropdown) {
                dateSuggestionDropdown.classList.remove('show');
            }
        });
    });

    // Close dropdowns when clicking outside - using mousedown to prevent conflicts
    document.addEventListener('mousedown', function (e) {
        // Check if click is inside any dropdown or dropdown button
        const isInsideDropdown = e.target.closest('.filter-dropdown');
        const isDropdownButton = e.target.closest('.filter-dropdown-btn');
        const isDropdownContent = e.target.closest('.filter-dropdown-content');
        const isDateSuggestionDropdown = e.target.closest('.date-suggestion-dropdown');

        if (!isInsideDropdown && !isDropdownButton && !isDropdownContent && !isDateSuggestionDropdown) {
            // Use setTimeout to allow other click handlers to process first
            setTimeout(() => {
                closeOtherDropdowns();
            }, 10);
        }
    });
}

/**
 * Initialize date range filter event listeners
 * This function sets up all the date input handlers and should be called on DOMContentLoaded
 */
function setupDateRangeFilters() {
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    if (startDateInput) {
        startDateInput.max = today;
        startDateInput.setAttribute('aria-label', 'Start date for search filter');
        startDateInput.setAttribute('data-listener-attached', 'true');
        
        // Track previous value to detect changes
        let previousStartValue = startDateInput.value || null;
        
        // Handle date change - trigger search immediately
        const handleStartDateChange = function () {
            const newStart = this.value || null;
            if (previousStartValue !== newStart) {
                previousStartValue = newStart;
                const currentDateRange = TalkState.getCurrentDateRange();
                TalkState.setCurrentDateRange({ ...currentDateRange, start: newStart });
                // Auto-trigger search immediately when date is selected
                triggerDateRangeSearch();
            }
        };
        
        startDateInput.addEventListener('change', handleStartDateChange);
        startDateInput.addEventListener('input', handleStartDateChange);
        
        // Also trigger filterDisplayedMessages when date changes
        startDateInput.addEventListener('change', function() {
            if (typeof filterDisplayedMessages === 'function') {
                filterDisplayedMessages();
            }
        });
        startDateInput.addEventListener('input', function() {
            if (typeof filterDisplayedMessages === 'function') {
                filterDisplayedMessages();
            }
        });
        
        // Also use property descriptor to intercept value changes
        const startDateInputDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') || 
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(startDateInput), 'value');
        if (startDateInputDescriptor && startDateInputDescriptor.set) {
            const originalSet = startDateInputDescriptor.set;
            Object.defineProperty(startDateInput, 'value', {
                set: function(newValue) {
                    originalSet.call(this, newValue);
                    if (previousStartValue !== newValue) {
                        previousStartValue = newValue || null;
                        const currentDateRange = TalkState.getCurrentDateRange();
                        TalkState.setCurrentDateRange({ ...currentDateRange, start: newValue || null });
                        triggerDateRangeSearch();
                    }
                },
                get: startDateInputDescriptor.get
            });
        }
        
        // Poll for changes (fallback for calendar picker that doesn't fire events properly)
        // More frequent polling to catch changes faster
        let startDatePollInterval = setInterval(() => {
            const currentValue = startDateInput.value || null;
            if (previousStartValue !== currentValue) {
                previousStartValue = currentValue;
                const currentDateRange = TalkState.getCurrentDateRange();
                TalkState.setCurrentDateRange({ ...currentDateRange, start: currentValue });
                triggerDateRangeSearch();
            }
        }, 200);
        
        // Also trigger on blur to catch manual date entry and calendar picker selection
        startDateInput.addEventListener('blur', function () {
            const currentValue = this.value || null;
            if (previousStartValue !== currentValue) {
                previousStartValue = currentValue;
                const currentDateRange = TalkState.getCurrentDateRange();
                TalkState.setCurrentDateRange({ ...currentDateRange, start: currentValue });
                triggerDateRangeSearch();
            }
        });
        
        // Listen for window focus (calendar picker closes when window regains focus)
        let startDateFocusCheck = false;
        window.addEventListener('focus', function() {
            if (startDateFocusCheck) {
                startDateFocusCheck = false;
                setTimeout(() => {
                    const currentValue = startDateInput.value || null;
                    if (previousStartValue !== currentValue) {
                        previousStartValue = currentValue;
                        const currentDateRange = TalkState.getCurrentDateRange();
                        TalkState.setCurrentDateRange({ ...currentDateRange, start: currentValue });
                        triggerDateRangeSearch();
                    }
                }, 100);
            }
        });
        
        // Mark that we should check on next focus
        startDateInput.addEventListener('focus', function() {
            startDateFocusCheck = true;
        });

        // Ensure clicking the input opens the calendar picker
        startDateInput.addEventListener('click', function (e) {
            // If showPicker is available (modern browsers), use it
            if (this.showPicker && typeof this.showPicker === 'function') {
                try {
                    this.showPicker();
                    // Aggressively check for changes after picker might close
                    const checkInterval = setInterval(() => {
                        const newStart = this.value || null;
                        if (previousStartValue !== newStart) {
                            clearInterval(checkInterval);
                            previousStartValue = newStart;
                            const currentDateRange = TalkState.getCurrentDateRange();
                            TalkState.setCurrentDateRange({ ...currentDateRange, start: newStart });
                            triggerDateRangeSearch();
                        }
                    }, 100);
                    // Stop checking after 5 seconds
                    setTimeout(() => clearInterval(checkInterval), 5000);
                } catch (err) {
                    // Fallback to focus if showPicker fails
                    this.focus();
                }
            }
        });

        // Make calendar icon clickable to open date picker
        const startDateIcon = startDateInput.parentElement.querySelector('.date-icon');
        if (startDateIcon) {
            startDateIcon.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (startDateInput.showPicker && typeof startDateInput.showPicker === 'function') {
                    try {
                        startDateInput.showPicker();
                        // Aggressively check for changes after picker might close
                        const checkInterval = setInterval(() => {
                            const newStart = startDateInput.value || null;
                            if (previousStartValue !== newStart) {
                                clearInterval(checkInterval);
                                previousStartValue = newStart;
                                const currentDateRange = TalkState.getCurrentDateRange();
                                TalkState.setCurrentDateRange({ ...currentDateRange, start: newStart });
                                triggerDateRangeSearch();
                            }
                        }, 100);
                        // Stop checking after 5 seconds
                        setTimeout(() => clearInterval(checkInterval), 5000);
                    } catch (err) {
                        startDateInput.focus();
                    }
                } else {
                    startDateInput.focus();
                }
            });
        }
    }
    
    if (endDateInput) {
        endDateInput.max = today;
        endDateInput.setAttribute('aria-label', 'End date for search filter');
        endDateInput.setAttribute('data-listener-attached', 'true');
        
        // Track previous value to detect changes
        let previousEndValue = endDateInput.value || null;
        
        // Handle date change - trigger search immediately
        const handleEndDateChange = function () {
            const newEnd = this.value || null;
            if (previousEndValue !== newEnd) {
                previousEndValue = newEnd;
                const currentDateRange = TalkState.getCurrentDateRange();
                TalkState.setCurrentDateRange({ ...currentDateRange, end: newEnd });
                // Auto-trigger search immediately when date is selected
                triggerDateRangeSearch();
            }
        };
        
        endDateInput.addEventListener('change', handleEndDateChange);
        endDateInput.addEventListener('input', handleEndDateChange);
        
        // Also trigger filterDisplayedMessages when date changes
        endDateInput.addEventListener('change', function() {
            if (typeof filterDisplayedMessages === 'function') {
                filterDisplayedMessages();
            }
        });
        endDateInput.addEventListener('input', function() {
            if (typeof filterDisplayedMessages === 'function') {
                filterDisplayedMessages();
            }
        });
        
        // Also use property descriptor to intercept value changes
        const endDateInputDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') || 
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(endDateInput), 'value');
        if (endDateInputDescriptor && endDateInputDescriptor.set) {
            const originalSet = endDateInputDescriptor.set;
            Object.defineProperty(endDateInput, 'value', {
                set: function(newValue) {
                    originalSet.call(this, newValue);
                    if (previousEndValue !== newValue) {
                        previousEndValue = newValue || null;
                        const currentDateRange = TalkState.getCurrentDateRange();
                        TalkState.setCurrentDateRange({ ...currentDateRange, end: newValue || null });
                        triggerDateRangeSearch();
                    }
                },
                get: endDateInputDescriptor.get
            });
        }
        
        // Poll for changes (fallback for calendar picker that doesn't fire events properly)
        // More frequent polling to catch changes faster
        let endDatePollInterval = setInterval(() => {
            const currentValue = endDateInput.value || null;
            if (previousEndValue !== currentValue) {
                previousEndValue = currentValue;
                const currentDateRange = TalkState.getCurrentDateRange();
                TalkState.setCurrentDateRange({ ...currentDateRange, end: currentValue });
                triggerDateRangeSearch();
            }
        }, 200);
        
        // Also trigger on blur to catch manual date entry and calendar picker selection
        endDateInput.addEventListener('blur', function () {
            const currentValue = this.value || null;
            if (previousEndValue !== currentValue) {
                previousEndValue = currentValue;
                const currentDateRange = TalkState.getCurrentDateRange();
                TalkState.setCurrentDateRange({ ...currentDateRange, end: currentValue });
                triggerDateRangeSearch();
            }
        });
        
        // Listen for window focus (calendar picker closes when window regains focus)
        let endDateFocusCheck = false;
        window.addEventListener('focus', function() {
            if (endDateFocusCheck) {
                endDateFocusCheck = false;
                setTimeout(() => {
                    const currentValue = endDateInput.value || null;
                    if (previousEndValue !== currentValue) {
                        previousEndValue = currentValue;
                        const currentDateRange = TalkState.getCurrentDateRange();
                        TalkState.setCurrentDateRange({ ...currentDateRange, end: currentValue });
                        triggerDateRangeSearch();
                    }
                }, 100);
            }
        });
        
        // Mark that we should check on next focus
        endDateInput.addEventListener('focus', function() {
            endDateFocusCheck = true;
        });

        // Ensure clicking the input opens the calendar picker
        endDateInput.addEventListener('click', function (e) {
            // If showPicker is available (modern browsers), use it
            if (this.showPicker && typeof this.showPicker === 'function') {
                try {
                    this.showPicker();
                    // Aggressively check for changes after picker might close
                    const checkInterval = setInterval(() => {
                        const newEnd = this.value || null;
                        if (previousEndValue !== newEnd) {
                            clearInterval(checkInterval);
                            previousEndValue = newEnd;
                            const currentDateRange = TalkState.getCurrentDateRange();
                            TalkState.setCurrentDateRange({ ...currentDateRange, end: newEnd });
                            triggerDateRangeSearch();
                        }
                    }, 100);
                    // Stop checking after 5 seconds
                    setTimeout(() => clearInterval(checkInterval), 5000);
                } catch (err) {
                    // Fallback to focus if showPicker fails
                    this.focus();
                }
            }
        });

        // Make calendar icon clickable to open date picker
        const endDateIcon = endDateInput.parentElement.querySelector('.date-icon');
        if (endDateIcon) {
            endDateIcon.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (endDateInput.showPicker && typeof endDateInput.showPicker === 'function') {
                    try {
                        endDateInput.showPicker();
                        // Aggressively check for changes after picker might close
                        const checkInterval = setInterval(() => {
                            const newEnd = endDateInput.value || null;
                            if (previousEndValue !== newEnd) {
                                clearInterval(checkInterval);
                                previousEndValue = newEnd;
                                const currentDateRange = TalkState.getCurrentDateRange();
                                TalkState.setCurrentDateRange({ ...currentDateRange, end: newEnd });
                                triggerDateRangeSearch();
                            }
                        }, 100);
                        // Stop checking after 5 seconds
                        setTimeout(() => clearInterval(checkInterval), 5000);
                    } catch (err) {
                        endDateInput.focus();
                    }
                } else {
                    endDateInput.focus();
                }
            });
        }
    }

    // Setup clear date range button
    const clearDateRangeBtn = document.getElementById('clearDateRangeBtn');
    if (clearDateRangeBtn) {
        clearDateRangeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            // Clear date inputs
            if (startDateInput) startDateInput.value = '';
            if (endDateInput) endDateInput.value = '';
            // Clear date range
            TalkState.setCurrentDateRange({ start: null, end: null });
            // Trigger search update to show all messages
            triggerDateRangeSearch();
        });
    }

    // Setup "View more" button
    const viewMoreBtn = document.getElementById('viewMoreBtn');
    if (viewMoreBtn) {
        viewMoreBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            
            const currentConversation = TalkState.getCurrentConversation();
            const conversations = TalkState.getConversations();
            const conv = conversations[currentConversation];
            if (!conv) return;
            
            // Get cached filtered results
            const searchInput = document.getElementById('searchPanelInput');
            const queryRaw = (searchInput?.value || '').trim();
            const currentDateRange = TalkState.getCurrentDateRange();
            const cacheKey = `${currentConversation}_${getCurrentSearchSenderFilter()}_${queryRaw}_${currentDateRange.start || 'null'}_${currentDateRange.end || 'null'}`;
            const searchCache = TalkState.getSearchCache();
            const cached = searchCache.get(cacheKey);
            
            if (!cached || !cached.filtered || cached.filtered.length === 0) {
                // No cache, need to reload
                if (typeof updateSearchPanelResults === 'function') {
                    updateSearchPanelResults();
                }
                return;
            }
            
            // Check how many messages are currently displayed
            const resultsList = document.getElementById('searchResultsList');
            const currentDisplayed = resultsList ? resultsList.querySelectorAll('.search-result-item').length : 0;
            
            // Only load more if there are more messages to show
            if (currentDisplayed < cached.filtered.length) {
                // Increment display count
                const currentDisplayed = TalkState.getCurrentMessagesDisplayed();
                TalkState.setCurrentMessagesDisplayed(currentDisplayed + TalkState.getMessagesPerLoad());
                
                // Clear search messages input when loading more
                const searchMessagesInput = document.getElementById('searchMessagesInput');
                if (searchMessagesInput) {
                    searchMessagesInput.value = '';
                }
                
                // Render additional messages
                if (typeof renderSearchResults === 'function') {
                    renderSearchResults(cached.filtered, queryRaw, conv);
                }
            } else {
                // Hide button if all messages are shown
                const viewMoreContainer = document.getElementById('viewMoreContainer');
                if (viewMoreContainer) {
                    viewMoreContainer.style.display = 'none';
                }
            }
        });
    }
}

// Make functions globally available (for inline onclick handlers and DOM event listeners)
window.closeAllDropdowns = closeAllDropdowns;
window.closeOtherDropdowns = closeOtherDropdowns;
window.updateSenderFilterCurrentUserUI = updateSenderFilterCurrentUserUI;
window.updateSenderFilterButtonDisplay = updateSenderFilterButtonDisplay;
window.populateSenderFilterFromConversations = populateSenderFilterFromConversations;
window.updateTimeFilterButtonDisplay = updateTimeFilterButtonDisplay;
window.triggerDateRangeSearch = triggerDateRangeSearch;
window.setupFilterDropdowns = setupFilterDropdowns;
window.setupDateRangeFilters = setupDateRangeFilters;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        closeAllDropdowns,
        closeOtherDropdowns,
        updateSenderFilterCurrentUserUI,
        updateSenderFilterButtonDisplay,
        populateSenderFilterFromConversations,
        updateTimeFilterButtonDisplay,
        triggerDateRangeSearch,
        setupFilterDropdowns,
        setupDateRangeFilters
    };
}
















