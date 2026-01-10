/**
 * MultiSelect Component
 * 
 * Multi-select component extending BaseComponent
 * Provides tag-based multi-select functionality for interests, hobbies, countries, etc.
 * 
 * Migration Phase 2: Week 7
 */

import { BaseComponent } from './BaseComponent.js';
import { escapeHtml } from '../core/utils.js';

export class MultiSelect extends BaseComponent {
    /**
     * @param {Object} config - MultiSelect configuration
     * @param {HTMLElement|string} config.select - Select element or selector
     * @param {HTMLElement|string} config.container - Container for badges
     * @param {HTMLElement|string} config.countSpan - Count display element
     * @param {number} config.maxSelections - Maximum selections allowed
     * @param {string} config.badgeStyle - CSS style for badges
     * @param {Function} config.itemFormatter - Function to format items
     * @param {Function} config.onChange - Callback when selection changes
     * @param {Function} config.notificationFunction - Function to show notifications
     */
    constructor(config = {}) {
        super({
            container: config.container || document.body,
            autoInit: false
        });
        
        this.select = typeof config.select === 'string'
            ? document.getElementById(config.select) || document.querySelector(config.select)
            : config.select;
            
        this.container = typeof config.container === 'string'
            ? document.getElementById(config.container) || document.querySelector(config.container)
            : config.container;
            
        this.countSpan = typeof config.countSpan === 'string'
            ? document.getElementById(config.countSpan) || document.querySelector(config.countSpan)
            : config.countSpan;
            
        this.maxSelections = config.maxSelections || 10;
        this.badgeStyle = config.badgeStyle || 'background: #e3f2fd; color: #1976d2; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;';
        this.itemFormatter = config.itemFormatter;
        this.onChange = config.onChange;
        this.notificationFunction = config.notificationFunction;
        
        this.allItems = [];
        this.selectedItems = [];
        
        this.init();
    }
    
    async onInit() {
        if (!this.select) {
            this.error('Select element not found');
            return;
        }
        
        if (!this.container) {
            this.error('Container element not found');
            return;
        }
        
        // Set up change listener
        this.on(this.select, 'change', (e) => {
            if (e.target.value) {
                this.addItem(e.target.value);
            }
        });
    }
    
    /**
     * Show notification
     * @param {string} message - Message to display
     * @param {string} type - 'success', 'error', or 'info'
     */
    showNotification(message, type = 'info') {
        if (this.notificationFunction) {
            this.notificationFunction(message, type);
        } else if (window.showNotification) {
            window.showNotification(message, type);
        }
    }
    
    /**
     * Convert Font Awesome icon to emoji
     * @param {string} icon - Font Awesome icon class
     * @returns {string} Emoji
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
     * Format item display text
     * @param {Object} item - Item object
     * @returns {string} Formatted text
     */
    formatItem(item) {
        if (this.itemFormatter) {
            return this.itemFormatter(item);
        }
        
        let displayText = item.name || item.value || '';
        if (item.icon) {
            if (item.icon.startsWith('fa')) {
                const emoji = this.faIconToEmoji(item.icon);
                displayText = emoji ? `${emoji} ${displayText}` : displayText;
            } else {
                displayText = `${item.icon} ${displayText}`;
            }
        }
        
        return displayText;
    }
    
    /**
     * Load all available items
     * @param {Array} items - Array of items
     */
    loadItems(items) {
        this.allItems = items || [];
        
        if (!this.select) return;
        
        // Clear existing options (keep first if placeholder)
        const firstOption = this.select.options[0];
        this.select.innerHTML = '';
        if (firstOption && firstOption.value === '') {
            this.select.appendChild(firstOption);
        }
        
        this.allItems.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id != null ? String(item.id) : (item.value || item.name || '');
            option.textContent = this.formatItem(item);
            option.dataset.id = String(item.id || '');
            this.select.appendChild(option);
        });
    }
    
    /**
     * Load selected items
     * @param {Array} selectedItems - Array of selected items
     */
    loadSelectedItems(selectedItems) {
        this.selectedItems = selectedItems || [];
        this.updateDisplay();
    }
    
    /**
     * Add an item to selection
     * @param {string|number} itemValue - Value or ID of item
     */
    addItem(itemValue) {
        if (!itemValue) return;
        
        // Handle special "all" case for countries
        if (itemValue === 'all' && this.select.id === 'preferred-country-select') {
            this.selectedItems = [];
            this.updateDisplay();
            if (this.select) this.select.value = '';
            return;
        }
        
        const item = this.allItems.find(i =>
            String(i.id) === String(itemValue) ||
            i.value === itemValue ||
            i.name === itemValue
        );
        
        if (!item) return;
        
        // Check if already selected
        if (this.selectedItems.find(si => si.id === item.id || si.name === item.name)) {
            this.showNotification('This item is already selected', 'info');
            return;
        }
        
        // Check max selections
        if (this.selectedItems.length >= this.maxSelections) {
            this.showNotification(`Maximum ${this.maxSelections} items can be selected`, 'error');
            return;
        }
        
        // Add item
        this.selectedItems.push(item);
        this.updateDisplay();
        
        // Clear select
        if (this.select) this.select.value = '';
        
        // Call onChange callback
        if (this.onChange) {
            this.onChange(this.selectedItems);
        }
        
        // Emit event
        this.emit('multiselect:change', { selectedItems: this.selectedItems, item });
    }
    
    /**
     * Remove an item from selection
     * @param {string|number} itemValue - Value or ID of item
     */
    removeItem(itemValue) {
        const beforeLength = this.selectedItems.length;
        this.selectedItems = this.selectedItems.filter(
            item => item.value !== itemValue &&
                   item.name !== itemValue &&
                   String(item.id) !== String(itemValue)
        );
        
        if (this.selectedItems.length !== beforeLength) {
            this.updateDisplay();
            
            // Call onChange callback
            if (this.onChange) {
                this.onChange(this.selectedItems);
            }
            
            // Emit event
            this.emit('multiselect:change', { selectedItems: this.selectedItems });
        }
    }
    
    /**
     * Update display of selected items
     */
    updateDisplay() {
        if (!this.container) return;
        
        this.container.innerHTML = '';
        
        // Special handling for preferred countries - show "All Countries" when empty
        if (this.select && this.select.id === 'preferred-country-select' &&
            this.selectedItems.length === 0) {
            const allCountriesSpan = document.createElement('span');
            allCountriesSpan.style.cssText = 'background: #e8f5e8; color: #2e7d32; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; font-style: italic;';
            allCountriesSpan.innerHTML = '🌍 All Countries (default)';
            this.container.appendChild(allCountriesSpan);
            if (this.countSpan) this.countSpan.textContent = 'All';
            return;
        }
        
        if (this.countSpan) {
            this.countSpan.textContent = this.selectedItems.length;
        }
        
        this.selectedItems.forEach(item => {
            const span = document.createElement('span');
            span.style.cssText = this.badgeStyle;
            
            const icon = item.icon || '';
            let iconHtml = '';
            if (icon) {
                if (icon.startsWith('fa')) {
                    const emoji = this.faIconToEmoji(icon);
                    iconHtml = emoji ? `${emoji} ` : '';
                } else {
                    iconHtml = `${icon} `;
                }
            }
            
            const displayName = escapeHtml(item.name || item.value || '');
            const itemValue = escapeHtml(String(item.value || item.name || ''));
            
            span.innerHTML = `${iconHtml}${displayName} <span style="cursor: pointer; font-weight: bold;" data-value="${itemValue}">×</span>`;
            
            // Add click handler for remove
            const removeBtn = span.querySelector('[data-value]');
            if (removeBtn) {
                this.on(removeBtn, 'click', () => {
                    this.removeItem(itemValue);
                });
            }
            
            this.container.appendChild(span);
        });
    }
    
    /**
     * Get selected items
     * @returns {Array} Array of selected items
     */
    getSelectedItems() {
        return this.selectedItems;
    }
    
    /**
     * Clear all selections
     */
    clear() {
        this.selectedItems = [];
        this.updateDisplay();
        
        if (this.onChange) {
            this.onChange(this.selectedItems);
        }
        
        this.emit('multiselect:change', { selectedItems: [] });
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.MultiSelect = MultiSelect;
}

