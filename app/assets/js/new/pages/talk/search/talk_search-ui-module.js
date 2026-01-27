/**
 * TALK SEARCH UI MODULE
 * UI utilities and helpers
 */

class SearchUI {
    constructor(controller) {
        this.controller = controller;
    }

    showLoading() {
        const resultsList = document.getElementById('searchResultsList');
        if (!resultsList) return;

        try {
            resultsList.innerHTML = `
                <div class="search-loading">
                    <div class="spinner"></div>
                    <p>Loading messages...</p>
                </div>
            `;
        } catch (error) {
            console.error('[SearchUI] Error showing loading:', error);
        }
    }

    showError(error) {
        const resultsList = document.getElementById('searchResultsList');
        if (!resultsList) return;

        try {
            const errorMessage = error?.message || 'Unknown error occurred';
            resultsList.innerHTML = `
                <div class="search-error">
                    <p>Unable to load search results. Please try again.</p>
                    <p class="error-details">${this.escapeHtml(errorMessage)}</p>
                    <button onclick="window.searchController?.search({ forceRefresh: true })" 
                            class="retry-btn">
                        Retry
                    </button>
                </div>
            `;
        } catch (err) {
            console.error('[SearchUI] Error showing error:', err);
        }
    }

    updateResultsHeader(conv) {
        if (!conv) return;
        
        const headerTitleEl = document.getElementById('searchResultsTitle');
        if (!headerTitleEl) return;

        try {
            const senderFilter = this.controller?.state?.getCurrentSearchSenderFilter() || 'me';
            const currentUserName = window.currentUser?.real_name || 'me';
            const partnerName = conv.name || `User ${conv.partnerId || conv.id}`;
            const headerName = senderFilter === 'me' ? currentUserName : partnerName;

            headerTitleEl.textContent = `Messages ${headerName}`;
        } catch (error) {
            console.error('[SearchUI] Error updating results header:', error);
        }
    }

    validateDateRange(startDateStr, endDateStr) {
        const errors = [];

        try {
            if (startDateStr) {
                const startDate = new Date(startDateStr);
                if (isNaN(startDate.getTime())) {
                    errors.push('Invalid start date format');
                }
            }

            if (endDateStr) {
                const endDate = new Date(endDateStr);
                if (isNaN(endDate.getTime())) {
                    errors.push('Invalid end date format');
                }
            }

            if (startDateStr && endDateStr) {
                const startDate = new Date(startDateStr);
                const endDate = new Date(endDateStr);
                if (startDate > endDate) {
                    errors.push('Start date must be before end date');
                }
            }
        } catch (error) {
            errors.push('Error validating date range');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    enhanceAccessibility() {
        try {
            // Add ARIA attributes
            document.querySelectorAll('.filter-dropdown-btn').forEach(btn => {
                if (!btn.hasAttribute('aria-haspopup')) {
                    btn.setAttribute('aria-haspopup', 'true');
                }
                if (!btn.hasAttribute('aria-expanded')) {
                    btn.setAttribute('aria-expanded', 'false');
                }
            });

            // Update aria-expanded on toggle
            document.addEventListener('click', (e) => {
                const dropdownBtn = e.target.closest('.filter-dropdown-btn');
                if (dropdownBtn) {
                    const isExpanded = dropdownBtn.getAttribute('aria-expanded') === 'true';
                    dropdownBtn.setAttribute('aria-expanded', (!isExpanded).toString());
                }
            });

            // Keyboard navigation
            this.setupKeyboardNavigation();
        } catch (error) {
            console.error('[SearchUI] Error enhancing accessibility:', error);
        }
    }

    setupKeyboardNavigation() {
        try {
            document.addEventListener('keydown', (e) => {
                const activeDropdown = document.querySelector('.filter-dropdown-content.show');
                if (!activeDropdown) return;

                const items = activeDropdown.querySelectorAll('.filter-dropdown-item');
                if (items.length === 0) return;

                const currentIndex = Array.from(items).findIndex(item => 
                    item === document.activeElement || item.contains(document.activeElement)
                );

                switch (e.key) {
                    case 'ArrowDown':
                        e.preventDefault();
                        const nextIndex = (currentIndex + 1) % items.length;
                        items[nextIndex].focus();
                        break;
                        
                    case 'ArrowUp':
                        e.preventDefault();
                        const prevIndex = (currentIndex - 1 + items.length) % items.length;
                        items[prevIndex].focus();
                        break;
                        
                    case 'Enter':
                        e.preventDefault();
                        if (document.activeElement?.classList.contains('filter-dropdown-item')) {
                            document.activeElement.click();
                        }
                        break;
                }
            });
        } catch (error) {
            console.error('[SearchUI] Error setting up keyboard navigation:', error);
        }
    }

    formatMessageTimestamp(timestamp) {
        if (!timestamp) return '';
        
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) {
                return date.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            } else if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return date.toLocaleDateString('en-US', { weekday: 'short' });
            } else {
                return date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                });
            }
        } catch (error) {
            console.error('[SearchUI] Error formatting timestamp:', error);
            return '';
        }
    }

    escapeHtml(text) {
        if (text == null) return '';
        
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
}

// Make class globally available
window.SearchUI = SearchUI;

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SearchUI;
}

