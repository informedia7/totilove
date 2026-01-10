/**
 * Main Entry Point
 * 
 * Initializes new architecture components
 * Migration Phase 3: Week 10
 */

// Import core utilities
import { state } from './core/state.js';
import { apiClient } from './core/api-client.js';

// Initialize state with current user data
if (typeof window !== 'undefined' && window.currentUser) {
    state.set('user', {
        id: window.currentUser.id || null,
        name: window.currentUser.name || null,
        isAuthenticated: !!window.currentUser
    }, { silent: true });
}

// Export for use in other modules
export { state, apiClient };

// Log initialization
if (typeof window !== 'undefined') {
    console.log('[New Architecture] Main entry point loaded');
}

