/**
 * Profile Edit Initialization - Simplified using new modules
 * Replaces large inline script in profile-edit.html
 */

// Wait for all scripts to load
function initProfileEdit() {
    // Check if required classes are available
    if (typeof DropdownManager === 'undefined') {
        console.error('DropdownManager not found. Make sure DropdownManager.js is loaded before profile-edit-init.js');
        setTimeout(initProfileEdit, 100);
        return;
    }
    if (typeof FormHandler === 'undefined') {
        console.error('FormHandler not found. Make sure FormHandler.js is loaded before profile-edit-init.js');
        setTimeout(initProfileEdit, 100);
        return;
    }
    if (typeof MultiSelectManager === 'undefined') {
        console.error('MultiSelectManager not found. Make sure MultiSelectManager.js is loaded before profile-edit-init.js');
        setTimeout(initProfileEdit, 100);
        return;
    }
    if (typeof FORM_FIELD_CONFIG === 'undefined') {
        console.error('FORM_FIELD_CONFIG not found. Make sure form-config.js is loaded before profile-edit-init.js');
        setTimeout(initProfileEdit, 100);
        return;
    }
    
    // Initialize managers
    const dropdownManager = new DropdownManager();
    const formHandler = new FormHandler();
    
    // Notification function
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
    
    formHandler.setNotificationFunction(showNotification);
    
    // Clear invalid "Not specified" values from number inputs (but skip age inputs - they come from template)
    const numberInputs = document.querySelectorAll('input[type="number"]');
    numberInputs.forEach(input => {
        // Skip age inputs - they are populated directly from template variables
        if (input.id === 'preferred-age-min' || input.id === 'preferred-age-max') {
            return;
        }
        // Clear other number inputs if they have invalid values
        if (input.value === 'Not specified' || input.value === '' || isNaN(input.value)) {
            input.value = '';
        }
    });
    
    // Age inputs are initialized directly from template variables ({{preferredAgeMin}} and {{preferredAgeMax}})
    // The template controller sets these values from user_preferences.age_min and user_preferences.age_max
    // No JavaScript initialization needed - template handles it
    const ageMinInput = document.getElementById('preferred-age-min');
    const ageMaxInput = document.getElementById('preferred-age-max');
    
    // Character counter functions
    function updateCharCounter(textarea, counterElement, countElement) {
        const currentLength = textarea.value.length;
        const maxLength = textarea.getAttribute('maxlength') || 2000;
        
        if (countElement) {
            countElement.textContent = currentLength;
        }
        
        if (counterElement) {
            counterElement.classList.remove('warning', 'error');
            if (currentLength > maxLength * 0.9) {
                counterElement.classList.add('error');
            } else if (currentLength > maxLength * 0.75) {
                counterElement.classList.add('warning');
            }
        }
    }
    
    // Real name validation
    function validateRealName(realNameInput) {
        const realName = realNameInput.value.trim();
        const errorMessage = realNameInput.parentElement.querySelector('.real-name-error');
        
        if (realName.length === 0) {
            if (errorMessage) errorMessage.remove();
            return true;
        }
        
        if (realName.length < 2) {
            if (!errorMessage) {
                const error = document.createElement('div');
                error.className = 'real-name-error';
                error.style.cssText = 'color: #dc3545; font-size: 0.875rem; margin-top: 0.25rem;';
                error.textContent = 'Real name must be at least 2 characters';
                realNameInput.parentElement.appendChild(error);
            } else {
                errorMessage.textContent = 'Real name must be at least 2 characters';
            }
            realNameInput.setCustomValidity('Real name must be at least 2 characters');
            return false;
        }
        
        if (realName.length > 100) {
            if (!errorMessage) {
                const error = document.createElement('div');
                error.className = 'real-name-error';
                error.style.cssText = 'color: #dc3545; font-size: 0.875rem; margin-top: 0.25rem;';
                error.textContent = 'Real name must be 100 characters or less';
                realNameInput.parentElement.appendChild(error);
            } else {
                errorMessage.textContent = 'Real name must be 100 characters or less';
            }
            realNameInput.setCustomValidity('Real name must be 100 characters or less');
            return false;
        }
        
        if (!/^[a-zA-Z]{2,100}$/.test(realName)) {
            if (!errorMessage) {
                const error = document.createElement('div');
                error.className = 'real-name-error';
                error.style.cssText = 'color: #dc3545; font-size: 0.875rem; margin-top: 0.25rem;';
                error.textContent = 'Name can only contain letters';
                realNameInput.parentElement.appendChild(error);
            } else {
                errorMessage.textContent = 'Name can only contain letters';
            }
            realNameInput.setCustomValidity('Name can only contain letters');
            return false;
        }
        
        if (errorMessage) errorMessage.remove();
        realNameInput.setCustomValidity('');
        return true;
    }
    
    // Initialize character counters
    const realNameInput = document.getElementById('real-name');
    const realNameCounter = document.getElementById('real-name-counter');
    const realNameCount = document.getElementById('real-name-count');
    const aboutEditTextarea = document.getElementById('about-edit');
    const partnerPreferencesTextarea = document.getElementById('partner-preferences-edit');
    const aboutEditCounter = document.getElementById('about-edit-counter');
    const partnerPreferencesEditCounter = document.getElementById('partner-preferences-edit-counter');
    const aboutEditCount = document.getElementById('about-edit-count');
    const partnerPreferencesEditCount = document.getElementById('partner-preferences-edit-count');
    
    // Initialize real name field
    if (realNameInput && realNameCounter && realNameCount) {
        updateCharCounter(realNameInput, realNameCounter, realNameCount);
        
        realNameInput.addEventListener('input', function(e) {
            const originalValue = this.value;
            const filteredValue = originalValue.replace(/[^a-zA-Z]/g, '');
            
            let finalValue = filteredValue;
            if (finalValue.length > 0) {
                finalValue = finalValue.charAt(0).toUpperCase() + finalValue.slice(1);
            }
            
            if (originalValue !== finalValue) {
                const cursorPos = this.selectionStart;
                this.value = finalValue;
                const lengthDiff = originalValue.length - finalValue.length;
                const newPos = Math.max(0, cursorPos - lengthDiff);
                this.setSelectionRange(newPos, newPos);
            }
            
            validateRealName(realNameInput);
            updateCharCounter(realNameInput, realNameCounter, realNameCount);
        });
        
        realNameInput.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            let filteredText = pastedText.replace(/[^a-zA-Z]/g, '');
            const start = this.selectionStart;
            const end = this.selectionEnd;
            const currentValue = this.value;
            const newValue = currentValue.substring(0, start) + filteredText + currentValue.substring(end);
            const finalValue = newValue.length > 0 ? newValue.charAt(0).toUpperCase() + newValue.slice(1) : newValue;
            this.value = finalValue;
            this.setSelectionRange(start + filteredText.length, start + filteredText.length);
            validateRealName(realNameInput);
            updateCharCounter(realNameInput, realNameCounter, realNameCount);
        });
        
        realNameInput.addEventListener('keypress', function(e) {
            const char = String.fromCharCode(e.which || e.keyCode);
            if (!/^[a-zA-Z]$/.test(char)) {
                e.preventDefault();
            }
        });
        
        realNameInput.addEventListener('blur', function() {
            validateRealName(realNameInput);
        });
    }
    
    if (aboutEditTextarea && aboutEditCounter && aboutEditCount) {
        formHandler.sanitizeTextarea(aboutEditTextarea);
        updateCharCounter(aboutEditTextarea, aboutEditCounter, aboutEditCount);
        
        aboutEditTextarea.addEventListener('input', function() {
            formHandler.sanitizeTextarea(aboutEditTextarea);
            updateCharCounter(aboutEditTextarea, aboutEditCounter, aboutEditCount);
        });
        
        aboutEditTextarea.addEventListener('paste', function(e) {
            setTimeout(() => {
                formHandler.sanitizeTextarea(aboutEditTextarea);
                updateCharCounter(aboutEditTextarea, aboutEditCounter, aboutEditCount);
            }, 0);
        });
    }
    
    if (partnerPreferencesTextarea && partnerPreferencesEditCounter && partnerPreferencesEditCount) {
        formHandler.sanitizeTextarea(partnerPreferencesTextarea);
        updateCharCounter(partnerPreferencesTextarea, partnerPreferencesEditCounter, partnerPreferencesEditCount);
        
        partnerPreferencesTextarea.addEventListener('input', function() {
            formHandler.sanitizeTextarea(partnerPreferencesTextarea);
            updateCharCounter(partnerPreferencesTextarea, partnerPreferencesEditCounter, partnerPreferencesEditCount);
        });
        
        partnerPreferencesTextarea.addEventListener('paste', function(e) {
            setTimeout(() => {
                formHandler.sanitizeTextarea(partnerPreferencesTextarea);
                updateCharCounter(partnerPreferencesTextarea, partnerPreferencesEditCounter, partnerPreferencesEditCount);
            }, 0);
        });
    }
    
    // Multi-select managers
    let interestsManager, hobbiesManager, preferredCountriesManager, languagesManager;
    let selectedInterests = [], selectedHobbies = [], selectedPreferredCountries = [];
    
    // Helper function to get session token from multiple sources
    // CSRF implementation moves token from URL to cookie, so we need to check both
    function getSessionToken() {
        // Try URL first (in case CSRF hasn't run yet)
        const urlParams = new URLSearchParams(window.location.search);
        let sessionToken = urlParams.get('token');
        
        // If not in URL, try cookie (where CSRF stores it)
        if (!sessionToken) {
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'sessionToken') {
                    sessionToken = value;
                    break;
                }
            }
        }
        
        // Try hidden input field as fallback
        if (!sessionToken) {
            const hiddenTokenInput = document.querySelector('input[name="sessionToken"]');
            if (hiddenTokenInput && hiddenTokenInput.value) {
                sessionToken = hiddenTokenInput.value;
            }
        }
        
        // Try global getSessionToken function if available
        if (!sessionToken && typeof window.getSessionToken === 'function') {
            sessionToken = window.getSessionToken();
        }
        
        return sessionToken;
    }
    
    // Load lookup data
    async function loadLookupData() {
        try {
            // Check if required classes are available
            if (typeof DropdownManager === 'undefined') {
                throw new Error('DropdownManager class not found. Please check script loading order.');
            }
            if (typeof FORM_FIELD_CONFIG === 'undefined') {
                throw new Error('FORM_FIELD_CONFIG not found. Please check script loading order.');
            }
            
            const sessionToken = getSessionToken();
            
            if (!sessionToken) {
                throw new Error('No session token found');
            }
            
            const fetchUrl = `/api/profile/lookup-data?sessionToken=${sessionToken}`;
            const response = await fetch(fetchUrl);
            
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result && result.success) {
                const data = result.data || {};
                
                // Set languages data for LanguagesModalManager
                if (window.LanguagesModalManager) {
                    window.LanguagesModalManager.languagesData = {
                        languages: data.languages || [],
                        fluencyLevels: data.fluencyLevels || []
                    };
                }
                
                // Initialize languages manager using LanguageMultiSelectManager
                if (data.languages && typeof LanguageMultiSelectManager !== 'undefined') {
                    languagesManager = new LanguageMultiSelectManager({
                        languagesData: data.languages || [],
                        userLanguages: [],
                        maxSelections: 10,
                        selectId: 'languages-select',
                        containerId: 'selected-languages',
                        countSpanId: 'selected-languages-count'
                    });
                    languagesManager.setNotificationFunction(showNotification);
                    languagesManager.loadItems(data.languages || []);
                    
                    // Make manager globally available
                    window.languagesManager = languagesManager;
                    window.removeLanguage = (value) => languagesManager.removeLanguage(value);
                    
                    // Sync with LanguagesModalManager when languages are loaded/updated
                    if (window.LanguagesModalManager) {
                        // Override updateCurrentLanguagesDisplay to use our manager
                        const originalUpdate = window.LanguagesModalManager.updateCurrentLanguagesDisplay;
                        window.LanguagesModalManager.updateCurrentLanguagesDisplay = function() {
                            // Update our manager's user languages
                            if (window.languagesManager) {
                                window.languagesManager.setUserLanguages(this.userLanguages);
                            }
                            // Also call original if needed
                            if (originalUpdate) {
                                originalUpdate.call(this);
                            }
                        };
                        
                        // Override saveLanguages to sync with our manager
                        const originalSave = window.LanguagesModalManager.saveLanguages;
                        window.LanguagesModalManager.saveLanguages = async function() {
                            const result = await originalSave.call(this);
                            // Sync after save
                            if (window.languagesManager && result) {
                                window.languagesManager.setUserLanguages(this.userLanguages);
                            }
                            return result;
                        };
                    }
                }
                
                // Populate all dropdowns using DropdownManager and config
                try {
                    if (FORM_FIELD_CONFIG && FORM_FIELD_CONFIG.aboutMe) {
                        dropdownManager.populateAllDropdowns(data, FORM_FIELD_CONFIG.aboutMe);
                    }
                } catch (error) {
                    console.error('Error populating About Me dropdowns:', error);
                    showNotification('Error loading some form fields. Please refresh the page.', 'error');
                }
                
                try {
                    if (FORM_FIELD_CONFIG && FORM_FIELD_CONFIG.preferences) {
                        dropdownManager.populateAllDropdowns(data, FORM_FIELD_CONFIG.preferences);
                    }
                } catch (error) {
                    console.error('Error populating Preferences dropdowns:', error);
                    showNotification('Error loading some preference fields. Please refresh the page.', 'error');
                }
                
                // Initialize multi-select managers
                if (data.interestCategories || data.interests) {
                    const interests = data.interestCategories || data.interests || [];
                    interestsManager = new MultiSelectManager({
                        selectId: 'interests-edit',
                        containerId: 'selected-interests',
                        countSpanId: 'selected-interests-count',
                        maxSelections: 10,
                        badgeStyle: 'background: #e3f2fd; color: #1976d2; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;',
                        removeFunctionName: 'removeInterest'
                    });
                    interestsManager.setNotificationFunction(showNotification);
                    interestsManager.loadItems(interests, (item) => {
                        return item.icon ? `${item.icon} ${item.name}` : item.name;
                    });
                    
                    // Load current selections
                    const currentInterestCategory = document.getElementById('current-interest-category')?.value?.trim() || '';
                    if (currentInterestCategory) {
                        const currentInterests = currentInterestCategory.split(',').map(s => s.trim()).filter(s => s);
                        const selected = interests.filter(i => 
                            currentInterests.some(ci => 
                                (i.name && i.name.toLowerCase() === ci.toLowerCase()) || 
                                (i.value && i.value.toLowerCase() === ci.toLowerCase())
                            )
                        );
                        interestsManager.loadSelectedItems(selected);
                        selectedInterests = selected;
                    }
                    window.removeInterest = (value) => interestsManager.removeItem(value);
                }
                
                if (data.hobbies || data.hobbies_reference) {
                    const hobbies = data.hobbies || data.hobbies_reference || [];
                    hobbiesManager = new MultiSelectManager({
                        selectId: 'hobbies-select',
                        containerId: 'selected-hobbies',
                        countSpanId: 'selected-hobbies-count',
                        maxSelections: 10,
                        badgeStyle: 'background: #fff3e0; color: #e65100; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;',
                        removeFunctionName: 'removeHobby'
                    });
                    hobbiesManager.setNotificationFunction(showNotification);
                    hobbiesManager.loadItems(hobbies);
                    
                    // Load current selections
                    const currentHobbies = document.getElementById('current-hobbies')?.value || '';
                    if (currentHobbies) {
                        const hobbyNames = currentHobbies.split(',').map(s => s.trim()).filter(Boolean);
                        const selected = hobbies.filter(h => 
                            hobbyNames.some(hn => 
                                (h.id != null && String(h.id) === hn) ||
                                (h.name && h.name.toLowerCase() === hn.toLowerCase()) || 
                                (h.value && h.value.toLowerCase() === hn.toLowerCase())
                            )
                        );
                        hobbiesManager.loadSelectedItems(selected);
                        selectedHobbies = selected;
                    }
                    window.removeHobby = (value) => hobbiesManager.removeItem(value);
                }
                
                // Preferred countries
                if (data.countries) {
                    const allCountries = data.countries.map(country => ({
                        id: country.id,
                        name: country.name,
                        emoji: country.emoji || ''
                    }));
                    
                    preferredCountriesManager = new MultiSelectManager({
                        selectId: 'preferred-country-select',
                        containerId: 'selected-preferred-countries',
                        countSpanId: 'selected-preferred-countries-count',
                        maxSelections: 10,
                        badgeStyle: 'background: #e3f2fd; color: #1976d2; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;',
                        removeFunctionName: 'removePreferredCountry'
                    });
                    preferredCountriesManager.setNotificationFunction(showNotification);
                    preferredCountriesManager.loadItems(allCountries);
                    
                    // Load current selections
                    selectedPreferredCountries = data.preferred_countries || [];
                    preferredCountriesManager.loadSelectedItems(selectedPreferredCountries);
                    window.removePreferredCountry = (id) => preferredCountriesManager.removeItem(id);
                    window.addPreferredCountry = (id) => preferredCountriesManager.addItem(id);
                }
                
                // Handle special dropdowns (distance - static values)
                // Distance dropdown - static values, handled separately
                try {
                    const preferredDistanceSelect = document.getElementById('preferred-distance');
                    if (preferredDistanceSelect) {
                        const currentPreferredDistance = document.getElementById('current-preferred-distance')?.value?.trim() || '';
                        const distanceOptions = [
                            { value: '', label: 'Select distance' },
                            { value: '0', label: 'Any distance' },
                            { value: '1', label: '1 mile / 2 km' },
                            { value: '5', label: '5 miles / 8 km' },
                            { value: '10', label: '10 miles / 16 km' },
                            { value: '50', label: '50 miles / 80 km' },
                            { value: '100', label: '100 miles / 160 km' },
                            { value: '500', label: '500 miles / 804 km' }
                        ];
                        preferredDistanceSelect.innerHTML = '';
                        distanceOptions.forEach(opt => {
                            const option = document.createElement('option');
                            option.value = opt.value;
                            option.textContent = opt.label;
                            preferredDistanceSelect.appendChild(option);
                        });
                        if (currentPreferredDistance !== '') {
                            const match = distanceOptions.find(opt => opt.value && Number(opt.value) === Number(currentPreferredDistance));
                            if (match) {
                                preferredDistanceSelect.value = match.value;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error populating distance dropdown:', error);
                }
                
                // Relationship type is now handled by DropdownManager via form-config.js
                
                // Populate country dropdown from lookup data
                try {
                    if (data.countries) {
                        const countrySelect = document.getElementById('country');
                        if (countrySelect) {
                            countrySelect.innerHTML = '<option value="">Select Country</option>';
                            data.countries.forEach(country => {
                                const option = new Option(country.name, country.id);
                                countrySelect.add(option);
                            });
                            
                            // Set current country value from hidden input
                            const currentCountryId = document.getElementById('current-country-id')?.value?.trim();
                            if (currentCountryId && currentCountryId !== '' && currentCountryId !== 'undefined' && currentCountryId !== 'null' && !isNaN(currentCountryId)) {
                                countrySelect.value = currentCountryId;
                                // Trigger country change to load states/cities
                                setTimeout(() => {
                                    onCountryChange();
                                }, 100);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error populating country dropdown:', error);
                    showNotification('Error loading countries. Please refresh the page.', 'error');
                }
                
                // Children visibility toggles are handled by initializeChildrenVisibilityToggles() at the end
                
            } else {
                throw new Error(result && result.error ? result.error : 'Failed to load lookup data');
            }
        } catch (error) {
            console.error('Error loading lookup data:', error);
            showNotification(`Failed to load form options: ${error.message}. Please refresh the page.`, 'error');
        }
    }
    
    
    // Geo data handling - Country is now populated from lookup data
    // This function is kept as fallback if lookup data doesn't have countries
    async function populateCountrySelects() {
        try {
            const countrySelect = document.getElementById('country');
            if (!countrySelect || countrySelect.options.length > 1) {
                // Already populated or doesn't exist
                return;
            }
            
            const response = await fetch('/api/countries');
            const data = await response.json();
            
            if (data.success && data.countries) {
                countrySelect.innerHTML = '<option value="">Select Country</option>';
                
                data.countries.forEach(country => {
                    const option = new Option(country.name, country.id);
                    countrySelect.add(option);
                });
                
                // Set current country value from hidden input
                const currentCountryId = document.getElementById('current-country-id')?.value?.trim();
                if (currentCountryId && currentCountryId !== '' && currentCountryId !== 'undefined' && currentCountryId !== 'null' && !isNaN(currentCountryId)) {
                    countrySelect.value = currentCountryId;
                    setTimeout(() => {
                        onCountryChange();
                    }, 100);
                }
            }
        } catch (error) {
            console.error('Error loading countries:', error);
        }
    }
    
    async function onCountryChange() {
        const countryId = document.getElementById('country').value;
        const stateSelect = document.getElementById('state');
        const citySelect = document.getElementById('city');
        const stateContainer = document.getElementById('state-container');
        const cityContainer = document.getElementById('city-container');
        
        stateSelect.innerHTML = '<option value="">Select State First</option>';
        citySelect.innerHTML = '<option value="">Select City First</option>';
        stateContainer.style.display = 'none';
        cityContainer.style.display = 'none';
        stateSelect.removeAttribute('required');
        citySelect.removeAttribute('required');
        document.getElementById('state-required').style.display = 'none';
        document.getElementById('city-required').style.display = 'none';
        
        if (countryId) {
            try {
                stateSelect.innerHTML = '<option value="">Loading states...</option>';
                const response = await fetch(`/api/states?country_id=${countryId}`);
                const data = await response.json();
                
                if (data.success && data.states.length > 0) {
                    stateSelect.innerHTML = '<option value="">Select State</option>';
                    data.states.forEach(state => {
                        stateSelect.add(new Option(state.name, state.id));
                    });
                    stateContainer.style.display = 'block';
                    stateSelect.setAttribute('required', 'required');
                    stateSelect.setCustomValidity('');
                    document.getElementById('state-required').style.display = 'inline';
                    
                    // Set current state value from hidden input
                    const currentStateId = document.getElementById('current-state-id')?.value?.trim();
                    if (currentStateId && currentStateId !== '' && currentStateId !== 'undefined' && currentStateId !== 'null' && !isNaN(currentStateId)) {
                        stateSelect.value = currentStateId;
                        setTimeout(() => {
                            onStateChange();
                        }, 100);
                    }
                } else {
                    stateSelect.innerHTML = '<option value="">No states available</option>';
                    stateSelect.removeAttribute('required');
                    document.getElementById('state-required').style.display = 'none';
                }
            } catch (error) {
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
        citySelect.removeAttribute('required');
        document.getElementById('city-required').style.display = 'none';
        
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
                    citySelect.setAttribute('required', 'required');
                    citySelect.setCustomValidity('');
                    document.getElementById('city-required').style.display = 'inline';
                    
                    // Set current city value from hidden input
                    const currentCityId = document.getElementById('current-city-id')?.value?.trim();
                    if (currentCityId && currentCityId !== '' && currentCityId !== 'undefined' && currentCityId !== 'null' && !isNaN(currentCityId)) {
                        citySelect.value = currentCityId;
                    }
                } else {
                    citySelect.innerHTML = '<option value="">No cities available</option>';
                    citySelect.removeAttribute('required');
                    document.getElementById('city-required').style.display = 'none';
                }
            } catch (error) {
                citySelect.innerHTML = '<option value="">Error loading cities</option>';
            }
        }
    }
    
    // Form submissions
    const aboutMeForm = document.getElementById('about-me-form');
    const preferencesForm = document.getElementById('preferences-form');
    const saveAboutMeBtn = document.getElementById('save-about-me-btn');
    const savePreferencesBtn = document.getElementById('save-preferences-btn');
    const cancelBtn = document.querySelector('.cancel-btn');
    
    if (aboutMeForm && saveAboutMeBtn) {
        aboutMeForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            await formHandler.handleSubmission({
                formId: 'about-me-form',
                submitButtonId: 'save-about-me-btn',
                apiEndpoint: '/api/profile/update',
                successMessage: 'About Me updated successfully!',
                textareaIds: ['about-edit'],
                dataProcessor: (data, config) => {
                    return formHandler.processFormData(data, {
                        interests: interestsManager ? interestsManager.getSelectedItems() : [],
                        hobbies: hobbiesManager ? hobbiesManager.getSelectedItems() : [],
                        // Languages are handled separately via languages modal/form
                        clearHiddenFields: [
                            { containerId: 'state-container', fieldName: 'state' },
                            { containerId: 'city-container', fieldName: 'city' },
                            { containerId: 'number-of-children-container', fieldName: 'number_of_children' }
                        ],
                        userIdInputSelector: '#about-me-form input[name="userId"]'
                    });
                }
            });
        });
    }
    
    if (preferencesForm && savePreferencesBtn) {
        preferencesForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            await formHandler.handleSubmission({
                formId: 'preferences-form',
                submitButtonId: 'save-preferences-btn',
                apiEndpoint: '/api/profile/update',
                successMessage: 'Preferences updated successfully!',
                textareaIds: ['partner-preferences-edit'],
                dataProcessor: (data, config) => {
                    return formHandler.processFormData(data, {
                        preferredCountries: preferredCountriesManager ? preferredCountriesManager.getSelectedItems() : [],
                        preferredChildrenSelect: 'preferred-children',
                        preferredNumberChildrenSelect: 'preferred-number-of-children',
                        userIdInputSelector: '#preferences-form input[name="userId"]'
                    });
                }
            });
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            const sessionToken = getSessionToken();
            if (sessionToken) {
                window.location.href = `/profile-full?token=${sessionToken}`;
            } else {
                window.location.href = '/profile-full';
            }
        });
    }
    
    // Event listeners for geo data
    document.getElementById('country')?.addEventListener('change', onCountryChange);
    document.getElementById('state')?.addEventListener('change', onStateChange);
    
    
    // Validation
    const stateSelect = document.getElementById('state');
    const citySelect = document.getElementById('city');
    
    if (stateSelect) {
        stateSelect.addEventListener('invalid', function(e) {
            if (stateSelect.validity.valueMissing) {
                stateSelect.setCustomValidity('Please select a state');
            }
        });
        stateSelect.addEventListener('change', function(e) {
            stateSelect.setCustomValidity('');
        });
    }
    
    if (citySelect) {
        citySelect.addEventListener('invalid', function(e) {
            if (citySelect.validity.valueMissing) {
                citySelect.setCustomValidity('Please select a city');
            }
        });
        citySelect.addEventListener('change', function(e) {
            citySelect.setCustomValidity('');
        });
    }
    
    // Age field validation - only allow 18-100, don't update if forbidden value
    // Note: ageMinInput and ageMaxInput are already declared above (lines 63-64)
    
    function validateAgeInput(input) {
        const value = input.value.replace(/[^0-9]/g, '');
        if (!value) return;
        
        const num = parseInt(value);
        const length = value.length;
        
        // Allow valid range 18-100
        if (num >= 18 && num <= 100) {
            // Check min/max relationship
            if (input === ageMinInput && ageMaxInput.value) {
                const maxNum = parseInt(ageMaxInput.value);
                if (num > maxNum) {
                    input.value = input.dataset.lastValid || '';
                    showNotification('Age minimum cannot be greater than age maximum', 'error');
                    return;
                }
            }
            if (input === ageMaxInput && ageMinInput.value) {
                const minNum = parseInt(ageMinInput.value);
                if (num < minNum) {
                    input.value = input.dataset.lastValid || '';
                    showNotification('Age maximum cannot be less than age minimum', 'error');
                    return;
                }
            }
            input.dataset.lastValid = value;
            return;
        }
        
        // Allow intermediate typing (single digits, "10")
        if ((length === 1 && num >= 1 && num <= 9) || value === '10') {
            return;
        }
        
        // Forbidden value - restore last valid or clear
        input.value = input.dataset.lastValid || '';
    }
    
    function validateAgeOnBlur(input) {
        const value = input.value;
        if (!value) return;
        
        const num = parseInt(value);
        if (num < 18 || num > 100) {
            input.value = input.dataset.lastValid || '';
        } else {
            // Check min/max relationship
            if (input === ageMinInput && ageMaxInput.value) {
                const maxNum = parseInt(ageMaxInput.value);
                if (num > maxNum) {
                    input.value = input.dataset.lastValid || '';
                    return;
                }
            }
            if (input === ageMaxInput && ageMinInput.value) {
                const minNum = parseInt(ageMinInput.value);
                if (num < minNum) {
                    input.value = input.dataset.lastValid || '';
                    return;
                }
            }
            input.dataset.lastValid = value;
        }
    }
    
    if (ageMinInput) {
        if (ageMinInput.value) {
            const num = parseInt(ageMinInput.value);
            if (num >= 18 && num <= 100) {
                ageMinInput.dataset.lastValid = ageMinInput.value;
            }
        }
        ageMinInput.addEventListener('input', () => validateAgeInput(ageMinInput));
        ageMinInput.addEventListener('blur', () => validateAgeOnBlur(ageMinInput));
    }
    
    if (ageMaxInput) {
        if (ageMaxInput.value) {
            const num = parseInt(ageMaxInput.value);
            if (num >= 18 && num <= 100) {
                ageMaxInput.dataset.lastValid = ageMaxInput.value;
            }
        }
        ageMaxInput.addEventListener('input', () => validateAgeInput(ageMaxInput));
        ageMaxInput.addEventListener('blur', () => validateAgeOnBlur(ageMaxInput));
    }
    
    // Load data
    loadLookupData().then(() => {
        // Only populate countries if they weren't already populated from lookup data
        const countrySelect = document.getElementById('country');
        if (countrySelect && countrySelect.options.length <= 1) {
            populateCountrySelects();
        }
    });
    
    // Load languages modal HTML and initialize
    (async function() {
        try {
            // Load modal HTML
            const response = await fetch('/components/modals/languages-modal.html');
            if (!response.ok) {
                console.error('Failed to load languages modal HTML');
                return;
            }
            const html = await response.text();
            
            // Inject HTML into container
            const container = document.getElementById('languages-modal-container');
            if (container) {
                container.innerHTML = html;
                
                // Wait for LanguagesModalManager to be available and languages data to be loaded
                let attempts = 0;
                const maxAttempts = 50;
                
                while (attempts < maxAttempts) {
                    if (window.LanguagesModalManager && document.getElementById('languages-modal')) {
                        // Check if languages data is loaded
                        if (window.LanguagesModalManager.languagesData && 
                            window.LanguagesModalManager.languagesData.languages && 
                            window.LanguagesModalManager.languagesData.languages.length > 0) {
                            // Initialize modal manager
                            window.LanguagesModalManager.init();
                            // Load user languages
                            await window.LanguagesModalManager.loadUserLanguages();
                            
                            // Sync with LanguageMultiSelectManager if it exists
                            if (window.languagesManager && window.LanguagesModalManager.userLanguages) {
                                window.languagesManager.setUserLanguages(window.LanguagesModalManager.userLanguages);
                            }
                            
                            // Load current selections from hidden input if available
                            if (window.languagesManager && window.languagesManager.config.userLanguages.length === 0) {
                                const currentLanguages = document.getElementById('current-languages')?.value || '';
                                if (currentLanguages) {
                                    // Parse and load from hidden input
                                    const languageIds = currentLanguages.split(',').map(s => s.trim()).filter(Boolean);
                                    languageIds.forEach(lid => {
                                        window.languagesManager.addLanguage(parseInt(lid));
                                    });
                                }
                            }
                            break;
                        } else {
                            // Wait a bit more for lookup data to load
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }
                
                // If still not initialized, try to initialize anyway (data might load later)
                if (window.LanguagesModalManager && document.getElementById('languages-modal')) {
                    window.LanguagesModalManager.init();
                    await window.LanguagesModalManager.loadUserLanguages();
                    
                    // Sync with LanguageMultiSelectManager if it exists
                    if (window.languagesManager && window.LanguagesModalManager.userLanguages) {
                        window.languagesManager.setUserLanguages(window.LanguagesModalManager.userLanguages);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load languages modal:', error);
        }
    })();
    
    // Initialize children visibility toggles
    initializeChildrenVisibilityToggles();
}

// Toggle number of children visibility based on have-children selection
function toggleNumberOfChildrenVisibility() {
    const haveChildrenSelect = document.getElementById('have-children');
    const numberChildrenContainer = document.getElementById('number-of-children-container');
    const numberChildrenSelect = document.getElementById('number-of-children');
    if (!haveChildrenSelect || !numberChildrenContainer || !numberChildrenSelect) return;
    
    const selectedOption = haveChildrenSelect.options[haveChildrenSelect.selectedIndex];
    const optionText = selectedOption ? selectedOption.textContent.toLowerCase() : '';
    const optionValue = haveChildrenSelect.value;
    
    // Show if option contains "have children" (including "grown up", "living with me", etc.)
    // or value is '2' or '3' (common IDs for "have children" options)
    // Exclude "don't have children", "no children", "prefer not to say" variations
    const hasChildrenText = optionText.includes('have children') || 
                           optionText.includes('has children') ||
                           optionText.includes('with children');
    const excludeText = optionText.includes("don't have") || 
                       optionText.includes('no children') || 
                       optionText.includes('prefer not') ||
                       optionText === 'none' ||
                       optionText === '';
    
    const show = (hasChildrenText && !excludeText) || optionValue === '2' || optionValue === '3';
    numberChildrenContainer.style.display = show ? 'block' : 'none';
    numberChildrenSelect.required = show;
    if (!show) {
        numberChildrenSelect.value = '';
    }
}

// Toggle preferred number of children visibility
function togglePreferredNumberOfChildrenVisibility() {
    const preferredChildrenSelect = document.getElementById('preferred-children');
    const preferredNumberChildrenContainer = document.getElementById('preferred-number-of-children-container');
    const preferredNumberChildrenSelect = document.getElementById('preferred-number-of-children');
    if (!preferredChildrenSelect || !preferredNumberChildrenContainer || !preferredNumberChildrenSelect) return;
    
    const selectedOption = preferredChildrenSelect.options[preferredChildrenSelect.selectedIndex];
    const optionText = selectedOption ? selectedOption.textContent.toLowerCase() : '';
    const optionValue = preferredChildrenSelect.value;
    
    // Show if option contains "has children" or value matches
    const show = optionText.includes('has children') || optionValue === 'Has children';
    preferredNumberChildrenContainer.style.display = show ? 'block' : 'none';
    preferredNumberChildrenSelect.required = show;
    if (!show) {
        preferredNumberChildrenSelect.value = '';
    }
}

// Initialize event listeners for children visibility toggles
function initializeChildrenVisibilityToggles() {
    const haveChildrenSelectEl = document.getElementById('have-children');
    if (haveChildrenSelectEl) {
        haveChildrenSelectEl.addEventListener('change', toggleNumberOfChildrenVisibility);
        // Call once on load to set initial state
        toggleNumberOfChildrenVisibility();
    }
    
    const preferredChildrenSelectEl = document.getElementById('preferred-children');
    if (preferredChildrenSelectEl) {
        preferredChildrenSelectEl.addEventListener('change', togglePreferredNumberOfChildrenVisibility);
        // Call once on load to set initial state
        togglePreferredNumberOfChildrenVisibility();
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfileEdit);
} else {
    // DOM already loaded
    initProfileEdit();
}
