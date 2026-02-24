/**
 * Universal Password Validator
 * Provides password validation functionality for register and account pages
 * 
 * Requirements:
 * - 5-12 characters
 * - At least one uppercase letter
 * - At least one number
 */

const PasswordValidator = {
    /**
     * Validate password against requirements
     * @param {string} password - Password to validate
     * @returns {Object} - Validation result with checks and isValid flag
     */
    validate: function(password) {
        const checks = {
            length: password.length >= 5 && password.length <= 12,
            uppercase: /[A-Z]/.test(password),
            number: /\d/.test(password)
        };
        
        checks.isValid = checks.length && checks.uppercase && checks.number;
        
        return checks;
    },
    
    /**
     * Get validation error message
     * @param {Object} checks - Validation checks object
     * @returns {string|null} - Error message or null if valid
     */
    getErrorMessage: function(checks) {
        if (!checks.length) {
            return 'Password must be between 5 and 12 characters';
        }
        if (!checks.uppercase) {
            return 'Password must contain at least one uppercase letter';
        }
        if (!checks.number) {
            return 'Password must contain at least one number';
        }
        return null;
    },
    
    /**
     * Update visual indicators in password requirements tooltip
     * @param {string} passwordInputId - ID of the password input field
     * @param {string} requirementsId - ID of the requirements container (optional)
     */
    updateIndicators: function(passwordInputId, requirementsId = null) {
        const passwordInput = document.getElementById(passwordInputId);
        if (!passwordInput) return;
        
        const password = passwordInput.value;
        const checks = this.validate(password);
        
        // Update indicators if requirements container exists
        if (requirementsId) {
            const lengthEl = document.getElementById('length');
            const uppercaseEl = document.getElementById('uppercase');
            const numberEl = document.getElementById('number');
            
            if (lengthEl) {
                const dot = lengthEl.querySelector('span');
                if (dot) {
                    dot.style.background = checks.length ? '#28a745' : '#dc3545';
                }
            }
            
            if (uppercaseEl) {
                const dot = uppercaseEl.querySelector('span');
                if (dot) {
                    dot.style.background = checks.uppercase ? '#28a745' : '#dc3545';
                }
            }
            
            if (numberEl) {
                const dot = numberEl.querySelector('span');
                if (dot) {
                    dot.style.background = checks.number ? '#28a745' : '#dc3545';
                }
            }
        }
        
        // Also update class-based indicators (for register.html style)
        ['length', 'uppercase', 'number'].forEach(check => {
            const element = document.getElementById(check);
            if (element) {
                if (checks[check]) {
                    element.classList.add('valid');
                    element.classList.remove('invalid');
                } else {
                    element.classList.add('invalid');
                    element.classList.remove('valid');
                }
            }
        });
        
        return checks;
    },
    
    /**
     * Toggle password requirements tooltip visibility
     * @param {Event} event - Click event
     * @param {string} requirementsId - ID of the requirements container
     */
    toggleRequirements: function(event, requirementsId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const requirements = document.getElementById(requirementsId);
        if (!requirements) return;
        
        const isVisible = requirements.style.display !== 'none';
        requirements.style.display = isVisible ? 'none' : 'block';
        
        // Update indicators when showing
        if (!isVisible) {
            // Find the associated password input
            const passwordInput = requirements.closest('form')?.querySelector('input[type="password"][id*="password"]') ||
                                 document.querySelector('input[type="password"][id*="password"]:not([id*="confirm"])');
            
            if (passwordInput) {
                this.updateIndicators(passwordInput.id, requirementsId);
            }
        }
    },
    
    /**
     * Initialize password validation for an input field
     * @param {Object} options - Configuration options
     * @param {string} options.passwordInputId - ID of the password input field
     * @param {string} options.requirementsId - ID of the requirements tooltip container
     * @param {string} options.toggleButtonId - ID of the toggle button (optional)
     */
    init: function(options) {
        const {
            passwordInputId,
            requirementsId = 'passwordRequirements',
            toggleButtonId = null
        } = options;
        
        const passwordInput = document.getElementById(passwordInputId);
        if (!passwordInput) {
            console.warn(`Password input not found: ${passwordInputId}`);
            return;
        }
        
        // Set up real-time validation
        passwordInput.addEventListener('input', () => {
            this.updateIndicators(passwordInputId, requirementsId);
        });
        
        // Set up toggle button if provided
        if (toggleButtonId) {
            const toggleButton = document.getElementById(toggleButtonId);
            if (toggleButton) {
                toggleButton.addEventListener('click', (e) => {
                    this.toggleRequirements(e, requirementsId);
                });
            }
        }
        
        // Close tooltip when clicking outside
        document.addEventListener('click', (event) => {
            const requirements = document.getElementById(requirementsId);
            if (!requirements || requirements.style.display === 'none') return;
            
            const infoIcon = document.getElementById('password-info-icon');
            const clickedInside = requirements.contains(event.target) ||
                                 (infoIcon && (event.target === infoIcon || infoIcon.closest('button')?.contains(event.target)));
            
            if (!clickedInside) {
                requirements.style.display = 'none';
            }
        });
    },
    
    /**
     * Validate password and return error message if invalid
     * @param {string} password - Password to validate
     * @returns {string|null} - Error message or null if valid
     */
    validateWithMessage: function(password) {
        const checks = this.validate(password);
        return this.getErrorMessage(checks);
    }
};

// Make available globally
window.PasswordValidator = PasswordValidator;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PasswordValidator;
}
























