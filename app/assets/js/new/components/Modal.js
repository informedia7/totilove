/**
 * Modal Component
 * 
 * Base modal component extending BaseComponent
 * Provides common modal functionality: open, close, loading states, error handling
 * 
 * Migration Phase 2: Week 7
 */

import { BaseComponent } from './BaseComponent.js';
import { apiClient } from '../core/api-client.js';

export class Modal extends BaseComponent {
    /**
     * @param {Object} config - Modal configuration
     * @param {HTMLElement|string} config.container - Modal container element or selector
     * @param {string} config.modalId - ID of the modal element
     * @param {string} config.loadingId - ID of loading element
     * @param {string} config.errorId - ID of error element
     * @param {string} config.contentId - ID of content element
     * @param {string} config.closeButtonId - ID of close button
     * @param {Function} config.onOpen - Callback when modal opens
     * @param {Function} config.onClose - Callback when modal closes
     */
    constructor(config = {}) {
        super({
            container: config.container || document.body,
            autoInit: false
        });
        
        this.modalId = config.modalId;
        this.loadingId = config.loadingId;
        this.errorId = config.errorId;
        this.contentId = config.contentId;
        this.closeButtonId = config.closeButtonId;
        this.onOpen = config.onOpen;
        this.onClose = config.onClose;
        
        this.modal = null;
        this.loading = null;
        this.error = null;
        this.content = null;
        this.closeButton = null;
        this.isOpen = false;
        
        this.init();
    }
    
    async onInit() {
        // Find modal elements
        this.modal = typeof this.modalId === 'string' 
            ? document.getElementById(this.modalId)
            : this.modalId;
            
        if (!this.modal) {
            this.error('Modal element not found:', this.modalId);
            return;
        }
        
        // Find child elements
        if (this.loadingId) {
            this.loading = document.getElementById(this.loadingId);
        }
        if (this.errorId) {
            this.error = document.getElementById(this.errorId);
        }
        if (this.contentId) {
            this.content = document.getElementById(this.contentId);
        }
        if (this.closeButtonId) {
            this.closeButton = document.getElementById(this.closeButtonId);
        }
        
        // Set up event listeners
        this.setupEvents();
    }
    
    setupEvents() {
        // Close button
        if (this.closeButton) {
            this.on(this.closeButton, 'click', () => this.close());
        }
        
        // Click outside to close
        this.on(this.modal, 'click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
        
        // ESC key to close
        this.on(document, 'keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }
    
    /**
     * Open the modal
     * @param {Object} data - Optional data to pass to modal
     */
    open(data = {}) {
        if (!this.modal) {
            this.error('Modal element not found');
            return;
        }
        
        this.modal.style.display = 'block';
        this.isOpen = true;
        
        // Show loading, hide error and content
        if (this.loading) {
            this.loading.style.display = 'block';
        }
        if (this.error) {
            this.error.style.display = 'none';
        }
        if (this.content) {
            this.content.style.display = 'none';
        }
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        
        // Focus management
        this.modal.setAttribute('aria-hidden', 'false');
        this.modal.focus();
        
        // Call onOpen callback
        if (this.onOpen) {
            this.onOpen(data);
        }
        
        // Emit custom event
        this.emit('modal:open', { modal: this, data });
    }
    
    /**
     * Close the modal
     */
    close() {
        if (!this.modal || !this.isOpen) {
            return;
        }
        
        this.modal.style.display = 'none';
        this.isOpen = false;
        
        // Restore body scroll
        document.body.style.overflow = '';
        
        // Focus management
        this.modal.setAttribute('aria-hidden', 'true');
        
        // Call onClose callback
        if (this.onClose) {
            this.onClose();
        }
        
        // Emit custom event
        this.emit('modal:close', { modal: this });
    }
    
    /**
     * Show loading state
     */
    showLoading() {
        if (this.loading) {
            this.loading.style.display = 'block';
        }
        if (this.error) {
            this.error.style.display = 'none';
        }
        if (this.content) {
            this.content.style.display = 'none';
        }
    }
    
    /**
     * Show error state
     * @param {string} message - Error message to display
     */
    showError(message = 'An error occurred') {
        if (this.loading) {
            this.loading.style.display = 'none';
        }
        if (this.error) {
            this.error.style.display = 'block';
            this.error.innerHTML = `<i class="fas fa-exclamation-triangle fa-2x"></i><p>${message}</p>`;
        }
        if (this.content) {
            this.content.style.display = 'none';
        }
    }
    
    /**
     * Show content
     */
    showContent() {
        if (this.loading) {
            this.loading.style.display = 'none';
        }
        if (this.error) {
            this.error.style.display = 'none';
        }
        if (this.content) {
            this.content.style.display = 'block';
        }
    }
    
    /**
     * Load data from API and display in modal
     * @param {string} url - API endpoint
     * @param {Object} options - Fetch options
     * @param {Function} displayFunction - Function to display the data
     */
    async loadData(url, options = {}, displayFunction = null) {
        this.showLoading();
        
        try {
            const data = await apiClient.getJson(url, options);
            
            if (displayFunction) {
                displayFunction(data);
            }
            
            this.showContent();
            return data;
        } catch (error) {
            this.error('Error loading data:', error);
            this.showError(error.message || 'Failed to load data');
            throw error;
        }
    }
    
    onDestroy() {
        // Clean up
        this.close();
        super.onDestroy();
    }
}

/**
 * ProfileModal - Specialized modal for user profiles
 */
export class ProfileModal extends Modal {
    constructor(config = {}) {
        super({
            modalId: config.modalId || 'userProfileModal',
            loadingId: config.loadingId || 'modal-loading',
            errorId: config.errorId || 'modal-error',
            contentId: config.contentId || 'modal-profile-content',
            closeButtonId: config.closeButtonId || 'closeProfileModalBtn',
            ...config
        });
        
        this.currentUserId = null;
    }
    
    /**
     * Open profile modal for a specific user
     * @param {number|string} userId - User ID to display
     */
    async openProfile(userId) {
        // Check email verification before opening
        if (window.checkEmailVerificationStatus) {
            const isVerified = await window.checkEmailVerificationStatus();
            if (!isVerified) {
                if (window.showVerificationMessage) {
                    window.showVerificationMessage();
                }
                return;
            }
        }
        
        this.currentUserId = userId;
        this.open({ userId });
        
        // Load profile data
        try {
            const currentUserId = window.currentUser?.id || '2';
            const data = await this.loadData(
                `/api/users/${userId}/profile`,
                {
                    headers: {
                        'X-User-ID': currentUserId
                    }
                },
                (profileData) => this.displayProfile(profileData.profile || profileData)
            );
        } catch (error) {
            // Error already handled in loadData
        }
    }
    
    /**
     * Display profile data in modal
     * @param {Object} profile - Profile data object
     */
    displayProfile(profile) {
        // This should be implemented based on your specific profile modal structure
        // For now, emit an event that existing code can listen to
        this.emit('profile:display', { profile, modal: this });
        
        // If there's a global display function, call it
        if (typeof window.displayProfileInModal === 'function') {
            window.displayProfileInModal(profile);
        }
    }
}

// Export singleton instance for backward compatibility
export const profileModal = new ProfileModal();

// Make available globally for backward compatibility
if (typeof window !== 'undefined') {
    window.ProfileModal = ProfileModal;
    window.profileModal = profileModal;
    
    // Global function for backward compatibility
    window.openProfileModal = (userId) => {
        profileModal.openProfile(userId);
    };
}












































