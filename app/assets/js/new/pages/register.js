/**
 * Register Page JavaScript
 * Extracted from register.html - Phase 1 CSS/JS Extraction
 */

// Custom Notification System
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const icon = type === 'success' ? 'fas fa-check-circle' : 
                type === 'error' ? 'fas fa-exclamation-circle' : 
                type === 'warning' ? 'fas fa-exclamation-triangle' : 
                'fas fa-info-circle';
    
    notification.innerHTML = `
        <div class="notification-content">
            <i class="${icon}"></i>
            <span class="notification-message">${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add to notification container
    const container = document.getElementById('notificationContainer');
    container.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
    
    // Add entrance animation
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
}

// Password visibility toggle function
function togglePasswordVisibility(inputId, eyeId) {
    const passwordInput = document.getElementById(inputId);
    const passwordEye = document.getElementById(eyeId);
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        passwordEye.className = 'fas fa-eye-slash';
    } else {
        passwordInput.type = 'password';
        passwordEye.className = 'fas fa-eye';
    }
}

let countries = [];
let emailCheckTimer = null;

// Initialize form
document.addEventListener('DOMContentLoaded', function() {
    loadCountries();
    setupEventListeners();
    setDateLimits();
    
    // Initialize password validator
    PasswordValidator.init({
        passwordInputId: 'password',
        requirementsId: 'passwordRequirements'
    });
});

// Wrapper function for inline onclick
function togglePasswordRequirements(event) {
    PasswordValidator.toggleRequirements(event, 'passwordRequirements');
}

// Toggle gender info tooltip
function toggleGenderInfo(event) {
    const genderInfo = document.getElementById('genderInfo');
    if (!genderInfo) return;
    
    const isVisible = genderInfo.classList.contains('show');
    if (isVisible) {
        genderInfo.classList.remove('show');
    } else {
        genderInfo.classList.add('show');
        // Close when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closeTooltip(e) {
                if (!genderInfo.contains(e.target) && e.target !== event.target) {
                    genderInfo.classList.remove('show');
                    document.removeEventListener('click', closeTooltip);
                }
            });
        }, 10);
    }
}

function setupEventListeners() {
    // Password info button - toggle password requirements tooltip
    const passwordInfoBtn = document.getElementById('password-info-btn');
    if (passwordInfoBtn) {
        passwordInfoBtn.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            togglePasswordRequirements(event);
        });
    }
    
    // Password toggle button - show/hide password
    const passwordToggleBtn = document.getElementById('password-toggle-btn');
    if (passwordToggleBtn) {
        passwordToggleBtn.addEventListener('click', function(event) {
            event.preventDefault();
            togglePasswordVisibility('password', 'password-eye');
        });
    }
    
    // Confirm password toggle button - show/hide confirm password
    const confirmPasswordToggleBtn = document.getElementById('confirm-password-toggle-btn');
    if (confirmPasswordToggleBtn) {
        confirmPasswordToggleBtn.addEventListener('click', function(event) {
            event.preventDefault();
            togglePasswordVisibility('confirm-password', 'confirm-password-eye');
        });
    }
    
    // Gender info button - toggle gender info tooltip
    const genderInfoBtn = document.getElementById('gender-info-btn');
    if (genderInfoBtn) {
        genderInfoBtn.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            toggleGenderInfo(event);
        });
    }
    
    // Name validation
    const realNameField = document.getElementById('real-name');
    if (realNameField) {
        // Prevent non-letter characters from being entered and capitalize first letter
        realNameField.addEventListener('input', function(e) {
            // Remove any non-letter characters
            const originalValue = this.value;
            const filteredValue = originalValue.replace(/[^a-zA-Z]/g, '');
            
            let finalValue = filteredValue;
            // Capitalize first letter if there's any text (keep rest as typed)
            if (finalValue.length > 0) {
                finalValue = finalValue.charAt(0).toUpperCase() + finalValue.slice(1);
            }
            
            if (originalValue !== finalValue) {
                const cursorPos = this.selectionStart;
                this.value = finalValue;
                // Restore cursor position (adjust for removed characters)
                const lengthDiff = originalValue.length - finalValue.length;
                const newPos = Math.max(0, cursorPos - lengthDiff);
                this.setSelectionRange(newPos, newPos);
            }
            
            validateRealName();
        });
        
        // Also prevent paste of non-letter characters and capitalize first letter
        realNameField.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            let filteredText = pastedText.replace(/[^a-zA-Z]/g, '');
            const start = this.selectionStart;
            const end = this.selectionEnd;
            const currentValue = this.value;
            const newValue = currentValue.substring(0, start) + filteredText + currentValue.substring(end);
            // Capitalize first letter of the entire value (keep rest as typed)
            const finalValue = newValue.length > 0 ? newValue.charAt(0).toUpperCase() + newValue.slice(1) : newValue;
            this.value = finalValue;
            this.setSelectionRange(start + filteredText.length, start + filteredText.length);
            validateRealName();
        });
        
        // Prevent typing non-letter characters
        realNameField.addEventListener('keypress', function(e) {
            const char = String.fromCharCode(e.which || e.keyCode);
            if (!/^[a-zA-Z]$/.test(char)) {
                e.preventDefault();
            }
        });
    }
    
    // Email validation with real-time checking
    document.getElementById('email').addEventListener('input', function() {
        clearTimeout(emailCheckTimer);
        emailCheckTimer = setTimeout(() => checkEmailAvailability(), 500);
        validateEmail();
    });
    
    // Password validation
    document.getElementById('password').addEventListener('input', function() {
        PasswordValidator.updateIndicators('password', 'passwordRequirements');
        validatePasswordMatch();
    });
    
    // Confirm password validation
    document.getElementById('confirm-password').addEventListener('input', validatePasswordMatch);
    
    // Country/State/City cascading
    document.getElementById('country').addEventListener('change', onCountryChange);
    document.getElementById('state').addEventListener('change', onStateChange);
    
    // Form submission
    document.getElementById('registerForm').addEventListener('submit', onFormSubmit);
    
    // Age validation using AgeValidation
    AgeValidation.initNumberInputs('age_min', 'age_max');
}

async function loadCountries() {
    try {
        const response = await fetch('/api/countries');
        const data = await response.json();
        
        if (data.success) {
            countries = data.countries;
            populateCountrySelects();
        } else {
            console.error('Failed to load countries:', data.error);
            showError('country', 'Failed to load countries');
        }
    } catch (error) {
        console.error('Error loading countries:', error);
        showError('country', 'Failed to load countries');
    }
}

function populateCountrySelects() {
    const countrySelect = document.getElementById('country');

    // Clear existing options
    countrySelect.innerHTML = '<option value="">Select Country</option>';

    countries.forEach(country => {
        const option1 = new Option(country.name, country.id);
        countrySelect.add(option1);
    });
}

async function onCountryChange() {
    const countryId = document.getElementById('country').value;
    const stateSelect = document.getElementById('state');
    const citySelect = document.getElementById('city');
    const stateContainer = document.getElementById('state-container');
    const cityContainer = document.getElementById('city-container');

    console.log('🌍 Country changed to:', countryId);

    // Clear state and city
    stateSelect.innerHTML = '<option value="">Select State First</option>';
    citySelect.innerHTML = '<option value="">Select City First</option>';
    stateContainer.style.display = 'none';
    cityContainer.style.display = 'none';

    if (countryId) {
        try {
            console.log('🔄 Loading states for country:', countryId);
            stateSelect.innerHTML = '<option value="">Loading states...</option>';
            const response = await fetch(`/api/states?country_id=${countryId}`);
            const data = await response.json();

            console.log('📡 States API response:', data);

            if (data.success && data.states.length > 0) {
                stateSelect.innerHTML = '<option value="">Select State</option>';
                data.states.forEach(state => {
                    stateSelect.add(new Option(state.name, state.id));
                });
                stateContainer.style.display = 'block';
                console.log('✅ States loaded successfully, showing state container');
            } else {
                stateSelect.innerHTML = '<option value="">No states available</option>';
                console.log('⚠️ No states found for country:', countryId);
            }
        } catch (error) {
            console.error('❌ Error loading states:', error);
            stateSelect.innerHTML = '<option value="">Error loading states</option>';
        }
    }
}

async function onStateChange() {
    const stateId = document.getElementById('state').value;
    const citySelect = document.getElementById('city');
    const cityContainer = document.getElementById('city-container');

    citySelect.innerHTML = '<option value="">Select City First</option>';
    cityContainer.style.display = 'none';

    if (stateId) {
        try {
            citySelect.innerHTML = '<option value="">Loading cities...</option>';
            const response = await fetch(`/api/cities?state_id=${stateId}`);
            const data = await response.json();

            if (data.success && data.cities.length > 0) {
                citySelect.innerHTML = '<option value="">Select City</option>';
                data.cities.forEach(city => {
                    citySelect.add(new Option(city.name, city.id));
                });
                cityContainer.style.display = 'block';
            } else {
                citySelect.innerHTML = '<option value="">No cities available</option>';
            }
        } catch (error) {
            console.error('Error loading cities:', error);
            citySelect.innerHTML = '<option value="">Error loading cities</option>';
        }
    }
}

async function checkEmailAvailability() {
    const email = document.getElementById('email').value;
    const emailField = document.getElementById('email');
    const errorEl = document.getElementById('email-error');
    const successEl = document.getElementById('email-success');
    
    if (!email || !email.includes('@')) return;
    
    try {
        const response = await fetch(`/api/check-email?email=${encodeURIComponent(email)}`);
        const data = await response.json();
        
        if (data.success) {
            if (data.available) {
                emailField.classList.remove('error');
                emailField.classList.add('success');
                errorEl.textContent = '';
                successEl.textContent = 'Email is available!';
            } else {
                emailField.classList.remove('success');
                emailField.classList.add('error');
                successEl.textContent = '';
                errorEl.textContent = 'Email is already registered';
            }
        }
    } catch (error) {
        console.error('Error checking email:', error);
    }
}

function validateRealName() {
    const realName = document.getElementById('real-name').value.trim();
    const realNameField = document.getElementById('real-name');
    const errorEl = document.getElementById('real-name-error');
    
    if (realName.length === 0) {
        realNameField.classList.remove('error', 'success');
        errorEl.textContent = '';
        return;
    }
    
    if (realName.length < 2 || realName.length > 100) {
        realNameField.classList.add('error');
        realNameField.classList.remove('success');
        errorEl.textContent = 'Name must be between 2 and 100 characters';
    } else if (!/^[a-zA-Z]{2,100}$/.test(realName)) {
        realNameField.classList.add('error');
        realNameField.classList.remove('success');
        errorEl.textContent = 'Name can only contain letters';
    } else {
        realNameField.classList.remove('error');
        realNameField.classList.add('success');
        errorEl.textContent = '';
    }
}

function validateEmail() {
    const email = document.getElementById('email').value;
    const emailField = document.getElementById('email');
    const errorEl = document.getElementById('email-error');
    
    if (email.length === 0) {
        emailField.classList.remove('error', 'success');
        errorEl.textContent = '';
        return;
    }
    
    if (email.length > 25 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailField.classList.add('error');
        emailField.classList.remove('success');
        errorEl.textContent = 'Please enter a valid email (max 25 characters)';
    } else {
        emailField.classList.remove('error');
        errorEl.textContent = '';
    }
}

function validatePassword() {
    return PasswordValidator.updateIndicators('password', 'passwordRequirements');
}

function validatePasswordMatch() {
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const confirmPasswordField = document.getElementById('confirm-password');
    const errorEl = document.getElementById('confirm-password-error');
    
    if (confirmPassword.length === 0) {
        confirmPasswordField.classList.remove('error', 'success');
        errorEl.textContent = '';
        return;
    }
    
    if (password !== confirmPassword) {
        confirmPasswordField.classList.add('error');
        confirmPasswordField.classList.remove('success');
        errorEl.textContent = 'Passwords do not match';
    } else {
        confirmPasswordField.classList.remove('error');
        confirmPasswordField.classList.add('success');
        errorEl.textContent = '';
    }
}

function validateAgeRange(minAge, maxAge, validation) {
    // Clear previous errors
    clearError('age_min');
    clearError('age_max');

    // Use AgeHandler validation result
    if (!validation.valid) {
        if (validation.errors.some(e => e.includes('minimum'))) {
            showError('age_min', validation.errors.find(e => e.includes('minimum')));
        }
        if (validation.errors.some(e => e.includes('maximum'))) {
            showError('age_max', validation.errors.find(e => e.includes('maximum')));
        }
        return false;
    }

    return true;
}

function setDateLimits() {
    const birthdateInput = document.getElementById('birthdate');
    const today = new Date();
    const maxDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const minDate = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
    
    birthdateInput.max = maxDate.toISOString().split('T')[0];
    birthdateInput.min = minDate.toISOString().split('T')[0];
}

async function onFormSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-btn');
    const originalText = submitBtn.textContent;
    
    // Disable submit button and show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Creating Account...';
    
    try {
        if (!validateForm()) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            return;
        }
        
        const formData = new FormData(document.getElementById('registerForm'));
        const data = Object.fromEntries(formData);
        
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Check if email verification is required
            if (result.requiresEmailVerification) {
                // Show email verification message
                const emailVerificationHTML = `
                    <div style="max-width: 600px; margin: 50px auto; padding: 30px; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 20px;">📧</div>
                        <h2 style="color: #667eea; margin-bottom: 15px;">Check Your Email!</h2>
                        <p style="color: #666; margin-bottom: 20px; line-height: 1.6;">
                            We've sent a verification email to <strong>${result.user.email}</strong>. 
                            Please click the link in the email to verify your account.
                        </p>
                        <p style="color: #667eea; font-size: 14px; margin-bottom: 15px; font-weight: 500;">
                            💡 You can log in and explore the app now. Email verification helps secure your account.
                        </p>
                        <p style="color: #999; font-size: 14px; margin-bottom: 30px;">
                            Didn't receive the email? Check your spam folder or click the button below to resend.
                        </p>
                        <button id="resendVerificationBtn" style="padding: 12px 30px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-right: 10px;">
                            Resend Verification Email
                        </button>
                        <a href="/login" style="display: inline-block; padding: 12px 30px; background: #f0f0f0; color: #333; text-decoration: none; border-radius: 5px; font-size: 16px;">
                            Go to Login
                        </a>
                    </div>
                `;
                
                // Replace form with verification message
                document.getElementById('registerForm').parentElement.innerHTML = emailVerificationHTML;
                
                // Add resend verification handler
                document.getElementById('resendVerificationBtn').addEventListener('click', async function() {
                    const btn = this;
                    const originalText = btn.textContent;
                    btn.disabled = true;
                    btn.textContent = 'Sending...';
                    
                    try {
                        const resendResponse = await fetch('/api/resend-verification', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ email: result.user.email })
                        });
                        
                        const resendResult = await resendResponse.json();
                        
                        if (resendResult.success) {
                            showNotification('Verification email sent! Please check your inbox.', 'success');
                        } else {
                            showNotification('Failed to resend email: ' + (resendResult.error || 'Unknown error'), 'error');
                        }
                    } catch (error) {
                        console.error('Resend verification error:', error);
                        showNotification('Failed to resend email. Please try again later.', 'error');
                    } finally {
                        btn.disabled = false;
                        btn.textContent = originalText;
                    }
                });
                
                showNotification('Registration successful! Please check your email to verify your account.', 'success');
            } else {
                // Old behavior - auto-login (for backward compatibility)
                if (window.sessionManager) {
                    if (result.sessionToken) {
                        window.sessionManager.setToken(result.sessionToken, 60);
                    }
                    if (result.user) {
                        window.sessionManager.setCurrentUser(result.user);
                    }
                }
                
                showNotification('Registration successful! Welcome to Totilove!', 'success');
                setTimeout(() => {
                    window.location.href = '/profile-full?token=' + encodeURIComponent(result.sessionToken);
                }, 1500);
            }
        } else {
            if (result.errors) {
                result.errors.forEach(error => {
                    console.error('Registration error:', error);
                });
                showNotification('Registration failed: ' + result.errors.join(', '), 'error');
            } else {
                showNotification('Registration failed: ' + (result.error || 'Unknown error'), 'error');
            }
        }
    } catch (error) {
        console.error('Registration error:', error);
        showNotification('Registration failed. Please try again.', 'error');
    } finally {
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

function validateForm() {
    let isValid = true;
    
    // Clear all errors
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
    document.querySelectorAll('input, select').forEach(el => el.classList.remove('error'));
    
    // Check all required fields
    const requiredFields = ['real-name', 'email', 'password', 'confirm-password', 'birthdate', 'gender', 'country', 'preferred_gender'];
    requiredFields.forEach(field => {
        const fieldElement = document.getElementById(field);
        if (!fieldElement) {
            console.warn('Field not found:', field);
            return; // Skip this field
        }
        
        // Get the value - handle both inputs and selects
        const value = fieldElement.value;
        const fieldType = fieldElement.tagName;
        
        // Check if field is empty
        // For selects: empty string means no selection
        // For inputs: empty string or whitespace means empty
        let isEmpty = false;
        
        if (fieldType === 'SELECT') {
            // For select elements, check if value is empty string
            // Don't check selectedIndex because first option might be valid
            // Just check if the value itself is empty
            isEmpty = !value || value === '' || value === null || value === undefined;
        } else {
            // For input elements, check if value exists and is not just whitespace
            isEmpty = !value || (typeof value === 'string' && value.trim() === '');
        }
        
        if (isEmpty) {
            showError(field, 'This field is required');
            isValid = false;
        } else {
            // Field has a value, do additional validation if needed
            if (field === 'birthdate') {
                // Check if birthdate is valid date
                const birthdate = new Date(value);
                if (isNaN(birthdate.getTime())) {
                    showError(field, 'Please enter a valid birthdate');
                    isValid = false;
                }
            }
        }
    });
    
    // Validate password match and requirements
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    if (password && confirmPassword && password !== confirmPassword) {
        showError('confirm-password', 'Passwords do not match');
        isValid = false;
    }
    
    // Validate password requirements
    if (password) {
        const passwordError = PasswordValidator.validateWithMessage(password);
        if (passwordError) {
            showError('password', passwordError);
            isValid = false;
        }
    }
    
    // Validate birthdate age
    const birthdate = document.getElementById('birthdate').value;
    if (birthdate) {
        const age = calculateAge(new Date(birthdate));
        if (age < 18) {
            showError('birthdate', 'You must be at least 18 years old');
            isValid = false;
        }
    }
    
    // Validate age preferences using AgeHandler
    const minAgeInput = document.getElementById('age_min');
    const maxAgeInput = document.getElementById('age_max');
    const minAge = minAgeInput.value ? parseInt(minAgeInput.value) : null;
    const maxAge = maxAgeInput.value ? parseInt(maxAgeInput.value) : null;
    
    const validation = AgeValidation.validateAgeRange(minAge, maxAge);
    if (!validation.valid) {
        if (validation.errors.some(e => e.includes('minimum'))) {
            showError('age_min', validation.errors.find(e => e.includes('minimum')));
        }
        if (validation.errors.some(e => e.includes('maximum'))) {
            showError('age_max', validation.errors.find(e => e.includes('maximum')));
        }
        isValid = false;
    }
    
    return isValid;
}

function showError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorEl = document.getElementById(fieldId + '-error');
    
    if (field) field.classList.add('error');
    if (errorEl) errorEl.textContent = message;
}

function clearError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorEl = document.getElementById(fieldId + '-error');
    
    if (field) field.classList.remove('error');
    if (errorEl) errorEl.textContent = '';
}

function calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

// Make functions available globally for backward compatibility (if any inline handlers remain)
window.togglePasswordVisibility = togglePasswordVisibility;
window.togglePasswordRequirements = togglePasswordRequirements;
window.toggleGenderInfo = toggleGenderInfo;


