/**
 * TALK STATE MANAGEMENT
 * Global state variables and cache management for talk functionality
 * Extracted from talk.html (lines 1389-1420)
 * 
 * Dependencies: CONFIG (talk_config.js)
 */

// Real conversation data - will be loaded from API
let conversations = {};
let currentUserId = null;
let currentConversation = null;
let filteredConversations = [];

// Performance optimization variables
let messageCache = new Map();
let conversationCache = new Map();
let conversationDOMCache = new Map();
let loadingStates = new Set();
let lastLoadTime = null;
const CACHE_DURATION = CONFIG.LIMITS.CACHE_DURATION;
const LAZY_LOAD_THRESHOLD = CONFIG.LIMITS.LAZY_LOAD_THRESHOLD;

// Debouncing for search and typing
let searchDebounceTimer = null;
let typingDebounceTimer = null;

// Explicit state for Search-in-chat sender filter:
// "me"  = logged-in user (messages you sent)
// "partner" = current conversation partner (messages you received)
let currentSearchSenderFilter = 'me';

// Enhanced search state
let searchCache = new Map();
let currentMessagesDisplayed = 20; // Number of messages currently displayed
const MESSAGES_PER_LOAD = 20; // Messages to load per "View more" click
let currentDateRange = { start: null, end: null };
let searchDebounceTimeout = null;
let lastSearchKey = ''; // Track last search to reset display count on new search

// State getters and setters (for better encapsulation)
const TalkState = {
    // Conversation state
    getConversations: () => conversations,
    setConversations: (data) => { conversations = data; },
    
    getCurrentUserId: () => currentUserId,
    setCurrentUserId: (id) => { currentUserId = id; },
    
    getCurrentConversation: () => currentConversation,
    setCurrentConversation: (conv) => { currentConversation = conv; },
    
    getFilteredConversations: () => filteredConversations,
    setFilteredConversations: (filtered) => { filteredConversations = filtered; },
    
    // Cache management
    getMessageCache: () => messageCache,
    getConversationCache: () => conversationCache,
    getConversationDOMCache: () => conversationDOMCache,
    
    clearMessageCache: () => { messageCache.clear(); },
    clearConversationCache: () => { conversationCache.clear(); },
    clearConversationDOMCache: () => { conversationDOMCache.clear(); },
    
    // Loading states
    getLoadingStates: () => loadingStates,
    addLoadingState: (key) => { loadingStates.add(key); },
    removeLoadingState: (key) => { loadingStates.delete(key); },
    hasLoadingState: (key) => { return loadingStates.has(key); },
    
    getLastLoadTime: () => lastLoadTime,
    setLastLoadTime: (time) => { lastLoadTime = time; },
    
    // Search state
    getCurrentSearchSenderFilter: () => currentSearchSenderFilter,
    setCurrentSearchSenderFilter: (filter) => { currentSearchSenderFilter = filter; },
    
    getSearchCache: () => searchCache,
    clearSearchCache: () => { searchCache.clear(); },
    
    getCurrentMessagesDisplayed: () => currentMessagesDisplayed,
    setCurrentMessagesDisplayed: (count) => { currentMessagesDisplayed = count; },
    
    getMessagesPerLoad: () => MESSAGES_PER_LOAD,
    
    getCurrentDateRange: () => currentDateRange,
    setCurrentDateRange: (range) => { currentDateRange = range; },
    
    getLastSearchKey: () => lastSearchKey,
    setLastSearchKey: (key) => { lastSearchKey = key; },
    
    // Debounce timers
    getSearchDebounceTimer: () => searchDebounceTimer,
    setSearchDebounceTimer: (timer) => { searchDebounceTimer = timer; },
    clearSearchDebounceTimer: () => {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
    },
    
    getTypingDebounceTimer: () => typingDebounceTimer,
    setTypingDebounceTimer: (timer) => { typingDebounceTimer = timer; },
    clearTypingDebounceTimer: () => {
        if (typingDebounceTimer) {
            clearTimeout(typingDebounceTimer);
            typingDebounceTimer = null;
        }
    },
    
    getSearchDebounceTimeout: () => searchDebounceTimeout,
    setSearchDebounceTimeout: (timeout) => { searchDebounceTimeout = timeout; },
    clearSearchDebounceTimeout: () => {
        if (searchDebounceTimeout) {
            clearTimeout(searchDebounceTimeout);
            searchDebounceTimeout = null;
        }
    },
    
    // Cache duration constants
    getCacheDuration: () => CACHE_DURATION,
    getLazyLoadThreshold: () => LAZY_LOAD_THRESHOLD
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TalkState;
}

