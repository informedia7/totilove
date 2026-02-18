/**
 * FormHandler - Consolidated form submission handler for profile-edit.html
 * Replaces duplicate form submission handlers with a single configurable system
 */

const ID_FIELD_NAMES = [
    'body_type',
    'eye_color',
    'hair_color',
    'ethnicity',
    'religion',
    'education',
    'occupation',
    'income',
    'marital_status',
    'lifestyle',
    'living_situation',
    'smoking',
    'drinking',
    'exercise',
    'body_art',
    'english_ability',
    'relocation',
    'number_of_children',
    'have_children',
    'height_reference_id',
    'weight_reference_id',
    'preferred_body_type',
    'preferred_eye_color',
    'preferred_hair_color',
    'preferred_ethnicity',
    'preferred_religion',
    'preferred_education',
    'preferred_occupation',
    'preferred_income',
    'preferred_marital_status',
    'preferred_lifestyle',
    'preferred_body_art',
    'preferred_english_ability',
    'preferred_smoking',
    'preferred_drinking',
    'preferred_exercise',
    'preferred_number_of_children',
    'preferred_height_reference_id',
    'preferred_weight_reference_id'
];

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
        
        // Handle multi-select fields (only when explicitly provided in config)
        if (Array.isArray(config.interests)) {
            if (config.interests.length > 0) {
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
        }

        if (Array.isArray(config.hobbies)) {
            if (config.hobbies.length > 0) {
                const hobbyIds = config.hobbies
                    .map(h => (h.id != null ? h.id : h.value || h.name))
                    .filter(Boolean);
                payload.hobbies = hobbyIds;
            } else {
                payload.hobbies = [];
            }
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

        /**
         * Unified helper to handle number of children field value
         * @param {string} selectId - ID of the number of children select element
         * @param {string} containerId - ID of the container element
         * @param {string} fieldName - Field name in payload (e.g., 'number_of_children' or 'preferred_number_of_children')
         */
        const handleNumberOfChildrenField = (selectId, containerId, fieldName) => {
            const container = document.getElementById(containerId);
            const select = document.getElementById(selectId);
            
            if (container && container.style.display === 'none') {
                // Container is hidden, clear the value
                payload[fieldName] = null;
            } else if (select && select.value) {
                // Container is visible, get value directly from select and convert to number if it's an ID
                const numValue = parseInt(select.value, 10);
                payload[fieldName] = (!isNaN(numValue) && numValue > 0) ? numValue : select.value;
            } else {
                // No value selected, ensure it's null
                payload[fieldName] = null;
            }
        };

        // Unified handling for both number of children fields
        const numberChildrenFields = [
            { selectId: 'number-of-children', containerId: 'number-of-children-container', fieldName: 'number_of_children' },
            { selectId: 'preferred-number-of-children', containerId: 'preferred-number-of-children-container', fieldName: 'preferred_number_of_children' }
        ];
        
        numberChildrenFields.forEach(field => {
            handleNumberOfChildrenField(field.selectId, field.containerId, field.fieldName);
        });

        // Force select fields to submit numeric IDs when available
        const coerceFieldToId = (fieldName) => {
            if (!Object.prototype.hasOwnProperty.call(payload, fieldName)) {
                return;
            }
            const currentValue = payload[fieldName];
            if (currentValue === undefined || currentValue === null) {
                payload[fieldName] = null;
                return;
            }

            const select = document.querySelector(`[name="${fieldName}"]`);
            let resolvedValue = null;

            if (select) {
                const selectedOption = select.selectedOptions && select.selectedOptions[0];
                if (selectedOption?.dataset?.itemId) {
                    resolvedValue = selectedOption.dataset.itemId;
                } else if (selectedOption?.value && /^-?\d+$/.test(selectedOption.value.trim())) {
                    resolvedValue = selectedOption.value.trim();
                }
            }

            if (resolvedValue === null && typeof currentValue === 'string' && currentValue.trim() !== '' && /^-?\d+$/.test(currentValue.trim())) {
                resolvedValue = currentValue.trim();
            }

            if (resolvedValue === null) {
                delete payload[fieldName];
            } else {
                payload[fieldName] = Number(resolvedValue);
            }
        };

        ID_FIELD_NAMES.forEach(coerceFieldToId);

        // Handle other conditional fields (clear if containers are hidden)
        if (config.clearHiddenFields) {
            config.clearHiddenFields.forEach(field => {
                const container = document.getElementById(field.containerId);
                if (container && container.style.display === 'none') {
                    payload[field.fieldName] = null;
                }
                // For other fields, FormData already has the correct value
            });
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
        if (ageMinInput && ageMaxInput && window.AgeValidation) {
            const ageMin = ageMinInput.value ? parseInt(ageMinInput.value) : null;
            const ageMax = ageMaxInput.value ? parseInt(ageMaxInput.value) : null;
            const validation = AgeValidation.validateAgeRange(ageMin, ageMax);
            if (!validation.valid) {
                validationErrors.push(...validation.errors);
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

