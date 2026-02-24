/**
 * TALK SEARCH RESULTS MODULE
 * Search logic and results management
 */

class SearchResults {
    constructor(controller) {
        this.controller = controller;
        this.state = controller?.state;
    }

    async performSearch(options = {}) {
        if (!this.state) {
            throw new Error('TalkState not available');
        }

        try {
            const conversations = this.state.getConversations();
            const currentConv = this.state.getCurrentConversation();
            
            if (!currentConv || !conversations[currentConv]) {
                return { messages: [], total: 0, hasMore: false };
            }

            const conv = conversations[currentConv];
            
            // Load messages if needed
            if (!conv.searchMessages || conv.searchMessages.length === 0) {
                await this.loadSearchMessages(conv);
            }

            // Apply filters
            const filtered = this.applyFilters(conv.searchMessages || [], options);
            const total = filtered.length;
            
            // Apply pagination
            const displayLimit = this.state.getCurrentMessagesDisplayed() || 10;
            const visibleMessages = filtered.slice(0, displayLimit);

            return {
                messages: visibleMessages,
                total,
                hasMore: total > displayLimit,
                filtered: filtered // Keep full filtered array for reference
            };
        } catch (error) {
            console.error('[SearchResults] Search error:', error);
            throw error;
        }
    }

    async loadSearchMessages(conv) {
        if (!conv) {
            throw new Error('Conversation not provided');
        }

        if (typeof loadMessages !== 'function') {
            throw new Error('loadMessages function not available');
        }

        try {
            const hasDateFilter = this.hasActiveDateFilter();
            const initialBatchSize = hasDateFilter ? 100 : 50;

            // Load initial batch
            await loadMessages(conv, {
                forceRefresh: true,
                offset: 0,
                limit: initialBatchSize,
                forSearch: true
            });

            // Load more if needed (and no date filter)
            if (!hasDateFilter && conv.searchMessages && conv.searchMessages.length >= initialBatchSize) {
                await loadMessages(conv, {
                    forceRefresh: false,
                    offset: initialBatchSize,
                    limit: initialBatchSize,
                    forSearch: true
                });
            }
        } catch (error) {
            console.error('[SearchResults] Failed to load messages:', error);
            throw error;
        }
    }

    hasActiveDateFilter() {
        if (!this.state) return false;
        
        const dateRange = this.state.getCurrentDateRange();
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        return (dateRange?.start || dateRange?.end) ||
               (startDateInput?.value) || 
               (endDateInput?.value);
    }

    applyFilters(messages, options = {}) {
        if (!messages || !Array.isArray(messages)) {
            return [];
        }

        let filtered = [...messages];

        // Sender filter
        filtered = this.applySenderFilter(filtered, options.senderFilter);

        // Date filter
        filtered = this.applyDateFilter(filtered, options.dateRange);

        // Text search
        filtered = this.applyTextFilter(filtered, options.query);

        // Sort by date (newest first)
        filtered.sort((a, b) => {
            const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return tb - ta;
        });

        // Update state with total count
        if (this.state) {
            this.state.setSearchResultTotal(filtered.length);
        }

        return filtered;
    }

    applySenderFilter(messages, senderFilter = null) {
        if (!messages || !Array.isArray(messages)) {
            return [];
        }

        const filter = senderFilter || this.state?.getCurrentSearchSenderFilter() || 'me';
        
        return messages.filter(msg => {
            if (!msg?.type) return false;
            
            switch (filter) {
                case 'me':
                    return msg.type === 'sent';
                case 'partner':
                    return msg.type === 'received';
                default:
                    return true;
            }
        });
    }

    applyDateFilter(messages, dateRange = null) {
        if (!messages || !Array.isArray(messages)) {
            return [];
        }

        const range = dateRange || this.state?.getCurrentDateRange();
        if (!range || (!range.start && !range.end)) {
            return messages;
        }

        const startDate = range.start ? this.parseDate(range.start) : null;
        const endDate = range.end ? this.parseDate(range.end) : null;
        
        if (!startDate && !endDate) {
            return messages;
        }

        return messages.filter(msg => {
            if (!msg.timestamp) return false;
            
            const msgTimestamp = typeof msg.timestamp === 'number' ? msg.timestamp : new Date(msg.timestamp).getTime();
            if (isNaN(msgTimestamp)) return false;

            const msgDate = new Date(msgTimestamp);
            const msgYear = msgDate.getFullYear();
            const msgMonth = msgDate.getMonth();
            const msgDay = msgDate.getDate();

            // Check start date
            if (startDate) {
                if (msgYear < startDate.year) return false;
                if (msgYear === startDate.year && msgMonth < startDate.month) return false;
                if (msgYear === startDate.year && msgMonth === startDate.month && msgDay < startDate.day) return false;
            }

            // Check end date
            if (endDate) {
                if (msgYear > endDate.year) return false;
                if (msgYear === endDate.year && msgMonth > endDate.month) return false;
                if (msgYear === endDate.year && msgMonth === endDate.month && msgDay > endDate.day) return false;
            }
            
            return true;
        });
    }

    parseDate(dateStr) {
        if (!dateStr) return null;
        
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Convert to 0-11
        const day = parseInt(parts[2], 10);
        
        if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
        
        return { year, month, day };
    }

    applyTextFilter(messages, query = '') {
        if (!messages || !Array.isArray(messages)) {
            return [];
        }

        if (!query || !query.trim()) {
            return messages;
        }
        
        const searchQuery = query.toLowerCase();
        return messages.filter(msg => {
            const text = (msg.text || msg.message || msg.content || '').toLowerCase();
            return text.includes(searchQuery);
        });
    }

    display(searchResult) {
        if (!searchResult) {
            console.warn('[SearchResults] No search result to display');
            return;
        }

        const { messages, total, hasMore } = searchResult;
        const resultsList = document.getElementById('searchResultsList');
        
        if (!resultsList) {
            console.warn('[SearchResults] Results list element not found');
            return;
        }
        
        try {
            // Clear loading/error states first
            const loadingEl = resultsList.querySelector('.search-loading');
            const errorEl = resultsList.querySelector('.search-error');
            if (loadingEl) loadingEl.remove();
            if (errorEl) errorEl.remove();
            
            // Update UI
            if (this.controller?.modules?.panel) {
                this.controller.modules.panel.updateStats(total, messages.length);
            }
            
            if (messages.length === 0) {
                // Clear any existing messages
                const existingItems = resultsList.querySelectorAll('.search-result-item');
                existingItems.forEach(item => item.remove());
                
                // Show empty state
                if (this.controller?.modules?.panel) {
                    this.controller.modules.panel.showEmpty('No messages found');
                }
                this.updateViewMoreButton(false);
                this.updateClearButton(false); // Hide clear button when no results
                return;
            }

            // Hide empty state before rendering messages
            if (this.controller?.modules?.panel) {
                this.controller.modules.panel.hideEmpty();
            }
            
            this.renderMessages(messages);
            // Hide "Load More" if 0 messages or less than 10 messages are visible
            this.updateViewMoreButton(hasMore && messages.length >= 10);
            this.updateClearButton(true); // Show clear button when there are results
        } catch (error) {
            console.error('[SearchResults] Display error:', error);
        }
    }

    renderMessages(messages) {
        if (!messages || !Array.isArray(messages)) {
            return;
        }

        const resultsList = document.getElementById('searchResultsList');
        if (!resultsList) {
            console.warn('[SearchResults] Results list element not found');
            return;
        }

        try {
            // Clear existing results and empty states
            const existingItems = resultsList.querySelectorAll('.search-result-item');
            existingItems.forEach(item => item.remove());
            
            const emptyEl = resultsList.querySelector('.search-results-empty');
            if (emptyEl) emptyEl.remove();
            
            const loadingEl = resultsList.querySelector('.search-loading');
            if (loadingEl) loadingEl.remove();
            
            const errorEl = resultsList.querySelector('.search-error');
            if (errorEl) errorEl.remove();

            // Get current conversation info
            const currentConv = this.state?.getCurrentConversation();
            const conversations = this.state?.getConversations();
            const conv = conversations?.[currentConv];
            
            if (!conv) {
                console.warn('[SearchResults] Conversation not found');
                return;
            }

            // Get search query for highlighting
            const searchPanelInput = document.getElementById('searchPanelInput');
            const query = (searchPanelInput?.value || '').trim();

            // Render each message
            messages.forEach(msg => {
                const item = this.createMessageItem(msg, conv, query);
                if (item) {
                    resultsList.appendChild(item);
                }
            });
        } catch (error) {
            console.error('[SearchResults] Render error:', error);
        }
    }

    createMessageItem(msg, conv, query) {
        if (!msg || !conv) return null;

        try {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            
            const isSent = msg.type === 'sent';
            const senderName = isSent ? 
                (window.currentUser?.real_name || 'me') : 
                (conv.name || `User ${conv.partnerId || conv.id}`);
            
            const avatar = isSent ? 
                (window.currentUser?.avatar || '') : 
                (conv.avatar || '');
            
            // Format timestamp
            const timestamp = msg.timestamp ? 
                new Date(msg.timestamp).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '';
            
            // Create item HTML
            item.innerHTML = `
                <div class="search-result-avatar">
                    ${this.createAvatarHTML(avatar, senderName)}
                </div>
                <div class="search-result-content">
                    <div class="search-result-header">
                        <span class="search-result-sender">${this.escapeHtml(senderName)}</span>
                        <span class="search-result-time">${this.escapeHtml(timestamp)}</span>
                    </div>
                    <div class="search-result-text">
                        ${this.highlightText(msg.text || msg.message || msg.content || '', query)}
                    </div>
                </div>
            `;
            
            // Add click handler to jump to message
            item.addEventListener('click', () => {
                this.jumpToMessage(msg);
            });
            
            return item;
        } catch (error) {
            console.error('[SearchResults] Error creating message item:', error);
            return null;
        }
    }

    createAvatarHTML(avatarSrc, name) {
        if (!name) name = 'User';
        
        try {
            const isValidImagePath = avatarSrc &&
                (avatarSrc.startsWith('/uploads/') || avatarSrc.startsWith('uploads/')) &&
                avatarSrc.includes('.') &&
                avatarSrc.length > 15 &&
                !avatarSrc.startsWith('images/');

            if (isValidImagePath) {
                const src = avatarSrc.startsWith('/') ? avatarSrc : `/${avatarSrc}`;
                return `<img src="${this.escapeHtml(src)}" alt="${this.escapeHtml(name)}" />`;
            } else {
                const initial = (name.charAt(0) || 'U').toUpperCase();
                return `<div class="avatar-initial">${this.escapeHtml(initial)}</div>`;
            }
        } catch (error) {
            console.error('[SearchResults] Error creating avatar HTML:', error);
            const initial = (name.charAt(0) || 'U').toUpperCase();
            return `<div class="avatar-initial">${this.escapeHtml(initial)}</div>`;
        }
    }

    highlightText(text, query) {
        if (!query || !text) {
            return this.escapeHtml(text);
        }
        
        try {
            const escapedText = this.escapeHtml(text);
            const escapedQuery = this.escapeHtml(query);
            
            const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            return escapedText.replace(regex, '<mark>$1</mark>');
        } catch (error) {
            console.error('[SearchResults] Error highlighting text:', error);
            return this.escapeHtml(text);
        }
    }

    escapeHtml(text) {
        if (text == null) return '';
        
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    jumpToMessage(msg) {
        try {
            // Close search panel
            if (this.controller?.modules?.panel) {
                this.controller.modules.panel.close();
            }
            
            // Scroll to message in main chat
            // Implementation depends on main chat structure
            console.log('[SearchResults] Jump to message:', msg);
            
            // You might need to implement this based on your chat structure
            // Example:
            // if (typeof scrollToMessage === 'function') {
            //     scrollToMessage(msg.id);
            // }
        } catch (error) {
            console.error('[SearchResults] Error jumping to message:', error);
        }
    }

    updateViewMoreButton(show) {
        const viewMoreContainer = document.getElementById('viewMoreContainer');
        if (viewMoreContainer) {
            try {
                viewMoreContainer.style.display = show ? 'block' : 'none';
            } catch (error) {
                console.error('[SearchResults] Error updating view more button:', error);
            }
        }
    }

    updateClearButton(show) {
        const clearBtn = document.getElementById('clearMessagesBtn');
        if (clearBtn) {
            try {
                clearBtn.style.display = show ? 'inline-block' : 'none';
            } catch (error) {
                console.error('[SearchResults] Error updating clear button:', error);
            }
        }
    }
}

// Make class globally available
window.SearchResults = SearchResults;

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SearchResults;
}

