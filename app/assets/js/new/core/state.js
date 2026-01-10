/**
 * Shared State Management
 * 
 * Centralized state manager for cross-page communication
 * Supports subscriptions, persistence, and event emission
 * Migration Phase 2: Week 8
 */

import { safeJsonParse, safeJsonStringify } from './utils.js';

/**
 * Global State Manager
 * Simple, lightweight state management for cross-page communication
 */
class StateManager {
    constructor() {
        this.state = {};
        this.subscribers = new Map();
        this.middleware = [];
        this.persistence = {
            enabled: true,
            storage: typeof localStorage !== 'undefined' ? localStorage : null,
            prefix: 'app_state_'
        };
        
        // Load persisted state
        this.loadPersistedState();
        
        // Listen for storage events (cross-tab communication)
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', this.handleStorageEvent.bind(this));
        }
    }
    
    /**
     * Get state value
     * @param {string} key - State key (supports dot notation: 'user.profile.name')
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {*} State value
     */
    get(key, defaultValue = undefined) {
        if (!key) return this.state;
        
        const keys = key.split('.');
        let value = this.state;
        
        for (const k of keys) {
            if (value == null || typeof value !== 'object') {
                return defaultValue;
            }
            value = value[k];
        }
        
        return value !== undefined ? value : defaultValue;
    }
    
    /**
     * Set state value
     * @param {string} key - State key (supports dot notation)
     * @param {*} value - Value to set
     * @param {Object} options - Options { silent, persist }
     */
    set(key, value, options = {}) {
        const { silent = false, persist = true } = options;
        
        // Apply middleware
        const middlewareResult = this.applyMiddleware(key, value, 'set');
        if (middlewareResult === false) {
            return false; // Middleware blocked the update
        }
        
        // Update state
        const keys = key.split('.');
        const lastKey = keys.pop();
        let target = this.state;
        
        // Navigate/create nested objects
        for (const k of keys) {
            if (!target[k] || typeof target[k] !== 'object') {
                target[k] = {};
            }
            target = target[k];
        }
        
        const oldValue = target[lastKey];
        target[lastKey] = value;
        
        // Persist if enabled
        if (persist && this.persistence.enabled && this.persistence.storage) {
            this.persistState(key, value);
        }
        
        // Notify subscribers
        if (!silent) {
            this.notifySubscribers(key, value, oldValue);
        }
        
        return true;
    }
    
    /**
     * Update multiple state values at once
     * @param {Object} updates - Object with key-value pairs
     * @param {Object} options - Options
     */
    update(updates, options = {}) {
        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value, options);
        });
    }
    
    /**
     * Delete state key
     * @param {string} key - State key to delete
     */
    delete(key) {
        const keys = key.split('.');
        const lastKey = keys.pop();
        let target = this.state;
        
        for (const k of keys) {
            if (!target[k] || typeof target[k] !== 'object') {
                return; // Key path doesn't exist
            }
            target = target[k];
        }
        
        delete target[lastKey];
        
        // Remove from persistence
        if (this.persistence.enabled && this.persistence.storage) {
            this.removePersistedState(key);
        }
        
        // Notify subscribers
        this.notifySubscribers(key, undefined, target[lastKey]);
    }
    
    /**
     * Subscribe to state changes
     * @param {string|Function} keyOrCallback - State key or callback function
     * @param {Function} callback - Callback function (if first arg is key)
     * @returns {Function} Unsubscribe function
     */
    subscribe(keyOrCallback, callback) {
        let key, handler;
        
        if (typeof keyOrCallback === 'function') {
            // Subscribe to all changes
            key = '*';
            handler = keyOrCallback;
        } else {
            // Subscribe to specific key
            key = keyOrCallback;
            handler = callback;
        }
        
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }
        
        this.subscribers.get(key).add(handler);
        
        // Return unsubscribe function
        return () => {
            const subscribers = this.subscribers.get(key);
            if (subscribers) {
                subscribers.delete(handler);
                if (subscribers.size === 0) {
                    this.subscribers.delete(key);
                }
            }
        };
    }
    
    /**
     * Notify subscribers of state change
     * @param {string} key - Changed key
     * @param {*} newValue - New value
     * @param {*} oldValue - Old value
     */
    notifySubscribers(key, newValue, oldValue) {
        // Notify specific key subscribers
        const specificSubscribers = this.subscribers.get(key);
        if (specificSubscribers) {
            specificSubscribers.forEach(handler => {
                try {
                    handler(newValue, oldValue, key);
                } catch (error) {
                    console.error(`[StateManager] Error in subscriber for "${key}":`, error);
                }
            });
        }
        
        // Notify wildcard subscribers
        const wildcardSubscribers = this.subscribers.get('*');
        if (wildcardSubscribers) {
            wildcardSubscribers.forEach(handler => {
                try {
                    handler(newValue, oldValue, key);
                } catch (error) {
                    console.error(`[StateManager] Error in wildcard subscriber:`, error);
                }
            });
        }
        
        // Emit custom event
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('state-change', {
                detail: { key, newValue, oldValue }
            }));
        }
    }
    
    /**
     * Add middleware
     * @param {Function} middleware - Middleware function (key, value, action) => value | false
     */
    use(middleware) {
        if (typeof middleware === 'function') {
            this.middleware.push(middleware);
        }
    }
    
    /**
     * Apply middleware
     * @param {string} key - State key
     * @param {*} value - Value
     * @param {string} action - Action type
     * @returns {*} Processed value or false if blocked
     */
    applyMiddleware(key, value, action) {
        let processedValue = value;
        
        for (const middleware of this.middleware) {
            try {
                const result = middleware(key, processedValue, action);
                if (result === false) {
                    return false; // Middleware blocked the update
                }
                if (result !== undefined) {
                    processedValue = result;
                }
            } catch (error) {
                console.error(`[StateManager] Middleware error:`, error);
            }
        }
        
        return processedValue;
    }
    
    /**
     * Persist state to storage
     * @param {string} key - State key
     * @param {*} value - Value to persist
     */
    persistState(key, value) {
        if (!this.persistence.storage) return;
        
        try {
            const storageKey = this.persistence.prefix + key.replace(/\./g, '_');
            this.persistence.storage.setItem(storageKey, safeJsonStringify(value));
        } catch (error) {
            console.warn(`[StateManager] Failed to persist state for "${key}":`, error);
        }
    }
    
    /**
     * Remove persisted state
     * @param {string} key - State key
     */
    removePersistedState(key) {
        if (!this.persistence.storage) return;
        
        try {
            const storageKey = this.persistence.prefix + key.replace(/\./g, '_');
            this.persistence.storage.removeItem(storageKey);
        } catch (error) {
            console.warn(`[StateManager] Failed to remove persisted state for "${key}":`, error);
        }
    }
    
    /**
     * Load persisted state
     */
    loadPersistedState() {
        if (!this.persistence.storage) return;
        
        try {
            const keys = Object.keys(this.persistence.storage);
            const prefix = this.persistence.prefix;
            
            keys.forEach(storageKey => {
                if (storageKey.startsWith(prefix)) {
                    const stateKey = storageKey.slice(prefix.length).replace(/_/g, '.');
                    const value = safeJsonParse(this.persistence.storage.getItem(storageKey));
                    
                    if (value !== null) {
                        this.set(stateKey, value, { silent: true, persist: false });
                    }
                }
            });
        } catch (error) {
            console.warn('[StateManager] Failed to load persisted state:', error);
        }
    }
    
    /**
     * Handle storage event (cross-tab communication)
     * @param {StorageEvent} event - Storage event
     */
    handleStorageEvent(event) {
        if (!event.key || !event.key.startsWith(this.persistence.prefix)) {
            return;
        }
        
        const stateKey = event.key.slice(this.persistence.prefix.length).replace(/_/g, '.');
        const newValue = safeJsonParse(event.newValue);
        const oldValue = this.get(stateKey);
        
        // Update state without persisting (already persisted)
        this.set(stateKey, newValue, { silent: false, persist: false });
    }
    
    /**
     * Reset state
     * @param {boolean} clearPersistence - Clear persisted state
     */
    reset(clearPersistence = false) {
        this.state = {};
        
        if (clearPersistence && this.persistence.storage) {
            const keys = Object.keys(this.persistence.storage);
            const prefix = this.persistence.prefix;
            
            keys.forEach(key => {
                if (key.startsWith(prefix)) {
                    this.persistence.storage.removeItem(key);
                }
            });
        }
        
        // Notify all subscribers
        this.notifySubscribers('*', this.state, null);
    }
    
    /**
     * Get all state
     * @returns {Object} Current state
     */
    getAll() {
        return { ...this.state };
    }
    
    /**
     * Check if key exists
     * @param {string} key - State key
     * @returns {boolean} True if key exists
     */
    has(key) {
        return this.get(key, '__NOT_FOUND__') !== '__NOT_FOUND__';
    }
}

// Create singleton instance
export const state = new StateManager();

// Export class for custom instances
export { StateManager };

// ===== CONVENIENCE FUNCTIONS =====

/**
 * Get state value
 */
export function getState(key, defaultValue) {
    return state.get(key, defaultValue);
}

/**
 * Set state value
 */
export function setState(key, value, options) {
    return state.set(key, value, options);
}

/**
 * Subscribe to state changes
 */
export function subscribeState(keyOrCallback, callback) {
    return state.subscribe(keyOrCallback, callback);
}

/**
 * Update multiple state values
 */
export function updateState(updates, options) {
    return state.update(updates, options);
}

// ===== DEFAULT STATE INITIALIZATION =====

// Initialize common state keys
if (typeof window !== 'undefined') {
    // User state
    state.set('user', {
        id: window.currentUser?.id || null,
        name: window.currentUser?.name || null,
        isAuthenticated: !!window.currentUser
    }, { silent: true });
    
    // Message state
    state.set('messages', {
        unreadCount: 0,
        lastUpdate: null
    }, { silent: true });
    
    // Online status
    state.set('online', {
        status: 'unknown',
        lastCheck: null
    }, { silent: true });
    
    // UI state
    state.set('ui', {
        theme: 'light',
        sidebarOpen: false,
        notifications: []
    }, { silent: true });
}

