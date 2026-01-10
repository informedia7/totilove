/**
 * FormHandler - Consolidated form submission handler for profile-edit.html
 * Replaces duplicate form submission handlers with a single configurable system
 */

class FormHandler {
    constructor() {
        this.notificationFunction = null;
    }

    /**
     * Set the notification function to use for showing messages
     * @param {Function} fn - Function that accepts (message, type)
     */
    setNotificationFunction(fn) {
        this.notificationFunction = fn;
    }

    /**
     * Show a notification
     * @param {string} message - Message to display
     * @param {string} type - 'success', 'error', or 'info'
     */
    showNotification(message, type = 'info') {
        if (this.notificationFunction) {
            this.notificationFunction(message, type);
        }
    }

    /**
     * Sanitize textarea content
     * @param {HTMLTextAreaElement} textarea - Textarea element to sanitize
     */
    sanitizeTextarea(textarea) {
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
     * Process form data before submission
     * @param {Object} formData - Form data object
     * @param {Object} config - Configuration for data processing
     * @returns {Object} Processed payload
     */
    processFormData(formData, config = {}) {
        const { sessionToken, ...payload } = formData;
        
        // Handle multi-select fields
        if (config.interests && config.interests.length > 0) {
            const ids = config.interests
                .map(i => (i.id != null ? i.id : i.value || i.name))
                .filter(Boolean);
            payload.interest_categories = ids;
            
            const primaryInterest = config.interests[0];
            const primaryId = primaryInterest?.id != null ? primaryInterest.id : null;
            payload.interest_category = primaryId || primaryInterest?.name || primaryInterest?.value || null;
        } else {
            payload.interest_category = null;
            payload.interest_categories = [];
        }

        if (config.hobbies && config.hobbies.length > 0) {
            const hobbyIds = config.hobbies
                .map(h => (h.id != null ? h.id : h.value || h.name))
                .filter(Boolean);
            payload.hobbies = hobbyIds;
        } else {
            payload.hobbies = [];
        }

        // Languages are handled separately via /api/profile/languages endpoint
        // Don't include languages in the main profile update payload
        // Languages will be saved separately when the languages modal/form is saved

        // Handle preferred countries
        if (config.preferredCountries) {
            payload.preferred_countries = config.preferredCountries.map(country => ({
                id: country.id,
                name: country.name,
                emoji: country.emoji
            }));
        }

        // Handle conditional fields (clear if containers are hidden)
        if (config.clearHiddenFields) {
            config.clearHiddenFields.forEach(field => {
                const container = document.getElementById(field.containerId);
                if (container && container.style.display === 'none') {
                    payload[field.fieldName] = null;
                }
            });
        }

        // Handle preferred number of children
        if (config.preferredChildrenSelect) {
            const preferredChildrenSelect = document.getElementById(config.preferredChildrenSelect);
            const preferredNumberChildrenSelect = document.getElementById(config.preferredNumberChildrenSelect);
            
            if (preferredChildrenSelect && preferredChildrenSelect.value === 'Has children') {
                if (preferredNumberChildrenSelect && preferredNumberChildrenSelect.value) {
                    payload.preferred_number_of_children = preferredNumberChildrenSelect.value;
                }
            } else {
                payload.preferred_number_of_children = null;
            }
        }

        // Ensure userId is included
        if (!payload.userId && config.userIdInputSelector) {
            const userIdInput = document.querySelector(config.userIdInputSelector);
            if (userIdInput) {
                payload.userId = userIdInput.value;
            }
        }

        return payload;
    }

    /**
     * Handle form submission
     * @param {Object} config - Configuration object
     * @param {string} config.formId - ID of the form element
     * @param {string} config.submitButtonId - ID of the submit button
     * @param {string} config.apiEndpoint - API endpoint URL
     * @param {string} config.successMessage - Success message to display
     * @param {Array} config.textareaIds - Array of textarea IDs to sanitize
     * @param {Function} config.dataProcessor - Function to process form data before submission
     * @param {Function} config.onSuccess - Optional callback on success
     */
    async handleSubmission(config) {
        const form = document.getElementById(config.formId);
        const submitButton = document.getElementById(config.submitButtonId);
        
        if (!form || !submitButton) {
            console.error('Form or submit button not found');
            return;
        }

        // Validate and sanitize textareas
        if (config.textareaIds) {
            for (const textareaId of config.textareaIds) {
                const textarea = document.getElementById(textareaId);
                if (textarea) {
                    this.sanitizeTextarea(textarea);
                    
                    const maxLength = textarea.getAttribute('maxlength') || 2000;
                    if (textarea.value.trim().length > maxLength) {
                        alert(`Text cannot exceed ${maxLength} characters.`);
                        textarea.focus();
                        return;
                    }
                }
            }
        }

        // Custom validation before HTML5 validation
        const validationErrors = [];
        
        // Validate age range if present
        const ageMinInput = form.querySelector('[name="preferred_age_min"]');
        const ageMaxInput = form.querySelector('[name="preferred_age_max"]');
        if (ageMinInput && ageMaxInput) {
            const ageMin = parseInt(ageMinInput.value);
            const ageMax = parseInt(ageMaxInput.value);
            
            if (ageMinInput.value && ageMaxInput.value) {
                if (isNaN(ageMin) || ageMin < 18 || ageMin > 100) {
                    validationErrors.push('Age minimum must be between 18 and 100');
                }
                if (isNaN(ageMax) || ageMax < 18 || ageMax > 100) {
                    validationErrors.push('Age maximum must be between 18 and 100');
                }
                if (!isNaN(ageMin) && !isNaN(ageMax) && ageMin > ageMax) {
                    validationErrors.push('Age minimum cannot be greater than age maximum');
                }
            } else if (ageMinInput.value && (isNaN(ageMin) || ageMin < 18 || ageMin > 100)) {
                validationErrors.push('Age minimum must be between 18 and 100');
            } else if (ageMaxInput.value && (isNaN(ageMax) || ageMax < 18 || ageMax > 100)) {
                validationErrors.push('Age maximum must be between 18 and 100');
            }
        }
        
        // Show validation errors if any
        if (validationErrors.length > 0) {
            this.showNotification(validationErrors.join('. '), 'error');
            if (ageMinInput && validationErrors.some(e => e.includes('minimum'))) {
                ageMinInput.focus();
            } else if (ageMaxInput && validationErrors.some(e => e.includes('maximum'))) {
                ageMaxInput.focus();
            }
            return;
        }
        
        // Check HTML5 form validation
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Show loading state
        const originalButtonHTML = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            // Get form data
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            // Process form data
            const payload = config.dataProcessor 
                ? config.dataProcessor(data, config)
                : this.processFormData(data, config);

            // Send update request using session manager
            const response = await window.sessionManager.apiRequest(config.apiEndpoint, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            // Handle response
            if (!response.ok) {
                const text = await response.text().catch(() => null);
                try {
                    const errorResult = JSON.parse(text);
                    if (errorResult.error) {
                        throw new Error(errorResult.error);
                    }
                } catch (e) {
                    // Not JSON, use text as is
                }
                throw new Error(text || `Server returned ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                // Check for rate limiting
                if (result.locationLimitReached) {
                    this.showNotification(
                        result.message || 'Location change limit reached. Please wait before changing your location again.',
                        'error'
                    );
                } else if (result.nameLimitReached) {
                    this.showNotification(
                        result.message || 'Name change limit reached. Please wait before changing your name again.',
                        'error'
                    );
                } else {
                    // Update frontend user data
                    if (result.real_name && window.currentUser) {
                        window.currentUser.real_name = result.real_name;
                        
                        // Dispatch event for other components
                        window.dispatchEvent(new CustomEvent('userNameUpdated', { 
                            detail: { newName: result.real_name } 
                        }));
                        
                        // Update navbar if it exists
                        if (window.globalNavbar && typeof window.globalNavbar.updateUserDisplay === 'function') {
                            window.globalNavbar.updateUserDisplay();
                        }
                        
                        // Update profile real_name display
                        const realNameElement = document.getElementById('real_name');
                        if (realNameElement) {
                            realNameElement.textContent = result.real_name;
                        }
                    }
                    
                    // Show success message
                    this.showNotification(config.successMessage || 'Updated successfully!', 'success');
                    
                    // Call success callback if provided
                    if (config.onSuccess) {
                        config.onSuccess(result);
                    }
                }
            } else {
                throw new Error(result.error || 'Failed to update');
            }

        } catch (error) {
            this.showNotification(
                error.message || 'Failed to update. Please try again.',
                'error'
            );
        } finally {
            // Reset button state
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonHTML;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormHandler;
} else {
    window.FormHandler = FormHandler;
}

