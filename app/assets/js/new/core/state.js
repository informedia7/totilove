/**
 * Shared State Management
 * 
 * Centralized state manager for cross-page communication
 * Supports subscriptions, persistence, and event emission
 * Migration Phase 2: Week 8
 */


class RemoteStateSync {
    constructor(options = {}) {
        this.basePath = options.basePath || '/api/state';
        this.available = typeof fetch === 'function';
    }

    isAvailable() {
        return this.available;
    }

    buildHeaders() {
        return {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };
    }

    async request(path = '', { method = 'GET', body = null } = {}) {
        if (!this.available) {
            throw new Error('State sync unavailable');
        }

        const options = {
            method,
            headers: this.buildHeaders(),
            credentials: 'include'
        };

        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.basePath}${path}`, options);
        let payload = null;

        if (response.status !== 204) {
            try {
                payload = await response.json();
            } catch (_error) {
                payload = null;
            }
        }

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                this.available = false;
            }
            const errorMessage = payload?.error || `State sync failed (${response.status})`;
            throw new Error(errorMessage);
        }

        return payload;
    }

    async fetchAll(keys = null) {
        if (!this.isAvailable()) {
            return {};
        }

        const params = new URLSearchParams();
        if (Array.isArray(keys) && keys.length > 0) {
            keys.forEach(key => params.append('keys', key));
        }

        const query = params.toString() ? `?${params.toString()}` : '';
        const payload = await this.request(query, { method: 'GET' });
        return payload?.state || {};
    }

    async persist(key, value) {
        if (!this.isAvailable() || !key) {
            return;
        }

        try {
            await this.request('', {
                method: 'POST',
                body: { updates: { [key]: value } }
            });
        } catch (error) {
            console.warn('[StateSync] Persist failed:', error.message);
        }
    }

    async remove(keys = []) {
        if (!this.isAvailable() || !Array.isArray(keys) || keys.length === 0) {
            return;
        }

        const params = new URLSearchParams();
        keys.forEach(key => params.append('keys', key));
        const query = params.toString() ? `?${params.toString()}` : '';

        try {
            await this.request(query, { method: 'DELETE' });
        } catch (error) {
            console.warn('[StateSync] Remove failed:', error.message);
        }
    }

    async clearAll() {
        if (!this.isAvailable()) {
            return;
        }

        try {
            await this.request('?all=true', { method: 'DELETE' });
        } catch (error) {
            console.warn('[StateSync] Clear failed:', error.message);
        }
    }
}

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
            prefix: 'app_state_',
            driver: typeof window !== 'undefined' ? new RemoteStateSync() : null,
            ready: false
        };
        
        // Load persisted state from remote storage
        this.loadPersistedState();
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
        if (persist && this.persistence.enabled && this.persistence.driver?.isAvailable?.()) {
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
        
        const oldValue = target[lastKey];
        delete target[lastKey];
        
        // Remove from persistence
        if (this.persistence.enabled && this.persistence.driver?.isAvailable?.()) {
            this.removePersistedState(key);
        }
        
        // Notify subscribers
        this.notifySubscribers(key, undefined, oldValue);
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
        if (!this.persistence.driver?.isAvailable?.()) return;

        this.persistence.driver.persist(key, value).catch(error => {
            console.warn(`[StateManager] Failed to persist state for "${key}":`, error?.message || error);
        });
    }
    
    /**
     * Remove persisted state
     * @param {string} key - State key
     */
    removePersistedState(key) {
        if (!this.persistence.driver?.isAvailable?.()) return;

        this.persistence.driver.remove([key]).catch(error => {
            console.warn(`[StateManager] Failed to remove persisted state for "${key}":`, error?.message || error);
        });
    }
    
    /**
     * Load persisted state
     */
    async loadPersistedState() {
        if (!this.persistence.driver?.isAvailable?.() || !this.persistence.enabled) {
            this.persistence.ready = true;
            return;
        }

        try {
            const records = await this.persistence.driver.fetchAll();
            Object.entries(records).forEach(([stateKey, value]) => {
                this.set(stateKey, value, { silent: true, persist: false });
            });
        } catch (error) {
            console.warn('[StateManager] Failed to load persisted state:', error?.message || error);
            this.persistence.enabled = false;
        } finally {
            this.persistence.ready = true;
        }
    }
    
    /**
     * Reset state
     * @param {boolean} clearPersistence - Clear persisted state
     */
    reset(clearPersistence = false) {
        this.state = {};
        
        if (clearPersistence && this.persistence.driver?.isAvailable?.()) {
            this.persistence.driver.clearAll().catch(error => {
                console.warn('[StateManager] Failed to clear persisted state:', error?.message || error);
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













































