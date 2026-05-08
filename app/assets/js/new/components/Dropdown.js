/**
 * Dropdown Component
 * 
 * Dropdown/select component extending BaseComponent
 * Provides dropdown population, value management, and change handling
 * 
 * Migration Phase 2: Week 8
 */

import { BaseComponent } from './BaseComponent.js';
import { escapeHtml } from '../core/utils.js';

export class Dropdown extends BaseComponent {
    /**
     * @param {Object} config - Dropdown configuration
     * @param {HTMLElement|string} config.select - Select element or selector
     * @param {Array} config.options - Array of option objects
     * @param {string} config.placeholder - Placeholder text
     * @param {string|number} config.value - Current selected value
     * @param {Function} config.valueMapper - Function to map option values
     * @param {Function} config.displayFormatter - Function to format display text
     * @param {Array} config.skipValues - Values to skip when populating
     * @param {Function} config.onChange - Callback when value changes
     */
    constructor(config = {}) {
        super({
            container: config.container || document.body,
            autoInit: false
        });
        
        this.select = typeof config.select === 'string'
            ? document.getElementById(config.select) || document.querySelector(config.select)
            : config.select;
            
        this.options = config.options || [];
        this.placeholder = config.placeholder || '';
        this.valueMapper = config.valueMapper;
        this.displayFormatter = config.displayFormatter;
        this.skipValues = config.skipValues || [];
        this.onChange = config.onChange;
        
        this.currentValue = config.value || null;
        
        this.init();
    }
    
    async onInit() {
        if (!this.select) {
            this.error('Select element not found');
            return;
        }
        
        // Set up change listener
        this.on(this.select, 'change', (e) => {
            const newValue = e.target.value;
            if (newValue !== this.currentValue) {
                this.currentValue = newValue;
                if (this.onChange) {
                    this.onChange(newValue, this.getSelectedOption());
                }
                this.emit('dropdown:change', { value: newValue, option: this.getSelectedOption() });
            }
        });
    }
    
    /**
     * Check if value should be skipped
     * @param {string} value - Value to check
     * @returns {boolean} True if should skip
     */
    shouldSkip(value) {
        if (!value) return false;
        const valueLower = value.toLowerCase().trim();
        return this.skipValues.some(skip => {
            const skipLower = skip.toLowerCase().trim();
            // Handle "complicated" variations
            if (skipLower.includes('complicated')) {
                return valueLower.includes('complicated');
            }
            // Exact match for others
            return valueLower === skipLower;
        });
    }
    
    /**
     * Populate dropdown with options
     * @param {Array} options - Array of option objects
     */
    populate(options) {
        if (!this.select) return;
        
        this.options = options || [];
        
        // Clear existing options (keep first if placeholder)
        const firstOption = this.select.options[0];
        this.select.innerHTML = '';
        
        // Add placeholder if provided
        if (this.placeholder) {
            const placeholderOption = document.createElement('option');
            placeholderOption.value = '';
            placeholderOption.textContent = this.placeholder;
            placeholderOption.disabled = true;
            placeholderOption.selected = !this.currentValue;
            this.select.appendChild(placeholderOption);
        } else if (firstOption && firstOption.value === '') {
            this.select.appendChild(firstOption);
        }
        
        // Add options
        this.options.forEach(item => {
            const itemName = item.name || item.display_name || item.display_text || item.label || '';
            const itemValue = this.valueMapper ? this.valueMapper(item) : (item.id != null ? String(item.id) : itemName);
            
            // Skip excluded values
            if (this.shouldSkip(itemName) || this.shouldSkip(itemValue)) {
                return;
            }
            
            const option = document.createElement('option');
            option.value = itemValue;
            
            // Format display text
            if (this.displayFormatter) {
                option.textContent = this.displayFormatter(item);
            } else if (item.display_text) {
                option.textContent = item.display_text;
            } else if (item.height_cm !== null && item.height_cm !== undefined) {
                option.textContent = `${item.height_cm} cm`;
            } else if (item.weight_kg !== null && item.weight_kg !== undefined) {
                option.textContent = `${item.weight_kg} kg`;
            } else {
                option.textContent = itemName;
            }
            
            // Add description as title if available
            if (item.description) {
                option.title = item.description;
            }
            
            // Set selected if matches current value
            if (this.currentValue && String(itemValue) === String(this.currentValue)) {
                option.selected = true;
            }
            
            this.select.appendChild(option);
        });
        
        // Explicitly set value if we have one
        if (this.currentValue) {
            this.select.value = String(this.currentValue);
        }
    }
    
    /**
     * Set current value
     * @param {string|number} value - Value to set
     */
    setValue(value) {
        this.currentValue = value;
        if (this.select) {
            this.select.value = String(value || '');
        }
    }
    
    /**
     * Get current value
     * @returns {string} Current value
     */
    getValue() {
        return this.select ? this.select.value : this.currentValue;
    }
    
    /**
     * Get selected option object
     * @returns {Object|null} Selected option object
     */
    getSelectedOption() {
        const value = this.getValue();
        if (!value) return null;
        return this.options.find(opt => {
            const optValue = this.valueMapper ? this.valueMapper(opt) : (opt.id != null ? String(opt.id) : (opt.name || opt.display_name || ''));
            return String(optValue) === String(value);
        }) || null;
    }
    
    /**
     * Clear selection
     */
    clear() {
        this.setValue('');
        this.currentValue = null;
    }
    
    /**
     * Enable/disable dropdown
     * @param {boolean} enabled - Whether to enable
     */
    setEnabled(enabled) {
        if (this.select) {
            this.select.disabled = !enabled;
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Dropdown = Dropdown;
}












































