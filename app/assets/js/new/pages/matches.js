// Global state
let allMatches = [];
let filteredMatches = [];
let currentView = 'grid';
let currentPage = 1;
let itemsPerPage = 12;
let sortBy = 'compatibility';

let filters = {
    search: '',
    onlineOnly: false,
    withPhotos: false,
    minCompatibilityScore: null
};

let matchesPresenceReadyPoller = null;

const MATCHES_VIRTUALIZATION_THRESHOLD = 60;
let matchesVirtualizer = null;
let matchesVirtualizedView = null;
let matchesVirtualizedColumns = null;

registerUserCardEventBridges();
registerUserCardFallbackHandlers();

function registerUserCardEventBridges() {
    if (window.__matchesUserCardEventsRegistered) {
        return;
    }
    window.__matchesUserCardEventsRegistered = true;

    const toNumber = (value) => {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? null : parsed;
    };

    window.addEventListener('view-profile', (event) => {
        const userId = toNumber(event?.detail?.profileId);
        if (userId) {
            viewProfile(userId);
        }
    });

    window.addEventListener('like-profile', (event) => {
        const userId = toNumber(event?.detail?.profileId);
        if (userId) {
            likeUser(userId);
        }
    });

    window.addEventListener('favorite-profile', (event) => {
        const userId = toNumber(event?.detail?.profileId);
        if (userId) {
            addFavorite(userId);
        }
    });

    window.addEventListener('message-profile', (event) => {
        const userId = toNumber(event?.detail?.profileId);
        if (userId) {
            openConversation(userId);
        }
    });
}

function registerUserCardFallbackHandlers() {
    window.likeProfile = function(profileId, displayName) {
        const targetId = Number(profileId);
        if (!targetId) {
            return;
        }
        likeUser(targetId, displayName);
    };

    window.addToFavourite = function(profileId) {
        const targetId = Number(profileId);
        if (!targetId) {
            return;
        }
        addFavorite(targetId);
    };

    window.messageProfile = function(displayName, profileId) {
        const targetId = Number(profileId) || resolveMatchIdByName(displayName);
        if (!targetId) {
            console.warn('Unable to resolve profile for message action', displayName);
            return;
        }
        openConversation(targetId);
    };
}

let emailVerificationScriptPromise = null;

function ensureMatchesVerificationScriptLoaded() {
    if (typeof window.checkEmailVerificationStatus === 'function') {
        return Promise.resolve();
    }

    if (emailVerificationScriptPromise) {
        return emailVerificationScriptPromise;
    }

    emailVerificationScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/assets/js/new/shared/email-verification-check.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = (error) => {
            console.error('Failed to load email verification script', error);
            emailVerificationScriptPromise = null;
            reject(error);
        };
        document.head.appendChild(script);
    });

    return emailVerificationScriptPromise;
}

async function requireEmailVerificationForMatches(actionDescription) {
    try {
        await ensureMatchesVerificationScriptLoaded();
    } catch (error) {
        return true;
    }

    if (typeof window.checkEmailVerificationStatus !== 'function') {
        return true;
    }

    const isVerified = await window.checkEmailVerificationStatus();
    if (!isVerified) {
        if (typeof window.showVerificationMessage === 'function') {
            window.showVerificationMessage();
        } else {
            showToast(`Please verify your email to ${actionDescription}.`, 'warning');
        }
        return false;
    }

    return true;
}

function resolveMatchIdByName(name) {
    if (!name) {
        return null;
    }
    const normalized = name.toLowerCase();
    const match = allMatches.find(candidate => {
        const realName = (candidate.real_name || candidate.name || '').toLowerCase();
        const username = (candidate.username || '').toLowerCase();
        return realName === normalized || username === normalized;
    });
    return match ? (match.id || match.user_id || match.userId || null) : null;
}

// Load stats
async function loadStats() {
    try {
        const sessionToken = getSessionToken();
        if (!sessionToken) return;

        const totalUsersRes = await fetch(`/api/stats/total-users?token=${sessionToken}`);
        const totalUsersData = await totalUsersRes.json();
        if (totalUsersData.success) {
            document.getElementById('total-users').textContent = totalUsersData.count.toLocaleString();
        }
        // Matches-today stat is updated via updateMatchStats
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load matches from API
async function loadMatches() {
    const container = document.getElementById('matches-users');
    container.innerHTML = '';

    try {
        const userId = getUserId();
        const sessionToken = getSessionToken();

        if (!userId) {
            throw new Error('User not authenticated');
        }

        const tokenParam = sessionToken ? `?token=${sessionToken}` : '';
        const url = `/api/matches/${userId}${tokenParam}`;

        const headers = {};
        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
            headers['X-Session-Token'] = sessionToken;
        }

        const response = await fetch(url, {
            credentials: 'same-origin',
            headers
        });

        const data = await response.json();

        if (data.success && data.matches && data.matches.length > 0) {
            allMatches = data.matches;
            updateMatchStats(data.matches);

            filters.minCompatibilityScore = (data.minCompatibilityScore !== undefined &&
                data.minCompatibilityScore !== null &&
                data.minCompatibilityScore !== '')
                ? parseInt(data.minCompatibilityScore)
                : 1;

            const matchScoreSlider = document.getElementById('match-score-slider');
            const matchScoreValue = document.getElementById('match-score-value');
            if (matchScoreSlider && matchScoreValue) {
                const value = filters.minCompatibilityScore || 1;
                matchScoreSlider.value = value;
                matchScoreValue.textContent = value === 1 ? '1%+ (All)' : `${value}%+`;
            }

            applyFiltersAndSort();
        } else {
            allMatches = [];
            filteredMatches = [];
            document.getElementById('matches-count').textContent = '(0)';
            showEmptyState();
        }
    } catch (error) {
        console.error('Error loading matches:', error);
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load matches</h3>
                <p>Please try again later</p>
                <button class="btn-primary" data-action="retry-load-matches">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
        document.getElementById('matches-count').textContent = '(0)';
    }
}

// Render matches grid/list
function renderMatches() {
    const container = document.getElementById('matches-users');
    if (!container) {
        return;
    }

    if (filteredMatches.length === 0) {
        showEmptyState();
        return;
    }

    container.classList.remove('empty-state-wrapper');
    container.classList.add('online-users-grid', 'results-grid');
    container.classList.remove('list-view', 'columns-3', 'columns-4', 'columns-5', 'columns-6');

    const columnsValue = getCardsPerRowValue();
    if (currentView === 'list') {
        container.classList.add('list-view');
    } else {
        container.classList.add(`columns-${columnsValue}`);
        applyGridColumns(columnsValue);
    }

    const useVirtualization = shouldVirtualizeMatches(filteredMatches.length);
    if (useVirtualization) {
        resetMatchesPresenceFallbacks();
        const virtualizer = getMatchesVirtualizer(container, columnsValue);
        virtualizer.setItems(filteredMatches);
        const pagination = document.getElementById('pagination');
        if (pagination) {
            pagination.style.display = 'none';
        }
        document.getElementById('matches-count').textContent = `(${filteredMatches.length})`;
        return;
    }

    destroyMatchesVirtualizer();

    const totalPages = Math.ceil(filteredMatches.length / itemsPerPage);
    const pageMatches = getPaginatedMatches();
    updatePagination(totalPages);

    const cardsHtml = pageMatches.map(user => renderMatchCard(user, columnsValue, currentView)).join('');
    container.innerHTML = cardsHtml;

    container.querySelectorAll('.uc-avatar').forEach(img => {
        const defaultSrc = img.dataset.default;
        if (defaultSrc) {
            img.addEventListener('error', function() {
                if (this.src !== defaultSrc) {
                    this.src = defaultSrc;
                }
            }, { once: true });
        }
    });

    if (typeof window.setupResultsUserCardEvents === 'function') {
        window.setupResultsUserCardEvents(container);
    }

    document.getElementById('matches-count').textContent = `(${filteredMatches.length})`;
    registerMatchStatusElements();
}

function registerMatchStatusElements() {
    const statusElements = document.querySelectorAll('#matches-users .online-dot-results[data-user-id]');
    if (!statusElements.length) {
        resetMatchesPresenceFallbacks();
        return;
    }

    if (bindMatchIndicators(statusElements)) {
        return;
    }

    if (!matchesPresenceReadyPoller) {
        matchesPresenceReadyPoller = setInterval(() => {
            if (bindMatchIndicators(statusElements)) {
                return;
            }
        }, 500);

        setTimeout(() => {
            if (matchesPresenceReadyPoller) {
                clearInterval(matchesPresenceReadyPoller);
                matchesPresenceReadyPoller = null;
            }
        }, 12000);
    }
}

function resetMatchesPresenceFallbacks() {
    if (matchesPresenceReadyPoller) {
        clearInterval(matchesPresenceReadyPoller);
        matchesPresenceReadyPoller = null;
    }
}

function bindMatchIndicators(statusElements) {
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

    resetMatchesPresenceFallbacks();
    return true;
}

function shouldVirtualizeMatches(totalCount) {
    if (!window.VirtualizedPresenceList) {
        return false;
    }
    return totalCount >= MATCHES_VIRTUALIZATION_THRESHOLD;
}

function getMatchesVirtualizer(container, columnsValue) {
    const desiredView = currentView;
    if (
        matchesVirtualizer &&
        (matchesVirtualizedView !== desiredView || matchesVirtualizedColumns !== columnsValue)
    ) {
        destroyMatchesVirtualizer();
    }

    if (!matchesVirtualizer) {
        matchesVirtualizer = new window.VirtualizedPresenceList(container, {
            itemHeight: desiredView === 'list' ? 230 : 360,
            overscan: 8,
            layout: desiredView === 'list' ? 'list' : 'grid',
            innerClass: buildMatchesVirtualInnerClass(columnsValue, desiredView),
            renderItem: (user) => renderMatchCardNode(user, columnsValue, desiredView),
            onRangeRendered: handleVirtualizedMatchesRange
        });
        matchesVirtualizedView = desiredView;
        matchesVirtualizedColumns = columnsValue;
    }

    return matchesVirtualizer;
}

function destroyMatchesVirtualizer() {
    if (matchesVirtualizer) {
        matchesVirtualizer.destroy();
        matchesVirtualizer = null;
        matchesVirtualizedView = null;
        matchesVirtualizedColumns = null;
    }
}

function buildMatchesVirtualInnerClass(columnsValue, viewMode) {
    const innerClasses = ['online-users-grid', 'results-grid'];
    if (viewMode === 'list') {
        innerClasses.push('list-view');
    } else {
        innerClasses.push(`columns-${columnsValue}`);
    }
    return innerClasses.join(' ');
}

function renderMatchCardNode(user, columns, view = currentView) {
    const html = renderMatchCard(user, columns, view);
    const template = document.createElement('div');
    template.innerHTML = html.trim();
    return template.firstElementChild;
}

function handleVirtualizedMatchesRange(payload = {}) {
    const nodes = payload.nodes || [];
    if (!nodes.length) {
        return;
    }
    registerVirtualMatchStatusElements(nodes);
    if (typeof window.setupResultsUserCardEvents === 'function' && matchesVirtualizer?.inner) {
        window.setupResultsUserCardEvents(matchesVirtualizer.inner);
    }
}

function registerVirtualMatchStatusElements(nodes = []) {
    if (!nodes || !nodes.length) {
        return;
    }
    const dotElements = [];
    nodes.forEach(node => {
        if (!node) {
            return;
        }
        const dots = node.matches('.online-dot-results[data-user-id]')
            ? [node]
            : Array.from(node.querySelectorAll('.online-dot-results[data-user-id]'));
        dots.forEach(dot => {
            if (dot && dot.dataset.userId) {
                dotElements.push(dot);
            }
        });
    });

    if (!dotElements.length) {
        return;
    }

    if (bindMatchIndicators(dotElements)) {
        return;
    }

    registerMatchStatusElements();
}

function getCardsPerRowValue() {
    const select = document.getElementById('cardsPerRow');
    return select ? select.value : '4';
}

function handleMatchCheckboxChange(event) {
    const checkbox = event.target.closest('.match-select');
    if (!checkbox) return;
    const userId = Number(checkbox.dataset.userId);
    if (!userId) return;
    setSelectionState(userId, checkbox.checked);
}

function setSelectionState(userId, shouldSelect) {
    if (shouldSelect) {
        selectedMatches.add(userId);
    } else {
        selectedMatches.delete(userId);
    }
    syncSelectionCheckbox(userId, shouldSelect);
    updateBulkActions();
}

function syncSelectionCheckbox(userId, isSelected) {
    const checkbox = document.getElementById(`match-select-${userId}`);
    if (checkbox) {
        checkbox.checked = isSelected;
    }
}

// Update match statistics
function updateMatchStats(matches) {
    const total = matches.length;
    const online = matches.filter(m => m.is_online).length;
    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const newToday = matches.filter(m => {
        if (!m.match_date) return false;
        
        const matchDate = parseDate(m.match_date);
        if (!matchDate) return false;
        
        // Reset time to midnight for both dates to compare only dates
        const matchDateOnly = new Date(matchDate.getFullYear(), matchDate.getMonth(), matchDate.getDate());
        
        // Compare timestamps (should be 0 if same date)
        return matchDateOnly.getTime() === todayOnly.getTime();
    }).length;

    // Update matches count in header
    const matchesCountEl = document.getElementById('matches-count');
    if (matchesCountEl) {
        matchesCountEl.textContent = `(${total})`;
    }
    
    // Update match statistics in header
    const totalMatchesEl = document.getElementById('total-matches');
    const onlineMatchesEl = document.getElementById('online-matches');
    const matchesTodayEl = document.getElementById('matches-today');
    
    if (totalMatchesEl) totalMatchesEl.textContent = total;
    if (onlineMatchesEl) onlineMatchesEl.textContent = online;
    // Make "Matches Today" dynamic - use the newToday value
    if (matchesTodayEl) matchesTodayEl.textContent = newToday;
}

// Format match date (optimized with shared date parsing)
function formatMatchDate(matchDate) {
    if (!matchDate) return 'Recently';
    
    const now = new Date();
    const match = parseDate(matchDate);
    if (!match) return 'Recently';
    
    const diffMs = now - match;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return match.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Shared date parsing cache to avoid repeated Date() calls
const dateCache = new Map();
function parseDate(dateString) {
    if (!dateString) return null;
    if (dateCache.has(dateString)) {
        return dateCache.get(dateString);
    }
    const parsed = new Date(dateString);
    // Cache only valid dates and limit cache size
    if (!isNaN(parsed.getTime()) && dateCache.size < 100) {
        dateCache.set(dateString, parsed);
    }
    return parsed;
}

// Check if match is new (last 24 hours) - optimized with shared date parsing
function isNewMatch(matchDate) {
    if (!matchDate) return false;
    const match = parseDate(matchDate);
    if (!match) return false;
    const now = new Date();
    const diffHours = (now - match) / (1000 * 60 * 60);
    return diffHours < 24;
}

// Get profile image helper (simplifies image handling)
function getProfileImage(user) {
    const defaults = {
        male: '/assets/images/default_profile_male.svg',
        female: '/assets/images/default_profile_female.svg'
    };
    
    let avatar = user.profile_image || user.avatar || '';
    const gender = (user.gender || '').toLowerCase();
    
    // Return default if no avatar or invalid avatar
    if (!avatar || avatar === 'null' || avatar.includes('default_profile')) {
        return (gender === 'f' || gender === 'female') ? defaults.female : defaults.male;
    }
    
    // Handle full paths
    if (avatar.startsWith('/uploads/profile_images/') || avatar.startsWith('/assets/images/')) {
        return avatar;
    }
    
    // Handle relative paths/filenames
    if (!avatar.includes('/') && !avatar.includes('default_profile')) {
        return `/uploads/profile_images/${avatar}`;
    }
    
    // Fallback to default
    return (gender === 'f' || gender === 'female') ? defaults.female : defaults.male;
}

// Render match card using shared component (fallback included)
function renderMatchCard(user, columns, view = currentView) {
    if (typeof window.renderResultsUserCard === 'function') {
        const normalizedProfile = mapMatchToUserCardProfile(user);
        const parsedColumns = Number(columns) || 4;
        return window.renderResultsUserCard(normalizedProfile, parsedColumns);
    }
    return renderLegacyMatchCard(user, view);
}

function mapMatchToUserCardProfile(user) {
    const normalizedId = user.id || user.user_id || user.userId || 0;
    const { city, country } = extractLocationParts(user);
    const normalizedInterests = normalizeInterests(user.interests);
    const resolvedAge = user.age || calculateAge(user.birthdate) || null;
    const compatibilityScore = user.compatibility_score || user.match_score || 0;

    return {
        ...user,
        id: normalizedId,
        real_name: user.real_name || user.name || 'Unknown',
        name: user.real_name || user.name || 'Unknown',
        username: user.username || user.real_name || user.name || '',
        age: resolvedAge,
        city,
        country,
        about: user.about || user.bio || '',
        interests: normalizedInterests,
        is_online: !!user.is_online,
        is_new_match: isNewMatch(user.match_date),
        match_score: compatibilityScore,
        compatibility_score: compatibilityScore,
        profile_image: getProfileImage(user),
        photo_count: user.photo_count || user.photoCount || 0,
        preferred_gender: user.preferred_gender || user.seeking_gender || '',
        age_min: user.preferred_age_min || user.age_min || null,
        age_max: user.preferred_age_max || user.age_max || null,
        seeking_gender: user.seeking_gender || user.preferred_gender || '',
        seeking_age_min: user.seeking_age_min ?? user.preferred_age_min ?? user.age_min ?? null,
        seeking_age_max: user.seeking_age_max ?? user.preferred_age_max ?? user.age_max ?? null
    };
}

function normalizeInterests(interests) {
    if (!Array.isArray(interests)) {
        return [];
    }
    return interests
        .map((interest) => {
            if (!interest) return null;
            if (typeof interest === 'string') {
                return { name: interest };
            }
            if (typeof interest === 'object') {
                return { name: interest.name || interest.label || '' };
            }
            return null;
        })
        .filter((interest) => interest && interest.name);
}

function extractLocationParts(user) {
    let city = user.city || user.city_name || '';
    let country = user.country || user.country_name || '';

    if ((!city || !country) && user.location) {
        const parts = user.location.split(',');
        if (!city && parts.length > 0) {
            city = parts[0].trim();
        }
        if (!country && parts.length > 1) {
            country = parts.slice(1).join(',').trim();
        }
    }

    return {
        city,
        country
    };
}

function renderLegacyMatchCard(user, view = 'grid') {
    const real_name = user.real_name || user.name || 'Unknown';
    const age = user.age || calculateAge(user.birthdate) || '?';
    const location = user.location || user.city || 'Unknown location';
    const userId = user.id || user.user_id || user.userId;
    const gender = user.gender || '';
    
    const profileImage = getProfileImage(user);
    const defaultImage = getProfileImage({ gender });
    const isNew = isNewMatch(user.match_date);
    const isOnline = user.is_online || false;
    const compatibility = user.compatibility_score || 70;
    const compatibilityBadgeData = user.compatibility_badge || null;
    
    const genderLower = (gender || '').toLowerCase().trim();
    const genderIcon = (genderLower === 'male' || genderLower === 'm') ? 'fa-mars' : (genderLower === 'female' || genderLower === 'f') ? 'fa-venus' : '';
    const genderClass = (genderLower === 'male' || genderLower === 'm') ? 'male' : (genderLower === 'female' || genderLower === 'f') ? 'female' : '';
    const genderIconHtml = genderIcon ? `<i class="fas ${genderIcon} gender-icon ${genderClass}"></i>` : '';
    const ageBadgeHtml = age ? `<span class="age-badge">${age}</span>` : '';
    
    const newBadge = isNew ? '<span class="new-match-badge"><i class="fas fa-star"></i> New</span>' : '';
    
    let compatibilityBadge = '';
    if (compatibilityBadgeData && compatibilityBadgeData.label) {
        compatibilityBadge = `<div class="compatibility-badge" style="background: ${compatibilityBadgeData.color || 'rgba(102, 126, 234, 0.9)'};" title="${compatibilityBadgeData.label}">
            ${compatibility}% Match
        </div>`;
    } else {
        compatibilityBadge = `<div class="compatibility-badge">${compatibility}% Match</div>`;
    }
    const onlineDot = userId ? `
        <div class="online-dot-results" data-user-id="${userId}" style="position: absolute; top: 0.5rem; right: 0.5rem; width: 16px; height: 16px; background: #00b894; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10; ${isOnline ? '' : 'display: none;'}"></div>
    ` : '';
    
    const interestsHtml = user.interests && Array.isArray(user.interests) && user.interests.length > 0 
        ? `<div class="user-interests" style="margin-bottom: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
            ${user.interests.slice(0, 3).map(interest => {
                const interestName = interest.name || interest;
                return `<span style="display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.5rem; background: #f5f6fa; border-radius: 8px; font-size: 0.8rem; color: #636e72;"><i class="fas fa-star"></i>${interestName}</span>`;
            }).join('')}
        </div>` : '';
    
    const aboutHtml = user.about ? `<p class="user-about" style="font-size: 0.9rem; color: #636e72; margin-bottom: 1rem; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; max-height: 4.5em; line-height: 1.4;">${user.about}</p>` : '';
    
    if (view === 'grid') {
        return `
        <div class="online-user-card" data-user-id="${userId}" data-action="view-profile" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(31,38,135,0.08); transition: transform 0.2s; cursor: pointer; position: relative;">
            ${newBadge}
            <div class="user-image-container">
                <img src="${profileImage ? profileImage : defaultImage}"
                     class="user-avatar"
                     data-default-src="${defaultImage}"
                     loading="lazy">
                ${onlineDot}
            </div>
            <div class="user-info" style="padding: 1rem;">
                <div style="font-weight: 600; color: #00b894; margin-bottom: 0.25rem; font-size: 1.08rem; display: flex; align-items: center; justify-content: center; gap: 0.3rem; flex-wrap: wrap;">
                    ${real_name} ${genderIconHtml} ${ageBadgeHtml} ${compatibilityBadge}
                </div>
                <div style="font-size: 1.02rem; color: var(--muted-color); margin-bottom: 0.5rem; text-align: center;">
                    <i class="fas fa-map-marker-alt"></i> ${location}
                </div>
                ${interestsHtml}
                ${aboutHtml}
                <div class="user-actions">
                    <span class="icon-action icon-message" title="Message" data-action="open-conversation" data-user-id="${userId}">
                        <i class="fas fa-envelope"></i>
                    </span>
                    <span class="icon-action icon-like" title="Like" data-action="like-user" data-user-id="${userId}">
                        <i class="fas fa-thumbs-up"></i>
                    </span>
                    <span class="icon-action icon-favourite" title="Add to Favourite" data-action="add-favorite" data-user-id="${userId}">
                        <i class="fas fa-heart"></i>
                    </span>
                </div>
            </div>
        </div>
    `;
    }

    return `
        <div class="online-user-card" data-user-id="${userId}" data-action="view-profile" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(31,38,135,0.08); transition: transform 0.2s; cursor: pointer; position: relative; display: flex; flex-direction: row; align-items: stretch; max-width: 100%; box-sizing: border-box;">
            ${newBadge}
            <div class="user-image-container" style="position: relative; width: 200px; min-width: 200px; height: 200px; overflow: hidden; border-radius: 12px 0 0 12px; background: #f0f0f0; flex-shrink: 0;">
                <img src="${profileImage ? profileImage : defaultImage}"
                     class="user-avatar"
                     data-default-src="${defaultImage}"
                     loading="lazy"
                     style="width: 100%; object-fit: cover;">
                ${onlineDot}
            </div>
            <div class="user-info" style="padding: 1.5rem; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="font-weight: 600; color: #00b894; margin-bottom: 0.5rem; font-size: 1.2rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                        ${real_name} ${genderIconHtml} ${ageBadgeHtml} ${compatibilityBadge}
                    </div>
                    <div style="font-size: 1rem; color: var(--muted-color); margin-bottom: 0.75rem;">
                        <i class="fas fa-map-marker-alt"></i> ${location}
                    </div>
                    ${interestsHtml}
                    ${aboutHtml}
                </div>
                <div class="user-actions">
                    <span class="icon-action icon-message" title="Message" data-action="open-conversation" data-user-id="${userId}">
                        <i class="fas fa-envelope"></i>
                    </span>
                    <span class="icon-action icon-like" title="Like" data-action="like-user" data-user-id="${userId}">
                        <i class="fas fa-thumbs-up"></i>
                    </span>
                    <span class="icon-action icon-favourite" title="Add to Favourite" data-action="add-favorite" data-user-id="${userId}">
                        <i class="fas fa-heart"></i>
                    </span>
                </div>
            </div>
        </div>
    `;
}

// Apply filters and sort (optimized: single filter pass)
function applyFiltersAndSort() {
    const searchLower = filters.search ? filters.search.toLowerCase() : '';
    const minScore = parseInt(filters.minCompatibilityScore) || 1;
    
    // Single filter pass for better performance
    filteredMatches = allMatches.filter(match => {
        // Search filter (location only)
        if (searchLower) {
            const loc = (match.location || match.city || '').toLowerCase();
            if (!loc.includes(searchLower)) return false;
        }

        // Online filter
        if (filters.onlineOnly && !match.is_online) return false;

        // With photos filter
        if (filters.withPhotos) {
            // Check if user has an actual uploaded photo (not default/null)
            // formatProfileImage returns null for default images, so non-null means real photo
            const hasPhoto = match.profile_image && 
                match.profile_image !== 'null' && 
                !match.profile_image.includes('default_profile') &&
                !match.profile_image.includes('default_profile_female') &&
                !match.profile_image.includes('default_profile_male');
            if (!hasPhoto) return false;
        }

        // Min compatibility score filter
        const score = match.compatibility_score || 0;
        if (score < minScore) return false;

        return true;
    });

    // Apply sorting
    switch (sortBy) {
        case 'compatibility':
            // Sort by highest compatibility score first
            filteredMatches.sort((a, b) => {
                const scoreA = a.compatibility_score || 0;
                const scoreB = b.compatibility_score || 0;
                // Primary: Compatibility score (highest first)
                if (scoreB !== scoreA) {
                    return scoreB - scoreA;
                }
                // Secondary: Mutual likes first
                if (a.is_mutual_like !== b.is_mutual_like) {
                    return b.is_mutual_like ? 1 : -1;
                }
                // Tertiary: Online status
                if (a.is_online !== b.is_online) {
                    return b.is_online ? 1 : -1;
                }
                // Quaternary: Most recent match
                const dateA = a.match_date ? (parseDate(a.match_date)?.getTime() || 0) : 0;
                const dateB = b.match_date ? (parseDate(b.match_date)?.getTime() || 0) : 0;
                return dateB - dateA;
            });
            break;
        case 'recent':
            filteredMatches.sort((a, b) => {
                const dateA = a.match_date ? (parseDate(a.match_date) || new Date(0)) : new Date(0);
                const dateB = b.match_date ? (parseDate(b.match_date) || new Date(0)) : new Date(0);
                return dateB - dateA;
            });
            break;
        case 'oldest':
            filteredMatches.sort((a, b) => {
                const dateA = a.match_date ? (parseDate(a.match_date) || new Date(0)) : new Date(0);
                const dateB = b.match_date ? (parseDate(b.match_date) || new Date(0)) : new Date(0);
                return dateA - dateB;
            });
            break;
        case 'age-asc':
            filteredMatches.sort((a, b) => {
                const ageA = a.age || calculateAge(a.birthdate) || 0;
                const ageB = b.age || calculateAge(b.birthdate) || 0;
                return ageA - ageB;
            });
            break;
        case 'age-desc':
            filteredMatches.sort((a, b) => {
                const ageA = a.age || calculateAge(a.birthdate) || 0;
                const ageB = b.age || calculateAge(b.birthdate) || 0;
                return ageB - ageA;
            });
            break;
        case 'online':
            filteredMatches.sort((a, b) => {
                if (a.is_online && !b.is_online) return -1;
                if (!a.is_online && b.is_online) return 1;
                return 0;
            });
            break;
    }

    renderMatches();
}

// Get paginated matches (encapsulated pagination logic)
function getPaginatedMatches() {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredMatches.slice(start, start + itemsPerPage);
}

// Show empty state
function showEmptyState() {
    const container = document.getElementById('matches-users');
    const sessionToken = getSessionToken();
    const tokenParam = sessionToken ? `?token=${sessionToken}` : '';
    selectedMatches.clear();
    updateBulkActions();
    container.innerHTML = `
        <div class="empty-state-container">
            <div class="empty-state-content">
                <div class="empty-icon-wrapper">
                    <i class="fas fa-search"></i>
                </div>
                <h2 class="empty-title">No Matches Found</h2>
                <p class="empty-description">We couldn't find any matches that meet your current filters. Try adjusting your search criteria or explore more options.</p>
                <div class="empty-actions">
                    <a href="/search${tokenParam}" class="empty-btn-primary">
                        <i class="fas fa-search"></i>
                        <span>Browse People</span>
                    </a>
                    <a href="/profile-edit${tokenParam}" class="empty-btn-secondary">
                        <i class="fas fa-user-edit"></i>
                        <span>Complete Your Profile</span>
                    </a>
                </div>
            </div>
        </div>
    `;
    container.className = 'empty-state-wrapper';
    
    // Hide pagination when no matches are found
    const pagination = document.getElementById('pagination');
    if (pagination) {
        pagination.style.display = 'none';
    }

    registerMatchStatusElements();
}

// Update pagination
function updatePagination(totalPages) {
    const pagination = document.getElementById('pagination');
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }

    pagination.style.display = 'flex';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

// Toggle view
function toggleView(view) {
    const cardsPerRowSelect = document.getElementById('cardsPerRow');
    if (cardsPerRowSelect) {
        cardsPerRowSelect.disabled = (view === 'list');
    }
    currentView = view;
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    const matchesGrid = document.getElementById('matches-users');
    if (matchesGrid) {
        matchesGrid.classList.remove('columns-3', 'columns-4', 'columns-5', 'columns-6');
        if (view === 'list') {
            matchesGrid.classList.add('list-view');
        } else {
            matchesGrid.classList.remove('list-view');
            const value = getCardsPerRowValue();
            matchesGrid.classList.add(`columns-${value}`);
            applyGridColumns(value);
        }
    }
    
    renderMatches();
}

// Toggle selection
let selectedMatches = new Set();
function toggleSelection(userId) {
    if (!userId) return;
    const shouldSelect = !selectedMatches.has(userId);
    setSelectionState(userId, shouldSelect);
}

function updateBulkActions() {
    const bulkActions = document.getElementById('bulk-actions');
    const selectedCount = document.getElementById('selected-count');
    
    if (selectedMatches.size > 0) {
        bulkActions.style.display = 'flex';
        selectedCount.textContent = `${selectedMatches.size} selected`;
    } else {
        bulkActions.style.display = 'none';
    }
}

// Bulk actions (with batch API support if backend supports it)
async function bulkMessage() {
    const userIds = Array.from(selectedMatches);
    if (userIds.length > 0) {
        // Open conversation with first user, or create group chat
        openConversation(userIds[0]);
    }
}

async function bulkFavorite() {
    const userIds = Array.from(selectedMatches);
    if (userIds.length === 0) return;
    
    // TODO: If backend supports batch API, use:
    // await batchAddFavorites(userIds);
    // For now, use sequential calls (can be optimized with Promise.all for parallel execution)
    const promises = userIds.map(userId => addFavorite(userId));
    await Promise.allSettled(promises);
    
    selectedMatches.clear();
    updateBulkActions();
    showToast(`Added ${userIds.length} user(s) to favorites`, 'success');
}

async function bulkUnmatch() {
    const count = selectedMatches.size;
    if (!confirm(`Are you sure you want to unmatch ${count} user(s)?`)) return;
    
    const userIds = Array.from(selectedMatches);
    
    // TODO: If backend supports batch API, use:
    // await batchUnmatch(userIds);
    // For now, use sequential calls (can be optimized with Promise.all for parallel execution)
    const promises = userIds.map(userId => unmatch(userId));
    const results = await Promise.allSettled(promises);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    selectedMatches.clear();
    updateBulkActions();
    loadMatches(); // Reload matches
    
    if (successCount === count) {
        showToast(`Unmatched ${successCount} user(s) successfully`, 'success');
    } else {
        showToast(`Unmatched ${successCount} of ${count} user(s)`, 'warning');
    }
}

// Action functions
function openConversation(userId) {
    // Try to get user's name from the match data
    const match = allMatches.find(m => m.id === userId || m.user_id === userId);
    const userName = match ? (match.real_name || match.name || 'User') : 'User';
    
    // Try to open universal message modal first
    if (typeof openUniversalMessageModal === 'function') {
        openUniversalMessageModal(userName, false, null,
            // Success callback
            (data) => {
                showToast('Message sent successfully', 'success');
            },
            // Error callback
            (error) => {
                // Error handling is done by the modal
            }
        );
    } else {
        // Fallback to talk page if modal not available
        const sessionToken = getSessionToken();
        if (sessionToken) {
            window.location.href = `/talk?token=${sessionToken}&user=${userId}`;
        } else {
            window.location.href = `/talk?user=${userId}`;
        }
    }
}

function viewProfile(userId) {
    // Open profile modal instead of redirecting
    if (window.openProfileModal) {
        openProfileModal(userId);
    } else if (window.UserProfileModal && window.UserProfileModal.open) {
        window.UserProfileModal.open(userId);
    } else {
        // Fallback to redirect if modal not available
        console.warn('Profile modal not available, redirecting to profile page');
        window.location.href = `/users/user_profile.html?user=${userId}`;
    }
}

async function likeUser(userId) {
    try {
        const currentUserId = getUserId();
        
        if (!currentUserId) {
            showToast('Authentication required', 'error');
            return;
        }

        const isVerified = await requireEmailVerificationForMatches('like users');
        if (!isVerified) {
            return;
        }
        
        const sessionToken = getSessionToken();
        
        // Build headers - only add auth headers if we have a token
        // Backend can read token from cookies if headers are missing
        const headers = {
            'Content-Type': 'application/json',
            'X-User-ID': currentUserId
        };
        
        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
            headers['X-Session-Token'] = sessionToken;
        }
        
        const tokenParam = sessionToken ? `?token=${sessionToken}` : '';
        const response = await fetch(`/api/likes${tokenParam}`, {
            method: 'POST',
            credentials: 'same-origin', // Include cookies for backend cookie-based auth
            headers: headers,
            body: JSON.stringify({ userId })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('User liked successfully', 'success');
        } else if (data.alreadyExists) {
            // User is already liked
            showToast(data.message || 'You already liked this user', 'info');
        } else {
            showToast(data.message || data.error || 'Failed to like user', 'error');
        }
    } catch (error) {
        console.error('Error liking user:', error);
        showToast('Failed to like user', 'error');
    }
}

async function addFavorite(userId) {
    try {
        const currentUserId = getUserId();
        
        if (!currentUserId) {
            showToast('Authentication required', 'error');
            return;
        }

        const isVerified = await requireEmailVerificationForMatches('add favourites');
        if (!isVerified) {
            return;
        }
        
        const sessionToken = getSessionToken();
        
        // Build headers - only add auth headers if we have a token
        // Backend can read token from cookies if headers are missing
        const headers = {
            'Content-Type': 'application/json',
            'X-User-ID': currentUserId
        };
        
        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
            headers['X-Session-Token'] = sessionToken;
        }
        
        const tokenParam = sessionToken ? `?token=${sessionToken}` : '';
        const response = await fetch(`/api/favorites${tokenParam}`, {
            method: 'POST',
            credentials: 'same-origin', // Include cookies for backend cookie-based auth
            headers: headers,
            body: JSON.stringify({ userId })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('Added to favorites', 'success');
        } else if (data.alreadyExists) {
            // User is already in favorites
            showToast(data.message || 'User is already in your favourites', 'info');
        } else {
            showToast(data.error || 'Failed to add favorite', 'error');
        }
    } catch (error) {
        console.error('Error adding favorite:', error);
        showToast('Failed to add favorite', 'error');
    }
}

async function unmatch(userId) {
    if (!confirm('Are you sure you want to unmatch this user?')) return;
    try {
        const sessionToken = getSessionToken();
        if (!sessionToken) {
            showToast('Authentication required', 'error');
            return;
        }
        // Call unmatch API endpoint
        const currentUserId = getUserId();
        const response = await fetch(`/api/matches/${currentUserId}/unmatch?token=${sessionToken}&userId=${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'X-Session-Token': sessionToken,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (data.success) {
            showToast('Unmatched successfully', 'success');
            loadMatches();
        } else {
            showToast(data.error || 'Failed to unmatch', 'error');
        }
    } catch (error) {
        console.error('Error unmatching:', error);
        showToast('Failed to unmatch', 'error');
    }
}

// Age calculation cache to avoid repeated calculations
const ageCache = new Map();
function calculateAge(birthdate) {
    if (!birthdate) return null;
    
    // Check cache first
    if (ageCache.has(birthdate)) {
        return ageCache.get(birthdate);
    }
    
    const today = new Date();
    const birth = parseDate(birthdate);
    if (!birth) return null;
    
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    
    // Cache result (limit cache size to prevent memory issues)
    if (ageCache.size < 200) {
        ageCache.set(birthdate, age);
    }
    
    return age;
}

// Helper functions
function getUserId() {
    return window.currentUser?.id || '{{userId}}' || null;
}

function getSessionToken() {
    // CSRF implementation moves token from URL to cookie, so check cookie first
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const trimmed = cookie.trim();
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex === -1) continue;
        
        const name = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim();
        
        if (name === 'sessionToken') {
            return decodeURIComponent(value);
        }
    }
    
    // Fallback to URL (in case CSRF hasn't run yet)
    const urlToken = new URLSearchParams(window.location.search).get('token');
    if (urlToken) {
        return urlToken;
    }
    
    return null;
}

// Save match score preference to database
async function saveMatchScorePreference(minScore) {
    try {
        const userId = getUserId();
        
        if (!userId) {
            console.error('User not authenticated');
            return;
        }
        
        const sessionToken = getSessionToken();
        
        // Build headers - only add auth headers if we have a token
        // Backend can read token from cookies if headers are missing
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
            headers['X-Session-Token'] = sessionToken;
        }

        const response = await fetch(`/api/matches/${userId}/match-score-preference`, {
            method: 'POST',
            credentials: 'same-origin', // Include cookies for backend cookie-based auth
            headers: headers,
            body: JSON.stringify({
                minCompatibilityScore: minScore
            })
        });

        const data = await response.json();
        
        if (!data.success) {
            console.error('Failed to save match score preference:', data.error);
        }
    } catch (error) {
        console.error('Error saving match score preference:', error);
    }
}

// Toast queue to prevent overlapping toasts
const toastQueue = [];
let toastActive = false;

function showToast(message, type = 'info') {
    toastQueue.push({ message, type });
    processToastQueue();
}

function processToastQueue() {
    if (toastActive || toastQueue.length === 0) return;
    
    toastActive = true;
    const { message, type } = toastQueue.shift();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
        toastActive = false;
        processToastQueue(); // Process next toast in queue
    }, 3001);
}

// Setup cards per row control (like reference)
function setupCardsPerRowControl() {
    const cardsPerRowSelect = document.getElementById('cardsPerRow');
    const matchesGrid = document.getElementById('matches-users');
    
    if (!cardsPerRowSelect || !matchesGrid) {
        console.warn('Cards per row elements not found');
        return;
    }
    
    // Use default value
    const defaultPreference = '4';
    cardsPerRowSelect.value = defaultPreference;
    updateGridColumns(defaultPreference);
    
    // Disable if currently in list view
    const isListView = matchesGrid.classList.contains('list-view');
    cardsPerRowSelect.disabled = isListView;
    
    cardsPerRowSelect.addEventListener('change', function(e) {
        updateGridColumns(e.target.value);
    });
}

// Update grid columns (exactly like reference)
function updateGridColumns(value) {
    const matchesGrid = document.getElementById('matches-users');
    if (!matchesGrid) return;

    matchesGrid.classList.remove('columns-3', 'columns-4', 'columns-5', 'columns-6');
    if (!matchesGrid.classList.contains('list-view')) {
        matchesGrid.classList.add(`columns-${value}`);
        applyGridColumns(value);
    }
}

function applyGridColumns(value) {
    const matchesGrid = document.getElementById('matches-users');
    if (!matchesGrid) return;
    if (matchesGrid.classList.contains('list-view')) return;

    matchesGrid.querySelectorAll('.uc-card').forEach(card => {
        card.dataset.columns = value;
    });
    matchesGrid.querySelectorAll('.uc-image-container').forEach(container => {
        container.dataset.columns = value;
    });
}

// Add mutation observer to handle dynamically added cards
function setupCardsObserver() {
    const matchesGrid = document.getElementById('matches-users');
    if (!matchesGrid) return;
    
    const observer = new MutationObserver((mutations) => {
        let hasNewCards = false;
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                hasNewCards = true;
            }
        });
        if (hasNewCards) {
            const columnsValue = getCardsPerRowValue();
            applyGridColumns(columnsValue);
        }
    });
    
    observer.observe(matchesGrid, { childList: true });
}

// Event delegation for match card actions (CSP-safe - optimized dataset queries)
function setupMatchCardEventDelegation() {
    const container = document.getElementById('matches-users');
    if (!container) return;

    container.addEventListener('change', handleMatchCheckboxChange);
    container.addEventListener('click', (event) => {
        const retryButton = event.target.closest('[data-action="retry-load-matches"]');
        if (retryButton) {
            event.preventDefault();
            loadMatches();
            return;
        }

        if (event.target.closest('.match-card-checkbox')) {
            event.stopPropagation();
            return;
        }

        if (typeof window.renderResultsUserCard !== 'function') {
            const legacyAction = event.target.closest('[data-action]');
            if (!legacyAction) {
                return;
            }

            const userId = Number(legacyAction.dataset.userId);
            const action = legacyAction.dataset.action;
            if (!action) return;

            switch (action) {
                case 'view-profile':
                    if (userId) viewProfile(userId);
                    break;
                case 'open-conversation':
                    if (userId) openConversation(userId);
                    break;
                case 'like-user':
                    if (userId) likeUser(userId);
                    break;
                case 'add-favorite':
                    if (userId) addFavorite(userId);
                    break;
                case 'toggle-selection':
                    if (userId) toggleSelection(userId);
                    break;
                default:
                    break;
            }
        }
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Adjust items per page based on screen size (session-only persistence)
    function adjustItemsPerPage() {
        // Otherwise, calculate based on screen size
        if (window.innerWidth <= 480) {
            itemsPerPage = 6; // Very small screens
        } else if (window.innerWidth <= 768) {
            itemsPerPage = 8; // Small screens/tablets
        } else {
            itemsPerPage = 12; // Desktop
        }
        
        currentPage = 1;
    }
    
    // Set initial items per page
    adjustItemsPerPage();
    
    // Setup event delegation for match cards (CSP-safe)
    setupMatchCardEventDelegation();
    
    // Update on window resize (debounced, no localStorage persistence)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const oldItemsPerPage = itemsPerPage;
            adjustItemsPerPage();
            // Only reload if items per page actually changed
            if (oldItemsPerPage !== itemsPerPage) {
                renderMatches();
            }
        }, 250);
    });
    
    // Setup cards per row control FIRST (before loading matches)
    setupCardsPerRowControl();
    setupCardsObserver();
    
    // Debug helper function
    window.debugImageSizes = function() {
        const containers = document.querySelectorAll('.user-image-container');
        console.log(`Found ${containers.length} image containers`);
        containers.forEach((container, i) => {
            const computed = getComputedStyle(container);
            console.log(`Container ${i+1}:`, {
                height: computed.height,
                minHeight: computed.minHeight,
                maxHeight: computed.maxHeight,
                aspectRatio: computed.aspectRatio,
                className: container.className,
                dataset: container.dataset
            });
        });
    };
    
    loadStats();
    loadMatches();

    // View toggle
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleView(btn.dataset.view));
    });

    // Search
    const searchInput = document.getElementById('search-matches');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filters.search = e.target.value;
                currentPage = 1;
                applyFiltersAndSort();
            }, 300);
        });
    }

    // Sort
    const sortSelect = document.getElementById('sort-matches');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortBy = e.target.value;
            currentPage = 1;
            applyFiltersAndSort();
        });
    }

    // Filters
    document.getElementById('filter-online-only')?.addEventListener('change', (e) => {
        filters.onlineOnly = e.target.checked;
        currentPage = 1;
        applyFiltersAndSort();
    });

    document.getElementById('filter-with-photos')?.addEventListener('change', (e) => {
        filters.withPhotos = e.target.checked;
        currentPage = 1;
        applyFiltersAndSort();
    });

    // Match score slider filter
    const matchScoreSlider = document.getElementById('match-score-slider');
    const matchScoreValue = document.getElementById('match-score-value');
    const matchScoreReset = document.getElementById('match-score-reset');
    
    if (matchScoreSlider && matchScoreValue) {
        // Debounce timer for input events
        let inputTimeout = null;
        
        // Handle slider input (while dragging) - update display and filter with scroll preservation
        matchScoreSlider.addEventListener('input', (e) => {
            // Store scroll position before filtering
            const scrollY = window.scrollY;
            
            const value = parseInt(e.target.value);
            filters.minCompatibilityScore = value;
            matchScoreValue.textContent = value === 1 ? '1%+ (All)' : `${value}%+`;
            
            // Debounce filtering to reduce re-renders while dragging
            clearTimeout(inputTimeout);
            inputTimeout = setTimeout(() => {
                applyFiltersAndSort();
                
                // Restore scroll position after rendering to prevent page jump
                requestAnimationFrame(() => {
                    window.scrollTo({
                        top: scrollY,
                        behavior: 'instant'
                    });
                });
            }, 150); // 150ms debounce
        });
        
        // Handle slider change (on release/click) - apply filter with scroll preservation
        matchScoreSlider.addEventListener('change', (e) => {
            // Clear any pending input timeout
            clearTimeout(inputTimeout);
            
            // Store scroll position before filtering
            const scrollY = window.scrollY;
            
            const value = parseInt(e.target.value);
            filters.minCompatibilityScore = value;
            matchScoreValue.textContent = value === 1 ? '1%+ (All)' : `${value}%+`;
            
            // Save preference to database
            saveMatchScorePreference(value);
            currentPage = 1;
            
            // Apply filters and restore scroll position
            applyFiltersAndSort();
            
            // Restore scroll position after rendering to prevent page jump
            requestAnimationFrame(() => {
                window.scrollTo({
                    top: scrollY,
                    behavior: 'instant'
                });
            });
        });
        
        // Reset button - reset to 1% (show all matches)
        if (matchScoreReset) {
            matchScoreReset.addEventListener('click', () => {
                // Store scroll position before filtering
                const scrollY = window.scrollY;
                
                matchScoreSlider.value = 1;
                matchScoreValue.textContent = '1%+ (All)';
                filters.minCompatibilityScore = 1;
                saveMatchScorePreference(1);
                currentPage = 1;
                
                applyFiltersAndSort();
                
                // Restore scroll position after rendering to prevent page jump
                requestAnimationFrame(() => {
                    window.scrollTo({
                        top: scrollY,
                        behavior: 'instant'
                    });
                });
            });
        }
    }

    // Initialize profile modal
    function initProfileModal() {
        // Wait for modal script to load
        if (window.UserProfileModal) {
            window.UserProfileModal.setGetCurrentUserId(getUserId);
            window.UserProfileModal.setGetSessionToken(getSessionToken);
        } else {
            // Retry after a short delay
            setTimeout(initProfileModal, 100);
        }
    }
    
    // Load profile modal actions
    function loadProfileModalActions() {
        if (typeof window.ProfileModalActions === 'undefined') {
            const script = document.createElement('script');
            script.src = '/components/modals/profile-modal-actions.js';
            script.async = true;
            script.type = 'text/javascript'; // Explicitly set type
            
            // Set error handler BEFORE appending to prevent HTML execution
            script.onerror = function() {
                console.warn('⚠️ Failed to load profile-modal-actions.js - modal actions may not work correctly');
                // Remove immediately to prevent HTML from being executed
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                // Prevent the script from executing by removing it from DOM
                script.remove();
            };
            
            script.onload = function() {
                // Verify it's actually JavaScript, not HTML
                if (window.ProfileModalActions) {
                    window.ProfileModalActions.init({
                        getCurrentUserId: getUserId,
                        getCurrentProfileUserId: () => window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null,
                        getSessionToken: getSessionToken,
                        showNotification: showToast
                    });
                } else {
                    // If ProfileModalActions is not defined, the file might have returned HTML
                    console.warn('⚠️ profile-modal-actions.js loaded but ProfileModalActions not defined - file may have returned HTML');
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }
                }
            };
            
            // Use fetch first to verify it's JavaScript before appending
            fetch('/components/modals/profile-modal-actions.js', {
                headers: { 'Accept': 'application/javascript, text/javascript, */*' }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const contentType = response.headers.get('content-type');
                if (contentType && !contentType.includes('javascript')) {
                    throw new Error('Response is not JavaScript');
                }
                // If fetch succeeds, append the script
                document.head.appendChild(script);
            })
            .catch(error => {
                console.warn('⚠️ Failed to load profile-modal-actions.js:', error.message);
                // Don't append the script if fetch fails
            });
        } else {
            window.ProfileModalActions.init({
                getCurrentUserId: getUserId,
                getCurrentProfileUserId: () => window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null,
                getSessionToken: getSessionToken,
                showNotification: showToast
            });
        }
    }
    
    // Add event listeners for modal action buttons
    function setupModalButtonHandlers() {
        // Use event delegation for modal buttons (they're dynamically loaded)
        document.addEventListener('click', function(e) {
            // Like button
            if (e.target.closest('.modal-like-btn')) {
                e.preventDefault();
                e.stopPropagation();
                if (window.ProfileModalActions) {
                    window.ProfileModalActions.likeProfileInModal();
                } else {
                    showToast('Profile modal actions not loaded', 'error');
                }
            }
            
            // Favorite button
            if (e.target.closest('.modal-favourite-btn')) {
                e.preventDefault();
                e.stopPropagation();
                if (window.ProfileModalActions) {
                    window.ProfileModalActions.favouriteProfileInModal();
                } else {
                    showToast('Profile modal actions not loaded', 'error');
                }
            }
            
            // Message button
            if (e.target.closest('.modal-message-btn')) {
                e.preventDefault();
                e.stopPropagation();
                messageProfileInModal();
            }
        });
    }
    
    // Message profile in modal
    function messageProfileInModal() {
        const currentProfileUserId = window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null;
        if (!currentProfileUserId) {
            showToast('Profile not loaded', 'error');
            return;
        }
        
        // Get full real_name from modal (not just first name)
        const real_nameElement = document.getElementById('modal-profile-real_name');
        const real_name = real_nameElement ? real_nameElement.textContent.trim() : 'User';
        
        if (!real_name || real_name === 'Unknown User') {
            showToast('Profile data not loaded correctly. Please refresh the page.', 'error');
            return;
        }
        
        // Close profile modal first
        if (window.closeProfileModal) {
            window.closeProfileModal();
        }
        
        // Open universal message modal with full name
        if (typeof openUniversalMessageModal === 'function') {
            openUniversalMessageModal(real_name, false, null,
                // Success callback
                (data) => {
                    showToast('Message sent successfully', 'success');
                },
                // Error callback
                (error) => {
                    // Error handling is done by the modal
                }
            );
            
            // Set receiverId after modal opens (if available)
            setTimeout(() => {
                if (window.universalMessageData) {
                    window.universalMessageData.receiverId = currentProfileUserId;
                }
            }, 100);
        } else {
            // Fallback to conversation page if modal not available
            openConversation(currentProfileUserId);
        }
    }
    
    // Initialize modals
    initProfileModal();
    loadProfileModalActions();
    setupModalButtonHandlers();
    
    // Setup bulk action buttons (CSP-safe: no inline onclick)
    document.getElementById('bulk-actions')?.addEventListener('click', function(e) {
        const button = e.target.closest('[data-action]');
        if (!button) return;
        
        const action = button.dataset.action;
        switch (action) {
            case 'bulk-message':
                bulkMessage();
                break;
            case 'bulk-favorite':
                bulkFavorite();
                break;
            case 'bulk-unmatch':
                bulkUnmatch();
                break;
        }
    });

    // Reset filters
    document.getElementById('reset-filters')?.addEventListener('click', () => {
        filters.search = '';
        filters.onlineOnly = false;
        filters.withPhotos = false;
        filters.minCompatibilityScore = 1;
        sortBy = 'compatibility';
        currentPage = 1;
        
        searchInput.value = '';
        sortSelect.value = 'compatibility';
        document.getElementById('filter-online-only').checked = false;
        document.getElementById('filter-with-photos').checked = false;
        
        // Reset match score slider
        const matchScoreSliderReset = document.getElementById('match-score-slider');
        const matchScoreValueReset = document.getElementById('match-score-value');
        if (matchScoreSliderReset && matchScoreValueReset) {
            matchScoreSliderReset.value = 1;
            matchScoreValueReset.textContent = '1%+ (All)';
        }
        
        applyFiltersAndSort();
    });

    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderMatches();
        }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredMatches.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderMatches();
        }
    });

    // Load more
    document.getElementById('load-more-btn')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredMatches.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderMatches();
        }
    });
});

// Expose functions for inline HTML handlers (CSP-safe)
window.viewProfile = viewProfile;
window.toggleSelection = toggleSelection;
window.openConversation = openConversation;
window.likeUser = likeUser;
window.addFavorite = addFavorite;
window.bulkMessage = bulkMessage;
window.bulkFavorite = bulkFavorite;
window.bulkUnmatch = bulkUnmatch;
window.loadMatches = loadMatches;

