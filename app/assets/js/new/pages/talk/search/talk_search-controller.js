/**
 * TALK SEARCH CONTROLLER
 * Main controller coordinating all search functionality
 */

class SearchController {
    constructor() {
        this.state = null;
        this.modules = {};
        this.isInitialized = false;
        this.currentSearch = null;
        this.searchCache = new SearchCache(50);
        this.debouncer = new SearchDebouncer(300);
        this.isSearching = false;
    }

    init(state) {
        if (this.isInitialized) return;
        
        if (!state) {
            console.error('[SearchController] TalkState not provided');
            return;
        }
        
        this.state = state;
        this.setupModules();
        this.setupEventDelegation();
        this.isInitialized = true;
    }

    setupModules() {
        try {
            this.modules = {
                panel: new SearchPanel(this),
                filters: new SearchFilters(this),
                results: new SearchResults(this),
                ui: new SearchUI(this)
            };
        } catch (error) {
            console.error('[SearchController] Failed to setup modules:', error);
        }
    }

    setupEventDelegation() {
        // Global event delegation for dropdowns
        document.addEventListener('click', this.handleGlobalClick.bind(this));
        document.addEventListener('keydown', this.handleGlobalKeydown.bind(this));
    }

    handleGlobalClick(e) {
        if (!this.modules.filters) return;
        
        // Delegate to appropriate module
        if (e.target.closest('.filter-dropdown-btn')) {
            const btn = e.target.closest('.filter-dropdown-btn');
            const type = btn.id.includes('sender') ? 'sender' : 'time';
            this.modules.filters.toggleDropdown(type);
        } else if (!e.target.closest('.filter-dropdown') && 
                   !e.target.closest('.date-suggestion-dropdown')) {
            this.modules.filters.closeAllDropdowns();
        }
    }

    handleGlobalKeydown(e) {
        if (e.key === 'Escape' && this.modules.filters) {
            this.modules.filters.closeAllDropdowns();
        }
    }

    async search(options = {}) {
        if (this.isSearching) {
            console.log('[SearchController] Search already in progress, skipping...');
            return;
        }

        this.isSearching = true;
        
        try {
            // Cancel previous search if any
            if (this.currentSearch?.cancel) {
                this.currentSearch.cancel();
            }

            // Generate search key
            const searchKey = this.generateSearchKey(options);
            
            // Check cache (if not forcing refresh)
            if (!options.forceRefresh) {
                const cached = this.searchCache.get(searchKey);
                if (cached && Date.now() - cached.timestamp < 30010) { // 30 second cache
                    if (this.modules.results) {
                        this.modules.results.display(cached);
                    }
                    this.isSearching = false;
                    return cached;
                }
            }

            // Show loading state
            if (this.modules.ui) {
                this.modules.ui.showLoading();
            }
            
            // Perform search
            const results = await this.performSearch(options);
            
            // Cache results
            this.searchCache.set(searchKey, {
                ...results,
                timestamp: Date.now()
            });
            
            // Display results
            if (this.modules.results) {
                this.modules.results.display(results);
            }
            
            return results;
        } catch (error) {
            console.error('[SearchController] Search error:', error);
            if (this.modules.ui) {
                this.modules.ui.showError(error);
            }
            throw error;
        } finally {
            this.isSearching = false;
        }
    }

    generateSearchKey(options) {
        if (!this.state) return '';
        
        const convId = this.state.getCurrentConversation() || '';
        const senderFilter = options.senderFilter || this.state.getCurrentSearchSenderFilter() || 'me';
        const dateRange = options.dateRange || this.state.getCurrentDateRange() || { start: null, end: null };
        const query = options.query || '';
        const displayLimit = options.displayLimit || this.state.getCurrentMessagesDisplayed() || 10;
        
        // Include display limit in cache key to ensure "Load More" gets fresh results
        return `${convId}_${senderFilter}_${query}_${dateRange.start || 'null'}_${dateRange.end || 'null'}_${displayLimit}`;
    }

    async performSearch(options = {}) {
        if (!this.modules.results) {
            throw new Error('SearchResults module not initialized');
        }
        
        return await this.modules.results.performSearch(options);
    }

    cleanup() {
        try {
            // Cleanup modules
            if (this.modules.filters && typeof this.modules.filters.cleanup === 'function') {
                this.modules.filters.cleanup();
            }
            
            // Cancel debouncer
            if (this.debouncer) {
                this.debouncer.cancel();
            }
            
            // Clear cache
            if (this.searchCache) {
                this.searchCache.clear();
            }
            
            // Reset state
            this.isInitialized = false;
            this.isSearching = false;
            this.currentSearch = null;
        } catch (error) {
            console.error('[SearchController] Cleanup error:', error);
        }
    }
}

class SearchDebouncer {
    constructor(delay = 300) {
        this.delay = delay;
        this.timeout = null;
    }

    debounce(callback) {
        if (typeof callback !== 'function') {
            console.warn('[SearchDebouncer] Callback is not a function');
            return;
        }
        
        this.cancel();
        this.timeout = setTimeout(() => {
            try {
                callback();
            } catch (error) {
                console.error('[SearchDebouncer] Callback error:', error);
            }
            this.timeout = null;
        }, this.delay);
    }

    cancel() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }
}

class SearchCache {
    constructor(maxSize = 50) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!key) return null;
        
        const item = this.cache.get(key);
        if (item && Date.now() - item.timestamp < 30010) { // 30 second TTL
            // Update LRU
            this.cache.delete(key);
            this.cache.set(key, item);
            return item;
        }
        
        if (item) {
            // Expired, remove it
            this.cache.delete(key);
        }
        
        return null;
    }

    set(key, value) {
        if (!key) return;
        
        if (this.cache.size >= this.maxSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, {
            ...value,
            timestamp: Date.now()
        });
    }

    clear() {
        this.cache.clear();
    }

    delete(key) {
        if (key) {
            this.cache.delete(key);
        }
    }
}

// Make classes globally available
window.SearchController = SearchController;
window.SearchDebouncer = SearchDebouncer;
window.SearchCache = SearchCache;

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SearchController, SearchDebouncer, SearchCache };
}

