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
            console.warn('[profile-modal] Failed to load ProfileModalActions module');
        }
    );
}

let currentPage = 1;
let searchResults = [];
const resultsPerPage = 20;
let resultsPresenceReadyPoller = null;

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
        console.error('Search error:', error);
        
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
        console.warn('displayResults: Invalid results data:', results);
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
        console.error('All profiles are invalid:', currentPageResults);
        grid.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1;">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Unable to display results</h3>
                <p>Please try refreshing the page.</p>
            </div>
        `;
        return;
    }
    
    // Use component function to render cards
    const cardsHTML = validProfiles.map(profile => {
        if (window.renderResultsUserCard) {
            return window.renderResultsUserCard(profile);
        } else {
            // Fallback if component not loaded
            console.warn('renderResultsUserCard not available, using fallback');
            return `<div class="online-user-card"><div class="user-info"><h4>Loading...</h4></div></div>`;
        }
    }).join('');
    grid.innerHTML = cardsHTML;
    
    // Apply grid columns after cards are rendered
    const cardsPerRowSelect = document.getElementById('cardsPerRow');
    if (cardsPerRowSelect && typeof updateGridColumns === 'function') {
        const currentValue = cardsPerRowSelect.value || '4';
        // Apply immediately and after animation frame to ensure it sticks
        updateGridColumns(currentValue);
        // Enforce mobile constraints
        enforceMobileGridConstraints();
        requestAnimationFrame(() => {
            updateGridColumns(currentValue);
            enforceMobileGridConstraints();
        });
    } else {
        // Even if updateGridColumns is not available, enforce mobile constraints
        enforceMobileGridConstraints();
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

function likeProfileInModal() {
    if (window.ProfileModalActions) {
        window.ProfileModalActions.likeProfileInModal();
    } else {
        console.error('ProfileModalActions not loaded');
    }
}

function favouriteProfileInModal() {
    if (window.ProfileModalActions) {
        window.ProfileModalActions.favouriteProfileInModal();
    } else {
        console.error('ProfileModalActions not loaded');
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
            console.error('Error blocking user:', error);
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
        console.error('openReportModal function not found. Make sure user-report-modal is included.');
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
    
    try {
        const response = await fetch('/api/likes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            },
            body: JSON.stringify({ userId: profileId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Show success notification
            const notification = document.createElement('div');
            notification.innerHTML = '<i class="fas fa-thumbs-up"></i> Like sent!';
            notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--success-color); color: white; padding: 1rem; border-radius: 10px; z-index: 1000; animation: slideIn 0.3s ease;';
            document.body.appendChild(notification);
            setTimeout(() => {
                notification.remove();
            }, 3000);
        } else if (data.alreadyExists || data.message?.toLowerCase().includes('already')) {
            // Show info notification for duplicate like
            const displayUsername = real_name || 'this user';
            const notification = document.createElement('div');
            notification.innerHTML = `<i class="fas fa-info-circle"></i> You already liked ${displayUsername}`;
            notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #3498db; color: white; padding: 1rem; border-radius: 10px; z-index: 1000; animation: slideIn 0.3s ease;';
            document.body.appendChild(notification);
            setTimeout(() => {
                notification.remove();
            }, 3000);
        } else {
            throw new Error(data.error || 'Failed to like profile');
        }
    } catch (error) {
        console.error('Error liking profile:', error);
        const notification = document.createElement('div');
        notification.innerHTML = '<i class="fas fa-exclamation-circle"></i> Failed to like profile';
        notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--danger-color); color: white; padding: 1rem; border-radius: 10px; z-index: 1000; animation: slideIn 0.3s ease;';
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

function messageProfile(real_name) {
    if (!real_name) {
        console.warn('No real_name provided for messaging');
        return;
    }
    if (typeof openUniversalMessageModal === 'function') {
        openUniversalMessageModal(real_name, false, null);
    } else {
        console.warn('Message modal not available');
    }
}

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
    
    try {
        const response = await fetch('/api/favorites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            },
            body: JSON.stringify({ userId: profileId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Show success notification
            const notification = document.createElement('div');
            notification.innerHTML = '<i class="fas fa-heart"></i> Added to favourites!';
            notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--danger-color); color: white; padding: 1rem; border-radius: 10px; z-index: 1000; animation: slideIn 0.3s ease;';
            document.body.appendChild(notification);
            setTimeout(() => {
                notification.remove();
            }, 3000);
        } else if (data.alreadyExists) {
            // Show info notification for duplicate
            const notification = document.createElement('div');
            notification.innerHTML = `<i class="fas fa-info-circle"></i> ${data.message || 'Already in your favourites'}`;
            notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #3498db; color: white; padding: 1rem; border-radius: 10px; z-index: 1000; animation: slideIn 0.3s ease;';
            document.body.appendChild(notification);
            setTimeout(() => {
                notification.remove();
            }, 3000);
        } else {
            throw new Error(data.message || data.error || 'Failed to add to favourites');
        }
    } catch (error) {
        console.error('Error adding to favourites:', error);
        const notification = document.createElement('div');
        notification.innerHTML = '<i class="fas fa-exclamation-circle"></i> Failed to add to favourites';
        notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--danger-color); color: white; padding: 1rem; border-radius: 10px; z-index: 1000; animation: slideIn 0.3s ease;';
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
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
        console.error('openReportModal function not found. Make sure user-report-modal is included.');
        alert('Report functionality is not available. Please refresh the page.');
    }
}


// Handle cards per row control
function setupCardsPerRowControl() {
    const cardsPerRowSelect = document.getElementById('cardsPerRow');
    const resultsGrid = document.getElementById('resultsGrid');
    
    if (cardsPerRowSelect && resultsGrid) {
        // Use default value (no localStorage)
        const defaultPreference = '4';
        cardsPerRowSelect.value = defaultPreference;
        
        // Don't call updateGridColumns here - it will be called after cards are rendered
        // Just set the initial class
        resultsGrid.classList.remove('columns-3', 'columns-4', 'columns-5', 'columns-6');
        resultsGrid.classList.add(`columns-${defaultPreference}`);
        // On mobile, don't set inline styles - let CSS media query control (2 columns)
        const isMobile = window.innerWidth <= 768;
        if (!isMobile) {
            resultsGrid.style.gridTemplateColumns = `repeat(${defaultPreference}, minmax(0, 1fr))`;
        } else {
            // Ensure mobile constraints are enforced on initial setup
            enforceMobileGridConstraints();
        }
        
        cardsPerRowSelect.addEventListener('change', function(e) {
            // Only update if in grid view
            if (currentView === 'grid') {
                const value = e.target.value;
                updateGridColumns(value);
            }
            // No localStorage storage - preference is not persisted
        });
    }
}

// Helper function to ensure mobile constraints are always enforced
function enforceMobileGridConstraints() {
    const resultsGrid = document.getElementById('resultsGrid');
    if (!resultsGrid) return;
    
    const isMobile = window.innerWidth <= 768;
    if (isMobile && currentView === 'grid') {
        // Force remove any inline styles that might override mobile CSS
        // The CSS media query with !important will handle the 2-column layout
        resultsGrid.style.removeProperty('grid-template-columns');
        // Ensure list-view class is removed in grid view
        if (resultsGrid.classList.contains('list-view')) {
            resultsGrid.classList.remove('list-view');
        }
        // Force a reflow to ensure CSS media query applies
        void resultsGrid.offsetWidth;
    }
}

function updateGridColumns(value) {
    const resultsGrid = document.getElementById('resultsGrid');
    if (!resultsGrid) {
        console.warn('resultsGrid not found');
        return;
    }
    
    // On mobile, always use 2 columns (don't override mobile CSS)
    const isMobile = window.innerWidth <= 768;
    if (isMobile && currentView === 'grid') {
        // Remove inline styles to let CSS media query take over
        resultsGrid.style.removeProperty('grid-template-columns');
        // Still set data attribute and class for reference, but CSS will override
        resultsGrid.setAttribute('data-columns', value);
        resultsGrid.classList.remove('columns-3', 'columns-4', 'columns-5', 'columns-6');
        resultsGrid.classList.add(`columns-${value}`);
        // Double-check mobile constraints are enforced
        enforceMobileGridConstraints();
        return; // Don't apply desktop grid styles on mobile
    }
    
    const previousColumns = resultsGrid.getAttribute('data-columns');
    const imageHeight = value === '3' ? '250px' : '140px';
    const shouldLogDesktopChange = previousColumns !== value;
    // Only log in development mode to reduce console spam
    if (shouldLogDesktopChange && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        console.log(`Applying ${value} columns, image height: ${imageHeight}`);
    }
    
    // Set data attribute for CSS targeting
    resultsGrid.setAttribute('data-columns', value);
    
    // Remove all column classes
    resultsGrid.classList.remove('columns-3', 'columns-4', 'columns-5', 'columns-6');
    
    // Add the new column class
    resultsGrid.classList.add(`columns-${value}`);
    
    // Set grid columns via inline style (only on desktop)
    resultsGrid.style.gridTemplateColumns = `repeat(${value}, minmax(0, 1fr))`;
    
    // Force image container heights - apply multiple times to catch all elements
    function applyImageHeights() {
        // Try both selectors: > div:first-child (for results) and .user-image-container
        const imageContainers = resultsGrid.querySelectorAll('.online-user-card > div:first-child, .online-user-card .user-image-container');
        
        // Only log if containers are found and in development mode
        if (imageContainers.length > 0 && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            console.log(`Found ${imageContainers.length} image containers for ${value} columns`);
        }
        
        if (imageContainers.length === 0) {
            // Don't warn - this is expected when called before cards are rendered
            return;
        }
        
        imageContainers.forEach((container, index) => {
            // Remove any conflicting styles first
            container.style.removeProperty('aspect-ratio');
            container.style.removeProperty('height');
            container.style.removeProperty('min-height');
            container.style.removeProperty('max-height');
            
            // Set the height
            container.style.height = imageHeight;
            container.style.minHeight = imageHeight;
            container.style.maxHeight = imageHeight;
            container.style.aspectRatio = 'unset';
            
            // Set data attributes for debugging
            container.setAttribute('data-columns', value);
            container.setAttribute('data-forced-height', imageHeight);
            
            // Verify it was applied (only log in development)
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                const computed = getComputedStyle(container);
                console.log(`Container ${index + 1}: Set to ${imageHeight}, computed: ${computed.height}`);
            }
        });
        
        // Set image sizing
        const images = resultsGrid.querySelectorAll('.online-user-card .user-avatar');
        images.forEach((img) => {
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.objectPosition = 'center center';
        });
        
        // Only log in development mode
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log(`Applied styles to ${images.length} images`);
        }
    }
    
    // Apply immediately
    applyImageHeights();
    
    // Also apply after a short delay to catch any late-rendered elements
    setTimeout(applyImageHeights, 100);
    
    // And after requestAnimationFrame
    requestAnimationFrame(applyImageHeights);
    
    // Dispatch custom event for debugging
    resultsGrid.dispatchEvent(new CustomEvent('gridColumnsChanged', {
        detail: { columns: value, imageHeight }
    }));
}

// Display search parameters
async function displaySearchParameters(params) {
    const paramsContainer = document.getElementById('searchParameters');
    if (!paramsContainer) return;
    
    const paramLabels = [];
    
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
                console.warn('Failed to fetch country names:', error);
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
        const eduResp = await fetch('/api/search/filters'); const eduData = await eduResp.json(); const eduMap = {}; if (eduData.success && eduData.filters?.educationLevels) { eduData.filters.educationLevels.forEach(e => { eduMap[e.id] = eduMap[String(e.id)] = eduMap[parseInt(e.id)] = e.name; }); }
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-graduation-cap" style="font-size: 0.972rem;"></i> ${eduMap[params.education] || eduMap[String(params.education)] || eduMap[parseInt(params.education)] || params.education}</span>`);
    }
    
    // Occupation
    if (params.occupation) {
        const occResp = await fetch('/api/search/filters'); const occData = await occResp.json(); const occMap = {}; if (occData.success && occData.filters?.occupationCategories) { occData.filters.occupationCategories.forEach(o => { occMap[o.id] = occMap[String(o.id)] = occMap[parseInt(o.id)] = o.name; }); }
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-briefcase" style="font-size: 0.972rem;"></i> ${occMap[params.occupation] || occMap[String(params.occupation)] || occMap[parseInt(params.occupation)] || params.occupation}</span>`);
    }
    
    // Income
    if (params.income) {
        const incResp = await fetch('/api/search/filters'); const incData = await incResp.json(); const incMap = {}; if (incData.success && incData.filters?.incomeRanges) { incData.filters.incomeRanges.forEach(i => { incMap[i.id] = incMap[String(i.id)] = incMap[parseInt(i.id)] = i.name; }); }
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-dollar-sign" style="font-size: 0.972rem;"></i> ${incMap[params.income] || incMap[String(params.income)] || incMap[parseInt(params.income)] || params.income}</span>`);
    }
    
    // Lifestyle
    if (params.lifestyle) {
        const lifeResp = await fetch('/api/search/filters'); const lifeData = await lifeResp.json(); const lifeMap = {}; if (lifeData.success && lifeData.filters?.lifestylePreferences) { lifeData.filters.lifestylePreferences.forEach(l => { lifeMap[l.id] = lifeMap[String(l.id)] = lifeMap[parseInt(l.id)] = l.name; }); }
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-heart" style="font-size: 0.972rem;"></i> ${lifeMap[params.lifestyle] || lifeMap[String(params.lifestyle)] || lifeMap[parseInt(params.lifestyle)] || params.lifestyle}</span>`);
    }
    
    // Smoking
    if (params.smoking) {
        const smokeResp = await fetch('/api/search/filters'); const smokeData = await smokeResp.json(); const smokeMap = {}; if (smokeData.success && smokeData.filters?.smokingPreferences) { smokeData.filters.smokingPreferences.forEach(s => { smokeMap[s.id] = smokeMap[String(s.id)] = smokeMap[parseInt(s.id)] = s.name; }); }
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-smoking-ban" style="font-size: 0.972rem;"></i> ${smokeMap[params.smoking] || smokeMap[String(params.smoking)] || smokeMap[parseInt(params.smoking)] || params.smoking}</span>`);
    }
    
    // Drinking
    if (params.drinking) {
        const drinkResp = await fetch('/api/search/filters'); const drinkData = await drinkResp.json(); const drinkMap = {}; if (drinkData.success && drinkData.filters?.drinkingPreferences) { drinkData.filters.drinkingPreferences.forEach(d => { drinkMap[d.id] = drinkMap[String(d.id)] = drinkMap[parseInt(d.id)] = d.name; }); }
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-wine-glass" style="font-size: 0.972rem;"></i> ${drinkMap[params.drinking] || drinkMap[String(params.drinking)] || drinkMap[parseInt(params.drinking)] || params.drinking}</span>`);
    }
    
    // Children
    if (params.children) {
        const childrenMap = {'has_children': 'Has children', 'no_children': 'No children'};
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-child" style="font-size: 0.972rem;"></i> ${childrenMap[params.children] || params.children}</span>`);
    }
    
    // Height Range
    if (params.heightMin || params.heightMax) {
        // Helper function to format height: converts cm to "5'7" (170cm)" format
        const formatHeightDisplay = (heightCm) => {
            if (!heightCm || isNaN(heightCm)) return '';
            const cm = Number(heightCm);
            const totalInches = cm / 2.54;
            const feet = Math.floor(totalInches / 12);
            const inches = Math.round(totalInches - feet * 12);
            return `${feet}'${inches}" (${cm}cm)`;
        };
        
        const heightResp = await fetch('/api/search/filters');
        const heightData = await heightResp.json();
        const heightMap = {};
        
        if (heightData.success && heightData.filters?.heights) {
            heightData.filters.heights.forEach(h => {
                // Use display_text if available and properly formatted (contains ' or "), otherwise generate formatted version
                let displayValue = h.display_text;
                // Check if display_text is missing, empty, or just contains plain "cm" without feet/inches format
                if (!displayValue || (!displayValue.includes("'") && !displayValue.includes('"'))) {
                    // display_text is missing or not formatted, generate it
                    displayValue = formatHeightDisplay(h.height_cm);
                }
                
                // Map by height_cm (as string, number, and parsed int)
                if (h.height_cm !== null && h.height_cm !== undefined) {
                    heightMap[h.height_cm] = displayValue;
                    heightMap[String(h.height_cm)] = displayValue;
                    heightMap[parseInt(h.height_cm)] = displayValue;
                }
                // Also map by id in case URL params use IDs
                if (h.id !== null && h.id !== undefined) {
                    heightMap[h.id] = displayValue;
                    heightMap[String(h.id)] = displayValue;
                    heightMap[parseInt(h.id)] = displayValue;
                }
            });
        }
        
        // Get display text from map, or format on the fly if not found
        const heightMinText = params.heightMin ? (
            heightMap[params.heightMin] || 
            heightMap[String(params.heightMin)] || 
            heightMap[parseInt(params.heightMin)] ||
            formatHeightDisplay(params.heightMin)
        ) : '';
        const heightMaxText = params.heightMax ? (
            heightMap[params.heightMax] || 
            heightMap[String(params.heightMax)] || 
            heightMap[parseInt(params.heightMax)] ||
            formatHeightDisplay(params.heightMax)
        ) : '';
        const heightDisplay = heightMinText && heightMaxText ? `${heightMinText} - ${heightMaxText}` : (heightMinText || heightMaxText);
        
        // Only display if we found the value in the database
        if (heightDisplay) {
            paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-ruler-vertical" style="font-size: 0.972rem;"></i> ${heightDisplay}</span>`);
        }
    }
    
    // Body Type
    if (params.bodyType) {
        const bodyTypeResp = await fetch('/api/search/filters');
        const bodyTypeData = await bodyTypeResp.json();
        const bodyTypeMap = {};
        if (bodyTypeData.success && bodyTypeData.filters?.bodyTypes) {
            bodyTypeData.filters.bodyTypes.forEach(bt => {
                bodyTypeMap[bt.id] = bodyTypeMap[String(bt.id)] = bodyTypeMap[parseInt(bt.id)] = bt.name;
            });
        }
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-user" style="font-size: 0.972rem;"></i> ${bodyTypeMap[params.bodyType] || bodyTypeMap[String(params.bodyType)] || bodyTypeMap[parseInt(params.bodyType)] || params.bodyType}</span>`);
    }
    
    // Ethnicity
    if (params.ethnicity) {
        const ethnicityResp = await fetch('/api/search/filters');
        const ethnicityData = await ethnicityResp.json();
        const ethnicityMap = {};
        if (ethnicityData.success && ethnicityData.filters?.ethnicities) {
            ethnicityData.filters.ethnicities.forEach(eth => {
                ethnicityMap[eth.id] = ethnicityMap[String(eth.id)] = ethnicityMap[parseInt(eth.id)] = eth.name;
            });
        }
        paramLabels.push(`<span style="background: rgba(102, 126, 234, 0.1); padding: 0.27rem 0.54rem; border-radius: 6.48px; font-size: 0.972rem; font-weight: normal; display: inline-flex; align-items: center; gap: 0.54rem;"><i class="fas fa-globe-americas" style="font-size: 0.972rem;"></i> ${ethnicityMap[params.ethnicity] || ethnicityMap[String(params.ethnicity)] || ethnicityMap[parseInt(params.ethnicity)] || params.ethnicity}</span>`);
    }
    
    // Interests
    if (params.interests) {
        const interests = Array.isArray(params.interests) ? params.interests : [params.interests];
        if (interests.length > 0) {
            const interestsResp = await fetch('/api/search/filters');
            const interestsData = await interestsResp.json();
            const interestsMap = {};
            if (interestsData.success && interestsData.filters?.interests) {
                interestsData.filters.interests.forEach(i => {
                    interestsMap[i.id] = interestsMap[String(i.id)] = interestsMap[parseInt(i.id)] = i.name;
                });
            }
            
            const interestNames = interests
                .map(id => {
                    return interestsMap[id] || interestsMap[String(id)] || interestsMap[parseInt(id)] || id;
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
            const hobbiesResp = await fetch('/api/search/filters');
            const hobbiesData = await hobbiesResp.json();
            const hobbiesMap = {};
            if (hobbiesData.success && hobbiesData.filters?.hobbies) {
                hobbiesData.filters.hobbies.forEach(h => {
                    hobbiesMap[h.id] = hobbiesMap[String(h.id)] = hobbiesMap[parseInt(h.id)] = h.name;
                });
            }
            
            const hobbyNames = hobbies
                .map(id => {
                    return hobbiesMap[id] || hobbiesMap[String(id)] || hobbiesMap[parseInt(id)] || id;
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
        const resultsGrid = document.getElementById('resultsGrid');
        if (resultsGrid && currentView === 'grid') {
            enforceMobileGridConstraints();
            // On desktop, restore grid columns if not mobile
            const isMobile = window.innerWidth <= 768;
            if (!isMobile) {
                const cardsPerRowSelect = document.getElementById('cardsPerRow');
                if (cardsPerRowSelect) {
                    updateGridColumns(cardsPerRowSelect.value);
                }
            }
        }
    }, 100);
});

// Also enforce on orientation change (mobile devices)
window.addEventListener('orientationchange', function() {
    setTimeout(function() {
        enforceMobileGridConstraints();
        if (currentView === 'grid') {
            const cardsPerRowSelect = document.getElementById('cardsPerRow');
            if (cardsPerRowSelect) {
                updateGridColumns(cardsPerRowSelect.value);
            }
        }
    }, 100);
});
    
    // Display search parameters (async)
    displaySearchParameters(searchParams).catch(error => {
        console.warn('Error displaying search parameters:', error);
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
        console.warn('WebSocket initialization failed, performing search anyway...');
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
