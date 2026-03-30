// Initialize user data
if (typeof window.currentUser === 'undefined') {
    window.currentUser = {
        id: parseInt(document.body.getAttribute('data-user-id')) || null,
        real_name: document.body.getAttribute('data-real_name') || '',
        email: document.body.getAttribute('data-user-email') || '',
        age: parseInt(document.body.getAttribute('data-user-age')) || null,
        gender: document.body.getAttribute('data-user-gender') || '',
        location: document.body.getAttribute('data-user-location') || '',
        memberSince: document.body.getAttribute('data-member-since') || '',
        lastActive: document.body.getAttribute('data-last-active') || ''
    };
    
    window.isAuthenticated = window.currentUser.id && window.currentUser.id !== 'null' && window.currentUser.id !== '';
}

// Load required scripts
function loadScript(src, onLoad, onError) {
    const script = document.createElement('script');
    script.src = src;
    if (onLoad) script.onload = onLoad;
    if (onError) script.onerror = onError;
    document.head.appendChild(script);
}

// Load ProfileModalActions module
if (typeof window.ProfileModalActions === 'undefined') {
    loadScript('/components/modals/profile-modal-actions.js',
        function() {
            // Initialize with page-specific configuration
            if (window.ProfileModalActions) {
                window.ProfileModalActions.init({
                    getCurrentUserId: getCurrentUserId,
                    getCurrentProfileUserId: () => window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null,
                    getSessionToken: getSessionToken,
                    showNotification: showNotification
                });
            }
        },
        function() {
            showNotification('Profile quick actions failed to load. Please refresh the page.', 'error');
        }
    );
}

let currentPage = 1;
let searchResults = [];
const resultsPerPage = 20;
let resultsPresenceReadyPoller = null;

const RESULTS_MOBILE_PORTRAIT_MEDIA_QUERY = '(max-width: 600px) and (orientation: portrait)';
const RESULTS_MOBILE_CARDS_PER_ROW_OPTIONS = [
    { value: '1', label: '1' },
    { value: '2', label: '2' }
];
let resultsDefaultCardsPerRowOptions = null;
let resultsCardsPerRowViewportMode = 'desktop';
let resultsLastDesktopCardsPerRowValue = '4';
let resultsLastMobileCardsPerRowValue = '1';
let resultsCardsPerRowMediaQuery = null;
let resultsCardsPerRowMediaHandler = null;

let searchFiltersPromise = null;
let cachedSearchFilters = null;

async function getSearchFilters() {
    if (cachedSearchFilters) {
        return cachedSearchFilters;
    }

    if (!searchFiltersPromise) {
        searchFiltersPromise = (async () => {
            try {
                const response = await fetch('/api/search/filters');
                if (!response.ok) {
                    return {};
                }
                const payload = await response.json();
                return payload.success && payload.filters ? payload.filters : {};
            } catch (_) {
                return {};
            }
        })();
    }

    cachedSearchFilters = await searchFiltersPromise;
    return cachedSearchFilters;
}

function formatHeightDisplay(heightCm) {
    if (heightCm === undefined || heightCm === null) {
        return '';
    }
    const centimeters = Number(heightCm);
    if (Number.isNaN(centimeters)) {
        return '';
    }
    const totalInches = centimeters / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches - feet * 12);
    return `${feet}'${inches}" (${centimeters}cm)`;
}

function buildFilterLookup(items, getLabel, getExtraKeys) {
    if (!Array.isArray(items)) {
        return {};
    }

    return items.reduce((lookup, item) => {
        if (!item) {
            return lookup;
        }
        const label = typeof getLabel === 'function' ? getLabel(item) : item.name;
        if (!label) {
            return lookup;
        }
        const keys = [];
        if (item.id !== undefined && item.id !== null) {
            keys.push(item.id);
        }
        if (typeof getExtraKeys === 'function') {
            const extraKeys = getExtraKeys(item);
            if (Array.isArray(extraKeys)) {
                keys.push(...extraKeys);
            } else if (extraKeys !== undefined && extraKeys !== null) {
                keys.push(extraKeys);
            }
        }
        registerLookupKeys(lookup, keys, label);
        return lookup;
    }, {});
}

function registerLookupKeys(lookup, keys, label) {
    keys.forEach(key => {
        if (key === undefined || key === null) {
            return;
        }
        lookup[key] = label;
        const stringKey = String(key);
        lookup[stringKey] = label;
        const numericKey = Number(key);
        if (!Number.isNaN(numericKey)) {
            lookup[numericKey] = label;
        }
    });
}

window.__userCardPreferEvents = true;
registerResultsUserCardEventBridges();

// Get search parameters from URL
function getSearchParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const params = {};
    
    for (const [key, value] of urlParams.entries()) {
        if (value !== '' && value !== 'undefined') {
            // Handle comma-separated arrays (country, interests, hobbies)
            if (key === 'country' || key === 'interests' || key === 'hobbies') {
                params[key] = value.split(',').filter(v => v.trim() !== '');
            } else {
                params[key] = value;
            }
        }
    }
    
    return params;
}

// Get session token from URL
// Expose globally for CSRF token management (layout.html also has this, but keep for compatibility)
function getSessionToken() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') || '';
}

// Get current user ID
function getCurrentUserId() {
    // Try session manager first
    if (window.sessionManager && window.sessionManager.getCurrentUser) {
        const user = window.sessionManager.getCurrentUser();
        if (user && user.id) return user.id;
    }
    
    // Try URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const currentUserId = urlParams.get('currentUser');
    if (currentUserId) return parseInt(currentUserId);
    
    // No localStorage fallback
    
    return 2; // Fallback
}

// Resolve a profile's display name for notifications/toasts
function resolveResultsProfileName(profileId, fallbackName = '') {
    const numericId = Number(profileId);
    const profile = searchResults.find(profile => {
        const pid = Number(profile?.id || profile?.user_id);
        return !Number.isNaN(pid) && pid === numericId;
    });
    const rawName = profile?.real_name || profile?.name || profile?.username || profile?.display_name || fallbackName;
    const trimmedName = typeof rawName === 'string' ? rawName.trim() : '';
    if (trimmedName) {
        return trimmedName;
    }
    if (!Number.isNaN(numericId) && numericId) {
        return `User ${numericId}`;
    }
    return 'this user';
}

// Update back to search links
function updateBackToSearchLinks() {
    const sessionToken = getSessionToken();
    const urlParams = new URLSearchParams(window.location.search);
    
    // Preserve all search parameters except system ones
    const searchParams = new URLSearchParams();
    searchParams.set('token', sessionToken);
    
    // Copy all search filter parameters from current URL
    const excludeParams = ['token', 'currentUser', 'userId', 'page', 'timestamp'];
    for (const [key, value] of urlParams.entries()) {
        if (!excludeParams.includes(key) && value && value !== 'undefined') {
            searchParams.set(key, value);
        }
    }
    
    // Add hash to open correct tab (from sessionStorage, referrer, or default to lifestyle)
    let tab = sessionStorage.getItem('searchActiveTab') || 'lifestyle';
    try {
        if (!tab || tab === 'lifestyle') {
            if (document.referrer) {
                const h = new URL(document.referrer).hash;
                if (h) tab = h.substring(1);
            }
        }
    } catch(e) {}
    const backUrl = `/search?${searchParams.toString()}#${tab}`;
    const backLinks = document.querySelectorAll('a[href="/search"], a.back-to-search');
    
    backLinks.forEach(link => {
        link.href = backUrl;
    });
}

// Wait for WebSocket initialization
function waitForWebSocketInitialization() {
    return new Promise((resolve, reject) => {
        const maxWaitTime = 5000;
        const checkInterval = 100;
        let elapsed = 0;
        
        const checkWebSocket = () => {
            if (window.Presence?.initialized ||
                window.instantStatusManager?.isInitialized ||
                (window.io && window.socket?.connected)) {
                resolve();
                return;
            }
            
            elapsed += checkInterval;
            if (elapsed >= maxWaitTime) {
                reject(new Error('WebSocket initialization timeout'));
                return;
            }
            
            setTimeout(checkWebSocket, checkInterval);
        };
        
        checkWebSocket();
    });
}

// Perform search
async function performSearch(params) {
    try {
        document.getElementById('loadingContainer').style.display = 'flex';
        document.getElementById('resultsSection').style.display = 'none';
        
        let userId = getCurrentUserId();
        
        const searchParams = new URLSearchParams();
        searchParams.append('userId', userId);
        
        // Add all filter parameters
        const filterKeys = [
            'ageMin', 'ageMax', 'gender', 'location', 'country', 'distance',
            'onlineNow', 'recentlyActive', 'onlineStatus',
            'withImages', 'verified', 'usePreferredCountries',
            'education', 'occupation', 'income', 'lifestyle', 'smoking', 'drinking', 'children',
            'heightMin', 'heightMax', 'bodyType', 'ethnicity',
            'interests', 'hobbies', 'relationshipType', 'sortBy'
        ];
        
        filterKeys.forEach(key => {
            if (params[key] !== undefined && params[key] !== '') {
                // Handle arrays (country, interests) - join with comma
                if (Array.isArray(params[key])) {
                    if (params[key].length > 0) {
                        searchParams.append(key, params[key].join(','));
                    }
                } else {
                    searchParams.append(key, params[key]);
                }
            }
        });
        
        searchParams.append('page', '1');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`/api/search?${searchParams.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Search API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Normalize results data structure to handle different API response formats
            const normalizedResults = (data.results || []).map(result => {
                // Normalize data structure - handle both API formats
                return {
                    id: result.id || result.user_id || 0,
                    name: result.real_name || result.name || `User${result.id || result.user_id || 'Unknown'}`,
                    real_name: result.real_name || result.name || `User${result.id || result.user_id || 'Unknown'}`,
                    age: result.age || 0,
                    gender: result.gender || null,
                    location: result.location || null,
                    city_name: result.city_name || null,
                    state_name: result.state_name || null,
                    country_name: result.country_name || null,
                    country_emoji: result.country_emoji || null,
                    profile_image: result.profile_image || null,
                    interests: result.interests || [],
                    about: result.about || null,
                    is_online: result.is_online !== undefined ? result.is_online : (result.online !== undefined ? result.online : false),
                    online: result.online !== undefined ? result.online : (result.is_online !== undefined ? result.is_online : false),
                    has_received_messages: result.has_received_messages || false,
                    // Preserve any other fields
                    ...result
                };
            });
            
            searchResults = normalizedResults;
            
            document.getElementById('loadingContainer').style.display = 'none';
            document.getElementById('resultsSection').style.display = 'block';
            
            displayResults(normalizedResults);
            
            if ((data.results || []).length > resultsPerPage) {
                showPagination((data.results || []).length);
            }
        } else {
            throw new Error(data.error || 'Search failed');
        }
        
    } catch (error) {
        showNotification('Search failed. Please try again.', 'error');
        
        document.getElementById('loadingContainer').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'block';
        
        const grid = document.getElementById('resultsGrid');
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: var(--muted-color); padding: 4rem 2rem;">
                <i class="fas fa-exclamation-triangle" style="font-size: 4rem; margin-bottom: 1rem; color: var(--danger-color);"></i>
                <h3 style="font-size: 1.5rem; margin-bottom: 1rem; color: var(--dark-color);">Search Error</h3>
                <p>${error.message}</p>
                <button id="reloadResultsBtn" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary-color); color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Try Again
                </button>
            </div>
        `;
    }
}

// Display results
function displayResults(results) {
    const grid = document.getElementById('resultsGrid');
    const countEl = document.getElementById('resultsCount');
    
    // Safety check for undefined or null results
    if (!results || !Array.isArray(results)) {
        results = [];
    }
    
    countEl.textContent = `${results.length} matches found`;

    if (results.length === 0) {
        const sessionToken = getSessionToken();
        grid.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1;">
                <i class="fas fa-search"></i>
                <h3>No matches found</h3>
                <p>Try adjusting your search criteria to find more people.</p>
                <a href="#" class="back-to-search" id="backToSearchLink" style="margin-top: 1rem;">
                    <i class="fas fa-arrow-left"></i>
                    Back to Search
                </a>
            </div>
        `;
        return;
    }

    const totalPages = Math.ceil(results.length / resultsPerPage);
    const startIndex = (currentPage - 1) * resultsPerPage;
    const endIndex = startIndex + resultsPerPage;
    const currentPageResults = results.slice(startIndex, endIndex);

    // Validate and filter out invalid profiles
    const validProfiles = currentPageResults.filter(profile => {
        return profile && typeof profile === 'object' && profile.id;
    });
    
    if (validProfiles.length === 0 && currentPageResults.length > 0) {
        grid.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1;">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Unable to display results</h3>
                <p>Please try refreshing the page.</p>
            </div>
        `;
        return;
    }
    
    const activeColumnsValue = getCardsPerRowValue();
    const parsedColumnsValue = Number(activeColumnsValue) || 4;

    const cardsHTML = validProfiles.map(profile => {
        if (window.renderResultsUserCard) {
            return window.renderResultsUserCard(profile, parsedColumnsValue);
        }
        return `<div class="online-user-card"><div class="user-info"><h4>Loading...</h4></div></div>`;
    }).join('');
    grid.innerHTML = cardsHTML;

    if (typeof updateGridColumns === 'function') {
        updateGridColumns(activeColumnsValue);
        requestAnimationFrame(() => updateGridColumns(activeColumnsValue));
    } else {
        applyUserCardColumnAttributes(activeColumnsValue);
    }
    
    // Setup event handlers using component function
    if (window.setupResultsUserCardEvents) {
        window.setupResultsUserCardEvents(grid);
    } else {
        // Fallback event handlers if component not loaded
        setTimeout(() => {
            grid.querySelectorAll('[data-view-profile]').forEach(card => {
                card.addEventListener('click', function() {
                    if (window.viewProfile) {
                        window.viewProfile(parseInt(this.dataset.viewProfile));
                    }
                });
            });
        }, 100);
    }
    if (totalPages > 1) {
        showPagination(results.length);
    } else {
        document.getElementById('paginationContainer').style.display = 'none';
    }
    registerStatusElements();
}

// Register status elements
function registerStatusElements() {
    const statusElements = document.querySelectorAll('.online-dot-results[data-user-id]');
    if (!statusElements.length) {
        resetResultsPresenceFallbacks();
        return;
    }

    if (bindResultsIndicators(statusElements)) {
        return;
    }

    if (!resultsPresenceReadyPoller) {
        resultsPresenceReadyPoller = setInterval(() => {
            if (bindResultsIndicators(statusElements)) {
                return;
            }
        }, 500);

        setTimeout(() => {
            if (resultsPresenceReadyPoller) {
                clearInterval(resultsPresenceReadyPoller);
                resultsPresenceReadyPoller = null;
            }
        }, 12000);
    }
}

function bindResultsIndicators(statusElements) {
    const presence = window.Presence;
    if (!presence?.bindIndicator) {
        return false;
    }

    statusElements.forEach(element => {
        const userId = element.dataset.userId;
        if (userId) {
            presence.bindIndicator(element, userId, { variant: 'dot' });
        }
    });

    resetResultsPresenceFallbacks();
    return true;
}

function resetResultsPresenceFallbacks() {
    if (resultsPresenceReadyPoller) {
        clearInterval(resultsPresenceReadyPoller);
        resultsPresenceReadyPoller = null;
    }
}

// Pagination
function showPagination(totalResults) {
    const totalPages = Math.ceil(totalResults / resultsPerPage);
    const paginationContainer = document.getElementById('paginationContainer');
    const pageNumbers = document.getElementById('pageNumbers');
    
    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';

    let pagesHTML = '';
    const maxVisiblePages = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        pagesHTML += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            pagesHTML += `<span class="page-ellipsis">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === currentPage;
        pagesHTML += `<button class="page-btn ${isActive ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            pagesHTML += `<span class="page-ellipsis">...</span>`;
        }
        pagesHTML += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    pageNumbers.innerHTML = pagesHTML;
    pageNumbers.querySelectorAll('[data-page]').forEach(btn=>{btn.addEventListener('click',function(){goToPage(parseInt(this.dataset.page));});});
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    
    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;
}

// Page navigation
function changePage(direction) {
    const totalPages = Math.ceil(searchResults.length / resultsPerPage);
    const newPage = currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        displayResults(searchResults);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function goToPage(page) {
    const totalPages = Math.ceil(searchResults.length / resultsPerPage);
    
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        displayResults(searchResults);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Profile actions
function viewProfile(profileId) {
    openProfileModal(profileId);
}

// Modal functions are now in external file: /components/modals/user-profile-modal.js
// Override getCurrentUserId for this page if needed
if (window.UserProfileModal) {
    window.UserProfileModal.setGetCurrentUserId(getCurrentUserId);
    window.UserProfileModal.setGetSessionToken(getSessionToken);
}

// Fallback closeProfileModal function in case modal script hasn't loaded yet
if (typeof window.closeProfileModal !== 'function') {
    window.closeProfileModal = function() {
        const modal = document.getElementById('userProfileModal');
        if (modal) {
            modal.style.display = 'none';
        }
    };
}

function showNotification(message, type = 'info', iconOverride = null) {
    const iconMap = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle',
        favorite: 'star',
        like: 'heart'
    };
    const normalizedType = iconMap[type] ? type : 'info';
    const iconClass = iconOverride || iconMap[normalizedType];
    const notification = document.createElement('div');
    notification.className = `notification notification-${normalizedType}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${iconClass}"></i>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 1800);
}

function likeProfileInModal() {
    if (window.ProfileModalActions) {
        window.ProfileModalActions.likeProfileInModal();
    } else {
        showNotification('Profile actions are not ready yet. Please try again.', 'error');
    }
}

function favouriteProfileInModal() {
    if (window.ProfileModalActions) {
        window.ProfileModalActions.favouriteProfileInModal();
    } else {
        showNotification('Profile actions are not ready yet. Please try again.', 'error');
    }
}

function messageProfileInModal() {
    const currentProfileUserId = window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null;
    if (!currentProfileUserId) {
        return;
    }
    
    // Get profile real_name from the modal
    const realNameElement = document.getElementById('modal-profile-real_name');
    const real_name = realNameElement ? realNameElement.textContent.trim() : '';

    if (!real_name) {
        showNotification('Profile data not loaded. Please try again.', 'error');
        return;
    }
    
    // Close modal and open message modal
    if (typeof window.closeProfileModal === 'function') {
        window.closeProfileModal();
    }
    messageProfile(real_name);

    // Ensure universal message modal knows the receiver ID
    setTimeout(() => {
        if (window.universalMessageData) {
            window.universalMessageData.receiverId = currentProfileUserId;
        }
    }, 100);
}

async function blockProfileInModal() {
    const currentProfileUserId = window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null;
    if (!currentProfileUserId) {
        return;
    }
    
    // Check email verification before blocking
    const isVerified = await window.checkEmailVerificationStatus();
    if (!isVerified) {
        window.showVerificationMessage();
        return; // Don't proceed with block action
    }
    
    const real_nameElement = document.getElementById('modal-profile-real_name');
    const real_name = real_nameElement ? real_nameElement.textContent.trim().split(' ')[0] : 'this user';
    
    // Show custom confirmation dialog
    document.getElementById('blockUsername').textContent = real_name;
    document.getElementById('blockConfirmModal').style.display = 'flex';
    
    // Store context for confirmBlock function
    window.pendingBlockUserId = currentProfileUserId;
    window.pendingBlockContext = 'results';
}

window.closeBlockConfirm = function() {
    document.getElementById('blockConfirmModal').style.display = 'none';
    window.pendingBlockUserId = null;
    window.pendingBlockContext = null;
};

window.confirmBlock = function() {
    if (window.pendingBlockUserId) {
        const currentUserId = getCurrentUserId();
        const userIdToBlock = window.pendingBlockUserId;
        const context = window.pendingBlockContext;
        
        fetch(`/api/users/${userIdToBlock}/block`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId,
                'Authorization': `Bearer ${getSessionToken()}`
            },
            body: JSON.stringify({
                reason: context === 'card' ? 'Blocked from search results' : 'Blocked from results page'
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('User blocked successfully', 'success');
                
                if (context === 'results') {
                    if (typeof window.closeProfileModal === 'function') {
                        window.closeProfileModal();
                    }
                }
                
                // Remove blocked user from results
                const userCard = document.querySelector(`[data-user-id="${userIdToBlock}"]`);
                if (userCard) {
                    userCard.remove();
                }
                
                // Update results count
                const resultsCount = document.querySelector('.results-count');
                if (resultsCount) {
                    const currentCount = parseInt(resultsCount.textContent.match(/\d+/)?.[0] || 0);
                    if (currentCount > 0) {
                        resultsCount.textContent = `${currentCount - 1} matches found`;
                    }
                }
            } else {
                showNotification('Failed to block user', 'error');
            }
        })
        .catch(error => {
            showNotification('Failed to block user', 'error');
        });
    }
    closeBlockConfirm();
};

async function reportProfileInModal() {
    const currentProfileUserId = window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null;
    if (!currentProfileUserId) {
        return;
    }
    
    // Check email verification before reporting
    const isVerified = await window.checkEmailVerificationStatus();
    if (!isVerified) {
        window.showVerificationMessage();
        return; // Don't proceed with report action
    }
    
    // Get real_name from modal
    const real_nameElement = document.getElementById('modal-profile-real_name');
    const real_name = real_nameElement ? real_nameElement.textContent.trim().split(' ')[0] : `User ${currentProfileUserId}`;
    
    // Open report modal
    if (typeof openReportModal === 'function') {
        openReportModal(currentProfileUserId, real_name);
    } else {
        alert('Report functionality is not available. Please refresh the page.');
    }
}

async function likeProfile(profileId, real_name) {
    // Check email verification before allowing like action
    if (window.checkEmailVerificationStatus) {
        const isVerified = await window.checkEmailVerificationStatus();
        if (!isVerified) {
            window.showVerificationMessage();
            return; // Don't proceed with like action
        }
    }

    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
        showNotification('Authentication required', 'error');
        return;
    }
    const sessionToken = getSessionToken();
    const headers = {
        'Content-Type': 'application/json',
        'X-User-ID': currentUserId
    };
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
        headers['X-Session-Token'] = sessionToken;
    }
    const tokenParam = sessionToken ? `?token=${sessionToken}` : '';
    
    try {
        const response = await fetch(`/api/likes${tokenParam}`, {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify({ userId: profileId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Like sent!', 'like');
        } else if (data.alreadyExists || data.message?.toLowerCase().includes('already')) {
            const displayUsername = resolveResultsProfileName(profileId, real_name);
            showNotification(`You already liked ${displayUsername}`, 'like');
        } else {
            throw new Error(data.error || 'Failed to like profile');
        }
    } catch (error) {
        showNotification('Failed to like profile', 'error');
    }
}

function messageProfile(real_name) {
    if (!real_name) {
        return;
    }
    if (typeof openUniversalMessageModal === 'function') {
        openUniversalMessageModal(real_name, false, null);
    } else {
        showNotification('Messaging is not available right now. Please refresh and try again.', 'error');
    }
}

window.viewProfile = viewProfile;
window.likeProfile = likeProfile;
window.addToFavourite = addToFavourite;
window.messageProfile = messageProfile;

async function addToFavourite(profileId) {
    // Check email verification before allowing favourite action
    if (window.checkEmailVerificationStatus) {
        const isVerified = await window.checkEmailVerificationStatus();
        if (!isVerified) {
            window.showVerificationMessage();
            return; // Don't proceed with favourite action
        }
    }
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
        showNotification('Authentication required', 'error');
        return;
    }
    const sessionToken = getSessionToken();
    const headers = {
        'Content-Type': 'application/json',
        'X-User-ID': currentUserId
    };
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
        headers['X-Session-Token'] = sessionToken;
    }
    const tokenParam = sessionToken ? `?token=${sessionToken}` : '';
    
    try {
        const response = await fetch(`/api/favorites${tokenParam}`, {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify({ userId: profileId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Added to favourites!', 'favorite', 'star');
        } else if (data.alreadyExists) {
            const displayUsername = resolveResultsProfileName(profileId);
            showNotification(`${displayUsername} is already in your favourites`, 'favorite', 'star');
        } else {
            throw new Error(data.message || data.error || 'Failed to add to favourites');
        }
    } catch (error) {
        showNotification('Failed to add to favourites', 'error');
    }
}

function registerResultsUserCardEventBridges() {
    if (window.__resultsUserCardEventsRegistered) {
        return;
    }
    window.__resultsUserCardEventsRegistered = true;

    const toNumber = (value) => {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? null : parsed;
    };

    const resolveProfileById = (profileId) => {
        const numericId = Number(profileId);
        if (Number.isNaN(numericId)) {
            return null;
        }
        return searchResults.find(profile => Number(profile.id) === numericId || Number(profile.user_id) === numericId) || null;
    };

    window.addEventListener('view-profile', (event) => {
        const profileId = toNumber(event?.detail?.profileId);
        if (profileId) {
            viewProfile(profileId);
        }
    });

    window.addEventListener('like-profile', (event) => {
        const profileId = toNumber(event?.detail?.profileId);
        if (profileId) {
            likeProfile(profileId);
        }
    });

    window.addEventListener('favorite-profile', (event) => {
        const profileId = toNumber(event?.detail?.profileId);
        if (profileId) {
            addToFavourite(profileId);
        }
    });

    window.addEventListener('message-profile', (event) => {
        const profileId = toNumber(event?.detail?.profileId);
        if (!profileId) {
            return;
        }
        const profile = resolveProfileById(profileId);
        const displayName = profile?.real_name || profile?.name || '';
        if (displayName) {
            messageProfile(displayName);
        } else {
            viewProfile(profileId);
        }
    });
}

// Block profile from card
async function blockProfileFromCard(profileId, real_name) {
    // Check email verification before blocking
    const isVerified = await window.checkEmailVerificationStatus();
    if (!isVerified) {
        window.showVerificationMessage();
        return; // Don't proceed with block action
    }
    
    // Show custom confirmation dialog
    document.getElementById('blockUsername').textContent = real_name;
    document.getElementById('blockConfirmModal').style.display = 'flex';
    
    // Store context for confirmBlock function
    window.pendingBlockUserId = profileId;
    window.pendingBlockContext = 'card';
}

// Report profile from card
async function reportProfileFromCard(profileId, real_name) {
    // Check email verification before reporting
    const isVerified = await window.checkEmailVerificationStatus();
    if (!isVerified) {
        window.showVerificationMessage();
        return; // Don't proceed with report action
    }
    
    // Open report modal
    if (typeof openReportModal === 'function') {
        openReportModal(profileId, real_name);
    } else {
        alert('Report functionality is not available. Please refresh the page.');
    }
}


function cacheResultsCardsPerRowOptions(select) {
    if (resultsDefaultCardsPerRowOptions || !select) {
        return;
    }
    resultsDefaultCardsPerRowOptions = Array.from(select.options).map(option => ({
        value: option.value,
        label: option.textContent,
        selected: option.selected
    }));

    const initialSelection = resultsDefaultCardsPerRowOptions.find(option => option.selected) || resultsDefaultCardsPerRowOptions[0];
    if (initialSelection) {
        resultsLastDesktopCardsPerRowValue = initialSelection.value;
    }
}

function setResultsCardsPerRowOptions(select, options, fallbackValue) {
    if (!select || !Array.isArray(options)) {
        return;
    }

    const fragment = document.createDocumentFragment();
    options.forEach(optionData => {
        if (!optionData || !optionData.value) {
            return;
        }
        const option = document.createElement('option');
        option.value = optionData.value;
        option.textContent = optionData.label || optionData.value;
        if (optionData.selected) {
            option.selected = true;
        }
        fragment.appendChild(option);
    });

    select.innerHTML = '';
    select.appendChild(fragment);

    if (fallbackValue && options.some(option => option.value === fallbackValue)) {
        select.value = fallbackValue;
    } else {
        const selectedOption = options.find(option => option.selected);
        if (selectedOption) {
            select.value = selectedOption.value;
        } else if (!select.value && options.length) {
            select.value = options[0].value;
        }
    }
}

function isResultsMobilePortraitViewport() {
    if (typeof window === 'undefined') {
        return false;
    }

    if (!resultsCardsPerRowMediaQuery && window.matchMedia) {
        resultsCardsPerRowMediaQuery = window.matchMedia(RESULTS_MOBILE_PORTRAIT_MEDIA_QUERY);
    }

    if (resultsCardsPerRowMediaQuery) {
        return resultsCardsPerRowMediaQuery.matches;
    }

    return window.innerWidth <= 600 && window.innerWidth <= window.innerHeight;
}

function updateCardsPerRowOptionsForViewport(forceApply = false) {
    const select = document.getElementById('cardsPerRow');
    if (!select) {
        return;
    }

    cacheResultsCardsPerRowOptions(select);
    if (!resultsDefaultCardsPerRowOptions) {
        return;
    }

    const mobilePortrait = isResultsMobilePortraitViewport();
    const desiredMode = mobilePortrait ? 'mobile' : 'desktop';

    if (!forceApply && desiredMode === resultsCardsPerRowViewportMode) {
        return;
    }

    resultsCardsPerRowViewportMode = desiredMode;

    if (desiredMode === 'mobile') {
        const options = RESULTS_MOBILE_CARDS_PER_ROW_OPTIONS.map(option => ({
            ...option,
            selected: option.value === resultsLastMobileCardsPerRowValue
        }));
        setResultsCardsPerRowOptions(select, options, resultsLastMobileCardsPerRowValue);
        if (!['1', '2'].includes(select.value)) {
            select.value = '1';
        }
        resultsLastMobileCardsPerRowValue = select.value;
    } else {
        const options = resultsDefaultCardsPerRowOptions.map(option => ({
            ...option,
            selected: option.value === resultsLastDesktopCardsPerRowValue
        }));
        setResultsCardsPerRowOptions(select, options, resultsLastDesktopCardsPerRowValue);
        if (!resultsDefaultCardsPerRowOptions.some(option => option.value === select.value)) {
            select.value = resultsDefaultCardsPerRowOptions[0]?.value || '4';
        }
        resultsLastDesktopCardsPerRowValue = select.value;
    }

    if (currentView === 'grid') {
        updateGridColumns(select.value);
    }
}

function bindResultsCardsPerRowViewportWatcher() {
    if (typeof window === 'undefined' || !window.matchMedia) {
        return;
    }

    if (!resultsCardsPerRowMediaQuery) {
        resultsCardsPerRowMediaQuery = window.matchMedia(RESULTS_MOBILE_PORTRAIT_MEDIA_QUERY);
    }

    if (!resultsCardsPerRowMediaQuery) {
        return;
    }

    if (resultsCardsPerRowMediaHandler) {
        return;
    }

    resultsCardsPerRowMediaHandler = () => updateCardsPerRowOptionsForViewport(true);

    if (resultsCardsPerRowMediaQuery.addEventListener) {
        resultsCardsPerRowMediaQuery.addEventListener('change', resultsCardsPerRowMediaHandler);
    } else if (resultsCardsPerRowMediaQuery.addListener) {
        resultsCardsPerRowMediaQuery.addListener(resultsCardsPerRowMediaHandler);
    }
}

function getCardsPerRowValue() {
    const select = document.getElementById('cardsPerRow');
    return select ? (select.value || '4') : '4';
}

function applyUserCardColumnAttributes(value) {
    const resultsGrid = document.getElementById('resultsGrid');
    if (!resultsGrid) {
        return;
    }

    resultsGrid.querySelectorAll('.uc-card').forEach(card => {
        card.dataset.columns = value;
    });

    resultsGrid.querySelectorAll('.uc-image-container').forEach(container => {
        container.dataset.columns = value;
    });
}

// Handle cards per row control
function setupCardsPerRowControl() {
    const cardsPerRowSelect = document.getElementById('cardsPerRow');
    const resultsGrid = document.getElementById('resultsGrid');
    
    if (!cardsPerRowSelect || !resultsGrid) {
        return;
    }

    cacheResultsCardsPerRowOptions(cardsPerRowSelect);
    updateCardsPerRowOptionsForViewport(true);
    bindResultsCardsPerRowViewportWatcher();

    cardsPerRowSelect.addEventListener('change', function(e) {
        if (currentView !== 'grid') {
            return;
        }
        const value = e.target.value;
        if (resultsCardsPerRowViewportMode === 'mobile') {
            resultsLastMobileCardsPerRowValue = value;
        } else {
            resultsLastDesktopCardsPerRowValue = value;
        }
        updateGridColumns(value);
    });
}

// Helper function to ensure mobile constraints are always enforced
function enforceMobileGridConstraints() {
    if (!isResultsMobilePortraitViewport()) {
        return;
    }

    if (currentView !== 'grid') {
        return;
    }

    updateGridColumns(getCardsPerRowValue());
}

function updateGridColumns(value) {
    const resultsGrid = document.getElementById('resultsGrid');
    if (!resultsGrid) {
        return;
    }
    const sanitizedValue = String(value || '4');
    const allowedValues = ['1', '2', '3', '4', '5', '6'];
    const finalValue = allowedValues.includes(sanitizedValue) ? sanitizedValue : '4';
    const isListView = resultsGrid.classList.contains('list-view');

    resultsGrid.setAttribute('data-columns', finalValue);

    resultsGrid.classList.remove('columns-1', 'columns-2', 'columns-3', 'columns-4', 'columns-5', 'columns-6');
    if (!isListView) {
        resultsGrid.classList.add(`columns-${finalValue}`);
        const numericValue = parseInt(finalValue, 10) || 4;
        resultsGrid.style.gridTemplateColumns = `repeat(${numericValue}, minmax(0, 1fr))`;
    } else {
        resultsGrid.style.removeProperty('grid-template-columns');
    }

    applyUserCardColumnAttributes(finalValue);

    if (isListView) {
        return;
    }

    const imageHeight = (finalValue === '1' || finalValue === '3') ? '250px' : (finalValue === '2' ? '260px' : '140px');

    function applyImageHeights() {
        const imageContainers = resultsGrid.querySelectorAll('.online-user-card > div:first-child, .online-user-card .user-image-container');
        if (imageContainers.length === 0) {
            return;
        }

        imageContainers.forEach(container => {
            container.style.removeProperty('aspect-ratio');
            container.style.removeProperty('height');
            container.style.removeProperty('min-height');
            container.style.removeProperty('max-height');
            container.style.height = imageHeight;
            container.style.minHeight = imageHeight;
            container.style.maxHeight = imageHeight;
            container.style.aspectRatio = 'unset';
            container.setAttribute('data-columns', finalValue);
            container.setAttribute('data-forced-height', imageHeight);
        });

        resultsGrid.querySelectorAll('.online-user-card .user-avatar').forEach(img => {
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.objectPosition = 'center center';
        });
    }

    applyImageHeights();
    setTimeout(applyImageHeights, 100);
    requestAnimationFrame(applyImageHeights);

    resultsGrid.dispatchEvent(new CustomEvent('gridColumnsChanged', {
        detail: { columns: finalValue, imageHeight }
    }));
}

// Display search parameters
async function displaySearchParameters(params) {
    const paramsContainer = document.getElementById('searchParameters');
    if (!paramsContainer) return;
    
    const paramLabels = [];
    const filters = await getSearchFilters();
    const filterLookups = {
        education: buildFilterLookup(filters?.educationLevels),
        occupation: buildFilterLookup(filters?.occupationCategories),
        income: buildFilterLookup(filters?.incomeRanges),
        lifestyle: buildFilterLookup(filters?.lifestylePreferences),
        smoking: buildFilterLookup(filters?.smokingPreferences),
        drinking: buildFilterLookup(filters?.drinkingPreferences),
        bodyType: buildFilterLookup(filters?.bodyTypes),
        ethnicity: buildFilterLookup(filters?.ethnicities),
        interests: buildFilterLookup(filters?.interests),
        hobbies: buildFilterLookup(filters?.hobbies),
        height: buildFilterLookup(
            filters?.heights,
            (item) => {
                if (!item) {
                    return '';
                }
                const hasFormattedText = item.display_text && (item.display_text.includes("'") || item.display_text.includes('"'));
                return hasFormattedText ? item.display_text : formatHeightDisplay(item.height_cm);
            },
            (item) => [item?.height_cm]
        )
    };
    
    // Age range
    if (params.ageMin || params.ageMax) {
        const ageMin = params.ageMin || '18';
        const ageMax = params.ageMax || '99';
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-birthday-cake" style="font-size: 0.972rem;"></i> Age: ${ageMin}-${ageMax}</span>`);
    }
    
    // Gender
    if (params.gender) {
        const genderLower = (params.gender || '').toLowerCase().trim();
        const genderMap = {
            'male': 'Male',
            'female': 'Female',
            'm': 'Male',
            'f': 'Female'
        };
        const genderDisplay = genderMap[genderLower] || params.gender;
        const isFemale = (genderLower === 'female' || genderLower === 'f');
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-${isFemale ? 'venus' : 'mars'}" style="font-size: 0.972rem;"></i> ${genderDisplay}</span>`);
    }
    
    // Relationship Type
    if (params.relationshipType) {
        // Capitalize first letter of each word
        const relationshipDisplay = params.relationshipType
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-heart" style="font-size: 0.972rem;"></i> ${relationshipDisplay}</span>`);
    }
    
    // Location
    if (params.location) {
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-map-marker-alt" style="font-size: 0.972rem;"></i> Location: ${params.location}</span>`);
    }
    
    // Preferred Countries
    if (params.usePreferredCountries === 'true' || params.usePreferredCountries === true) {
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-globe" style="font-size: 0.972rem;"></i> My preferred countries</span>`);
    }
    
    // Country - convert IDs to names
    let countryDisplay = '';
    if (params.country && (!params.usePreferredCountries || params.usePreferredCountries !== 'true' && params.usePreferredCountries !== true)) {
        const countryIds = Array.isArray(params.country) ? params.country : [params.country];
        if (countryIds.length > 0) {
            try {
                // Fetch country names from API
                const response = await fetch('/api/countries');
                const data = await response.json();
                
                if (data.success && data.countries) {
                    const countryMap = {};
                    // Create map with both string and number keys
                    data.countries.forEach(country => {
                        countryMap[country.id] = country.name;
                        countryMap[String(country.id)] = country.name;
                        countryMap[parseInt(country.id)] = country.name;
                    });
                    
                    const countryNames = countryIds
                        .map(id => {
                            // Try multiple key formats
                            return countryMap[id] || 
                                   countryMap[String(id)] || 
                                   countryMap[parseInt(id)] || 
                                   countryMap[Number(id)] ||
                                   id;
                        })
                        .filter(name => name && name !== 'undefined' && name !== 'null');
                    
                    if (countryNames.length > 0) {
                        countryDisplay = countryNames.length > 2 
                            ? `${countryNames.slice(0, 2).join(', ')} +${countryNames.length - 2} more`
                            : countryNames.join(', ');
                    } else {
                        // Fallback to IDs if no names found
                        countryDisplay = countryIds.length > 2 
                            ? `${countryIds.slice(0, 2).join(', ')} +${countryIds.length - 2} more`
                            : countryIds.join(', ');
                    }
                } else {
                    // Fallback to IDs if API fails
                    countryDisplay = countryIds.length > 2 
                        ? `${countryIds.slice(0, 2).join(', ')} +${countryIds.length - 2} more`
                        : countryIds.join(', ');
                }
            } catch (error) {
                // Fallback to IDs if API fails
                countryDisplay = countryIds.length > 2 
                    ? `${countryIds.slice(0, 2).join(', ')} +${countryIds.length - 2} more`
                    : countryIds.join(', ');
            }
            
            if (countryDisplay) {
                paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-globe" style="font-size: 0.972rem;"></i> ${countryDisplay}</span>`);
            }
        }
    }
    
    // Distance
    if (params.distance) {
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-ruler" style="font-size: 0.972rem;"></i> Within ${params.distance} km</span>`);
    }
    
    // Online status
    if (params.onlineNow === 'true' || params.onlineNow === true) {
        paramLabels.push(`<span style="background: rgba(0, 184, 148, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;" aria-label="Online now" title="Online now"><i class="fas fa-circle" style="color: #00b894; font-size: 0.756rem;"></i></span>`);
    }
    
    if (params.recentlyActive === 'true' || params.recentlyActive === true) {
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-clock" style="font-size: 0.972rem;"></i> Recently active</span>`);
    }
    
    // With images
    if (params.withImages === 'true' || params.withImages === true) {
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-image" style="font-size: 0.972rem;"></i> With photos</span>`);
    }
    
    // Verified
    if (params.verified === 'true' || params.verified === true) {
        paramLabels.push(`<span style="background: rgba(0, 184, 148, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-check-circle" style="font-size: 0.972rem;"></i> Verified</span>`);
    }
    
    // Education
    if (params.education) {
        const educationLookup = filterLookups.education || {};
        const educationDisplay = educationLookup[params.education] || educationLookup[String(params.education)] || educationLookup[parseInt(params.education, 10)];
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-graduation-cap" style="font-size: 0.972rem;"></i> ${educationDisplay || params.education}</span>`);
    }
    
    // Occupation
    if (params.occupation) {
        const occupationLookup = filterLookups.occupation || {};
        const occupationDisplay = occupationLookup[params.occupation] || occupationLookup[String(params.occupation)] || occupationLookup[parseInt(params.occupation, 10)];
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-briefcase" style="font-size: 0.972rem;"></i> ${occupationDisplay || params.occupation}</span>`);
    }
    
    // Income
    if (params.income) {
        const incomeLookup = filterLookups.income || {};
        const incomeDisplay = incomeLookup[params.income] || incomeLookup[String(params.income)] || incomeLookup[parseInt(params.income, 10)];
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-dollar-sign" style="font-size: 0.972rem;"></i> ${incomeDisplay || params.income}</span>`);
    }
    
    // Lifestyle
    if (params.lifestyle) {
        const lifestyleLookup = filterLookups.lifestyle || {};
        const lifestyleDisplay = lifestyleLookup[params.lifestyle] || lifestyleLookup[String(params.lifestyle)] || lifestyleLookup[parseInt(params.lifestyle, 10)];
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-heart" style="font-size: 0.972rem;"></i> ${lifestyleDisplay || params.lifestyle}</span>`);
    }
    
    // Smoking
    if (params.smoking) {
        const smokingLookup = filterLookups.smoking || {};
        const smokingDisplay = smokingLookup[params.smoking] || smokingLookup[String(params.smoking)] || smokingLookup[parseInt(params.smoking, 10)];
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-smoking-ban" style="font-size: 0.972rem;"></i> ${smokingDisplay || params.smoking}</span>`);
    }
    
    // Drinking
    if (params.drinking) {
        const drinkingLookup = filterLookups.drinking || {};
        const drinkingDisplay = drinkingLookup[params.drinking] || drinkingLookup[String(params.drinking)] || drinkingLookup[parseInt(params.drinking, 10)];
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-wine-glass" style="font-size: 0.972rem;"></i> ${drinkingDisplay || params.drinking}</span>`);
    }
    
    // Children
    if (params.children) {
        const childrenMap = {'has_children': 'Has children', 'no_children': 'No children'};
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-child" style="font-size: 0.972rem;"></i> ${childrenMap[params.children] || params.children}</span>`);
    }
    
    // Height Range
    if (params.heightMin || params.heightMax) {
        const heightLookup = filterLookups.height || {};
        const resolveHeightLabel = (value) => {
            if (!value && value !== 0) {
                return '';
            }
            return heightLookup[value] || heightLookup[String(value)] || heightLookup[parseInt(value, 10)] || formatHeightDisplay(value);
        };
        const heightMinText = params.heightMin ? resolveHeightLabel(params.heightMin) : '';
        const heightMaxText = params.heightMax ? resolveHeightLabel(params.heightMax) : '';
        const heightDisplay = heightMinText && heightMaxText ? `${heightMinText} - ${heightMaxText}` : (heightMinText || heightMaxText);
        
        if (heightDisplay) {
            paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-ruler-vertical" style="font-size: 0.972rem;"></i> ${heightDisplay}</span>`);
        }
    }
    
    // Body Type
    if (params.bodyType) {
        const bodyTypeLookup = filterLookups.bodyType || {};
        const bodyTypeDisplay = bodyTypeLookup[params.bodyType] || bodyTypeLookup[String(params.bodyType)] || bodyTypeLookup[parseInt(params.bodyType, 10)];
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-user" style="font-size: 0.972rem;"></i> ${bodyTypeDisplay || params.bodyType}</span>`);
    }
    
    // Ethnicity
    if (params.ethnicity) {
        const ethnicityLookup = filterLookups.ethnicity || {};
        const ethnicityDisplay = ethnicityLookup[params.ethnicity] || ethnicityLookup[String(params.ethnicity)] || ethnicityLookup[parseInt(params.ethnicity, 10)];
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-globe-americas" style="font-size: 0.972rem;"></i> ${ethnicityDisplay || params.ethnicity}</span>`);
    }
    
    // Interests
    if (params.interests) {
        const interests = Array.isArray(params.interests) ? params.interests : [params.interests];
        if (interests.length > 0) {
            const interestsLookup = filterLookups.interests || {};
            const interestNames = interests
                .map(id => {
                    return interestsLookup[id] || interestsLookup[String(id)] || interestsLookup[parseInt(id, 10)] || id;
                })
                .filter(name => name && name !== 'undefined' && name !== 'null');
            
            if (interestNames.length > 0) {
                const interestsBadges = interestNames.map(name => {
                    return `<span style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.8rem; background: rgba(102, 126, 234, 0.1); border: 2px solid rgba(102, 126, 234, 0.3); border-radius: 20px; font-size: 0.9rem; font-weight: 500; color: var(--dark-color); margin-right: 0.5rem; margin-bottom: 0.5rem;"><i class="fas fa-heart" style="font-size: 0.85rem; color: var(--primary);"></i> ${name}</span>`;
                }).join('');
                paramLabels.push(`<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;"><span style="font-weight: 600; margin-right: 0.5rem;">Interests:</span>${interestsBadges}</div>`);
            }
        }
    }
    
    // Hobbies
    if (params.hobbies) {
        const hobbies = Array.isArray(params.hobbies) ? params.hobbies : [params.hobbies];
        if (hobbies.length > 0) {
            const hobbiesLookup = filterLookups.hobbies || {};
            const hobbyNames = hobbies
                .map(id => {
                    return hobbiesLookup[id] || hobbiesLookup[String(id)] || hobbiesLookup[parseInt(id, 10)] || id;
                })
                .filter(name => name && name !== 'undefined' && name !== 'null');
            
            if (hobbyNames.length > 0) {
                const hobbiesBadges = hobbyNames.map(name => {
                    return `<span style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.8rem; background: rgba(102, 126, 234, 0.1); border: 2px solid rgba(102, 126, 234, 0.3); border-radius: 20px; font-size: 0.9rem; font-weight: 500; color: var(--dark-color); margin-right: 0.5rem; margin-bottom: 0.5rem;"><i class="fas fa-palette" style="font-size: 0.85rem; color: var(--primary);"></i> ${name}</span>`;
                }).join('');
                paramLabels.push(`<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;"><span style="font-weight: 600; margin-right: 0.5rem;">Hobbies:</span>${hobbiesBadges}</div>`);
            }
        }
    }
    
    if (paramLabels.length === 0) {
        paramsContainer.innerHTML = '<span style="color: var(--muted-color); font-style: italic; font-size: 0.972rem; font-weight: normal;">No specific filters applied</span>';
    } else {
        paramsContainer.innerHTML = paramLabels.join('');
    }
}

// View toggle functionality
let currentView = 'grid'; // Default to grid view

function toggleView(view) {
    currentView = view;
    const resultsGrid = document.getElementById('resultsGrid');
    const viewButtons = document.querySelectorAll('.view-btn');
    const cardsPerRowSelect = document.getElementById('cardsPerRow');
    
    // Update button states
    viewButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Enable/disable cards per row control based on view
    if (cardsPerRowSelect) {
        if (view === 'list') {
            cardsPerRowSelect.disabled = true;
            cardsPerRowSelect.style.opacity = '0.5';
            cardsPerRowSelect.style.cursor = 'not-allowed';
        } else {
            cardsPerRowSelect.disabled = false;
            cardsPerRowSelect.style.opacity = '1';
            cardsPerRowSelect.style.cursor = 'pointer';
        }
    }
    
    if (resultsGrid) {
        if (view === 'list') {
            // Remove column classes and add list-view class
            resultsGrid.classList.remove('columns-3', 'columns-4', 'columns-5', 'columns-6');
            resultsGrid.classList.add('list-view');
            // Remove inline styles for list view
            resultsGrid.style.removeProperty('grid-template-columns');
        } else {
            // Remove list-view class and restore grid columns
            resultsGrid.classList.remove('list-view');
            if (cardsPerRowSelect) {
                updateGridColumns(cardsPerRowSelect.value);
            }
            // Enforce mobile constraints after switching to grid view
            enforceMobileGridConstraints();
        }
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
    setupCardsPerRowControl();
    // Enforce mobile constraints on initial load
    enforceMobileGridConstraints();
    const searchParams = getSearchParams();
    
    // Setup view toggle buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.dataset.view;
            toggleView(view);
        });
    });
    
// Handle window resize to ensure mobile CSS (2 columns) is always applied
let resizeTimeout;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
        updateCardsPerRowOptionsForViewport();
        const resultsGrid = document.getElementById('resultsGrid');
        if (resultsGrid && currentView === 'grid') {
            updateGridColumns(getCardsPerRowValue());
        }
    }, 100);
});

// Also enforce on orientation change (mobile devices)
window.addEventListener('orientationchange', function() {
    setTimeout(function() {
        updateCardsPerRowOptionsForViewport(true);
        if (currentView === 'grid') {
            updateGridColumns(getCardsPerRowValue());
        }
    }, 100);
});
    
    // Display search parameters (async)
    displaySearchParameters(searchParams).catch(() => {
        showNotification('Some search filters could not be displayed.', 'error');
    });
    
    // Ensure currentUser is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const currentUser = urlParams.get('currentUser');
    if (!currentUser) {
        const currentUserId = getCurrentUserId();
        urlParams.set('currentUser', currentUserId);
        const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
        window.history.replaceState({}, '', newUrl);
    }
    
    updateBackToSearchLinks();
    
    try {
        await waitForWebSocketInitialization();
        performSearch(searchParams);
        setTimeout(() => {
            registerStatusElements();
        }, 100);
    } catch (error) {
        performSearch(searchParams);
    }
    
    // Modal event listeners and action buttons are handled by the external modal JS
    // Modal action buttons
    document.addEventListener('click', (e) => {
        if (e.target.closest('.modal-like-btn')) {
            e.preventDefault();
            likeProfileInModal();
        }
        
        if (e.target.closest('.modal-favourite-btn')) {
            e.preventDefault();
            favouriteProfileInModal();
        }
        
        if (e.target.closest('.modal-message-btn')) {
            e.preventDefault();
            messageProfileInModal();
        }
        
        if (e.target.closest('.modal-block-btn')) {
            e.preventDefault();
            blockProfileInModal();
        }
        
        if (e.target.closest('.modal-report-btn')) {
            e.preventDefault();
            reportProfileInModal();
        }
    });
    
    // Event delegation for user card clicks
    document.addEventListener('click', (e) => {
        const card = e.target.closest('[data-profile-card]');
        if (card) {
            // Don't open modal if clicking on quick action buttons
            if (e.target.closest('.uc-quick-action')) {
                return;
            }
            
            const userId = card.dataset.userId;
            if (userId) {
                viewProfile(parseInt(userId));
            }
        }
    });
    
    // Sort functionality
    const sortSelect = document.getElementById('sortBy');
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            const params = getSearchParams();
            params.sortBy = this.value;
            performSearch(params);
        });
    }
});
