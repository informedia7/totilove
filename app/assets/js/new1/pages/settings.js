// Settings Page JavaScript - Extracted from settings.html - Phase 1 CSS/JS Extraction

// Global variables
let currentSettings = {};
let selectedCountries = [];
let allCountries = [];

// Load settings on page load
document.addEventListener('DOMContentLoaded', async function() {
    // Get user data directly from token (no localStorage)
    const currentUser = await getUserFromToken();
    
    if (!currentUser) {
        console.error('❌ No authenticated user found');
        showToast('Please log in to access settings', 'error');
        return;
    }
    
    loadSettings(currentUser);
    
    // Event listeners
    document.getElementById('country-select').addEventListener('change', function() {
        if (this.value) {
            addCountry(this.value);
        }
    });

    // Age range event listeners
    document.getElementById('age-min').addEventListener('change', function() {
        validateAgeRange();
    });

    document.getElementById('age-max').addEventListener('change', function() {
        validateAgeRange();
    });

    // Toggle switch event listeners
    document.getElementById('show-online-status').addEventListener('change', function() {
        updateToggleSlider('show-online-status');
    });

    document.getElementById('notify-new-messages').addEventListener('change', function() {
        updateToggleSlider('notify-new-messages');
    });

    document.getElementById('notify-profile-views').addEventListener('change', function() {
        updateToggleSlider('notify-profile-views');
    });

    document.getElementById('show-last-active').addEventListener('change', function() {
        updateToggleSlider('show-last-active');
    });

    document.getElementById('save-settings-btn').addEventListener('click', function() {
        saveSettings();
    });
});

// Get user data from session (cookie-based, no URL tokens)
async function getUserFromToken() {
    try {
        // Cookie-based auth - cookies sent automatically
        const response = await fetch('/api/auth/check-session', {
            method: 'GET',
            credentials: 'same-origin' // Sends cookies automatically
        });
        const data = await response.json();
        
        if (data.success && data.user) {
            return data.user;
        } else {
            console.warn('⚠️ Session check failed:', data.message);
            return null;
        }
    } catch (error) {
        console.error('❌ Error getting user from token:', error);
        return null;
    }
}

// Load settings from API
async function loadSettings(currentUser) {
    try {
        if (!currentUser) {
            console.error('❌ No authenticated user found');
            showToast('Please log in to access settings', 'error');
            return;
        }
        
        // Cookie-based auth - cookies sent automatically
        const response = await fetch(`/api/settings?userId=${currentUser.id}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin'
        });

        // Check if response is a Response object that needs to be parsed
        let responseData = response;
        if (response && response.json && typeof response.json === 'function') {
            try {
                responseData = await response.json();
            } catch (parseError) {
                console.error('❌ Error parsing response JSON:', parseError);
                responseData = null;
            }
        }

        if (responseData && responseData.success) {
            currentSettings = responseData.settings;
            
            // Load countries from settings response
            if (responseData.settings.all_countries && responseData.settings.all_countries.length > 0) {
                allCountries = responseData.settings.all_countries.map(country => ({
                    id: country.id,
                    name: country.name,
                    emoji: country.emoji || ''
                }));
            } else {
                // Fallback: load countries separately
                await loadCountries();
            }
            
            selectedCountries = responseData.settings.contact_countries || [];
            populateForm();
        } else {
            const errorMsg = responseData ? responseData.error : 'Unknown error';
            console.error('❌ Failed to load settings:', errorMsg);
            showToast('Failed to load settings: ' + errorMsg, 'error');
            loadDefaultSettings();
        }
    } catch (error) {
        console.error('💥 Error loading settings:', error);
        showToast('Error loading settings: ' + error.message, 'error');
        loadDefaultSettings();
    }
}

// Load countries from API
async function loadCountries() {
    try {
        // Cookie-based auth - cookies sent automatically
        const response = await fetch('/api/countries', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin'
        });

        // Parse response
        let responseData = response;
        if (response && response.json && typeof response.json === 'function') {
            try {
                responseData = await response.json();
            } catch (parseError) {
                console.error('❌ Error parsing countries response JSON:', parseError);
                responseData = null;
            }
        }

        if (responseData && responseData.success && responseData.countries) {
            allCountries = responseData.countries.map(country => ({
                id: country.id,
                name: country.name,
                emoji: country.emoji || ''
            }));
        } else {
            console.error('❌ Failed to load countries from API:', responseData);
            // Load fallback countries
            loadFallbackCountries();
        }
    } catch (error) {
        console.error('💥 Error loading countries:', error);
        // Load fallback countries
        loadFallbackCountries();
    }
}

// Load fallback countries if API fails
function loadFallbackCountries() {
    allCountries = [
        { id: 1, name: 'United States', emoji: '🇺🇸' },
        { id: 2, name: 'Canada', emoji: '🇨🇦' },
        { id: 3, name: 'United Kingdom', emoji: '🇬🇧' },
        { id: 4, name: 'Australia', emoji: '🇦🇺' },
        { id: 5, name: 'Germany', emoji: '🇩🇪' },
        { id: 6, name: 'France', emoji: '🇫🇷' },
        { id: 7, name: 'Spain', emoji: '🇪🇸' },
        { id: 8, name: 'Italy', emoji: '🇮🇹' },
        { id: 9, name: 'Japan', emoji: '🇯🇵' },
        { id: 10, name: 'South Korea', emoji: '🇰🇷' }
    ];
}

// Load default settings as fallback
function loadDefaultSettings() {
    currentSettings = {
        profile_visibility: 'public',
        email_notifications: true,
        show_online_status: true,
        contact_age_min: 18,
        contact_age_max: 65,
        require_photos: false,
        messages_per_day: 50,
        no_same_gender_contact: true,
        notify_new_messages: true,

        notify_profile_views: false,
        show_last_active: true,
        verified_profiles_only: false,
        contact_countries: [], // Empty array means "All Countries"
        measurement_system: 'metric'
    };
    
    // Load fallback countries if not already loaded
    if (!allCountries || allCountries.length === 0) {
        loadFallbackCountries();
    }
    
    selectedCountries = []; // Empty array means "All Countries"
    
    populateForm();
}

// Populate age dropdowns
function populateAgeDropdowns() {
    const minSelect = document.getElementById('age-min');
    const maxSelect = document.getElementById('age-max');
    
    // Clear existing options
    minSelect.innerHTML = '';
    maxSelect.innerHTML = '';
    
    // Add options from 18 to 100
    for (let age = 18; age <= 100; age++) {
        const minOption = document.createElement('option');
        minOption.value = age;
        minOption.textContent = age;
        minSelect.appendChild(minOption);
        
        const maxOption = document.createElement('option');
        maxOption.value = age;
        maxOption.textContent = age;
        maxSelect.appendChild(maxOption);
    }
}

// Update visibility description based on selected value
function updateVisibilityDescription(value) {
    const descriptionEl = document.getElementById('visibility-description');
    if (!descriptionEl) return;
    
    const descriptions = {
        'public': 'Your profile will appear in search results and can be discovered by anyone on the platform.',
        'friends': 'Your profile can only be found by users you have connected with (mutual likes/matches).',
        'private': 'Your profile is hidden from search results and discovery. Only you can see it.'
    };
    
    // Handle legacy 'hidden' value
    if (value === 'hidden') {
        value = 'private';
        document.getElementById('profile-visibility').value = 'private';
    }
    
    descriptionEl.textContent = descriptions[value] || descriptions['public'];
}

// Populate form with loaded data
function populateForm() {
    // Profile visibility - validate and convert legacy 'hidden' to 'private'
    let visibilityValue = currentSettings.profile_visibility || 'public';
    if (visibilityValue === 'hidden') {
        visibilityValue = 'private';
    }
    // Ensure it's a valid value
    const validValues = ['public', 'friends', 'private'];
    if (!validValues.includes(visibilityValue)) {
        visibilityValue = 'public';
    }
    
    document.getElementById('profile-visibility').value = visibilityValue;
    updateVisibilityDescription(visibilityValue);
    
    // Populate age dropdowns first
    populateAgeDropdowns();
    
    // Age range
    document.getElementById('age-min').value = currentSettings.contact_age_min || 18;
    document.getElementById('age-max').value = currentSettings.contact_age_max || 65;
    
    // Require photos
    document.getElementById('require-photos').checked = currentSettings.require_photos || false;
    
    // No same gender contact
    document.getElementById('no-same-gender').checked = currentSettings.no_same_gender_contact !== false;
    
    // Verified profiles only
    document.getElementById('verified-profiles-only').checked = currentSettings.verified_profiles_only !== false;
    
    // Show online status
    document.getElementById('show-online-status').checked = currentSettings.show_online_status !== false;
    
    // Update toggle slider appearance for show online status
    updateToggleSlider('show-online-status');
    
    // Notification settings
    document.getElementById('notify-new-messages').checked = currentSettings.notify_new_messages !== false;
    document.getElementById('notify-profile-views').checked = currentSettings.notify_profile_views !== false;
    
    // Update toggle slider appearance for notification settings
    updateToggleSlider('notify-new-messages');
    updateToggleSlider('notify-profile-views');
    
    // Show last active
    document.getElementById('show-last-active').checked = currentSettings.show_last_active !== false;
    
    // Update toggle slider appearance for show last active
    updateToggleSlider('show-last-active');
    
    // Messages per day
    document.getElementById('messagesPerDay').value = currentSettings.messages_per_day || 50;

    // Measurement system
    document.getElementById('measurement-system').value = currentSettings.measurement_system || 'metric';
    
    // Populate countries dropdown
    populateCountriesDropdown();
    
    // Populate selected countries
    updateSelectedCountriesDisplay();
}

// Populate countries dropdown
function populateCountriesDropdown() {
    const select = document.getElementById('country-select');
    if (!select) {
        console.error('❌ Country select element not found!');
        return;
    }
    
    select.innerHTML = '<option value="">Select a country...</option>';
    
    // Add "All Countries" option as default
    const allCountriesOption = document.createElement('option');
    allCountriesOption.value = 'all';
    allCountriesOption.textContent = '🌍 All Countries';
    select.appendChild(allCountriesOption);
    
    if (!allCountries || allCountries.length === 0) {
        console.error('❌ No countries available to populate dropdown');
        return;
    }
    
    allCountries.forEach((country) => {
        const option = document.createElement('option');
        option.value = country.id;
        // Remove country code prefix if present (e.g., 'au Australia' -> 'Australia')
        let displayName = country.name;
        if (/^[a-z]{2} /.test(displayName)) {
            displayName = displayName.substring(3);
        }
        option.textContent = displayName;
        select.appendChild(option);
    });
}

// Update selected countries display
function updateSelectedCountriesDisplay() {
    const container = document.getElementById('selected-countries');
    const countSpan = document.getElementById('selected-countries-count');
    
    container.innerHTML = '';
    
    if (selectedCountries.length === 0) {
        // Show "All Countries" when no specific countries are selected
        const allCountriesSpan = document.createElement('span');
        allCountriesSpan.style.cssText = 'background: #e8f5e8; color: #2e7d32; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; font-style: italic;';
        allCountriesSpan.innerHTML = '🌍 All Countries (default)';
        container.appendChild(allCountriesSpan);
        countSpan.textContent = 'All';
    } else {
        countSpan.textContent = selectedCountries.length;
        
        selectedCountries.forEach(country => {
            const span = document.createElement('span');
            span.style.cssText = 'background: #e3f2fd; color: #1976d2; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;';
            // Remove country code prefix if present (e.g., 'au Australia' -> 'Australia')
            let displayName = country.name;
            if (/^[a-z]{2} /.test(displayName)) {
                displayName = displayName.substring(3);
            }
            span.innerHTML = `${displayName} <span style="cursor: pointer; font-weight: bold;" onclick="removeCountry(${country.id})">×</span>`; // Removed emoji
            container.appendChild(span);
        });
    }
}

// Add country to selection
function addCountry(countryId) {
    
    // Handle "All Countries" selection
    if (countryId === 'all') {
        selectedCountries = [];
        updateSelectedCountriesDisplay();
        document.getElementById('country-select').value = '';
        return;
    }
    
    const country = allCountries.find(c => c.id == countryId);
    
    if (country && !selectedCountries.find(c => c.id == countryId) && selectedCountries.length < 10) {
        selectedCountries.push(country);
        updateSelectedCountriesDisplay();
        document.getElementById('country-select').value = '';
    } else {
        if (!country) {
            console.error('❌ Country not found with ID:', countryId);
        } else if (selectedCountries.find(c => c.id == countryId)) {
            console.warn('⚠️ Country already selected:', country.name);
        } else if (selectedCountries.length >= 10) {
            console.warn('⚠️ Maximum 10 countries already selected');
        }
    }
}

// Remove country from selection
function removeCountry(countryId) {
    selectedCountries = selectedCountries.filter(c => c.id != countryId);
    updateSelectedCountriesDisplay();
}

// Save settings
async function saveSettings() {
    try {
        // Get user data from token (no localStorage)
        const currentUser = await getUserFromToken();
        if (!currentUser) {
            console.error('No authenticated user found');
            return;
        }

        const verifiedProfilesOnly = document.getElementById('verified-profiles-only').checked;
        
        const settings = {
            profile_visibility: document.getElementById('profile-visibility').value || 'public',
            email_notifications: true, // Default value
            show_online_status: document.getElementById('show-online-status').checked,
            contact_age_min: parseInt(document.getElementById('age-min').value),
            contact_age_max: parseInt(document.getElementById('age-max').value),
            require_photos: document.getElementById('require-photos').checked,
            messages_per_day: parseInt(document.getElementById('messagesPerDay').value) || 50,
            no_same_gender_contact: document.getElementById('no-same-gender').checked,
            notify_new_messages: document.getElementById('notify-new-messages').checked,
            notify_profile_views: document.getElementById('notify-profile-views').checked,
            show_last_active: document.getElementById('show-last-active').checked,
            verified_profiles_only: verifiedProfilesOnly,
            contact_countries: selectedCountries,
            measurement_system: document.getElementById('measurement-system').value || 'metric'
        };


        // Cookie-based auth - cookies sent automatically
        const response = await fetch('/api/settings/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                userId: currentUser.id,
                settings: settings
            })
        });

        // Parse response if it's a Response object
        let responseData = response;
        if (response && response.json && typeof response.json === 'function') {
            try {
                responseData = await response.json();
            } catch (parseError) {
                console.error('❌ Error parsing settings save response:', parseError);
                responseData = null;
            }
        }

        if (responseData && responseData.success) {
            showToast('Settings saved successfully!', 'success');
            currentSettings = settings;
        } else {
            const errorMsg = responseData ? responseData.error : 'Unknown error';
            console.error('❌ Failed to save settings:', errorMsg);
            showToast('Failed to save settings: ' + errorMsg, 'error');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error saving settings', 'error');
    }
}

// Toast notification function
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-size: 14px;
        max-width: 300px;
        word-wrap: break-word;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 100);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3001);
}

// Update toggle slider appearance
function updateToggleSlider(elementId) {
    const checkbox = document.getElementById(elementId);
    const slider = checkbox.nextElementSibling;
    if (checkbox.checked) {
        slider.style.backgroundColor = 'var(--primary)';
    } else {
        slider.style.backgroundColor = '#ccc';
    }
}

// Age range validation
function validateAgeRange() {
    const minAge = parseInt(document.getElementById('age-min').value);
    const maxAge = parseInt(document.getElementById('age-max').value);
    
    if (minAge > maxAge) {
        // If min age is greater than max age, set max age to min age
        document.getElementById('age-max').value = minAge;
    }
}









































