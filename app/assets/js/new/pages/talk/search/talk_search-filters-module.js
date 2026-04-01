/**
 * TALK SEARCH FILTERS MODULE
 * Filter dropdown management and filtering logic
 */

class SearchFilters {
    constructor(controller) {
        this.controller = controller;
        this.state = controller?.state;
        this.elements = {};
        this.dateIntervals = {
            startDate: null,
            endDate: null
        };
        this.dateValues = {
            startDate: null,
            endDate: null
        };
        this.calendarRange = null;
        this.pendingDateRange = { start: null, end: null };
        this.appliedDateRange = { start: null, end: null };
    }

    init() {
        try {
            this.cacheElements();
            this.initializeFilterThemes();
            this.setupEventListeners();
            this.populateSenderFilter();
            this.setupCustomCalendar();
            this.initializeDateValues();
        } catch (error) {
            console.error('[SearchFilters] Initialization error:', error);
        }
    }

    cacheElements() {
        this.elements = {
            senderFilterBtn: document.getElementById('senderFilterBtn'),
            senderFilterContent: document.getElementById('senderFilterContent'),
            senderFilterList: document.getElementById('senderFilterList'),
            senderSearchInput: document.getElementById('senderSearchInput'),
            timeFilterBtn: document.getElementById('timeFilterBtn'),
            timeFilterContent: document.getElementById('timeFilterContent'),
            clearDateRangeBtn: document.getElementById('clearDateRangeBtn'),
            dateSuggestionDropdown: document.getElementById('dateSuggestionDropdown'),
            calendarRangeHost: document.getElementById('talkCalendarRange'),
            applyDateRangeBtn: document.getElementById('applyDateRangeBtn')
        };
    }

    initializeFilterThemes() {
        this.applyFilterTheme(this.elements.senderFilterBtn, 'sender', 'default');
        this.applyFilterTheme(this.elements.timeFilterBtn, 'time', 'default');
    }

    applyFilterTheme(target, variant, mode) {
        if (!target) return;
        const registry = window.TalkStyleRegistry;
        if (!registry || typeof registry.applyFilterTheme !== 'function') return;
        try {
            registry.applyFilterTheme(target, { variant, mode });
        } catch (error) {
            console.warn('[SearchFilters] Failed to apply filter theme:', error);
        }
    }

    setupEventListeners() {
        const {
            senderFilterBtn,
            senderFilterContent,
            senderSearchInput,
            timeFilterBtn,
            timeFilterContent,
            clearDateRangeBtn,
            applyDateRangeBtn
        } = this.elements;

        // Sender filter dropdown
        if (senderFilterBtn && senderFilterContent) {
            senderFilterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown('sender');
                if (senderSearchInput) {
                    setTimeout(() => senderSearchInput.focus(), 50);
                }
            });
        }

        // Sender filter items click handler (event delegation)
        if (senderFilterContent) {
            senderFilterContent.addEventListener('click', (e) => {
                const item = e.target.closest('.filter-dropdown-item');
                if (item && item.dataset.value) {
                    e.stopPropagation();
                    const value = item.dataset.value;
                    this.selectSenderFilter(value, item);
                }
            });
        }

        // Time filter dropdown
        if (timeFilterBtn && timeFilterContent) {
            timeFilterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown('time');
            });
        }

        // Sender search
        if (senderSearchInput) {
            senderSearchInput.addEventListener('input', () => this.filterSenderList());
        }

        // Clear date range
        if (clearDateRangeBtn) {
            clearDateRangeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.clearDateRange();
            });
        }

        if (applyDateRangeBtn) {
            applyDateRangeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.applyPendingDateRangeFilter();
            });
        }

        // Date suggestion trigger (Quick Select button) - use event delegation
        // This is inside the time filter dropdown, so we need to handle it via delegation
        if (timeFilterContent) {
            timeFilterContent.addEventListener('click', (e) => {
                const trigger = e.target.closest('.date-suggestion-trigger');
                if (trigger) {
                    e.stopPropagation();
                    e.preventDefault();
                    this.toggleDateSuggestionDropdown();
                }
            });
        }

        // Date suggestion items
        document.querySelectorAll('.date-suggestion-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleDateSuggestionClick(e, item));
        });

        // Close dropdowns on outside click
        document.addEventListener('mousedown', (e) => {
            const path = typeof e.composedPath === 'function' ? e.composedPath() : null;
            const pathMatches = (selector) => {
                if (!path) return null;
                return path.find(node => node instanceof Element && node.matches(selector));
            };

            const isInsideDropdown = pathMatches('.filter-dropdown') ||
                pathMatches('.filter-dropdown-btn') ||
                pathMatches('.filter-dropdown-content') ||
                pathMatches('.date-suggestion-dropdown') ||
                e.target.closest('.filter-dropdown') ||
                e.target.closest('.filter-dropdown-btn') ||
                e.target.closest('.filter-dropdown-content') ||
                e.target.closest('.date-suggestion-dropdown');

            if (!isInsideDropdown) {
                setTimeout(() => this.closeAllDropdowns(), 10);
            }
        });
    }

    getPendingRange() {
        return {
            start: this.pendingDateRange?.start || null,
            end: this.pendingDateRange?.end || null
        };
    }

    hasPendingDateRangeChanges() {
        const pending = this.getPendingRange();
        const applied = this.appliedDateRange || { start: null, end: null };
        return (pending.start !== applied.start) || (pending.end !== applied.end);
    }

    updateDateRangeActionState() {
        const btn = this.elements?.applyDateRangeBtn;
        if (!btn) return;

        const hasChanges = this.hasPendingDateRangeChanges();
        const hasSelection = Boolean(this.pendingDateRange?.start || this.pendingDateRange?.end);

        btn.classList.toggle('show', hasChanges);
        btn.disabled = !hasChanges;
        btn.setAttribute('aria-disabled', hasChanges ? 'false' : 'true');
        btn.textContent = 'Search';
    }

    applyPendingDateRangeFilter() {
        if (!this.state) return;
        if (!this.hasPendingDateRangeChanges()) return;

        const pending = this.getPendingRange();
        this.state.setCurrentDateRange({ ...pending });
        this.appliedDateRange = { ...pending };
        this.pendingDateRange = { ...pending };
        this.updateDateRangeActionState();
        this.updateTimeFilterButtonDisplay();
        this.closeAllDropdowns();
        this.triggerDateRangeSearch();
    }

    formatDateToISO(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    normalizeDateString(value) {
        if (!value) return null;
        const date = value instanceof Date ? new Date(value) : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return this.formatDateToISO(date);
    }

    getMaxSelectableDate() {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return this.formatDateToISO(now);
    }

    clampToMaxDate(value) {
        const normalized = this.normalizeDateString(value);
        if (!normalized) return null;
        const maxDate = this.getMaxSelectableDate();
        return maxDate && normalized > maxDate ? maxDate : normalized;
    }

    sanitizeRange(range = {}) {
        return {
            start: this.clampToMaxDate(range?.start),
            end: this.clampToMaxDate(range?.end)
        };
    }

    setupCustomCalendar() {
        if (!this.elements.calendarRangeHost || !window.TalkCalendarRange) {
            return;
        }

        try {
            const minDate = (window.CONFIG?.DATES?.MIN_DATE) || '2010-01-01';
            const storedRange = this.state?.getCurrentDateRange ? this.state.getCurrentDateRange() : null;
            const initialRange = this.sanitizeRange(storedRange || {});

            this.calendarRange = new window.TalkCalendarRange({
                container: this.elements.calendarRangeHost,
                minDate,
                maxDate: this.getMaxSelectableDate(),
                initialRange,
                onChange: (range) => this.handleCalendarRangeChange(range)
            });
        } catch (error) {
            console.error('[SearchFilters] Failed to initialize calendar range:', error);
        }
    }

    handleCalendarRangeChange(range = {}) {
        this.applyDateRange({
            start: range.start || null,
            end: range.end || null
        }, { skipCalendar: true, source: 'calendar' });
    }

    initializeDateValues() {
        const stateRange = this.state?.getCurrentDateRange ? this.state.getCurrentDateRange() : null;
        const initialRange = this.sanitizeRange(stateRange || {});

        this.dateValues.startDate = initialRange.start;
        this.dateValues.endDate = initialRange.end;
        this.pendingDateRange = { ...initialRange };
        this.appliedDateRange = { ...initialRange };

        if (this.calendarRange) {
            this.calendarRange.setRange({ ...initialRange }, { silent: true, preserveView: true });
        }

        this.updateTimeFilterButtonDisplay();
        this.updateDateRangeActionState();
    }

    applyDateRange(range = {}, options = {}) {
        const normalized = this.sanitizeRange(range);

        if (normalized.start && normalized.end && normalized.start > normalized.end) {
            const temp = normalized.start;
            normalized.start = normalized.end;
            normalized.end = temp;
        }

        this.dateValues.startDate = normalized.start;
        this.dateValues.endDate = normalized.end;
        this.pendingDateRange = { ...normalized };

        if (!options.skipCalendar && this.calendarRange) {
            this.calendarRange.setRange({ ...normalized }, { silent: true, preserveView: true });
        }

        this.updateTimeFilterButtonDisplay();
        this.updateDateRangeActionState();
    }

    toggleDropdown(type) {
        const { senderFilterContent, senderFilterBtn, timeFilterContent, timeFilterBtn } = this.elements;
        
        switch (type) {
            case 'sender':
                const senderIsOpen = senderFilterContent?.classList.contains('show');
                this.closeOtherDropdowns('sender');
                if (!senderIsOpen) {
                    senderFilterContent?.classList.add('show');
                    senderFilterBtn?.classList.add('active');
                } else {
                    senderFilterContent?.classList.remove('show');
                    senderFilterBtn?.classList.remove('active');
                }
                break;
                
            case 'time':
                const timeIsOpen = timeFilterContent?.classList.contains('show');
                this.closeOtherDropdowns('time');
                if (!timeIsOpen) {
                    timeFilterContent?.classList.add('show');
                    timeFilterBtn?.classList.add('active');
                } else {
                    timeFilterContent?.classList.remove('show');
                    timeFilterBtn?.classList.remove('active');
                }
                break;
        }
    }

    toggleDateSuggestionDropdown() {
        const { dateSuggestionDropdown } = this.elements;
        if (!dateSuggestionDropdown) {
            console.warn('[SearchFilters] Date suggestion dropdown not found');
            return;
        }

        try {
            const isVisible = dateSuggestionDropdown.classList.contains('show');
            if (isVisible) {
                dateSuggestionDropdown.classList.remove('show');
            } else {
                // Close other dropdowns first
                this.closeOtherDropdowns();
                // Also close time filter dropdown if open
                if (this.elements.timeFilterContent) {
                    this.elements.timeFilterContent.classList.remove('show');
                }
                if (this.elements.timeFilterBtn) {
                    this.elements.timeFilterBtn.classList.remove('active');
                }
                dateSuggestionDropdown.classList.add('show');
            }
        } catch (error) {
            console.error('[SearchFilters] Error toggling date suggestion dropdown:', error);
        }
    }

    closeAllDropdowns() {
        const elements = [
            { content: this.elements.senderFilterContent, btn: this.elements.senderFilterBtn },
            { content: this.elements.timeFilterContent, btn: this.elements.timeFilterBtn },
            { content: this.elements.dateSuggestionDropdown }
        ];

        elements.forEach(({ content, btn }) => {
            if (content) content.classList.remove('show');
            if (btn) btn.classList.remove('active');
        });
    }

    closeOtherDropdowns(excludeType) {
        if (excludeType !== 'sender') {
            this.elements.senderFilterContent?.classList.remove('show');
            this.elements.senderFilterBtn?.classList.remove('active');
        }
        
        if (excludeType !== 'time') {
            this.elements.timeFilterContent?.classList.remove('show');
            this.elements.timeFilterBtn?.classList.remove('active');
        }
    }

    populateSenderFilter() {
        const { senderFilterList } = this.elements;
        if (!senderFilterList) return;

        try {
            // Clear existing items (except "me")
            senderFilterList.querySelectorAll('.filter-dropdown-item:not([data-value="me"])').forEach(item => {
                item.remove();
            });

            // Update "me" item
            this.updateSenderFilterCurrentUserUI();

            // Add partner if conversation exists
            const currentConv = this.state?.getCurrentConversation();
            const conversations = this.state?.getConversations();
            const conv = conversations?.[currentConv];

            if (currentConv && conv) {
                this.addPartnerItem(conv);
            }

            // Set default selection
            this.setDefaultSenderSelection();
        } catch (error) {
            console.error('[SearchFilters] Error populating sender filter:', error);
        }
    }

    updateSenderFilterCurrentUserUI() {
        const meItem = document.querySelector('#senderFilterList .filter-dropdown-item[data-value="me"]');
        if (!meItem || !window.currentUser) return;

        try {
            const avatarDiv = meItem.querySelector('.filter-dropdown-avatar');
            const labelSpan = meItem.querySelector('span');

            const actualName = (window.currentUser.real_name || window.currentUser.real_name || '').trim();
            const displayLabel = 'Me';
            const searchLabel = actualName || displayLabel;
            const currentUserAvatar = window.currentUser.avatar || '';

            if (labelSpan) {
                labelSpan.textContent = displayLabel;
                labelSpan.setAttribute('data-original-name', actualName);
            }

            meItem.dataset.searchValue = searchLabel;

            if (avatarDiv) {
                avatarDiv.innerHTML = '';
                this.createAvatar(avatarDiv, currentUserAvatar, actualName || displayLabel);
            }
        } catch (error) {
            console.error('[SearchFilters] Error updating sender filter UI:', error);
        }
    }

    addPartnerItem(conv) {
        const { senderFilterList } = this.elements;
        if (!senderFilterList || !conv) return;

        try {
            const partnerId = conv.partnerId || conv.id;
            if (!partnerId) return;

            const item = document.createElement('div');
            item.className = 'filter-dropdown-item';
            item.dataset.value = 'partner';
            item.dataset.partnerId = String(partnerId);
            item.dataset.avatar = conv.avatar || '';

            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'filter-dropdown-avatar';
            
            const name = conv.name || `User ${partnerId}`;
            this.createAvatar(avatarDiv, conv.avatar, name);

            const labelSpan = document.createElement('span');
            labelSpan.textContent = name;

            item.appendChild(avatarDiv);
            item.appendChild(labelSpan);
            senderFilterList.appendChild(item);

            // Click handler is handled by event delegation in setupEventListeners()
        } catch (error) {
            console.error('[SearchFilters] Error adding partner item:', error);
        }
    }

    createAvatar(container, avatarSrc, name) {
        if (!container) return;

        try {
            const isValidImagePath = avatarSrc &&
                (avatarSrc.startsWith('/uploads/') || avatarSrc.startsWith('uploads/')) &&
                avatarSrc.includes('.') &&
                avatarSrc.length > 15 &&
                !avatarSrc.startsWith('images/');

            if (isValidImagePath) {
                const img = document.createElement('img');
                img.src = avatarSrc.startsWith('/') ? avatarSrc : `/${avatarSrc}`;
                img.alt = name || 'Avatar';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '50%';
                container.appendChild(img);
            } else {
                container.textContent = (name?.charAt(0) || 'U').toUpperCase();
            }
        } catch (error) {
            console.error('[SearchFilters] Error creating avatar:', error);
            container.textContent = (name?.charAt(0) || 'U').toUpperCase();
        }
    }

    setDefaultSenderSelection() {
        const { senderFilterList } = this.elements;
        if (!senderFilterList) return;

        try {
            const items = senderFilterList.querySelectorAll('.filter-dropdown-item');
            items.forEach(item => item.classList.remove('selected'));
            
            const meItem = senderFilterList.querySelector('[data-value="me"]');
            if (meItem) {
                meItem.classList.add('selected');
                if (this.state) {
                    this.state.setCurrentSearchSenderFilter('me');
                }
                this.updateSenderFilterButtonDisplay('me', meItem);
            }
        } catch (error) {
            console.error('[SearchFilters] Error setting default selection:', error);
        }
    }

    selectSenderFilter(value, item) {
        if (!this.state) return;

        try {
            this.state.setCurrentSearchSenderFilter(value);
            this.updateSenderFilterButtonDisplay(value, item);
            
            const { senderFilterList } = this.elements;
            if (senderFilterList) {
                senderFilterList.querySelectorAll('.filter-dropdown-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            }
            
            this.closeAllDropdowns();
            
            // Reset pagination and trigger search
            if (this.state) {
                this.state.setCurrentMessagesDisplayed(10);
                this.state.setLastSearchKey('');
            }
            
            if (this.controller) {
                this.controller.search();
            }
        } catch (error) {
            console.error('[SearchFilters] Error selecting sender filter:', error);
        }
    }

    updateSenderFilterButtonDisplay(selectedType, selectedItem = null) {
        const { senderFilterBtn } = this.elements;
        if (!senderFilterBtn) return;

        try {
            const labelContainer = document.getElementById('senderFilterDisplay') || 
                                  senderFilterBtn.querySelector('span:first-child');
            if (!labelContainer) return;

            labelContainer.innerHTML = '';
            labelContainer.style.display = 'inline-flex';
            labelContainer.style.alignItems = 'center';

            let displayName = '';
            let avatarSrc = '';
            let avatarLabel = '';

            if (selectedType === 'me') {
                const actualName = (window.currentUser?.real_name || window.currentUser?.real_name || '').trim();
                displayName = 'Me';
                avatarSrc = window.currentUser?.avatar || '';
                avatarLabel = actualName || displayName;
            } else {
                displayName = selectedItem?.querySelector('span')?.textContent || '';
                avatarSrc = selectedItem?.dataset.avatar || '';
                avatarLabel = displayName;
            }

            const avatarWrapper = document.createElement('div');
            avatarWrapper.className = 'filter-dropdown-avatar filter-dropdown-avatar-small';
            this.createAvatar(avatarWrapper, avatarSrc, avatarLabel || displayName);

            const textSpan = document.createElement('span');
            textSpan.textContent = displayName || (selectedType === 'me' ? 'Me' : 'User');
            textSpan.style.marginLeft = '6px';

            labelContainer.appendChild(avatarWrapper);
            labelContainer.appendChild(textSpan);
            senderFilterBtn.dataset.value = selectedType;

            const themeMode = selectedType === 'partner' ? 'partner' : (selectedType === 'me' ? 'me' : 'default');
            this.applyFilterTheme(senderFilterBtn, 'sender', themeMode);
        } catch (error) {
            console.error('[SearchFilters] Error updating button display:', error);
        }
    }

    filterSenderList() {
        const { senderSearchInput, senderFilterList } = this.elements;
        if (!senderSearchInput || !senderFilterList) return;

        try {
            const searchTerm = senderSearchInput.value.toLowerCase();
            const items = senderFilterList.querySelectorAll('.filter-dropdown-item');
            
            items.forEach(item => {
                const text = item.querySelector('span')?.textContent || '';
                const searchSource = (item.dataset.searchValue || text).toLowerCase();
                item.style.display = searchSource.includes(searchTerm) ? 'flex' : 'none';
            });
        } catch (error) {
            console.error('[SearchFilters] Error filtering sender list:', error);
        }
    }

    handleDateSuggestionClick(e, item) {
        e.stopPropagation();
        
        if (!item) return;
        
        try {
            const value = item.getAttribute('data-value');
            const text = item.querySelector('span')?.textContent || '';
            const { timeFilterBtn, dateSuggestionDropdown } = this.elements;

            // Update button text
            if (timeFilterBtn) {
                const span = timeFilterBtn.querySelector('span:first-child');
                if (span) span.textContent = `📅 ${text}`;
            }

            // Calculate dates
            const today = new Date();
            let startDate = new Date();

            switch (value) {
                case 'last7days':
                    startDate.setDate(today.getDate() - 7);
                    break;
                case 'last30days':
                    startDate.setDate(today.getDate() - 30);
                    break;
                case 'last3months':
                    startDate.setMonth(today.getMonth() - 3);
                    break;
            }

            const startDateStr = this.formatDateToISO(startDate);
            const endDateStr = this.getMaxSelectableDate();

            if (this.calendarRange) {
                this.calendarRange.setRange({ start: startDateStr, end: endDateStr }, { silent: true, preserveView: true });
            }
            
            this.applyDateRange({ start: startDateStr, end: endDateStr }, { skipCalendar: true });

            // Close dropdown
            if (dateSuggestionDropdown) {
                dateSuggestionDropdown.classList.remove('show');
            }
        } catch (error) {
            console.error('[SearchFilters] Error handling date suggestion:', error);
        }
    }

    triggerDateRangeSearch() {
        if (!this.state) return;
        
        try {
            // Reset pagination
            this.state.setCurrentMessagesDisplayed(10);
            this.state.setLastSearchKey('');

            const currentConv = this.state.getCurrentConversation ? this.state.getCurrentConversation() : null;
            if (currentConv) {
                const conversations = this.state.getConversations ? this.state.getConversations() : null;
                const conv = conversations?.[currentConv];
                if (conv) {
                    conv.searchMessages = null;
                }
            }
            
            // Clear search text
            const searchPanelInput = document.getElementById('searchPanelInput');
            if (searchPanelInput) searchPanelInput.value = '';
            
            // Trigger search
            if (this.controller) {
                this.controller.search();
            }
        } catch (error) {
            console.error('[SearchFilters] Error triggering date range search:', error);
        }
    }

    clearDateRange() {
        try {
            if (this.calendarRange) {
                this.calendarRange.clear({ silent: true });
            }

            this.applyDateRange({ start: null, end: null }, { skipCalendar: true });
        } catch (error) {
            console.error('[SearchFilters] Error clearing date range:', error);
        }
    }

    updateTimeFilterButtonDisplay() {
        const { timeFilterBtn } = this.elements;
        if (!timeFilterBtn) return;

        try {
            const dateRange = {
                start: this.dateValues?.startDate || null,
                end: this.dateValues?.endDate || null
            };
            const span = timeFilterBtn.querySelector('span:first-child');
            if (!span) return;

            if (dateRange?.start && dateRange?.end) {
                const startDate = new Date(dateRange.start);
                const endDate = new Date(dateRange.end);
                const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                span.textContent = `📅 ${startFormatted} - ${endFormatted}`;
            } else if (dateRange?.start) {
                const startDate = new Date(dateRange.start);
                const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                span.textContent = `📅 From ${startFormatted}`;
            } else if (dateRange?.end) {
                const endDate = new Date(dateRange.end);
                const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                span.textContent = `📅 Until ${endFormatted}`;
            } else {
                span.textContent = '📅 Time';
            }

            const hasCustomRange = Boolean(dateRange?.start || dateRange?.end);
            this.applyFilterTheme(timeFilterBtn, 'time', hasCustomRange ? 'range' : 'default');
        } catch (error) {
            console.error('[SearchFilters] Error updating time filter button:', error);
        }
    }

    cleanup() {
        try {
            // Clear intervals
            Object.values(this.dateIntervals).forEach(interval => {
                if (interval) {
                    clearInterval(interval);
                }
            });
            
            this.dateIntervals = {
                startDate: null,
                endDate: null
            };
        } catch (error) {
            console.error('[SearchFilters] Cleanup error:', error);
        }
    }
}

// Make class globally available
window.SearchFilters = SearchFilters;

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SearchFilters;
}

