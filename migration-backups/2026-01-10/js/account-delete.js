/**
 * Account Deletion Module
 * Handles all account deletion functionality including modal management,
 * confirmation steps, and API communication.
 */

class AccountDeleteManager {
    constructor() {
        this.init();
    }

    /**
     * Initialize event listeners
     */
    init() {
        // Setup delete account modal event listeners
        const deleteInput = document.getElementById('delete-confirm-input');
        if (deleteInput) {
            deleteInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !document.getElementById('delete-confirm-btn').disabled) {
                    this.confirmDeleteAccount();
                }
            });
            deleteInput.addEventListener('input', () => this.checkDeleteInput());
        }

        // Close modal when clicking outside
        const deleteModal = document.getElementById('delete-account-modal');
        if (deleteModal) {
            deleteModal.addEventListener('click', (event) => {
                if (event.target === deleteModal) {
                    this.closeDeleteAccountModal();
                }
            });
        }

        // Setup button event listeners
        const deleteAccountBtn = document.getElementById('deleteAccountBtn');
        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', () => this.deleteAccount());
        }

        const closeDeleteAccountModalBtn = document.getElementById('closeDeleteAccountModalBtn');
        if (closeDeleteAccountModalBtn) {
            closeDeleteAccountModalBtn.addEventListener('click', () => this.closeDeleteAccountModal());
        }

        const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
        if (deleteConfirmBtn) {
            deleteConfirmBtn.addEventListener('click', () => this.confirmDeleteAccount());
        }

        const showDeleteConfirmStep2Btn = document.getElementById('showDeleteConfirmStep2Btn');
        if (showDeleteConfirmStep2Btn) {
            showDeleteConfirmStep2Btn.addEventListener('click', () => this.showDeleteConfirmStep2());
        }

        const showDeleteConfirmStep1Btn = document.getElementById('showDeleteConfirmStep1Btn');
        if (showDeleteConfirmStep1Btn) {
            showDeleteConfirmStep1Btn.addEventListener('click', () => this.showDeleteConfirmStep1());
        }
    }

    /**
     * Show the delete account modal
     */
    deleteAccount() {
        const modal = document.getElementById('delete-account-modal');
        if (modal) {
            modal.style.display = 'flex';
            this.showDeleteConfirmStep1();
        }
    }

    /**
     * Close the delete account modal
     */
    closeDeleteAccountModal() {
        const modal = document.getElementById('delete-account-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.showDeleteConfirmStep1(); // Reset to step 1
        
        // Reset form
        const input = document.getElementById('delete-confirm-input');
        const error = document.getElementById('delete-confirm-error');
        const btn = document.getElementById('delete-confirm-btn');
        
        if (input) input.value = '';
        if (error) error.style.display = 'none';
        if (btn) {
            btn.disabled = true;
            btn.style.background = '#ccc';
            btn.style.cursor = 'not-allowed';
        }
    }

    /**
     * Show step 1 of the confirmation process
     */
    showDeleteConfirmStep1() {
        const step1 = document.getElementById('delete-confirm-step1');
        const step2 = document.getElementById('delete-confirm-step2');
        const step3 = document.getElementById('delete-confirm-step3');
        
        if (step1) step1.style.display = 'block';
        if (step2) step2.style.display = 'none';
        if (step3) step3.style.display = 'none';
    }

    /**
     * Show step 2 of the confirmation process (type DELETE)
     */
    showDeleteConfirmStep2() {
        const step1 = document.getElementById('delete-confirm-step1');
        const step2 = document.getElementById('delete-confirm-step2');
        const step3 = document.getElementById('delete-confirm-step3');
        
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';
        if (step3) step3.style.display = 'none';
        
        // Focus on input
        const input = document.getElementById('delete-confirm-input');
        if (input) input.focus();
    }

    /**
     * Check if the delete confirmation input is valid
     */
    checkDeleteInput() {
        const input = document.getElementById('delete-confirm-input');
        const error = document.getElementById('delete-confirm-error');
        const btn = document.getElementById('delete-confirm-btn');
        
        if (!input || !error || !btn) return;
        
        if (input.value.toUpperCase() === 'DELETE') {
            error.style.display = 'none';
            btn.disabled = false;
            btn.style.background = 'var(--danger-color)';
            btn.style.cursor = 'pointer';
        } else {
            error.style.display = 'block';
            btn.disabled = true;
            btn.style.background = '#ccc';
            btn.style.cursor = 'not-allowed';
        }
    }

    /**
     * Confirm and execute account deletion
     */
    async confirmDeleteAccount() {
        const input = document.getElementById('delete-confirm-input');
        if (!input || input.value.toUpperCase() !== 'DELETE') {
            return;
        }
        
        // Show processing step
        const step2 = document.getElementById('delete-confirm-step2');
        const step3 = document.getElementById('delete-confirm-step3');
        if (step2) step2.style.display = 'none';
        if (step3) step3.style.display = 'block';
        
        try {
            // Get session token (optional - backend can read from cookies)
            const token = typeof getSessionToken === 'function' ? getSessionToken() : null;
            
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
            
            // Build URL - only add token param if we have a token
            const tokenParam = token ? `?token=${token}` : '';
            const url = `/api/account/delete${tokenParam}`;
            
            // Build headers - only add auth headers if we have a token
            // Backend can read token from cookies if headers are missing
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
                headers['X-Session-Token'] = token;
            }
            
            let response;
            try {
                response = await fetch(url, {
                    method: 'DELETE',
                    credentials: 'same-origin', // Include cookies for backend cookie-based auth
                    headers: headers,
                    signal: controller.signal
                });
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    throw new Error('Request timed out. Please try again.');
                }
                throw fetchError;
            }
            clearTimeout(timeoutId);
            
            // Check if response is ok before trying to parse JSON
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch (jsonError) {
                    console.error('Error parsing JSON response:', jsonError);
                    throw new Error('Invalid response from server');
                }
            } else {
                // If not JSON, try to get text
                const text = await response.text();
                console.error('Non-JSON response:', text);
                throw new Error('Server returned an invalid response');
            }
            
            if (response.ok && data.success) {
                // Show success message briefly before redirect
                if (step3) {
                    step3.innerHTML = `
                        <div style="margin-bottom: 1.5rem;">
                            <i class="fas fa-check-circle" style="font-size: 3rem; color: #28a745;"></i>
                        </div>
                        <h3 style="margin: 0 0 0.5rem 0; color: var(--dark-color);">Account Deleted</h3>
                        <p style="margin: 0; color: var(--muted-color);">Your account has been permanently deleted. Redirecting to login...</p>
                    `;
                }
                
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 2000);
            } else {
                this.showDeleteConfirmStep2();
                // Show detailed error message including details field
                let errorMsg = data.error || data.message || `Server error (${response.status})`;
                
                // Always include details if available
                if (data.details) {
                    if (data.details !== errorMsg && data.details !== 'Internal server error') {
                        errorMsg = `${errorMsg}\n\nDetails: ${data.details}`;
                    } else if (data.details !== 'Internal server error') {
                        errorMsg = data.details; // Use details as main message if it's more specific
                    }
                }
                
                // Include additional error info if available
                if (data.type) {
                    errorMsg += `\n\nError type: ${data.type}`;
                }
                
                console.error('Delete account error response:', data);
                console.error('Response status:', response.status);
                console.error('Full error object:', JSON.stringify(data, null, 2));
                
                alert('Failed to delete account:\n\n' + errorMsg + '\n\nCheck the browser console for more details.');
            }
        } catch (error) {
            console.error('Error deleting account:', error);
            console.error('Error stack:', error.stack);
            this.showDeleteConfirmStep2();
            const errorMessage = error.message || 'Failed to delete account. Please try again.';
            alert('Failed to delete account: ' + errorMessage + '\n\nCheck the browser console for more details.');
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.accountDeleteManager = new AccountDeleteManager();
    });
} else {
    window.accountDeleteManager = new AccountDeleteManager();
}

// Export for use in other scripts if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AccountDeleteManager;
}


