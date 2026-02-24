// Consolidated search page logic
(() => {
    const searchContainer = document.querySelector('.search-page-container');
    if (!searchContainer) {
        return;
    }

    const pageData = {
        userId: searchContainer.dataset.userId || null,
        userName: searchContainer.dataset.userName || null,
        userGender: searchContainer.dataset.userGender || null,
        sessionToken: searchContainer.dataset.sessionToken || ''
    };

// Set correct active tab immediately from hash to prevent flash
            (function() {
                if (window.location.hash) {
                    const hash = window.location.hash.substring(1);
                    const validTabs = ['basic', 'advanced'];
                    // Handle legacy tab hashes (lifestyle, appearance, interests) by redirecting to advanced
                    const legacyTabs = ['lifestyle', 'appearance', 'interests'];
                    let activeHash = hash;
                    if (legacyTabs.includes(hash)) {
                        activeHash = 'advanced';
                        window.location.hash = 'advanced';
                    }
                    if (validTabs.includes(activeHash)) {
                        document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
                        document.querySelectorAll('.filter-content').forEach(content => content.classList.remove('active'));
                        const tabBtn = document.querySelector(`[data-tab="${activeHash}"]`);
                        const tabContent = document.getElementById(`${activeHash}-filters`);
                        if (tabBtn) tabBtn.classList.add('active');
                        if (tabContent) tabContent.classList.add('active');
                    }
                }
            })();

// Enhanced Search Functionality
let currentPage = 1;
let searchResults = [];
let currentView = 'grid';

// Initialize search page
document.addEventListener('DOMContentLoaded', function() {
    // Check for hash in URL FIRST to open specific tab immediately (before any other code)
    if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        const validTabs = ['basic', 'advanced'];
        // Handle legacy tab hashes (lifestyle, appearance, interests) by redirecting to advanced
        const legacyTabs = ['lifestyle', 'appearance', 'interests'];
        let activeHash = hash;
        if (legacyTabs.includes(hash)) {
            activeHash = 'advanced';
            window.location.hash = 'advanced';
        }
        if (validTabs.includes(activeHash)) {
            switchFilterTab(activeHash);
        }
    }
    
    // Set up current user data for JavaScript access
                window.currentUser = {
                    id: pageData.userId || null,
                    real_name: pageData.userName || null,
                    gender: pageData.userGender || null // Use raw gender value
                };
                
                // Try to get gender from session manager or localStorage as fallback
                if (!window.currentUser.gender) {
                    // Try session manager first (preferred method)
                    if (window.sessionManager && window.sessionManager.getCurrentUser) {
                        const sessionUser = window.sessionManager.getCurrentUser();
                        if (sessionUser && sessionUser.gender) {
                            window.currentUser.gender = sessionUser.gender;
                        }
                    }
                    
                    // No localStorage fallback
                }
                
                // If still no gender, try to get it from the session or make an API call
                if (!window.currentUser.gender) {
                    fetchCurrentUserData();
                } else {
                    // If we have gender, set preference immediately
                    setTimeout(() => {
                        setGenderPreference();
                    }, 100);
                }
    
    initializeFilters();
    
    // Attach event listeners to search action buttons
    const performSearchBtn = document.getElementById('performSearchBtn');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    const saveSearchBtn = document.getElementById('saveSearchBtn');
    
    if (performSearchBtn) {
        performSearchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            performAdvancedSearch();
        });
    }
    
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', function(e) {
            e.preventDefault();
            clearAllFilters();
        });
    }
    
    if (saveSearchBtn) {
        saveSearchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            saveSearchPreset();
        });
    }
});

// Function to fetch current user data from the server
async function fetchCurrentUserData() {
    try {
        // Try to get user data from session check endpoint
        const response = await fetch('/api/auth/check-session', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const userData = await response.json();
            if (userData.success && userData.user) {
                window.currentUser = {
                    id: userData.user.id,
                    real_name: userData.user.real_name || userData.user.name || '',
                    gender: userData.user.gender
                };
                
                // Store user data using session manager (preferred) or localStorage (fallback)
                if (window.sessionManager && window.sessionManager.setCurrentUser) {
                    window.sessionManager.setCurrentUser(window.currentUser);
                } else {
                    // No localStorage fallback
                }
                
                // Now set the gender preference
                setTimeout(() => {
                    setGenderPreference();
                }, 100);
            }
        }
    } catch (error) {
        console.error('Γ¥î Error fetching user data:', error);
        // Fallback: try to get from URL parameters or other sources
        tryGetUserDataFromURL();
    }
}

// Fallback function to try getting user data from URL or other sources
function tryGetUserDataFromURL() {
    // Try to get user ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId') || urlParams.get('id');
    
    if (userId) {
        // Try to get user data from session manager or localStorage by user ID
        let userData = null;
        
        // Try session manager first (preferred method)
        if (window.sessionManager && window.sessionManager.getCurrentUser) {
            const sessionUser = window.sessionManager.getCurrentUser();
            if (sessionUser && sessionUser.id == userId) {
                userData = sessionUser;
            }
        }
        
        // No localStorage fallback
        
        if (userData && userData.gender) {
            window.currentUser = {
                id: userId,
                real_name: userData.real_name || userData.name || 'User',
                gender: userData.gender
            };
            setGenderPreference();
        }
    }
}

// Filter tab switching
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('filter-tab')) {
        const tabName = e.target.dataset.tab;
        switchFilterTab(tabName);
    }
});

function switchFilterTab(tabName) {
    // Remove active class from all tabs and contents
    document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.filter-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab and content
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-filters`).classList.add('active');
}

// Set default gender preference based on current user's gender
function setGenderPreference() {
    if (window.currentUser && window.currentUser.gender) {
        const searchGenderSelect = document.getElementById('search-gender');
        const genderLabel = document.querySelector('label[for="search-gender"]');
        
        // Normalize gender value (handle both 'm'/'f' and 'male'/'female' formats)
        const userGender = window.currentUser.gender.toLowerCase();
        const isMale = userGender === 'male' || userGender === 'm';
        const isFemale = userGender === 'female' || userGender === 'f';
        
        if (searchGenderSelect) {
            if (isMale) {
                // Male user looking for female
                searchGenderSelect.value = 'female';
                if (genderLabel) {
                    genderLabel.innerHTML = '<i class="fas fa-venus"></i> Looking For: <strong>Women</strong>';
                }
            } else if (isFemale) {
                // Female user looking for male
                searchGenderSelect.value = 'male';
                if (genderLabel) {
                    genderLabel.innerHTML = '<i class="fas fa-mars"></i> Looking For: <strong>Men</strong>';
                }
            }
        }
    } else {
        // Retry after a short delay if currentUser is not loaded yet
        setTimeout(setGenderPreference, 500);
    }
}

function initializeFilters() {
    // Load countries dropdown and all filter options from database
    Promise.all([
        loadCountries(),
        loadSearchFilters()
    ]).then(() => {
        // After all data is loaded, populate form from URL parameters
        populateFormFromURL();
    });
    
    // Set default gender preference
    setGenderPreference();
    
    // Update label when gender dropdown changes
    const searchGenderSelect = document.getElementById('search-gender');
    const genderLabel = document.querySelector('label[for="search-gender"]');
    
    if (searchGenderSelect && genderLabel) {
        searchGenderSelect.addEventListener('change', function() {
            if (this.value === 'female') {
                genderLabel.innerHTML = '<i class="fas fa-venus"></i> Looking For: <strong>Women</strong>';
            } else if (this.value === 'male') {
                genderLabel.innerHTML = '<i class="fas fa-mars"></i> Looking For: <strong>Men</strong>';
            }
        });
    }
    
    // Initialize age validation
    const minAge = document.getElementById('search-age-min');
    const maxAge = document.getElementById('search-age-max');
    
    if (minAge && maxAge) {
        minAge.addEventListener('change', function() {
            if (parseInt(this.value) > parseInt(maxAge.value)) {
                maxAge.value = this.value;
            }
        });
        
        maxAge.addEventListener('change', function() {
            if (parseInt(this.value) < parseInt(minAge.value)) {
                minAge.value = this.value;
            }
        });
    }
    
    // Make "My preferred countries" and country dropdown mutually exclusive
    const usePreferredCountriesCheckbox = document.getElementById('use-preferred-countries');
    const countrySelect = document.getElementById('search-country');
    const countryContainer = document.getElementById('selected-countries');
    
    if (usePreferredCountriesCheckbox) {
        usePreferredCountriesCheckbox.addEventListener('change', function() {
            if (this.checked) {
                // When "My preferred countries" is checked, clear country dropdown and disable it
                selectedCountries = [];
                updateSelectedCountriesDisplay();
                if (countrySelect) {
                    countrySelect.value = '';
                    countrySelect.disabled = true;
                    countrySelect.style.opacity = '0.5';
                    countrySelect.style.cursor = 'not-allowed';
                }
            } else {
                // When "My preferred countries" is unchecked, enable country dropdown
                if (countrySelect) {
                    countrySelect.disabled = false;
                    countrySelect.style.opacity = '1';
                    countrySelect.style.cursor = 'pointer';
                }
            }
        });
    }
    
    // When countries are selected via dropdown, uncheck "My preferred countries"
    // This is handled in addSearchCountry function

}

// Store countries and selected countries globally
let allCountries = [];
let selectedCountries = [];

// Load countries from database
async function loadCountries() {
    try {
        
        const response = await fetch('/api/countries', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success && data.countries) {
            allCountries = data.countries;
            const countrySelect = document.getElementById('search-country');
            if (countrySelect) {
                countrySelect.innerHTML = '<option value="">Select a country...</option>';
                
                // Add "All Countries" option
                const allCountriesOption = document.createElement('option');
                allCountriesOption.value = 'all';
                allCountriesOption.textContent = '🌍 All Countries';
                countrySelect.appendChild(allCountriesOption);
                
                // Add countries from database
                data.countries.forEach(country => {
                    const option = document.createElement('option');
                    option.value = country.id;
                    // Remove country code prefix if present (e.g., 'au Australia' -> 'Australia')
                    let displayName = country.name;
                    if (/^[a-z]{2} /.test(displayName)) {
                        displayName = displayName.substring(3);
                    }
                    // Use display name without emoji
                    option.textContent = displayName;
                    countrySelect.appendChild(option);
                });
                
                // Add event listener for country selection
                countrySelect.addEventListener('change', function() {
                    if (this.value) {
                        addSearchCountry(this.value);
                    }
                });
                
                // Update display
                updateSelectedCountriesDisplay();
                
            }
        } else {
            console.error('Γ¥î Failed to load countries:', data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Γ¥î Error loading countries:', error);
    }
    
    return Promise.resolve(); // Return promise for chaining
}

// Load relationship types from database
async function loadRelationshipTypes() {
    try {
        // Get session token from URL or session manager
        const urlParams = new URLSearchParams(window.location.search);
        let sessionToken = urlParams.get('token');
        
        if (!sessionToken && window.sessionManager && window.sessionManager.getToken) {
            sessionToken = window.sessionManager.getToken();
        }
        
        if (!sessionToken) {
            // Try cookies as fallback
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'sessionToken') {
                    sessionToken = value;
                    break;
                }
            }
        }
        
        if (!sessionToken) {
            throw new Error('No session token found');
        }
        
        const fetchUrl = `/api/profile/lookup-data?sessionToken=${sessionToken}`;
        const response = await fetch(fetchUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();
        
        if (!responseData.success) {
            throw new Error(responseData.error || 'API returned success: false');
        }
        
        // The API wraps data in a 'data' property
        const lookupData = responseData.data || responseData;
        let relationshipTypes = lookupData.relationshipTypes || [];
        
        if (!Array.isArray(relationshipTypes)) {
            relationshipTypes = [];
        }
        
        const relationshipSelect = document.getElementById('search-relationship');
        if (!relationshipSelect) {
            return Promise.resolve();
        }
        
        // Keep the "Any" option, then add relationship types
        relationshipSelect.innerHTML = '<option value="">Any</option>';
        
        if (relationshipTypes.length > 0) {
            relationshipTypes.forEach(type => {
                const displayName = type.display_name || '';
                const displayNameLower = displayName.toLowerCase();
                
                // Skip "Any", "Prefer not to say", "Not important", and "Other" options
                if (displayNameLower === 'any' ||
                    displayNameLower === 'prefer not to say' || 
                    displayNameLower === 'not important' || 
                    displayNameLower === 'other') {
                    return;
                }
                
                const option = document.createElement('option');
                option.value = type.display_name;
                option.textContent = type.display_name;
                if (type.description) {
                    option.title = type.description; // Add description as tooltip
                }
                relationshipSelect.appendChild(option);
            });
            
            // Restore relationship type from URL if present (after options are loaded)
            const urlParams = new URLSearchParams(window.location.search);
            const relationshipType = urlParams.get('relationshipType');
            if (relationshipType && relationshipSelect) {
                // Try to find exact match first
                const exactMatch = Array.from(relationshipSelect.options).find(opt => opt.value === relationshipType);
                if (exactMatch) {
                    relationshipSelect.value = relationshipType;
                } else {
                    // Try case-insensitive match
                    const caseInsensitiveMatch = Array.from(relationshipSelect.options).find(opt => 
                        opt.value.toLowerCase() === relationshipType.toLowerCase()
                    );
                    if (caseInsensitiveMatch) {
                        relationshipSelect.value = caseInsensitiveMatch.value;
                    }
                }
            }
        }
    } catch (error) {
        // Still initialize the dropdown with just "Any" option
        const relationshipSelect = document.getElementById('search-relationship');
        if (relationshipSelect) {
            relationshipSelect.innerHTML = '<option value="">Any</option>';
        }
    }
    
    return Promise.resolve(); // Return promise for chaining
}

// Load all search filter options from database
async function loadSearchFilters() {
    try {
        
        const response = await fetch('/api/search/filters', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success && data.filters) {
            const filters = data.filters;
            
            // Populate Education Level dropdown
            const educationSelect = document.getElementById('education-level');
            if (educationSelect && filters.educationLevels) {
                educationSelect.innerHTML = '<option value="">Any Education</option>';
                filters.educationLevels.forEach(edu => {
                    // Skip "Other" and "Not Important" options
                    const nameLower = edu.name.toLowerCase();
                    if (nameLower === 'other' || nameLower.includes('not important')) {
                        return;
                    }
                    const option = document.createElement('option');
                    option.value = edu.id;
                    option.textContent = edu.name;
                    educationSelect.appendChild(option);
                });
            }
            
            // Populate Income Range dropdown
            const incomeSelect = document.getElementById('income-range');
            if (incomeSelect && filters.incomeRanges) {
                incomeSelect.innerHTML = '<option value="">Any income</option>';
                filters.incomeRanges.forEach(income => {
                    // Skip "Prefer not to say" and similar options
                    const nameLower = income.name.toLowerCase();
                    if (nameLower.includes('prefer not to say') || 
                        nameLower.includes('not important') ||
                        nameLower === 'other') {
                        return;
                    }
                    const option = document.createElement('option');
                    option.value = income.id;
                    option.textContent = income.name;
                    incomeSelect.appendChild(option);
                });
            }
            
            // Populate Occupation dropdown
            const occupationSelect = document.getElementById('occupation');
            if (occupationSelect && filters.occupationCategories) {
                occupationSelect.innerHTML = '<option value="">Any occupation</option>';
                filters.occupationCategories.forEach(occupation => {
                    // Skip "Prefer not to say" and similar options
                    const nameLower = occupation.name.toLowerCase();
                    if (nameLower.includes('prefer not to say') || 
                        nameLower.includes('not important') ||
                        nameLower === 'other') {
                        return;
                    }
                    const option = document.createElement('option');
                    option.value = occupation.id;
                    option.textContent = occupation.name;
                    occupationSelect.appendChild(option);
                });
            }
            
            // Populate Lifestyle dropdown
            const lifestyleSelect = document.getElementById('lifestyle');
            if (lifestyleSelect && filters.lifestylePreferences) {
                lifestyleSelect.innerHTML = '<option value="">Any lifestyle</option>';
                filters.lifestylePreferences.forEach(lifestyle => {
                    // Skip "Prefer not to say" and similar options
                    const nameLower = lifestyle.name.toLowerCase();
                    if (nameLower.includes('prefer not to say') || 
                        nameLower.includes('not important') ||
                        nameLower === 'other') {
                        return;
                    }
                    const option = document.createElement('option');
                    option.value = lifestyle.id;
                    option.textContent = lifestyle.name;
                    lifestyleSelect.appendChild(option);
                });
            }
            
            // Populate Relationship Type dropdown
            const relationshipSelect = document.getElementById('search-relationship');
            if (relationshipSelect && filters.relationshipTypes) {
                relationshipSelect.innerHTML = '<option value="">Any</option>';
                filters.relationshipTypes.forEach(type => {
                    const displayName = type.name || '';
                    const displayNameLower = displayName.toLowerCase();
                    
                    // Skip "Any", "Prefer not to say", "Not important", and "Other" options
                    if (displayNameLower === 'any' ||
                        displayNameLower === 'prefer not to say' || 
                        displayNameLower === 'not important' || 
                        displayNameLower === 'other') {
                        return;
                    }
                    
                    const option = document.createElement('option');
                    option.value = displayName;
                    option.textContent = displayName;
                    if (type.description) {
                        option.title = type.description; // Add description as tooltip
                    }
                    relationshipSelect.appendChild(option);
                });
                
                // Restore relationship type from URL if present (after options are loaded)
                const urlParams = new URLSearchParams(window.location.search);
                const relationshipType = urlParams.get('relationshipType');
                if (relationshipType && relationshipSelect) {
                    // Try to find exact match first
                    const exactMatch = Array.from(relationshipSelect.options).find(opt => opt.value === relationshipType);
                    if (exactMatch) {
                        relationshipSelect.value = relationshipType;
                    } else {
                        // Try case-insensitive match
                        const caseInsensitiveMatch = Array.from(relationshipSelect.options).find(opt => 
                            opt.value.toLowerCase() === relationshipType.toLowerCase()
                        );
                        if (caseInsensitiveMatch) {
                            relationshipSelect.value = caseInsensitiveMatch.value;
                        }
                    }
                }
            }
            
            // Populate Smoking dropdown
            const smokingSelect = document.getElementById('smoking');
            if (smokingSelect && filters.smokingPreferences) {
                smokingSelect.innerHTML = '<option value="">Any</option>';
                filters.smokingPreferences.forEach(smoking => {
                    // Skip "Prefer not to say" and similar options
                    const nameLower = smoking.name.toLowerCase();
                    if (nameLower.includes('prefer not to say') || 
                        nameLower.includes('not important') ||
                        nameLower === 'other') {
                        return;
                    }
                    const option = document.createElement('option');
                    option.value = smoking.id;
                    option.textContent = smoking.name;
                    smokingSelect.appendChild(option);
                });
            }
            
            // Populate Drinking dropdown
            const drinkingSelect = document.getElementById('drinking');
            if (drinkingSelect && filters.drinkingPreferences) {
                drinkingSelect.innerHTML = '<option value="">Any</option>';
                filters.drinkingPreferences.forEach(drinking => {
                    // Skip "Prefer not to say" and similar options
                    const nameLower = drinking.name.toLowerCase();
                    if (nameLower.includes('prefer not to say') || 
                        nameLower.includes('not important') ||
                        nameLower === 'other') {
                        return;
                    }
                    const option = document.createElement('option');
                    option.value = drinking.id;
                    option.textContent = drinking.name;
                    drinkingSelect.appendChild(option);
                });
            }
            
            // Children dropdown is hardcoded, no need to populate from database
            
            // Populate Body Type dropdown
            const bodyTypeSelect = document.getElementById('body-type');
            if (bodyTypeSelect && filters.bodyTypes) {
                bodyTypeSelect.innerHTML = '<option value="">Any body type</option>';
                filters.bodyTypes.forEach(bodyType => {
                    // Skip "Not important", "Prefer not to say", and "Other" options
                    const nameLower = bodyType.name.toLowerCase();
                    if (nameLower.includes('prefer not to say') || 
                        nameLower.includes('not important') ||
                        nameLower === 'other') {
                        return;
                    }
                    const option = document.createElement('option');
                    option.value = bodyType.id;
                    option.textContent = bodyType.name;
                    bodyTypeSelect.appendChild(option);
                });
            }
            
            // Populate Ethnicity dropdown
            const ethnicitySelect = document.getElementById('ethnicity');
            if (ethnicitySelect && filters.ethnicities) {
                ethnicitySelect.innerHTML = '<option value="">Any ethnicity</option>';
                filters.ethnicities.forEach(ethnicity => {
                    // Skip "Not important", "Prefer not to say", and "Other" options
                    const nameLower = ethnicity.name.toLowerCase();
                    if (nameLower.includes('prefer not to say') || 
                        nameLower.includes('not important') ||
                        nameLower === 'other') {
                        return;
                    }
                    const option = document.createElement('option');
                    option.value = ethnicity.id;
                    option.textContent = ethnicity.name;
                    ethnicitySelect.appendChild(option);
                });
            }
            
            // Populate Interests grid
            const interestsGrid = document.getElementById('interests-grid');
            if (interestsGrid) {
                if (filters.interests && Array.isArray(filters.interests) && filters.interests.length > 0) {
                    interestsGrid.innerHTML = '';
                    
                    // Create a single category container for all interests
                    const categoryDiv = document.createElement('div');
                    categoryDiv.className = 'interest-category';
                    
                    // Create category title (optional - can be removed if not needed)
                    const categoryTitle = document.createElement('h5');
                    categoryTitle.textContent = 'All Interests';
                    categoryDiv.appendChild(categoryTitle);
                    
                    // Create tags container
                    const tagsDiv = document.createElement('div');
                    tagsDiv.className = 'interest-tags';
                    
                    // Add each interest as a checkbox
                    filters.interests.forEach(interest => {
                        const label = document.createElement('label');
                        label.className = 'interest-tag';
                        
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.value = interest.id;
                        checkbox.id = `interest-${interest.id}`;
                        
                        const span = document.createElement('span');
                        // Handle icon - could be FontAwesome class (fa-music) or emoji
                        let iconHtml = '';
                        if (interest.icon) {
                            // Check if it's an emoji (single character or starts with common emoji patterns)
                            if (interest.icon.length <= 2 || /^[\u{1F300}-\u{1F9FF}]/u.test(interest.icon)) {
                                // It's an emoji
                                iconHtml = interest.icon;
                            } else {
                                // It's a FontAwesome class
                                const iconClass = interest.icon.startsWith('fa-') ? interest.icon : `fa-${interest.icon}`;
                                iconHtml = `<i class="fas ${iconClass}"></i>`;
                            }
                        } else {
                            // Default icon
                            iconHtml = '<i class="fas fa-star"></i>';
                        }
                        span.innerHTML = `${iconHtml} ${interest.name || 'Interest'}`;
                        
                        label.appendChild(checkbox);
                        label.appendChild(span);
                        tagsDiv.appendChild(label);
                    });
                    
                    categoryDiv.appendChild(tagsDiv);
                    interestsGrid.appendChild(categoryDiv);
                } else {
                    // No interests available or not loaded
                    interestsGrid.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--muted-color);"><p>No interests available</p></div>';
                }
            }
            
            // Populate Hobbies grid
            const hobbiesGrid = document.getElementById('hobbies-grid');
            if (hobbiesGrid) {
                if (filters.hobbies && Array.isArray(filters.hobbies) && filters.hobbies.length > 0) {
                    hobbiesGrid.innerHTML = '';
                    
                    // Create a single category container for all hobbies
                    const categoryDiv = document.createElement('div');
                    categoryDiv.className = 'interest-category';
                    
                    // Create category title
                    const categoryTitle = document.createElement('h5');
                    categoryTitle.textContent = 'All Hobbies';
                    categoryDiv.appendChild(categoryTitle);
                    
                    // Create tags container
                    const tagsDiv = document.createElement('div');
                    tagsDiv.className = 'interest-tags';
                    
                    // Add each hobby as a checkbox
                    filters.hobbies.forEach(hobby => {
                        const label = document.createElement('label');
                        label.className = 'interest-tag';
                        
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.value = hobby.id;
                        checkbox.id = `hobby-${hobby.id}`;
                        
                        const span = document.createElement('span');
                        // Handle icon - could be FontAwesome class (fa-music) or emoji
                        let iconHtml = '';
                        if (hobby.icon) {
                            // Check if it's an emoji (single character or starts with common emoji patterns)
                            if (hobby.icon.length <= 2 || /^[\u{1F300}-\u{1F9FF}]/u.test(hobby.icon)) {
                                // It's an emoji
                                iconHtml = hobby.icon;
                            } else {
                                // It's a FontAwesome class
                                const iconClass = hobby.icon.startsWith('fa-') ? hobby.icon : `fa-${hobby.icon}`;
                                iconHtml = `<i class="fas ${iconClass}"></i>`;
                            }
                        } else {
                            // Default icon
                            iconHtml = '<i class="fas fa-star"></i>';
                        }
                        span.innerHTML = `${iconHtml} ${hobby.name || 'Hobby'}`;
                        
                        label.appendChild(checkbox);
                        label.appendChild(span);
                        tagsDiv.appendChild(label);
                    });
                    
                    categoryDiv.appendChild(tagsDiv);
                    hobbiesGrid.appendChild(categoryDiv);
                } else {
                    // No hobbies available or not loaded
                    hobbiesGrid.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--muted-color);"><p>No hobbies available</p></div>';
                }
            }
            
            // Populate Height Range dropdowns (Min and Max)
            const heightMinSelect = document.getElementById('height-min');
            const heightMaxSelect = document.getElementById('height-max');
            if (filters.heights) {
                // Populate Min Height dropdown
                if (heightMinSelect) {
                    // Keep the "Min Height" placeholder option
                    const existingPlaceholder = heightMinSelect.querySelector('option[value=""]');
                    heightMinSelect.innerHTML = existingPlaceholder ? existingPlaceholder.outerHTML : '<option value="">Min Height</option>';
                    
                    filters.heights.forEach(height => {
                        // Skip special options like "Prefer not to say" or "Not important"
                        if (height.display_text && (
                            height.display_text.toLowerCase().includes('prefer not to say') ||
                            height.display_text.toLowerCase().includes('not important') ||
                            height.display_text.toLowerCase() === 'other'
                        )) {
                            return;
                        }
                        
                        // Only include heights with valid height_cm values
                        if (height.height_cm !== null && height.height_cm !== undefined) {
                            const option = document.createElement('option');
                            option.value = height.height_cm;
                            // Use display_text if available, otherwise fallback to height_cm
                            option.textContent = height.display_text || `${height.height_cm} cm`;
                            heightMinSelect.appendChild(option);
                        }
                    });
                }
                
                // Populate Max Height dropdown
                if (heightMaxSelect) {
                    // Keep the "Max Height" placeholder option
                    const existingPlaceholder = heightMaxSelect.querySelector('option[value=""]');
                    heightMaxSelect.innerHTML = existingPlaceholder ? existingPlaceholder.outerHTML : '<option value="">Max Height</option>';
                    
                    filters.heights.forEach(height => {
                        // Skip special options like "Prefer not to say" or "Not important"
                        if (height.display_text && (
                            height.display_text.toLowerCase().includes('prefer not to say') ||
                            height.display_text.toLowerCase().includes('not important') ||
                            height.display_text.toLowerCase() === 'other'
                        )) {
                            return;
                        }
                        
                        // Only include heights with valid height_cm values
                        if (height.height_cm !== null && height.height_cm !== undefined) {
                            const option = document.createElement('option');
                            option.value = height.height_cm;
                            // Use display_text if available, otherwise fallback to height_cm
                            option.textContent = height.display_text || `${height.height_cm} cm`;
                            heightMaxSelect.appendChild(option);
                        }
                    });
                }
            }
            
        } else {
            console.error('Γ¥î Failed to load filters:', data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Γ¥î Error loading search filters:', error);
    }
    
    return Promise.resolve(); // Return promise for chaining
}

// Populate form fields from URL parameters
function populateFormFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Exclude system parameters
    const excludeParams = ['token', 'currentUser', 'userId', 'page', 'timestamp'];
    
    
    // Age range
    const ageMin = urlParams.get('ageMin');
    const ageMax = urlParams.get('ageMax');
    if (ageMin) document.getElementById('search-age-min').value = ageMin;
    if (ageMax) document.getElementById('search-age-max').value = ageMax;
    
    // Gender
    const gender = urlParams.get('gender');
    if (gender) {
        const genderSelect = document.getElementById('search-gender');
        if (genderSelect) {
            genderSelect.value = gender;
            // Update label if needed
            const genderLabel = document.querySelector('label[for="search-gender"]');
            if (genderLabel) {
                if (gender === 'female') {
                    genderLabel.innerHTML = '<i class="fas fa-venus"></i> Looking For: <strong>Women</strong>';
                } else if (gender === 'male') {
                    genderLabel.innerHTML = '<i class="fas fa-mars"></i> Looking For: <strong>Men</strong>';
                }
            }
        }
    }
    
    // Relationship Type
    const relationshipType = urlParams.get('relationshipType');
    if (relationshipType) {
        const relationshipSelect = document.getElementById('search-relationship');
        if (relationshipSelect) {
            // Try to find exact match first
            const exactMatch = Array.from(relationshipSelect.options).find(opt => opt.value === relationshipType);
            if (exactMatch) {
                relationshipSelect.value = relationshipType;
            } else {
                // Try case-insensitive match
                const caseInsensitiveMatch = Array.from(relationshipSelect.options).find(opt => 
                    opt.value.toLowerCase() === relationshipType.toLowerCase()
                );
                if (caseInsensitiveMatch) {
                    relationshipSelect.value = caseInsensitiveMatch.value;
                }
            }
        }
    }
    
    // Country (multiple select)
    const countryParam = urlParams.get('country');
    if (countryParam) {
        const countryIds = countryParam.split(',').filter(id => id.trim() !== '');
        if (countryIds.length > 0) {
            selectedCountries = [];
            countryIds.forEach(countryId => {
                const country = allCountries.find(c => c.id == countryId);
                if (country) {
                    selectedCountries.push(country);
                }
            });
            // Uncheck "My preferred countries" if countries are selected
            const usePreferredCountriesCheckbox = document.getElementById('use-preferred-countries');
            if (usePreferredCountriesCheckbox) {
                usePreferredCountriesCheckbox.checked = false;
            }
            updateSelectedCountriesDisplay();
        }
    }
    
    // Quality filters (checkboxes) - explicitly set both true and false states
    const withImages = urlParams.get('withImages');
    const withImagesCheckbox = document.getElementById('with-images');
    if (withImagesCheckbox) {
        withImagesCheckbox.checked = (withImages === 'true');
    }
    
    const verified = urlParams.get('verified');
    const verifiedCheckbox = document.getElementById('verified-profiles');
    if (verifiedCheckbox) {
        verifiedCheckbox.checked = (verified === 'true');
    }
    
    const recentlyActive = urlParams.get('recentlyActive');
    const recentlyActiveCheckbox = document.getElementById('online-recently');
    if (recentlyActiveCheckbox) {
        recentlyActiveCheckbox.checked = (recentlyActive === 'true');
    }
    
    const onlineNow = urlParams.get('onlineNow');
    const onlineNowCheckbox = document.getElementById('online-now-filter');
    if (onlineNowCheckbox) {
        onlineNowCheckbox.checked = (onlineNow === 'true');
    }
    
    // Preferred countries filter
    const usePreferredCountries = urlParams.get('usePreferredCountries');
    const usePreferredCountriesCheckbox = document.getElementById('use-preferred-countries');
    const countrySelect = document.getElementById('search-country');
    
    if (usePreferredCountries === 'true' && usePreferredCountriesCheckbox) {
        usePreferredCountriesCheckbox.checked = true;
        // Disable country dropdown when "My preferred countries" is checked
        if (countrySelect) {
            countrySelect.disabled = true;
            countrySelect.style.opacity = '0.5';
            countrySelect.style.cursor = 'not-allowed';
        }
    }
    
    // Lifestyle filters - using correct IDs from HTML
    const education = urlParams.get('education');
    if (education) {
        const educationSelect = document.getElementById('education-level');
        if (educationSelect) educationSelect.value = education;
    }
    
    const occupation = urlParams.get('occupation');
    if (occupation) {
        const occupationSelect = document.getElementById('occupation');
        if (occupationSelect) occupationSelect.value = occupation;
    }
    
    const income = urlParams.get('income');
    if (income) {
        const incomeSelect = document.getElementById('income-range');
        if (incomeSelect) incomeSelect.value = income;
    }
    
    const lifestyle = urlParams.get('lifestyle');
    if (lifestyle) {
        const lifestyleSelect = document.getElementById('lifestyle');
        if (lifestyleSelect) lifestyleSelect.value = lifestyle;
    }
    
    const smoking = urlParams.get('smoking');
    if (smoking) {
        const smokingSelect = document.getElementById('smoking');
        if (smokingSelect) smokingSelect.value = smoking;
    }
    
    const drinking = urlParams.get('drinking');
    if (drinking) {
        const drinkingSelect = document.getElementById('drinking');
        if (drinkingSelect) drinkingSelect.value = drinking;
    }
    
    const children = urlParams.get('children');
    if (children) {
        const childrenSelect = document.getElementById('children');
        if (childrenSelect) childrenSelect.value = children;
    }
    
    const heightMin = urlParams.get('heightMin');
    if (heightMin) {
        const heightMinInput = document.getElementById('height-min');
        if (heightMinInput) heightMinInput.value = heightMin;
    }
    
    const heightMax = urlParams.get('heightMax');
    if (heightMax) {
        const heightMaxInput = document.getElementById('height-max');
        if (heightMaxInput) heightMaxInput.value = heightMax;
    }
    
    const bodyType = urlParams.get('bodyType');
    if (bodyType) {
        const bodyTypeSelect = document.getElementById('body-type');
        if (bodyTypeSelect) bodyTypeSelect.value = bodyType;
    }
    
    const ethnicity = urlParams.get('ethnicity');
    if (ethnicity) {
        const ethnicitySelect = document.getElementById('ethnicity');
        if (ethnicitySelect) ethnicitySelect.value = ethnicity;
    }
    
    // Interests (comma-separated)
    const interests = urlParams.get('interests');
    if (interests) {
        const interestIds = interests.split(',').filter(id => id.trim() !== '');
        // Check the corresponding interest checkboxes
        interestIds.forEach(interestId => {
            const checkbox = document.getElementById(`interest-${interestId}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
    }
    
    // Hobbies (comma-separated)
    const hobbies = urlParams.get('hobbies');
    if (hobbies) {
        const hobbyIds = hobbies.split(',').filter(id => id.trim() !== '');
        // Check the corresponding hobby checkboxes
        hobbyIds.forEach(hobbyId => {
            const checkbox = document.getElementById(`hobby-${hobbyId}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
    }
    
    // Sort by
    const sortBy = urlParams.get('sortBy');
    if (sortBy) {
        const sortSelect = document.getElementById('search-sort');
        if (sortSelect) sortSelect.value = sortBy;
    }
    
}

// Update selected countries display
function updateSelectedCountriesDisplay() {
    const container = document.getElementById('selected-countries');
    const countSpan = document.getElementById('selected-countries-count');
    const usePreferredCountriesCheckbox = document.getElementById('use-preferred-countries');
    const countrySelect = document.getElementById('search-country');
    
    if (!container || !countSpan) return;
    
    container.innerHTML = '';
    
    if (selectedCountries.length === 0) {
        // Show "All Countries" when no specific countries are selected
        const allCountriesSpan = document.createElement('span');
        allCountriesSpan.style.cssText = 'background: #e8f5e8; color: #2e7d32; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.5rem; font-style: italic;';
        allCountriesSpan.innerHTML = '🌍 All Countries (default)';
        container.appendChild(allCountriesSpan);
        countSpan.textContent = 'All';
        
        // Enable "My preferred countries" when showing "All"
        if (usePreferredCountriesCheckbox) {
            usePreferredCountriesCheckbox.disabled = false;
            usePreferredCountriesCheckbox.parentElement.style.opacity = '1';
            usePreferredCountriesCheckbox.parentElement.style.pointerEvents = 'auto';
        }
        // Enable country dropdown
        if (countrySelect) {
            countrySelect.disabled = false;
            countrySelect.style.opacity = '1';
            countrySelect.style.cursor = 'pointer';
        }
    } else {
        countSpan.textContent = selectedCountries.length;
        
        selectedCountries.forEach(country => {
            const span = document.createElement('span');
            span.style.cssText = 'background: #e3f2fd; color: #1976d2; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.5rem;';
            // Remove country code prefix if present
            let displayName = country.name;
            if (/^[a-z]{2} /.test(displayName)) {
                displayName = displayName.substring(3);
            }
            span.innerHTML = `${displayName} <button type="button" class="remove-country-btn" data-remove-country="${country.id}" onclick="removeSearchCountry('${country.id}')">x</button>`;
            container.appendChild(span);
        });
        
        // Disable "My preferred countries" when specific countries are selected
        if (usePreferredCountriesCheckbox) {
            usePreferredCountriesCheckbox.disabled = true;
            usePreferredCountriesCheckbox.checked = false;
            usePreferredCountriesCheckbox.parentElement.style.opacity = '0.5';
            usePreferredCountriesCheckbox.parentElement.style.pointerEvents = 'none';
        }
    }
}

// Add country to selection
function addSearchCountry(countryId) {
    // If "My preferred countries" is checked, uncheck it when user selects countries
    const usePreferredCountriesCheckbox = document.getElementById('use-preferred-countries');
    if (usePreferredCountriesCheckbox && usePreferredCountriesCheckbox.checked) {
        usePreferredCountriesCheckbox.checked = false;
    }
    
    // Handle "All Countries" selection
    if (countryId === 'all') {
        selectedCountries = [];
        updateSelectedCountriesDisplay();
        document.getElementById('search-country').value = '';
        return;
    }
    
    const country = allCountries.find(c => c.id == countryId);
    
    if (country && !selectedCountries.find(c => c.id == countryId)) {
        selectedCountries.push(country);
        updateSelectedCountriesDisplay();
        document.getElementById('search-country').value = '';
    } else if (selectedCountries.find(c => c.id == countryId)) {
    }
}

// Remove country from selection
function removeSearchCountry(countryId) {
    selectedCountries = selectedCountries.filter(c => c.id != countryId);
    updateSelectedCountriesDisplay();
}

// Expose for inline button handlers
window.removeSearchCountry = removeSearchCountry;



function performAdvancedSearch() {
    // Show loading state
    const searchBtn = document.querySelector('.search-btn.primary');
    const originalText = searchBtn.innerHTML;
    searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
    searchBtn.disabled = true;
    
    // Collect all filter values
    const filters = collectFilters();
    
    // Convert filters to URL parameters
    const searchParams = new URLSearchParams();
    
    // Add all non-empty filter values to URL params
    Object.keys(filters).forEach(key => {
        const value = filters[key];
        
        // Handle boolean values (checkboxes) - always include them
        if (typeof value === 'boolean') {
            searchParams.set(key, value.toString());
        }
        // Handle arrays (like interests)
        else if (Array.isArray(value)) {
            if (value.length > 0) {
                searchParams.set(key, value.join(','));
            }
        }
        // Handle other values - only include if not empty
        else if (value && value !== '' && value !== 'any') {
            searchParams.set(key, value);
        }
    });
    
    // Add timestamp to make each search unique
    searchParams.set('timestamp', Date.now());
    
    // Prepare redirect (minimal delay to show button loading state)
    const sessionToken = pageData.sessionToken || (window.sessionManager && window.sessionManager.getToken && window.sessionManager.getToken()) || '';
    const currentUserId = pageData.userId || window.currentUser?.id || '2';
    const activeTab = document.querySelector('.filter-tab.active')?.dataset.tab || 'basic';
    sessionStorage.setItem('searchActiveTab', activeTab);
    const finalUrl = `/results?${searchParams.toString()}&currentUser=${currentUserId}&token=${sessionToken}`;
    
    // Small delay to show loading state, then redirect
    setTimeout(() => {
        window.location.href = finalUrl;
    }, 50);
}

function collectFilters() {
    const filters = {};
    
    // Basic filters
    filters.ageMin = document.getElementById('search-age-min').value;
    filters.ageMax = document.getElementById('search-age-max').value;
    filters.gender = document.getElementById('search-gender').value;
    // Country preference filter - mutually exclusive with country dropdown
    filters.usePreferredCountries = document.getElementById('use-preferred-countries').checked;
    
    // Only send country filter if "My preferred countries" is NOT checked
    // If usePreferredCountries is true, ignore the country dropdown
    if (filters.usePreferredCountries) {
        // Use preferred countries - don't send country filter
        filters.country = [];
    } else {
        // Use country dropdown - send array of country IDs, or empty array if none selected (means all countries)
        filters.country = selectedCountries.length > 0 ? selectedCountries.map(c => c.id) : [];
    }
    
    // Quality filters
    filters.withImages = document.getElementById('with-images').checked;
    filters.verified = document.getElementById('verified-profiles').checked;
    filters.recentlyActive = document.getElementById('online-recently').checked;
    filters.onlineNow = document.getElementById('online-now-filter').checked;
    
    // If "Online Now" is selected and no age range is specified, use broader defaults
    // This ensures we don't miss online users due to restrictive user preferences
    if (filters.onlineNow && (!filters.ageMin || !filters.ageMax)) {
        if (!filters.ageMin) filters.ageMin = '18';
        if (!filters.ageMax) filters.ageMax = '65';
    }
    

    
    // Relationship type filter
    filters.relationshipType = document.getElementById('search-relationship').value;
    
    // Lifestyle filters
    filters.education = document.getElementById('education-level').value;
    filters.occupation = document.getElementById('occupation').value;
    filters.income = document.getElementById('income-range').value;
    filters.lifestyle = document.getElementById('lifestyle').value;
    filters.smoking = document.getElementById('smoking').value;
    filters.drinking = document.getElementById('drinking').value;
    filters.children = document.getElementById('children').value;
    
    // Appearance filters
    filters.heightMin = document.getElementById('height-min').value;
    filters.heightMax = document.getElementById('height-max').value;
    filters.bodyType = document.getElementById('body-type').value;
    filters.ethnicity = document.getElementById('ethnicity').value;
    
    // Interests - collect checked interest IDs
    filters.interests = [];
    document.querySelectorAll('#interests-grid .interest-tag input[type="checkbox"]:checked').forEach(input => {
        filters.interests.push(input.value);
    });
    
    // Hobbies - collect checked hobby IDs
    filters.hobbies = [];
    document.querySelectorAll('#hobbies-grid .interest-tag input[type="checkbox"]:checked').forEach(input => {
        filters.hobbies.push(input.value);
    });
    
    return filters;
}

function simulateSearchResults(filters) {
    // Generate mock results based on filters
    const mockUsers = generateMockUsers(filters);
    searchResults = mockUsers;
    
    // Show results
    displaySearchResults(mockUsers);
    
    // Show results header
    document.getElementById('search-results-header').style.display = 'block';
    document.getElementById('search-count').textContent = mockUsers.length;
    
    // Show pagination if needed
    if (mockUsers.length > 12) {
        document.getElementById('search-pagination').style.display = 'flex';
        generatePagination(mockUsers.length);
    }
}

function generateMockUsers(filters) {
    const mockNames = ['Alex Johnson', 'Sarah Wilson', 'Mike Chen', 'Emily Davis', 'David Brown', 'Lisa Garcia', 'Tom Anderson', 'Jessica Taylor', 'Chris Martinez', 'Amanda White'];
    const mockAges = [22, 25, 28, 30, 32, 35, 27, 29, 31, 26];
    const mockLocations = ['2 km away', '5 km away', '8 km away', '12 km away', '15 km away'];
    
    const users = [];
    const resultCount = Math.floor(Math.random() * 20) + 5; // 5-25 results
    
    for (let i = 0; i < resultCount; i++) {
        users.push({
            id: i + 1,
            name: mockNames[i % mockNames.length],
            age: mockAges[i % mockAges.length],
            location: mockLocations[i % mockLocations.length],
            online: Math.random() > 0.7,
            verified: Math.random() > 0.6,
            photos: Math.floor(Math.random() * 8) + 1,
            compatibility: Math.floor(Math.random() * 30) + 70 // 70-100% match
        });
    }
    
    return users;
}

function displaySearchResults(users) {
    const resultsContainer = document.getElementById('search-results');
    
    if (users.length === 0) {
        resultsContainer.innerHTML = `
            <div class="search-placeholder">
                <div class="placeholder-content">
                    <i class="fas fa-search"></i>
                    <h3>No matches found</h3>
                    <p>Try adjusting your search filters to find more people.</p>
                </div>
            </div>
        `;
        return;
    }
    
    const userCards = users.map(user => `
        <div class="online-user-card" data-user-id="${user.id}">
            <div class="user-header">
                <div class="user-avatar" style="position: relative;">
                    <i class="fas fa-user"></i>
                    <div class="online-dot" data-user-id="${user.id}" style="display:${user.is_online ? 'block' : 'none'};position:absolute;top:5px;right:5px;width:12px;height:12px;background:#00b894;border-radius:50%;border:2px solid white;box-shadow:0 0 0 2px rgba(0,184,148,0.3);"></div>
                    ${user.verified ? '<div class="verified-badge"><i class="fas fa-check"></i></div>' : ''}
                </div>
                <div class="user-info">
                    <h4>${user.name}</h4>
                    <p>${user.age} years old</p>
                    <p class="user-location"><i class="fas fa-map-marker-alt"></i> ${user.location}</p>
                </div>
                <div class="match-percentage">
                    <span class="match-score">${user.compatibility}%</span>
                    <span class="match-label">Match</span>
                </div>
            </div>
            <div class="user-stats">
                <span><i class="fas fa-images"></i> ${user.photos} photos</span>
                <div class="user-status" data-user-id="${user.id}" style="display:inline-block;padding:2px 6px;border-radius:10px;font-size:0.7rem;color:#aaa;">
                    <span style="color: #aaa; font-size:0.8em;">ΓùÅ</span> Loading...
                </div>
            </div>
            <div class="user-actions">
                <button class="btn-secondary" data-view-profile="${user.id}">
                    <i class="fas fa-eye"></i> View Profile
                </button>
                <button class="btn-primary" data-send-message="${user.id}">
                    <i class="fas fa-heart"></i> Like
                </button>
            </div>
        </div>
    `).join('');
    
    resultsContainer.innerHTML = userCards;
    resultsContainer.className = `search-results ${currentView}-view`;
    
    // Register status elements for instant updates
    setTimeout(() => {
        registerStatusElements();
    }, 100);
}

function clearAllFilters() {
    // Clear selected countries
    selectedCountries = [];
    updateSelectedCountriesDisplay();
    document.getElementById('search-country').value = '';
    
    // Clear relationship type dropdown
    const relationshipSelect = document.getElementById('search-relationship');
    if (relationshipSelect) {
        relationshipSelect.value = '';
    }
    
    // Clear all checkboxes
    document.getElementById('with-images').checked = false;
    document.getElementById('verified-profiles').checked = false;
    document.getElementById('online-recently').checked = false;
    document.getElementById('online-now-filter').checked = false;
    document.getElementById('use-preferred-countries').checked = false;
    
    // Clear all select dropdowns
    document.getElementById('sort-by').value = 'relevance';
    
    // Reset age range
    document.getElementById('search-age-min').value = '18';
    document.getElementById('search-age-max').value = '45';
    
    // Reset gender to default based on user's gender
    const searchGenderSelect = document.getElementById('search-gender');
    const genderLabel = document.querySelector('label[for="search-gender"]');
    if (window.currentUser && window.currentUser.gender) {
        const userGender = window.currentUser.gender.toLowerCase();
        const isMale = userGender === 'male' || userGender === 'm';
        const isFemale = userGender === 'female' || userGender === 'f';
        
        if (isMale && searchGenderSelect) {
            // Male user looking for female (default)
            searchGenderSelect.value = 'female';
            if (genderLabel) {
                genderLabel.innerHTML = '<i class="fas fa-venus"></i> Looking For: <strong>Women</strong>';
            }
        } else if (isFemale && searchGenderSelect) {
            // Female user looking for male (default)
            searchGenderSelect.value = 'male';
            if (genderLabel) {
                genderLabel.innerHTML = '<i class="fas fa-mars"></i> Looking For: <strong>Men</strong>';
            }
        }
    } else {
        // Fallback if user gender not available
        if (searchGenderSelect) {
            searchGenderSelect.value = '';
        }
        if (genderLabel) {
            genderLabel.innerHTML = '<i class="fas fa-heart"></i> Looking For';
        }
    }
    
    // Clear all other filter inputs (lifestyle, appearance, interests)
    document.querySelectorAll('.filter-input').forEach(input => {
        if (input.type === 'checkbox') {
            input.checked = false;
        } else if (input.type === 'range') {
            input.value = input.getAttribute('value') || 50;
        } else if (input.type === 'number') {
            // Skip age inputs as they're already set above
            if (input.id !== 'search-age-min' && input.id !== 'search-age-max') {
                input.value = '';
            }
        } else if (input.tagName === 'SELECT') {
            // Skip already cleared selects
            if (input.id !== 'search-gender' && input.id !== 'search-relationship' && input.id !== 'sort-by' && input.id !== 'search-country') {
                input.value = '';
            }
        } else if (input.type === 'text') {
            input.value = '';
        }
    });
    
    // Clear all interest checkboxes
    document.querySelectorAll('.interest-tag input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Hide results
    document.getElementById('search-results-header').style.display = 'none';
    const paginationEl = document.getElementById('search-pagination');
    if (paginationEl) {
        paginationEl.style.display = 'none';
    }
    
    // Show placeholder
    document.getElementById('search-results').innerHTML = `
        <div class="search-placeholder">
            <div class="placeholder-content">
                <i class="fas fa-search"></i>
                <h3>Ready to find your perfect match?</h3>
                <p>Use our advanced filters above to discover amazing people near you!</p>
            </div>
        </div>
    `;
}

function saveSearchPreset() {
    const filters = collectFilters();
    const presetName = prompt('Enter a name for this search preset:');
    
    if (presetName) {
        // Save search preset using preferences manager
        const presetKey = `search_preset_${Date.now()}`;
        const presetData = {
            name: presetName,
            filters: filters
        };
        
        // Try to save to session manager if available
        if (window.sessionManager && window.sessionManager.getCurrentUser) {
            const user = window.sessionManager.getCurrentUser();
            if (user && user.id) {
                // No localStorage storage
            }
        }
        
        // No localStorage fallback
        
        alert(`Search preset "${presetName}" saved successfully!`);
    }
}

function quickSearch(type) {
    clearAllFilters();
    
    switch (type) {
        case 'nearby':
            // Nearby search
            break;
        case 'online':
            document.getElementById('online-recently').checked = true;
            break;
        case 'new':
            // Simulate new members search
            break;
    }
    
    performAdvancedSearch();
}

function toggleView(view) {
    currentView = view;
    
    // Update button states
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');
    
    // Update results container
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.className = `search-results ${view}-view`;
}

function sortResults() {
    const sortBy = document.getElementById('sort-by').value;
    
    // Simulate sorting (in real app, this would re-query the backend)
    displaySearchResults(searchResults);
}

function viewProfile(userId) {
    openProfileModal(userId);
}

// Load email verification check utility
if (!window.checkEmailVerificationStatus) {
    const script = document.createElement('script');
    script.src = '/assets/js/new/shared/email-verification-check.js';
    document.head.appendChild(script);
}

// Modal functions
let currentProfileUserId = null;

async function openProfileModal(userId) {
    // Check email verification before opening profile modal
    if (window.checkEmailVerificationStatus) {
        const isVerified = await window.checkEmailVerificationStatus();
        if (!isVerified) {
            window.showVerificationMessage();
            return; // Don't open modal
        }
    }
    
    const modal = document.getElementById('userProfileModal');
    const loading = document.getElementById('modal-loading');
    const error = document.getElementById('modal-error');
    const content = document.getElementById('modal-profile-content');
    
    if (!modal) {
        setTimeout(() => openProfileModal(userId), 100);
        return;
    }
    
    modal.style.display = 'block';
    loading.style.display = 'block';
    error.style.display = 'none';
    content.style.display = 'none';
    
    currentProfileUserId = userId;
    
    try {
        const currentUserId = window.currentUser?.id || '2';
        const response = await fetch(`/api/users/${userId}/profile`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        displayProfileInModal(data.profile || data);
    } catch (err) {
        console.error('Error loading profile:', err);
        loading.style.display = 'none';
        error.style.display = 'block';
        error.innerHTML = '<i class="fas fa-exclamation-triangle fa-2x"></i><p>Failed to load profile</p>';
    }
}

function displayProfileInModal(profile) {
    const loading = document.getElementById('modal-loading');
    const content = document.getElementById('modal-profile-content');
    
    loading.style.display = 'none';
    content.style.display = 'block';
    
    const profileGenderLower = (profile.gender || '').toLowerCase().trim();
    const genderIcon = (profileGenderLower === 'male' || profileGenderLower === 'm') ? 'fa-mars' : 'fa-venus';
    const genderStyle = (profileGenderLower === 'male' || profileGenderLower === 'm') ? 'color: #3498db;' : 'color: #e91e63;';
    document.getElementById('modal-profile-real_name').innerHTML = `${escapeHtml(profile.real_name || profile.name || 'Unknown User')} <i class="fas ${genderIcon}" style="font-size: 1.8rem; margin-left: 0.3rem; ${genderStyle}"></i>`;
    const isFemale = (profileGenderLower === 'female' || profileGenderLower === 'f');
    document.getElementById('modal-profile-avatar').src = profile.profile_image ? `/uploads/profile_images/${profile.profile_image}` : (isFemale ? '/assets/images/default_profile_female.svg' : '/assets/images/default_profile_male.svg');
    document.getElementById('modal-profile-location-text').textContent = profile.location || 'Not specified';
    document.getElementById('modal-profile-age').textContent = profile.age ? `${profile.age} years old` : 'Unknown';
    
    const statusText = document.getElementById('modal-status-text');
    if (profile.is_online) {
        statusText.innerHTML = '<i class="fas fa-circle" style="color: #00b894; font-size: 0.6rem;"></i> Online now';
        statusText.style.color = '#00b894';
    } else if (profile.last_active) {
        statusText.textContent = `Last active ${formatTimeAgo(profile.last_active)}`;
        statusText.style.color = '#888';
    } else {
        statusText.textContent = 'Offline';
        statusText.style.color = '#888';
    }
    
    // Basic Information section
    document.getElementById('modal-info-occupation').textContent = (profile.attributes && profile.attributes.occupation) ? profile.attributes.occupation : 'Not specified';
    document.getElementById('modal-info-education').textContent = (profile.attributes && profile.attributes.education) ? profile.attributes.education : 'Not specified';
    
    const aboutElement = document.getElementById('modal-profile-about');
    if (profile.attributes && Object.keys(profile.attributes).length > 0) {
        const aboutText = [];
        if (profile.attributes.lifestyle) aboutText.push(`Lifestyle: ${escapeHtml(profile.attributes.lifestyle)}`);
        aboutElement.innerHTML = aboutText.length > 0 ? `<p>${aboutText.join('<br>')}</p>` : '<p>No information provided</p>';
    } else {
        aboutElement.innerHTML = '<p>No information provided</p>';
    }
    
    // Render interests with icons using modal's function
    if (window.renderModalInterests) {
        window.renderModalInterests(profile.interests || []);
    }
    
    // I am looking for
    const lookingForElement = document.getElementById('modal-profile-looking-for');
    if (lookingForElement) {
        const lookingForText = [];
        if (profile.partner_preferences) {
            lookingForText.push(`<p style="margin-bottom: 0.5rem;">${escapeHtml(profile.partner_preferences)}</p>`);
        }
        if (profile.relationship_type) {
            lookingForText.push(`<div style="margin-top: 0.5rem;"><strong>Relationship Type:</strong> ${escapeHtml(profile.relationship_type)}</div>`);
        }
        lookingForElement.innerHTML = lookingForText.length > 0 ? lookingForText.join('') : '<p>No information provided</p>';
    }
    
    // Show/hide block and report buttons based on has_received_messages
    const blockBtn = document.getElementById('modal-block-btn');
    const reportBtn = document.getElementById('modal-report-btn');
    
    if (blockBtn && reportBtn) {
        if (profile.has_received_messages) {
            blockBtn.style.display = 'flex';
            reportBtn.style.display = 'flex';
        } else {
            blockBtn.style.display = 'none';
            reportBtn.style.display = 'none';
        }
    }
    
    // Update like button state
    const likeBtn = document.getElementById('modal-like-btn');
    const likeBtnText = likeBtn?.querySelector('.like-btn-text');
    const likeBtnIcon = likeBtn?.querySelector('i');
    
    if (likeBtn && profile.is_liked) {
        likeBtn.style.background = 'linear-gradient(90deg, #f39c12, #e67e22)';
        if (likeBtnIcon) {
            likeBtnIcon.className = 'fas fa-thumbs-up';
        }
        if (likeBtnText) {
            likeBtnText.textContent = 'Liked';
        }
    } else if (likeBtn && !profile.is_liked) {
        likeBtn.style.background = 'linear-gradient(90deg, #e74c3c, #c44569)';
        if (likeBtnIcon) {
            likeBtnIcon.className = 'fas fa-thumbs-up';
        }
        if (likeBtnText) {
            likeBtnText.textContent = 'Like';
        }
    }
    
    // Update favorite button state
    const favouriteBtn = document.getElementById('modal-favourite-btn');
    const favouriteBtnText = favouriteBtn?.querySelector('.favourite-btn-text');
    const favouriteBtnIcon = favouriteBtn?.querySelector('i');
    
    if (favouriteBtn && profile.is_favorited) {
        favouriteBtn.style.background = 'linear-gradient(90deg, #e74c3c, #c44569)';
        if (favouriteBtnIcon) {
            favouriteBtnIcon.className = 'fas fa-heart';
        }
        if (favouriteBtnText) {
            favouriteBtnText.textContent = 'Added';
        }
    } else if (favouriteBtn && !profile.is_favorited) {
        favouriteBtn.style.background = 'linear-gradient(90deg, #f39c12, #e67e22)';
        if (favouriteBtnIcon) {
            favouriteBtnIcon.className = 'fas fa-heart';
        }
        if (favouriteBtnText) {
            favouriteBtnText.textContent = 'Add to Favourites';
        }
    }
    
    const photosElement = document.getElementById('modal-profile-photos');
    const defaultImg = profile.gender && profile.gender.toString().toLowerCase() === 'f' ? '/assets/images/default_profile_female.svg' : '/assets/images/default_profile_male.svg';
    if (profile.photos && profile.photos.length > 0) {
        photosElement.innerHTML = profile.photos.map(photo => 
            `<div class="photo-item" style="border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                <img src="/uploads/profile_images/${photo.file_name}" alt="Profile photo" onerror="if(!this.src.includes('default_profile_')){this.src='${defaultImg}';}" style="width: 100%; height: 150px; object-fit: cover;">
            </div>`
        ).join('');
    } else {
        photosElement.innerHTML = `<div class="photo-item" style="border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);"><img src="${defaultImg}" alt="No photos" style="width: 100%; height: 150px; object-fit: cover;"></div>`;
    }
}

function closeProfileModal() {
    const modal = document.getElementById('userProfileModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentProfileUserId = null;
}

function formatTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diff = now - then;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

function sendMessage(userId) {
    // Simulate sending a like/message
    alert(`Like sent to user ${userId}!`);
}

function changePage(direction) {
    currentPage += direction;
    
    // Simulate pagination (in real app, this would query next page)
    const offset = (currentPage - 1) * 12;
    const pageResults = searchResults.slice(offset, offset + 12);
    displaySearchResults(pageResults);
    
    // Update page numbers
    generatePagination(searchResults.length);
}

function generatePagination(totalResults) {
    const totalPages = Math.ceil(totalResults / 12);
    const pageNumbers = document.getElementById('page-numbers');
    
    let pagesHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        pagesHTML += `
            <button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">
                ${i}
            </button>
        `;
    }
    
    pageNumbers.innerHTML = pagesHTML;
    
    // Update prev/next buttons
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage === totalPages;
}

function goToPage(page) {
    currentPage = page;
    changePage(0); // Re-render current page
}

// Register status elements for instant updates
function registerStatusElements() {
    if (window.instantStatusManager && window.instantStatusManager.isInitialized) {
        const statusElements = document.querySelectorAll('.online-dot[data-user-id]');
        statusElements.forEach(element => {
            const userId = element.dataset.userId;
            if (userId) {
                window.instantStatusManager.registerStatusElement(element, userId);
            }
        });
    }
}

// Initialize instant status updates after page loads
document.addEventListener('DOMContentLoaded', function() {
    // Wait for instant status manager to be ready
    const checkStatusManager = setInterval(() => {
        if (window.instantStatusManager && window.instantStatusManager.isInitialized) {
            clearInterval(checkStatusManager);
            registerStatusElements();
        }
    }, 1000);
    
    // Initialize online tracking for search page
    if (window.onlineTracker && window.currentUser?.id) {
        if (!window.onlineTracker.getStatus().isRunning) {
            window.onlineTracker.start();
        }
    }
});

// Manual function to set gender preference (for debugging if needed)
window.manualSetGenderPreference = function(gender) {
    if (gender === 'male' || gender === 'female') {
        const searchGenderSelect = document.getElementById('search-gender');
        if (searchGenderSelect) {
            searchGenderSelect.value = gender;
        }
    }
};

// Get session token function
    function getSessionToken() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        
        if (urlToken) {
            return urlToken;
        }
        
        // Try session manager first (preferred method)
        if (window.sessionManager && window.sessionManager.getToken) {
            return window.sessionManager.getToken() || '';
        }
        
        // Try cookies as fallback
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'sessionToken') {
                return value;
            }
        }
        
        return '';
    }
    
    // Show notification function
    function showNotification(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#00b894' : type === 'error' ? '#e74c3c' : '#667eea'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            max-width: 300px;
            animation: slideInRight 0.3s ease-out;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        `;
        
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
    }
    
    // Load ProfileModalActions module
    function loadProfileModalActions() {
        if (typeof window.ProfileModalActions === 'undefined') {
            const script = document.createElement('script');
            script.src = '/components/modals/profile-modal-actions.js';
            script.onload = function() {
                // Initialize with page-specific configuration
                if (window.ProfileModalActions) {
                    window.ProfileModalActions.init({
                        getCurrentUserId: () => window.currentUser?.id || '2',
                        getCurrentProfileUserId: () => currentProfileUserId,
                        getSessionToken: getSessionToken,
                        showNotification: showNotification
                    });
                }
            };
            script.onerror = function() {
            };
            document.head.appendChild(script);
        } else {
            // Already loaded, just initialize
            if (window.ProfileModalActions) {
                window.ProfileModalActions.init({
                    getCurrentUserId: () => window.currentUser?.id || '2',
                    getCurrentProfileUserId: () => currentProfileUserId,
                    getSessionToken: getSessionToken,
                    showNotification: showNotification
                });
            }
        }
    }
    
    // Initialize modal close buttons
    document.addEventListener('DOMContentLoaded', function() {
        // Load ProfileModalActions module
        loadProfileModalActions();
        
        const closeBtn = document.querySelector('.close-profile-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeProfileModal);
        }
        
        const modal = document.getElementById('userProfileModal');
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    closeProfileModal();
                }
            });
        }
        
        // Add event listeners for modal action buttons
        const likeBtn = document.querySelector('.modal-like-btn');
        const favouriteBtn = document.querySelector('.modal-favourite-btn');
        const messageBtn = document.querySelector('.modal-message-btn');
        const blockBtn = document.querySelector('.modal-block-btn');
        const reportBtn = document.querySelector('.modal-report-btn');
        
        if (likeBtn) {
            likeBtn.addEventListener('click', function() {
                if (window.ProfileModalActions) {
                    window.ProfileModalActions.likeProfileInModal();
                } else {
                    console.error('ProfileModalActions not loaded');
                }
            });
        }
        
        if (favouriteBtn) {
            favouriteBtn.addEventListener('click', function() {
                if (window.ProfileModalActions) {
                    window.ProfileModalActions.favouriteProfileInModal();
                } else {
                    console.error('ProfileModalActions not loaded');
                }
            });
        }
        
        if (messageBtn) {
            messageBtn.addEventListener('click', function() {
                if (currentProfileUserId) {
                    alert('Message feature coming soon!');
                }
            });
        }
        
        if (blockBtn) {
            blockBtn.addEventListener('click', async function() {
                if (currentProfileUserId) {
                    const real_nameElement = document.getElementById('modal-profile-real_name');
                    const real_name = real_nameElement ? real_nameElement.textContent.trim().split(' ')[0] : 'this user';
                    
                    // Show custom confirmation dialog
                    document.getElementById('blockUsername').textContent = real_name;
                    document.getElementById('blockConfirmModal').style.display = 'flex';
                    
                    // Store context for confirmBlock function
                    window.pendingBlockUserId = currentProfileUserId;
                    window.pendingBlockContext = 'search';
                }
            });
        }
        
        // Global functions for block confirmation dialog
        window.closeBlockConfirm = function() {
            document.getElementById('blockConfirmModal').style.display = 'none';
            window.pendingBlockUserId = null;
            window.pendingBlockContext = null;
        };
        
        window.confirmBlock = async function() {
            if (window.pendingBlockUserId && window.pendingBlockContext === 'search') {
                try {
                    const currentUserId = window.currentUser?.id || '2';
                    const userIdToBlock = window.pendingBlockUserId;
                    
                    const response = await fetch(`/api/users/${userIdToBlock}/block`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-User-ID': currentUserId,
                            'Authorization': `Bearer ${getSessionToken()}`
                        },
                        body: JSON.stringify({ reason: 'Blocked from search page' })
                    });
                    
                    const data = await response.json();
                    if (data.success) {
                        showNotification('User blocked successfully', 'success');
                        closeProfileModal();
                        
                        // Remove the user from search results
                        const userCard = document.querySelector(`[data-user-id="${userIdToBlock}"]`);
                        if (userCard) {
                            userCard.style.transition = 'opacity 0.3s';
                            userCard.style.opacity = '0';
                            setTimeout(() => userCard.remove(), 300);
                        }
                    } else {
                        alert('Failed to block user: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Error blocking user:', error);
                    alert('Failed to block user. Please try again.');
                }
            }
            closeBlockConfirm();
        };
        
        if (reportBtn) {
            reportBtn.addEventListener('click', function() {
                if (currentProfileUserId) {
                    // Get real_name from modal
                    const real_nameElement = document.getElementById('modal-profile-real_name');
                    const real_name = real_nameElement ? real_nameElement.textContent.trim().split(' ')[0] : `User ${currentProfileUserId}`;
                    
                    // Open report modal
                    if (typeof openReportModal === 'function') {
                        openReportModal(currentProfileUserId, real_name);
                    } else {
                        console.error('openReportModal function not found. Make sure user-report-modal is included.');
                        alert('Report functionality is not available. Please refresh the page.');
                    }
                }
            });
        }
    });
})();
