/**
 * Bad Words Filter Utility
 * 
 * Loads bad words from the database and provides filtering functionality.
 * Caches bad words in memory for performance.
 */

class BadWordsFilter {
    constructor(db) {
        this.db = db;
        this.badWords = new Set();
        this.badWordsPattern = null;
        this.lastCacheUpdate = null;
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
        this.initialized = false;
    }

    /**
     * Initialize and load bad words from database
     */
    async initialize() {
        if (this.initialized && this.isCacheValid()) {
            return;
        }

        try {
            const result = await this.db.query(
                'SELECT LOWER(word) as word FROM bad_words WHERE word IS NOT NULL AND word != \'\''
            );

            this.badWords.clear();
            result.rows.forEach(row => {
                if (row.word && row.word.trim()) {
                    this.badWords.add(row.word.trim().toLowerCase());
                }
            });

            // Create regex pattern for efficient matching
            // Match whole words only (word boundaries)
            if (this.badWords.size > 0) {
                const escapedWords = Array.from(this.badWords)
                    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                    .join('|');
                this.badWordsPattern = new RegExp(`\\b(${escapedWords})\\b`, 'gi');
            } else {
                this.badWordsPattern = null;
            }

            this.lastCacheUpdate = Date.now();
            this.initialized = true;
        } catch (error) {
            console.error('❌ Error loading bad words:', error);
            // If table doesn't exist or error, continue without filtering
            this.badWords.clear();
            this.badWordsPattern = null;
            this.initialized = true;
        }
    }

    /**
     * Check if cache is still valid
     */
    isCacheValid() {
        if (!this.lastCacheUpdate) return false;
        return (Date.now() - this.lastCacheUpdate) < this.CACHE_TTL;
    }

    /**
     * Check if text contains any bad words
     * @param {string} text - Text to check
     * @returns {boolean} - True if bad words found
     */
    containsBadWords(text) {
        if (!text || typeof text !== 'string') return false;
        if (!this.badWordsPattern || this.badWords.size === 0) return false;

        const lowerText = text.toLowerCase();
        return this.badWordsPattern.test(lowerText);
    }

    /**
     * Get list of bad words found in text
     * @param {string} text - Text to check
     * @returns {Array<string>} - Array of bad words found
     */
    getBadWordsFound(text) {
        if (!text || typeof text !== 'string') return [];
        if (!this.badWordsPattern || this.badWords.size === 0) return [];

        const lowerText = text.toLowerCase();
        const matches = lowerText.match(this.badWordsPattern);
        
        if (!matches) return [];

        // Return unique bad words found
        return [...new Set(matches.map(match => match.toLowerCase()))];
    }

    /**
     * Replace bad words with asterisks
     * @param {string} text - Text to filter
     * @returns {string} - Filtered text
     */
    filterBadWords(text) {
        if (!text || typeof text !== 'string') return text;
        if (!this.badWordsPattern || this.badWords.size === 0) return text;

        return text.replace(this.badWordsPattern, (match) => {
            return '*'.repeat(match.length);
        });
    }

    /**
     * Validate message and return result
     * @param {string} text - Text to validate
     * @returns {Object} - { valid: boolean, error?: string, filtered?: string }
     */
    async validateMessage(text) {
        // Ensure cache is loaded
        if (!this.initialized || !this.isCacheValid()) {
            await this.initialize();
        }

        if (!text || typeof text !== 'string') {
            return { valid: true, filtered: text };
        }

        if (this.containsBadWords(text)) {
            const badWordsFound = this.getBadWordsFound(text);
            const filtered = this.filterBadWords(text);
            
            return {
                valid: false,
                error: `Your message contains inappropriate language. Please revise your message.`,
                badWordsFound: badWordsFound,
                filtered: filtered
            };
        }

        return { valid: true, filtered: text };
    }

    /**
     * Force refresh cache from database
     */
    async refreshCache() {
        this.initialized = false;
        await this.initialize();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            wordCount: this.badWords.size,
            lastUpdate: this.lastCacheUpdate,
            cacheValid: this.isCacheValid(),
            initialized: this.initialized
        };
    }
}

module.exports = BadWordsFilter;
















