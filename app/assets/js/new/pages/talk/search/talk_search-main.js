/**
 * TALK SEARCH - MAIN ENTRY POINT
 * Initializes the modular search system and provides backward compatibility
 */

// Global search controller instance
window.searchController = null;
window.searchSystemInitialized = false;

// Initialize when DOM is ready or immediately if already loaded
function initializeSearchSystem() {
    // Wait for all required classes to be available
    let initInterval = null;
    let timeoutId = null;
    
    const checkAndInit = () => {
        if (window.TalkState && 
            window.SearchController && 
            window.SearchPanel && 
            window.SearchFilters && 
            window.SearchResults && 
            window.SearchUI) {
            if (initInterval) {
                clearInterval(initInterval);
                initInterval = null;
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            initializeSearch();
            return true;
        }
        return false;
    };
    
    // Try immediately
    if (!checkAndInit()) {
        // If not ready, check periodically
        initInterval = setInterval(() => {
            if (checkAndInit()) {
                // Initialized successfully
            }
        }, 50); // Check more frequently
        
        // Timeout after 10 seconds
        timeoutId = setTimeout(() => {
            if (initInterval) {
                clearInterval(initInterval);
                initInterval = null;
            }
            if (!window.searchController) {
                console.warn('[Search] Required classes not available after 10 seconds. Available:', {
                    TalkState: !!window.TalkState,
                    SearchController: !!window.SearchController,
                    SearchPanel: !!window.SearchPanel,
                    SearchFilters: !!window.SearchFilters,
                    SearchResults: !!window.SearchResults,
                    SearchUI: !!window.SearchUI
                });
            }
        }, 10000);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSearchSystem);
} else {
    // DOM already loaded, initialize immediately
    initializeSearchSystem();
}

async function initializeSearch() {
    try {
        if (!window.TalkState) {
            console.error('[Search] TalkState not available');
            return;
        }

        if (!window.SearchController) {
            console.error('[Search] SearchController class not available');
            return;
        }

        // Initialize controller
        window.searchController = new window.SearchController();
        window.searchController.init(window.TalkState);
        
        // Initialize modules
        if (window.searchController.modules) {
            Object.values(window.searchController.modules).forEach(module => {
                if (module && typeof module.init === 'function') {
                    try {
                        module.init();
                    } catch (error) {
                        console.error('[Search] Module initialization error:', error);
                    }
                }
            });
        }
        
        // Enhance accessibility
        if (window.searchController.modules?.ui) {
            window.searchController.modules.ui.enhanceAccessibility();
        }
        
        window.searchSystemInitialized = true;
        console.log('[Search] Search system initialized');
        
        // Dispatch custom event to notify other code that search system is ready
        window.dispatchEvent(new CustomEvent('searchSystemInitialized'));
    } catch (error) {
        console.error('[Search] Failed to initialize search system:', error);
        window.searchSystemInitialized = false;
    }
}

// Global functions for inline handlers and backward compatibility
window.openSearchPanel = function() {
    if (window.searchController?.modules?.panel) {
        window.searchController.modules.panel.open();
    } else if (window.searchSystemInitialized) {
        // System initialized but panel not available - fallback
        console.warn('[Search] Search panel not available');
        const searchPanel = document.getElementById('searchPanel');
        const searchPanelBtn = document.getElementById('searchPanelBtn');
        if (searchPanel) {
            searchPanel.classList.add('show');
            if (searchPanelBtn) {
                searchPanelBtn.classList.add('active');
            }
        }
    } else {
        // System not initialized yet - wait for it
        const checkInterval = setInterval(() => {
            if (window.searchSystemInitialized) {
                clearInterval(checkInterval);
                if (window.searchController?.modules?.panel) {
                    window.searchController.modules.panel.open();
                } else {
                    // Fallback after initialization
                    const searchPanel = document.getElementById('searchPanel');
                    const searchPanelBtn = document.getElementById('searchPanelBtn');
                    if (searchPanel) {
                        searchPanel.classList.add('show');
                        if (searchPanelBtn) {
                            searchPanelBtn.classList.add('active');
                        }
                    }
                }
            }
        }, 50);
        
        // Timeout after 2 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!window.searchController?.modules?.panel) {
                console.warn('[Search] Search panel not available after waiting');
                // Fallback
                const searchPanel = document.getElementById('searchPanel');
                const searchPanelBtn = document.getElementById('searchPanelBtn');
                if (searchPanel) {
                    searchPanel.classList.add('show');
                    if (searchPanelBtn) {
                        searchPanelBtn.classList.add('active');
                    }
                }
            }
        }, 2000);
    }
};

window.closeSearchPanel = function() {
    if (window.searchController?.modules?.panel) {
        window.searchController.modules.panel.close();
    } else {
        // Fallback - close panel directly
        const searchPanel = document.getElementById('searchPanel');
        const searchPanelBtn = document.getElementById('searchPanelBtn');
        if (searchPanel) {
            searchPanel.classList.remove('show');
            if (searchPanelBtn) {
                searchPanelBtn.classList.remove('active');
            }
        }
    }
};

window.updateSearchPanelResults = async function() {
    if (window.searchController) {
        await window.searchController.search();
    } else {
        console.warn('[Search] Search controller not available');
    }
};

window.filterDisplayedMessages = function() {
    const searchInput = document.getElementById('searchMessagesInput');
    const resultsList = document.getElementById('searchResultsList');
    const statsTextEl = document.getElementById('searchResultsStatsText');
    const state = window.TalkState;
    
    if (!searchInput || !resultsList) return;

    const searchQuery = (searchInput.value || '').trim().toLowerCase();
    const messageItems = resultsList.querySelectorAll('.search-result-item');
    if (!messageItems.length) return;

    const dateRange = state?.getCurrentDateRange?.() || {};
    const startDateInputEl = document.getElementById('startDate');
    const endDateInputEl = document.getElementById('endDate');
    const actualStartDate = (startDateInputEl && startDateInputEl.value) ? startDateInputEl.value : dateRange.start;
    const actualEndDate = (endDateInputEl && endDateInputEl.value) ? endDateInputEl.value : dateRange.end;

    let visibleCount = 0;

    messageItems.forEach(item => {
        let shouldShow = true;

        if (searchQuery) {
            const textDiv = item.querySelector('.search-result-text');
            const textContent = textDiv ? (textDiv.textContent || textDiv.innerText || '').toLowerCase() : '';
            if (!textContent.includes(searchQuery)) {
                shouldShow = false;
            }
        }

        if (shouldShow && (actualStartDate || actualEndDate)) {
            const timestampAttr = item.getAttribute('data-timestamp');
            if (!timestampAttr) {
                shouldShow = false;
            } else {
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
                    const msgYear = msgDate.getFullYear();
                    const msgMonth = msgDate.getMonth();
                    const msgDay = msgDate.getDate();
                    const msgDateOnly = new Date(msgYear, msgMonth, msgDay).getTime();

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

        if (shouldShow) {
            item.style.display = '';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    const panelModule = window.searchController?.modules?.panel;
    if (panelModule?.updateStats) {
        if (searchQuery) {
            panelModule.updateStats(visibleCount, visibleCount);
        } else {
            const totalFromState = state?.getSearchResultTotal?.();
            const totalCount = typeof totalFromState === 'number' ? totalFromState : messageItems.length;
            panelModule.updateStats(totalCount, visibleCount);
        }
    } else if (statsTextEl) {
        if (searchQuery) {
            statsTextEl.textContent = `Found ${visibleCount} message${visibleCount !== 1 ? 's' : ''} · displaying 1 to ${visibleCount}`;
        } else {
            const panelInput = document.getElementById('searchPanelInput');
            const queryRaw = (panelInput?.value || '').trim();
            const currentConversation = state?.getCurrentConversation?.();
            const senderFilter = state?.getCurrentSearchSenderFilter?.();
            const cacheStart = dateRange?.start;
            const cacheEnd = dateRange?.end;
            const cacheKey = `${currentConversation}_${senderFilter}_${queryRaw}_${cacheStart}_${cacheEnd}`;
            const searchCache = state?.getSearchCache?.();
            const cached = searchCache?.get ? searchCache.get(cacheKey) : null;
            if (cached && cached.filtered) {
                statsTextEl.textContent = `Found ${cached.filtered.length} message${cached.filtered.length !== 1 ? 's' : ''}`;
            } else {
                const totalCount = messageItems.length;
                statsTextEl.textContent = `Found ${totalCount} message${totalCount !== 1 ? 's' : ''}`;
            }
        }
    }

    const emptyEl = document.getElementById('searchResultsEmpty');
    if (emptyEl) {
        if (visibleCount === 0 && (searchQuery || actualStartDate || actualEndDate)) {
            emptyEl.textContent = 'No messages found';
            emptyEl.style.display = '';
            if (!resultsList.contains(emptyEl)) {
                resultsList.appendChild(emptyEl);
            }
        } else {
            emptyEl.style.display = 'none';
        }
    }

    const viewMoreContainer = document.getElementById('viewMoreContainer');
    if (viewMoreContainer) {
        const messagesPerLoad = state?.getMessagesPerLoad?.() || 10;
        const totalFromState = state?.getSearchResultTotal?.();
        const currentDisplayed = state?.getCurrentMessagesDisplayed?.();
        if (searchQuery || actualStartDate || actualEndDate) {
            viewMoreContainer.style.display = visibleCount > messagesPerLoad ? 'block' : 'none';
        } else if (typeof totalFromState === 'number' && typeof currentDisplayed === 'number') {
            viewMoreContainer.style.display = totalFromState > currentDisplayed ? 'block' : 'none';
        }
    }
};

window.clearCurrentMessages = function() {
    if (window.searchController?.modules?.panel) {
        window.searchController.modules.panel.clearMessages();
    } else {
        console.warn('[Search] Search panel not available');
    }
};

window.closeAllDropdowns = function() {
    if (window.searchController?.modules?.filters) {
        window.searchController.modules.filters.closeAllDropdowns();
    } else {
        // Fallback to direct DOM manipulation
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
};

window.populateSenderFilterFromConversations = function() {
    // Wait for search system to initialize if not ready
    if (!window.searchSystemInitialized) {
        const checkInterval = setInterval(() => {
            if (window.searchSystemInitialized && window.searchController?.modules?.filters) {
                clearInterval(checkInterval);
                window.searchController.modules.filters.populateSenderFilter();
            }
        }, 50);
        
        // Timeout after 2 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            if (window.searchController?.modules?.filters) {
                window.searchController.modules.filters.populateSenderFilter();
            } else {
                console.warn('[Search] Search filters not available after waiting');
            }
        }, 2000);
        return;
    }
    
    if (window.searchController?.modules?.filters) {
        window.searchController.modules.filters.populateSenderFilter();
    } else {
        console.warn('[Search] Search filters not available');
    }
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.searchController) {
        try {
            window.searchController.cleanup();
        } catch (error) {
            console.error('[Search] Cleanup error:', error);
        }
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeSearch,
        SearchController: window.SearchController
    };
}

