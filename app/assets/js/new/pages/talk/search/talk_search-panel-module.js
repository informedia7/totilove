/**
 * TALK SEARCH PANEL MODULE
 * Search panel UI management
 */

class SearchPanel {
    constructor(controller) {
        this.controller = controller;
        this.state = controller?.state;
        this.elements = {};
        this.isOpen = false;
    }

    init() {
        try {
            this.cacheElements();
            this.setupEventListeners();
        } catch (error) {
            console.error('[SearchPanel] Initialization error:', error);
        }
    }

    cacheElements() {
        this.elements = {
            panel: document.getElementById('searchPanel'),
            panelBtn: document.getElementById('searchPanelBtn'),
            panelInput: document.getElementById('searchPanelInput'),
            resultsList: document.getElementById('searchResultsList'),
            resultsEmpty: document.getElementById('searchResultsEmpty'),
            resultsStats: document.getElementById('searchResultsStatsText'),
            clearBtn: document.getElementById('clearMessagesBtn'),
            viewMoreContainer: document.getElementById('viewMoreContainer'),
            viewMoreBtn: document.getElementById('viewMoreBtn'),
            searchMessagesInput: document.getElementById('searchMessagesInput')
        };
    }

    setupEventListeners() {
        const { panelInput, viewMoreBtn, clearBtn, panelBtn, searchMessagesInput } = this.elements;

        // Panel button
        if (panelBtn) {
            panelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        // Search input (main search)
        if (panelInput) {
            panelInput.addEventListener('input', () => {
                if (this.controller?.debouncer) {
                    this.controller.debouncer.debounce(() => {
                        if (this.controller) {
                            this.controller.search();
                        }
                    });
                }
            });
            
            panelInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (this.controller?.debouncer) {
                        this.controller.debouncer.cancel();
                    }
                    if (this.controller) {
                        this.controller.search();
                    }
                }
            });
        }

        // Secondary search input (filter displayed messages)
        if (searchMessagesInput) {
            let filterDebounceTimeout = null;
            searchMessagesInput.addEventListener('input', () => {
                if (filterDebounceTimeout) {
                    clearTimeout(filterDebounceTimeout);
                }
                filterDebounceTimeout = setTimeout(() => {
                    if (typeof filterDisplayedMessages === 'function') {
                        filterDisplayedMessages();
                    }
                }, 200);
            });
            
            searchMessagesInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (filterDebounceTimeout) {
                        clearTimeout(filterDebounceTimeout);
                    }
                    if (typeof filterDisplayedMessages === 'function') {
                        filterDisplayedMessages();
                    }
                }
            });
        }

        // Clear button
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.clearMessages();
            });
        }

        // View more button
        if (viewMoreBtn) {
            viewMoreBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.loadMore();
            });
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        const { panel, panelBtn } = this.elements;
        if (!panel || !panelBtn) {
            console.warn('[SearchPanel] Panel elements not found');
            return;
        }

        try {
            // Close first, then open with animation
            panel.classList.remove('show');
            panel.style.removeProperty('transform');
            
            // Force reflow
            panel.offsetHeight;
            
            // Open with animation
            panel.classList.add('show');
            panelBtn.classList.add('active');
            panel.style.setProperty('transform', 'matrix(1, 0, 0, 1, 0, 0)', 'important');
            
            this.isOpen = true;
            
            // Verify transform after animation
            requestAnimationFrame(() => {
                const computed = window.getComputedStyle(panel);
                const transformValue = computed.transform;
                
                if (transformValue && transformValue !== 'none') {
                    const matrixMatch = transformValue.match(/matrix\([^)]+\)/);
                    if (matrixMatch) {
                        const matrixValues = matrixMatch[0].match(/[\d.-]+/g);
                        if (matrixValues && matrixValues.length >= 5) {
                            const translateX = parseFloat(matrixValues[4]);
                            if (Math.abs(translateX) > 0.5) {
                                panel.style.setProperty('transform', 'matrix(1, 0, 0, 1, 0, 0)', 'important');
                            }
                        }
                    }
                }
            });
            
            // Focus and refresh
            setTimeout(() => {
                const { panelInput } = this.elements;
                if (panelInput) {
                    panelInput.focus();
                }
                if (this.controller) {
                    this.controller.search();
                }
            }, 300);
        } catch (error) {
            console.error('[SearchPanel] Error opening panel:', error);
        }
    }

    close() {
        const { panel, panelBtn } = this.elements;
        
        try {
            if (panel) {
                panel.classList.remove('show');
                const panelWidth = panel.offsetWidth || 455;
                panel.style.setProperty('transform', `translateX(${panelWidth}px)`, 'important');
            }
            if (panelBtn) {
                panelBtn.classList.remove('active');
            }
            
            this.isOpen = false;
            
            // Close dropdowns
            if (this.controller?.modules?.filters) {
                this.controller.modules.filters.closeAllDropdowns();
            }
        } catch (error) {
            console.error('[SearchPanel] Error closing panel:', error);
        }
    }

    async loadMore() {
        if (!this.state) return;
        
        try {
            const currentDisplayed = this.state.getCurrentMessagesDisplayed() || 10;
            const messagesPerLoad = this.state.getMessagesPerLoad() || 10;
            const totalMatchedCount = this.state.getSearchResultTotal();
            
            // Check if we can render more from already-filtered results
            if (totalMatchedCount !== null && currentDisplayed < totalMatchedCount) {
                this.state.setCurrentMessagesDisplayed(currentDisplayed + messagesPerLoad);
                if (this.controller) {
                    await this.controller.search();
                }
                return;
            }
            
            // Otherwise, fetch more messages from server
            const currentConv = this.state.getCurrentConversation();
            const conversations = this.state.getConversations();
            const conv = conversations[currentConv];
            
            if (!conv) return;
            
            const totalLoadedMessages = conv.searchMessages ? conv.searchMessages.length : 0;
            const loadMoreBatchSize = 30;
            
            if (typeof loadMessages === 'function' && totalLoadedMessages < 500) {
                try {
                    await loadMessages(conv, {
                        forceRefresh: false,
                        offset: totalLoadedMessages,
                        limit: loadMoreBatchSize,
                        forSearch: true
                    });
                    
                    const newTotalLoaded = conv.searchMessages ? conv.searchMessages.length : 0;
                    const loadedThisBatch = newTotalLoaded - totalLoadedMessages;
                    
                    if (loadedThisBatch > 0) {
                        if (this.controller) {
                            await this.controller.search();
                        }
                    } else {
                        const { viewMoreContainer } = this.elements;
                        if (viewMoreContainer) {
                            viewMoreContainer.style.display = 'none';
                        }
                    }
                } catch (error) {
                    console.error('[SearchPanel] Error loading more messages:', error);
                    const { viewMoreContainer } = this.elements;
                    if (viewMoreContainer) {
                        viewMoreContainer.style.display = 'none';
                    }
                }
            } else {
                const { viewMoreContainer } = this.elements;
                if (viewMoreContainer) {
                    viewMoreContainer.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('[SearchPanel] Error in loadMore:', error);
        }
    }

    clearMessages() {
        const { resultsList, panelInput, resultsStats, clearBtn, viewMoreContainer, searchMessagesInput } = this.elements;
        
        if (!resultsList) return;
        
        try {
            // Clear search text inputs
            if (panelInput) panelInput.value = '';
            if (searchMessagesInput) searchMessagesInput.value = '';
            
            // Check if date filter is active and clear it directly
            const startDateInput = document.getElementById('startDate');
            const endDateInput = document.getElementById('endDate');
            const currentDateRange = this.state?.getCurrentDateRange();
            const hasDateFilter = (startDateInput?.value) || 
                                 (endDateInput?.value) || 
                                 (currentDateRange?.start) || 
                                 (currentDateRange?.end);
            
            // Clear date filter if active (clear directly without triggering search)
            if (hasDateFilter) {
                if (startDateInput) startDateInput.value = '';
                if (endDateInput) endDateInput.value = '';
                
                if (this.controller?.modules?.filters) {
                    const filters = this.controller.modules.filters;
                    filters.dateValues.startDate = null;
                    filters.dateValues.endDate = null;
                    filters.pendingDateRange = { start: null, end: null };
                    filters.appliedDateRange = { start: null, end: null };
                    filters.updateTimeFilterButtonDisplay();
                    filters.updateDateRangeActionState?.();
                }
                
                if (this.state) {
                    this.state.setCurrentDateRange({ start: null, end: null });
                }
            }
            
            // Reset state
            if (this.state) {
                this.state.setCurrentMessagesDisplayed(10);
                this.state.setLastSearchKey('');
            }
            
            // Clear UI
            while (resultsList.firstChild) {
                resultsList.removeChild(resultsList.firstChild);
            }
            
            // Show empty message
            const emptyEl = document.createElement('div');
            emptyEl.className = 'search-results-empty';
            emptyEl.id = 'searchResultsEmpty';
            emptyEl.textContent = 'Select a conversation and start typing to search messages.';
            resultsList.appendChild(emptyEl);
            
            // Update other elements
            if (resultsStats) resultsStats.textContent = '';
            if (clearBtn) clearBtn.style.display = 'none';
            if (viewMoreContainer) viewMoreContainer.style.display = 'none';
        } catch (error) {
            console.error('[SearchPanel] Error clearing messages:', error);
        }
    }

    updateStats(total, visible) {
        const { resultsStats, searchMessagesInput, panelInput } = this.elements;
        if (!resultsStats) return;
        
        try {
            const panelInputEl = panelInput || document.getElementById('searchPanelInput');
            const searchMessagesInputEl = searchMessagesInput || document.getElementById('searchMessagesInput');
            const panelInputValue = panelInputEl?.value?.trim() || '';
            const inlineFilterValue = searchMessagesInputEl?.value?.trim() || '';

            const lastSearchKey = this.state?.getLastSearchKey?.() || '';
            const hasPrimarySearch = Boolean(panelInputValue) || Boolean(lastSearchKey.trim());
            const hasInlineFilter = Boolean(inlineFilterValue);
            const hasDateFilter = this.hasActiveDateFilter();

            if (total === 0) {
                resultsStats.textContent = 'No messages found';
                return;
            }

            const formatSummary = (count) => `Found ${count} message${count !== 1 ? 's' : ''}`;
            const formatRange = (count, endRange) => `Found ${count} message${count !== 1 ? 's' : ''} · displaying 1 to ${endRange}`;
            const safeVisible = typeof visible === 'number' && visible > 0 ? visible : 0;

            if (hasPrimarySearch || hasDateFilter) {
                if (safeVisible) {
                    resultsStats.textContent = formatRange(total, Math.min(safeVisible, total));
                } else {
                    resultsStats.textContent = formatSummary(total);
                }
                return;
            }

            if (hasInlineFilter) {
                if (safeVisible) {
                    resultsStats.textContent = formatRange(safeVisible, safeVisible);
                } else {
                    resultsStats.textContent = 'No messages found';
                }
                return;
            }

            if (safeVisible && safeVisible < total) {
                resultsStats.textContent = `Found ${total} message${total !== 1 ? 's' : ''} · displaying 1 to ${safeVisible}`;
            } else {
                resultsStats.textContent = formatSummary(total);
            }
        } catch (error) {
            console.error('[SearchPanel] Error updating stats:', error);
        }
    }

    hasActiveDateFilter() {
        if (!this.state) return false;
        
        const dateRange = this.state.getCurrentDateRange();
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        return (dateRange?.start || dateRange?.end) ||
               (startDateInput?.value) || 
               (endDateInput?.value);
    }

    showEmpty(message = 'No messages found') {
        const { resultsList, resultsEmpty } = this.elements;
        if (!resultsList) return;

        try {
            let emptyEl = resultsEmpty;
            if (!emptyEl) {
                emptyEl = document.createElement('div');
                emptyEl.className = 'search-results-empty';
                emptyEl.id = 'searchResultsEmpty';
                resultsList.appendChild(emptyEl);
            }
            
            emptyEl.textContent = message;
            emptyEl.style.display = '';
        } catch (error) {
            console.error('[SearchPanel] Error showing empty:', error);
        }
    }

    hideEmpty() {
        const { resultsEmpty } = this.elements;
        if (resultsEmpty) {
            try {
                resultsEmpty.style.display = 'none';
            } catch (error) {
                console.error('[SearchPanel] Error hiding empty:', error);
            }
        }
    }
}

// Make class globally available
window.SearchPanel = SearchPanel;

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SearchPanel;
}

