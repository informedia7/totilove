/**
 * TALK CONFIGURATION
 * Centralized configuration object for all talk functionality
 * Extracted from talk.html (lines 1018-1045)
 */

const CONFIG = {
    TIMEOUTS: {
        REFRESH: 30010,
        CACHE_CLEANUP: 300100,
        RECALL_CHECK: 10000,
        TYPING_INDICATOR: 3001,
        TYPING_DEBOUNCE: 1000,
        SEARCH_DEBOUNCE: 300,
        IMAGE_LOAD_TIMEOUT: 10000,
        STUCK_MESSAGE_TIMEOUT: 30010
    },
    LIMITS: {
        MAX_IMAGE_SIZE: 1920,
        COMPRESSION_TARGET: 100,
        COMPRESSION_QUALITY: 0.8,
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
        LAZY_LOAD_THRESHOLD: 50,
        CACHE_DURATION: 60000
    },
    DATES: {
        MIN_DATE: '2020-01-01',
        MAX_YEARS_BACK: 5
    },
    USERS: {
        SAVED_MESSAGES: [] // Will be populated from database
    }
};

// Expose configuration on window for legacy helpers that read from window.CONFIG
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
















