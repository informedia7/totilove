/**
 * Form Component
 * 
 * Form handling component extending BaseComponent
 * Provides form validation, sanitization, submission, and error handling
 * 
 * Migration Phase 2: Week 7
 */

import { BaseComponent } from './BaseComponent.js';
import { apiClient } from '../core/api-client.js';
import { escapeHtml } from '../core/utils.js';

export class Form extends BaseComponent {
    /**
     * @param {Object} config - Form configuration
     * @param {HTMLElement|string} config.form - Form element or selector
     * @param {string} config.submitButtonId - ID of submit button
     * @param {string} config.apiEndpoint - API endpoint URL
     * @param {string} config.successMessage - Success message
     * @param {Array<string>} config.textareaIds - Textarea IDs to sanitize
     * @param {Function} config.dataProcessor - Function to process form data
     * @param {Function} config.validator - Custom validation function
     * @param {Function} config.onSuccess - Success callback
     * @param {Function} config.onError - Error callback
     * @param {Function} config.notificationFunction - Function to show notifications
     */
    constructor(config = {}) {
        super({
            container: config.form || document.body,
            autoInit: false
        });
        
        this.form = typeof config.form === 'string' 
            ? document.getElementById(config.form) || document.querySelector(config.form)
            : config.form;
            
        this.submitButtonId = config.submitButtonId;
        this.apiEndpoint = config.apiEndpoint;
        this.successMessage = config.successMessage || 'Saved successfully!';
        this.textareaIds = config.textareaIds || [];
        this.dataProcessor = config.dataProcessor;
        this.validator = config.validator;
        this.onSuccess = config.onSuccess;
        this.onError = config.onError;
        this.notificationFunction = config.notificationFunction;
        
        this.submitButton = null;
        this.originalButtonHTML = null;
        
        this.init();
    }
    
    async onInit() {
        if (!this.form) {
            this.error('Form element not found');
            return;
        }
        
        // Find submit button
        if (this.submitButtonId) {
            this.submitButton = document.getElementById(this.submitButtonId);
        } else {
            this.submitButton = this.form.querySelector('button[type="submit"]');
        }
        
        if (this.submitButton) {
            this.originalButtonHTML = this.submitButton.innerHTML;
        }
        
        // Set up form submission handler
        this.on(this.form, 'submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
    }
    
    /**
     * Sanitize textarea content
     * @param {HTMLTextAreaElement} textarea - Textarea element
     * @returns {string} Sanitized content
     */
    sanitizeTextarea(textarea) {
        if (!textarea) return '';
        
        const originalValue = textarea.value;
        let sanitized = originalValue;
        
        // Remove HTML tags
        sanitized = sanitized.replace(/<[^>]*>/g, '');
        
        // Remove dangerous patterns
        const forbiddenPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe/gi,
            /<object/gi,
            /<embed/gi,
            /<link/gi,
            /<meta/gi,
            /<style/gi,
            /data:text\/html/gi,
            /vbscript:/gi,
            /expression\s*\(/gi
        ];
        
        forbiddenPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '');
        });
        
        // Remove control characters (except newline, tab, carriage return)
        sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
        
        // Allow only: letters, numbers, spaces, newlines, tabs, and basic text punctuation
        const allowed = /^[a-zA-Z0-9\s\n\r\t.,!?:;'\-"()\[\]/]*$/;
        let cleaned = '';
        for (let i = 0; i < sanitized.length; i++) {
            const char = sanitized[i];
            if (allowed.test(char)) {
                cleaned += char;
            }
        }
        
        if (cleaned !== originalValue) {
            const cursorPosition = textarea.selectionStart;
            textarea.value = cleaned;
            const lengthDiff = originalValue.length - cleaned.length;
            const newPosition = Math.max(0, cursorPosition - lengthDiff);
            textarea.setSelectionRange(newPosition, newPosition);
        }
        
        return cleaned;
    }
    
    /**
     * Validate form
     * @returns {Array<string>} Array of validation errors (empty if valid)
     */
    validate() {
        const errors = [];
        
        // Sanitize textareas
        for (const textareaId of this.textareaIds) {
            const textarea = document.getElementById(textareaId);
            if (textarea) {
                this.sanitizeTextarea(textarea);
                
                const maxLength = parseInt(textarea.getAttribute('maxlength') || '2000');
                if (textarea.value.trim().length > maxLength) {
                    errors.push(`Text cannot exceed ${maxLength} characters.`);
                }
            }
        }
        
        // Validate age range if present
        const ageMinInput = this.form.querySelector('[name="preferred_age_min"]');
        const ageMaxInput = this.form.querySelector('[name="preferred_age_max"]');
        if (ageMinInput && ageMaxInput) {
            const ageMin = parseInt(ageMinInput.value);
            const ageMax = parseInt(ageMaxInput.value);
            
            if (ageMinInput.value && ageMaxInput.value) {
                if (isNaN(ageMin) || ageMin < 18 || ageMin > 100) {
                    errors.push('Age minimum must be between 18 and 100');
                }
                if (isNaN(ageMax) || ageMax < 18 || ageMax > 100) {
                    errors.push('Age maximum must be between 18 and 100');
                }
                if (!isNaN(ageMin) && !isNaN(ageMax) && ageMin > ageMax) {
                    errors.push('Age minimum cannot be greater than age maximum');
                }
            } else if (ageMinInput.value && (isNaN(ageMin) || ageMin < 18 || ageMin > 100)) {
                errors.push('Age minimum must be between 18 and 100');
            } else if (ageMaxInput.value && (isNaN(ageMax) || ageMax < 18 || ageMax > 100)) {
                errors.push('Age maximum must be between 18 and 100');
            }
        }
        
        // Custom validator
        if (this.validator) {
            const customErrors = this.validator(this.form);
            if (Array.isArray(customErrors)) {
                errors.push(...customErrors);
            } else if (customErrors) {
                errors.push(customErrors);
            }
        }
        
        // HTML5 validation
        if (!this.form.checkValidity()) {
            this.form.reportValidity();
            return ['Form validation failed'];
        }
        
        return errors;
    }
    
    /**
     * Process form data
     * @param {FormData} formData - Form data
     * @returns {Object} Processed payload
     */
    processFormData(formData) {
        const data = Object.fromEntries(formData.entries());
        
        if (this.dataProcessor) {
            return this.dataProcessor(data, {
                form: this.form,
                textareaIds: this.textareaIds
            });
        }
        
        // Default processing
        const { sessionToken, ...payload } = data;
        return payload;
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
        } else {
            // Fallback to alert
            alert(message);
        }
    }
    
    /**
     * Set loading state
     * @param {boolean} loading - Whether form is loading
     */
    setLoading(loading) {
        if (this.submitButton) {
            this.submitButton.disabled = loading;
            if (loading) {
                this.submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            } else {
                this.submitButton.innerHTML = this.originalButtonHTML || 'Submit';
            }
        }
    }
    
    /**
     * Handle form submission
     */
    async handleSubmit() {
        // Validate
        const errors = this.validate();
        if (errors.length > 0) {
            this.showNotification(errors.join('. '), 'error');
            return;
        }
        
        // Set loading state
        this.setLoading(true);
        
        try {
            // Get form data
            const formData = new FormData(this.form);
            const payload = this.processFormData(formData);
            
            // Submit
            const result = await apiClient.postJson(this.apiEndpoint, payload);
            
            if (result.success) {
                // Handle rate limiting
                if (result.locationLimitReached || result.nameLimitReached) {
                    this.showNotification(
                        result.message || 'Update limit reached. Please wait before trying again.',
                        'error'
                    );
                } else {
                    // Update frontend user data if name changed
                    if (result.real_name && window.currentUser) {
                        window.currentUser.real_name = result.real_name;
                        
                        // Dispatch event
                        window.dispatchEvent(new CustomEvent('userNameUpdated', { 
                            detail: { newName: result.real_name } 
                        }));
                        
                        // Update navbar if available
                        if (window.globalNavbar && typeof window.globalNavbar.updateUserDisplay === 'function') {
                            window.globalNavbar.updateUserDisplay();
                        }
                        
                        // Update display
                        const realNameElement = document.getElementById('real_name');
                        if (realNameElement) {
                            realNameElement.textContent = result.real_name;
                        }
                    }
                    
                    // Show success
                    this.showNotification(this.successMessage, 'success');
                    
                    // Call success callback
                    if (this.onSuccess) {
                        this.onSuccess(result);
                    }
                    
                    // Emit event
                    this.emit('form:success', { result, form: this });
                }
            } else {
                throw new Error(result.error || 'Failed to save');
            }
        } catch (error) {
            this.error('Form submission error:', error);
            this.showNotification(
                error.message || 'Failed to save. Please try again.',
                'error'
            );
            
            if (this.onError) {
                this.onError(error);
            }
            
            this.emit('form:error', { error, form: this });
        } finally {
            this.setLoading(false);
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Form = Form;
}

