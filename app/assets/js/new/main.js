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

// Import components
import { BaseComponent } from './components/BaseComponent.js';
import { UserCard } from './components/UserCard.js';
import { Modal, ProfileModal } from './components/Modal.js';
import { Form } from './components/Form.js';
import { MultiSelect } from './components/MultiSelect.js';
import { ChatInput } from './components/ChatInput.js';

// Export for use in other modules
export { 
    state, 
    apiClient,
    BaseComponent,
    UserCard,
    Modal,
    ProfileModal,
    Form,
    MultiSelect,
    ChatInput
};

// Log initialization
if (typeof window !== 'undefined') {
    console.log('[New Architecture] Main entry point loaded');
    console.log('[New Architecture] Components available:', {
        BaseComponent,
        UserCard,
        Modal,
        ProfileModal,
        Form,
        MultiSelect,
        ChatInput
    });
}


