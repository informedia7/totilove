/**
 * MultiSelectManager - Consolidated multi-select management for interests, hobbies, and countries
 * Replaces three similar implementations with a single configurable system
 */

class MultiSelectManager {
    constructor(config) {
        this.config = {
            selectId: config.selectId,
            containerId: config.containerId,
            countSpanId: config.countSpanId,
            maxSelections: config.maxSelections || 10,
            badgeStyle: config.badgeStyle || 'background: #e3f2fd; color: #1976d2; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;',
            removeFunctionName: config.removeFunctionName,
            allItems: [],
            selectedItems: [],
            notificationFunction: null
        };
        
        this.init();
    }

    /**
     * Initialize the multi-select manager
     */
    init() {
        const select = document.getElementById(this.config.selectId);
        if (select) {
            select.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.addItem(e.target.value);
                }
            });
        }
    }

    /**
     * Set the notification function
     * @param {Function} fn - Function that accepts (message, type)
     */
    setNotificationFunction(fn) {
        this.config.notificationFunction = fn;
    }

    /**
     * Show a notification
     * @param {string} message - Message to display
     * @param {string} type - 'success', 'error', or 'info'
     */
    showNotification(message, type = 'info') {
        if (this.config.notificationFunction) {
            this.config.notificationFunction(message, type);
        }
    }

    /**
     * Load all available items
     * @param {Array} items - Array of items to load
     * @param {Function} itemFormatter - Optional function to format items
     */
    loadItems(items, itemFormatter) {
        this.config.allItems = items || [];
        
        const select = document.getElementById(this.config.selectId);
        if (!select) return;

        // Clear existing options (keep first if it's a placeholder)
        const firstOption = select.options[0];
        select.innerHTML = '';
        if (firstOption && firstOption.value === '') {
            select.appendChild(firstOption);
        }

        this.config.allItems.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id != null ? String(item.id) : (item.value || item.name || '');
            
            // Format display text - convert Font Awesome icons to emojis for hobbies
            let displayText = item.name || item.value || '';
            if (item.icon) {
                if (item.icon.startsWith('fa')) {
                    // Convert Font Awesome icon to emoji (for hobbies)
                    const emoji = this.faIconToEmoji(item.icon);
                    displayText = emoji ? `${emoji} ${displayText}` : displayText;
                } else {
                    // Use emoji directly
                    displayText = `${item.icon} ${displayText}`;
                }
            }
            
            option.textContent = itemFormatter ? itemFormatter(item) : displayText;
            option.dataset.id = String(item.id || '');
            select.appendChild(option);
        });
    }

    /**
     * Load selected items (for initialization)
     * @param {Array} selectedItems - Array of selected items
     */
    loadSelectedItems(selectedItems) {
        this.config.selectedItems = selectedItems || [];
        this.updateDisplay();
    }

    /**
     * Add an item to the selection
     * @param {string|number} itemValue - Value or ID of the item to add
     */
    addItem(itemValue) {
        if (!itemValue) return;

        // Handle special "all" case for countries
        if (itemValue === 'all' && this.config.selectId === 'preferred-country-select') {
            this.config.selectedItems = [];
            this.updateDisplay();
            const select = document.getElementById(this.config.selectId);
            if (select) select.value = '';
            return;
        }

        const item = this.config.allItems.find(i => 
            String(i.id) === String(itemValue) ||
            i.value === itemValue || 
            i.name === itemValue
        );

        if (!item) return;

        // Check if already selected
        if (this.config.selectedItems.find(si => si.id === item.id || si.name === item.name)) {
            this.showNotification('This item is already selected', 'info');
            return;
        }

        // Check max selections
        if (this.config.selectedItems.length >= this.config.maxSelections) {
            this.showNotification(`Maximum ${this.config.maxSelections} items can be selected`, 'error');
            return;
        }

        // Add item
        this.config.selectedItems.push(item);
        this.updateDisplay();

        // Clear select
        const select = document.getElementById(this.config.selectId);
        if (select) select.value = '';
    }

    /**
     * Remove an item from the selection
     * @param {string|number} itemValue - Value or ID of the item to remove
     */
    removeItem(itemValue) {
        this.config.selectedItems = this.config.selectedItems.filter(
            item => item.value !== itemValue && 
                   item.name !== itemValue && 
                   String(item.id) !== String(itemValue)
        );
        this.updateDisplay();
    }

    /**
     * Convert Font Awesome icon to emoji (for hobbies)
     * @param {string} icon - Font Awesome icon class name
     * @returns {string} Emoji string
     */
    faIconToEmoji(icon) {
        if (!icon) return '';
        const map = {
            'fa-music': '🎵',
            'fa-running': '🏃',
            'fa-walking': '🚶',
            'fa-book': '📚',
            'fa-camera': '📸',
            'fa-film': '🎬',
            'fa-gamepad': '🎮',
            'fa-basketball-ball': '🏀',
            'fa-football-ball': '🏈',
            'fa-futbol': '⚽',
            'fa-swimmer': '🏊',
            'fa-hiking': '🥾',
            'fa-biking': '🚴',
            'fa-tree': '🌳',
            'fa-leaf': '🍃',
            'fa-paint-brush': '🎨',
            'fa-dumbbell': '🏋️',
            'fa-car': '🚗',
            'fa-plane': '✈️',
            'fa-utensils': '🍽️',
            'fa-cookie-bite': '🍪',
            'fa-om': '🧘',
            'fa-pen': '✍️',
            'fa-pencil': '✏️',
            'fa-pencil-alt': '✏️',
            'fa-pen-nib': '✍️',
            'fa-edit': '✏️',
            'fa-feather': '🪶',
            'fa-feather-alt': '🪶',
            'fa-box-open': '📦',
            'fa-utensils': '🍽️',
            'fa-bicycle': '🚴',
            'fa-fish': '🎣',
            'fa-seedling': '🌱',
            'fa-users': '👥',
            'fa-hands-helping': '🤝',
            'fa-child': '🧘'
        };
        const key = icon.split(' ').find(k => k.startsWith('fa-'));
        return map[key] || '';
    }

    /**
     * Update the display of selected items
     */
    updateDisplay() {
        const container = document.getElementById(this.config.containerId);
        const countSpan = document.getElementById(this.config.countSpanId);

        if (!container) return;

        container.innerHTML = '';

        // Special handling for preferred countries - show "All Countries" when empty
        if (this.config.selectId === 'preferred-country-select' && 
            this.config.selectedItems.length === 0) {
            const allCountriesSpan = document.createElement('span');
            allCountriesSpan.style.cssText = 'background: #e8f5e8; color: #2e7d32; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; font-style: italic;';
            allCountriesSpan.innerHTML = '🌍 All Countries (default)';
            container.appendChild(allCountriesSpan);
            if (countSpan) countSpan.textContent = 'All';
            return;
        }

        if (countSpan) {
            countSpan.textContent = this.config.selectedItems.length;
        }

        this.config.selectedItems.forEach(item => {
            const span = document.createElement('span');
            span.style.cssText = this.config.badgeStyle;
            
            // Format item display - convert Font Awesome icons to emojis for hobbies
            const icon = item.icon || '';
            let iconHtml = '';
            if (icon) {
                if (icon.startsWith('fa')) {
                    // Convert Font Awesome icon to emoji (for hobbies)
                    const emoji = this.faIconToEmoji(icon);
                    iconHtml = emoji ? `${emoji} ` : '';
                } else {
                    // Use emoji directly
                    iconHtml = `${icon} `;
                }
            }
            const displayName = item.name || item.value || '';
            
            // Create remove function call
            const removeFunc = this.config.removeFunctionName || 'removeItem';
            const escapedValue = (item.value || item.name || '').replace(/'/g, "\\'");
            
            span.innerHTML = `${iconHtml}${displayName} <span style="cursor: pointer; font-weight: bold;" onclick="${removeFunc}('${escapedValue}')">×</span>`;
            container.appendChild(span);
        });
    }

    /**
     * Get selected items
     * @returns {Array} Array of selected items
     */
    getSelectedItems() {
        return this.config.selectedItems;
    }

    /**
     * Clear all selections
     */
    clear() {
        this.config.selectedItems = [];
        this.updateDisplay();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MultiSelectManager;
} else {
    window.MultiSelectManager = MultiSelectManager;
}

