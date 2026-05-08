/**
 * User Profile Modal JavaScript
 * External module for handling user profile modal functionality
 */

(function() {
    'use strict';
    
    // Global state
    let currentProfileUserId = null;
    let currentProfileGender = null;
    let modalPresenceUnsubscribe = null;
    
    // Utility functions
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function formatTimeAgo(timestamp) {
        const now = Date.now();
        const then = new Date(timestamp).getTime();
        const diff = now - then;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    
    // Get default profile image based on gender
    function getDefaultProfileImage(gender) {
        const genderLower = (gender || '').toLowerCase().trim();
        if (genderLower === 'male' || genderLower === 'm') {
            return '/assets/images/default_profile_male.svg';
        } else if (genderLower === 'female' || genderLower === 'f') {
            return '/assets/images/default_profile_female.svg';
        }
        // Fallback to male default
        return '/assets/images/default_profile_male.svg';
    }

    function repairThumbnailPath(rawPath) {
        const value = (rawPath || '').toString().trim();
        if (!value) {
            return '';
        }

        // Repair malformed thumbnail names while preserving thumbnail preference.
        // Example: user_123.jpg_thumb_small.jpg -> user_123_thumb_small.jpg
        return value.replace(
            /(\.[^.\/]+)_thumb_(small|medium)\.jpg$/i,
            '_thumb_$2.jpg'
        );
    }

    function hasMalformedThumbnailSuffix(rawPath) {
        const value = (rawPath || '').toString().trim();
        return /(\.[^.\/]+)_thumb_(small|medium)\.jpg$/i.test(value);
    }

    function getProfileImageVariants(fileNameOrUrl, explicitSmallPath, explicitMediumPath) {
        const value = repairThumbnailPath(fileNameOrUrl);
        if (!value) {
            return { original: '', medium: '', small: '' };
        }

        const normalizePath = (rawPath) => {
            if (hasMalformedThumbnailSuffix(rawPath)) return '';
            const val = repairThumbnailPath(rawPath);
            if (!val) return '';
            if (/^https?:\/\//i.test(val)) return val;
            return val.startsWith('/') ? val : `/${val}`;
        };

        const explicitSmall = normalizePath(explicitSmallPath);
        const explicitMedium = normalizePath(explicitMediumPath);

        if (/^https?:\/\//i.test(value)) {
            return {
                original: value,
                medium: explicitMedium || value,
                small: explicitSmall || explicitMedium || value
            };
        }

        let normalized = value;
        if (normalized.startsWith('/uploads/profile_images/')) {
            normalized = normalized.replace('/uploads/profile_images/', '');
        } else if (normalized.startsWith('uploads/profile_images/')) {
            normalized = normalized.replace('uploads/profile_images/', '');
        } else if (normalized.startsWith('/')) {
            normalized = normalized.slice(1);
        }

        const originalNormalized = normalized.replace(/_thumb_(small|medium)(\.[^.\/]+)$/i, '$2');
        const originalPath = `/uploads/profile_images/${originalNormalized}`;

        return {
            original: originalPath,
            medium: explicitMedium || originalPath,
            small: explicitSmall || explicitMedium || originalPath
        };
    }

    function getImageVariantOrder(preferenceSource) {
        const preferredSize = String(
            preferenceSource?.preferred_image_size
            || preferenceSource?.preferredImageSize
            || ''
        ).toLowerCase();

        const preferSmall = Boolean(
            preferenceSource?.prefer_small_thumbnail
            || preferenceSource?.preferSmallThumbnail
            || preferredSize === 'small'
        );

        const preferMedium = Boolean(
            preferenceSource?.prefer_medium_thumbnail
            || preferenceSource?.preferMediumThumbnail
            || preferredSize === 'medium'
        );

        if (preferMedium) {
            return ['medium', 'small', 'original'];
        }

        if (preferSmall) {
            return ['small', 'medium', 'original'];
        }

        return ['small', 'medium', 'original'];
    }

    function buildVariantCandidates(variants, preferenceSource) {
        const order = getImageVariantOrder(preferenceSource);
        const allKeys = ['small', 'medium', 'original'];
        const keys = [...order, ...allKeys.filter((key) => !order.includes(key))];
        return keys
            .map((key) => variants?.[key] || '')
            .filter(Boolean)
            .filter((value, index, arr) => arr.indexOf(value) === index);
    }

    function getPrimaryProfileImageSource(profile) {
        const baseValue =
            profile?.profile_image ||
            profile?.profileImage ||
            profile?.image ||
            '';

        const variants = getProfileImageVariants(
            baseValue,
            profile?.thumbnail_small_path,
            profile?.thumbnail_medium_path
        );

        const candidates = buildVariantCandidates(variants, profile);
        return candidates[0] || '';
    }

    /**
     * True when the profile has a real photo URL to attempt (uploads, http(s), or non-placeholder asset).
     * Matches Talk `hasTalkProfilePhoto` semantics so modal and chat stay consistent.
     */
    function hasModalProfilePhoto(profile) {
        const base = (
            profile?.profile_image ||
            profile?.profileImage ||
            profile?.image ||
            ''
        ).toString().trim();
        if (!base || base === 'null') {
            return false;
        }
        if (base.length === 1 && !/[./\\]/.test(base)) {
            return false;
        }
        const lower = base.toLowerCase();
        if (lower.includes('default_profile')) {
            return false;
        }
        if (lower.includes('account_deactivated')) {
            return false;
        }
        if (/^https?:\/\//i.test(base)) {
            return true;
        }
        if (base.startsWith('/uploads/') || base.startsWith('uploads/')) {
            return true;
        }
        if (base.startsWith('/assets/') || base.startsWith('assets/')) {
            return true;
        }
        if (!base.includes('/') && !base.includes('\\') && /\.[a-z0-9]{2,8}$/i.test(base)) {
            return true;
        }
        return false;
    }

    function modalInitialFromRealName(profile) {
        const raw = (profile?.real_name || '').trim();
        if (!raw) {
            return '?';
        }
        const token = raw.split(/\s+/).filter(Boolean)[0] || raw;
        const ch = token.charAt(0);
        return ch ? ch.toLocaleUpperCase() : '?';
    }

    function removeModalAvatarInitial() {
        const letter = document.getElementById('modal-profile-avatar-initial');
        if (letter) {
            letter.remove();
        }
    }
    
    // Get icon and color for relationship type
    function getRelationshipTypeIcon(relationshipType) {
        if (!relationshipType) return { icon: '', color: '#667eea', label: '' };
        
        const type = relationshipType.toLowerCase().trim();
        const iconMap = {
            'marriage': { icon: 'fa-ring', color: '#c0c0c0', label: 'Marriage' },
            'romance': { icon: 'fa-heart', color: '#e91e63', label: 'Romance' },
            'casual': { icon: 'fa-lips', color: '#f39c12', label: 'Casual' },
            'friendship': { icon: 'fa-smile', color: '#f39c12', label: 'Friendship' },
            'travel companion': { icon: 'fa-plane', color: '#16a085', label: 'Travel Companion' },
            'pen pal': { icon: 'fa-pen', color: '#9b59b6', label: 'Pen Pal' },
            'other': { icon: 'fa-question-circle', color: '#95a5a6', label: 'Other' }
        };
        
        return iconMap[type] || { icon: 'fa-star', color: '#667eea', label: relationshipType };
    }
    
    // Get current user ID - can be overridden by pages
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
        
        // Try window.currentUser
        if (window.currentUser && window.currentUser.id) {
            return window.currentUser.id;
        }
        
        return null;
    }
    
    // Get session token - can be overridden by pages
    function getSessionToken() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('token') || '';
    }

    function cleanupModalPresenceSubscription() {
        if (typeof modalPresenceUnsubscribe === 'function') {
            try {
                modalPresenceUnsubscribe();
            } catch (error) {
                console.warn('UserProfileModal: failed to cleanup presence subscription', error);
            }
        }
        modalPresenceUnsubscribe = null;
    }

    function applyModalStatusFallback(profile) {
        const statusText = document.getElementById('modal-status-text');
        const statusDot = document.getElementById('status-dot');
        if (!statusText) return;

        if (statusDot) {
            statusDot.style.display = 'inline-flex';
            statusDot.style.backgroundColor = '#00b894';
        }

        if (profile?.is_online) {
            statusText.innerHTML = '<i class="fas fa-circle" style="color: #00b894; font-size: 0.6rem;"></i> Online now';
            statusText.style.color = '#00b894';
            return;
        }

        if (statusDot) {
            statusDot.style.display = profile?.last_active ? 'inline-flex' : 'none';
            statusDot.style.backgroundColor = '#f39c12';
        }

        if (profile?.last_active) {
            statusText.innerHTML = `<i class="fas fa-clock" style="margin-right: 0.3rem; color: #ffffff;"></i> Last active ${formatTimeAgo(profile.last_active)}`;
            statusText.style.color = '#ffffff';
            return;
        }

        statusText.textContent = 'Offline';
        statusText.style.color = '#ffffff';
    }

    function updateModalPresenceStatus(status) {
        const statusText = document.getElementById('modal-status-text');
        const statusDot = document.getElementById('status-dot');
        if (!statusText) return;

        const isOnline = Boolean(status?.isOnline);
        const lastSeen = status?.lastSeen || status?.timestamp || null;
        const uiState = status?.uiState || (isOnline ? 'online' : 'offline');

        if (statusDot) {
            statusDot.style.display = uiState === 'offline' ? 'none' : 'inline-flex';
            statusDot.style.backgroundColor = isOnline ? '#00b894' : '#f39c12';
            statusDot.classList.toggle('is-online', isOnline);
            statusDot.classList.toggle('is-stale', !isOnline && uiState !== 'offline');
        }

        if (isOnline) {
            statusText.innerHTML = '<i class="fas fa-circle" style="color: #00b894; font-size: 0.6rem;"></i> Online now';
            statusText.style.color = '#00b894';
            return;
        }

        if (lastSeen) {
            statusText.innerHTML = `<i class="fas fa-clock" style="margin-right: 0.3rem; color: #ffffff;"></i> Last active ${formatTimeAgo(lastSeen)}`;
            statusText.style.color = '#ffffff';
            return;
        }

        statusText.textContent = 'Offline';
        statusText.style.color = '#ffffff';
    }

    function bindModalPresenceStatus(profile) {
        const presence = window.Presence;
        const userId = Number(profile?.id);
        if (!presence?.subscribe || !presence?.requestStatus || !Number.isFinite(userId)) {
            return false;
        }

        cleanupModalPresenceSubscription();

        const handler = (status) => updateModalPresenceStatus(status);
        modalPresenceUnsubscribe = presence.subscribe(userId, handler);

        presence.requestStatus(userId).then(handler).catch(() => {
            // Fallback already rendered; no-op on failure.
        });

        const statusContainer = document.getElementById('modal-profile-status');
        if (statusContainer) {
            statusContainer.dataset.userId = String(userId);
        }

        return true;
    }

    // Open profile modal
    async function openProfileModal(userId) {
        // Check email verification before opening profile modal
        if (window.checkEmailVerificationStatus) {
            const isVerified = await window.checkEmailVerificationStatus();
            if (!isVerified) {
                if (window.showVerificationMessage) {
                    window.showVerificationMessage();
                }
                return; // Don't open modal
            }
        }
        
        const modal = document.getElementById('userProfileModal');
        const loading = document.getElementById('modal-loading');
        const error = document.getElementById('modal-error');
        const content = document.getElementById('modal-profile-content');
        
        if (!modal || !loading || !error || !content) {
            console.error('Profile modal elements not found');
            return;
        }
        
        // Show modal
        modal.style.display = 'block';
        loading.style.display = 'block';
        error.style.display = 'none';
        content.style.display = 'none';
        
        // Store current profile user ID
        currentProfileUserId = userId;
        
        try {
            const currentUserId = getCurrentUserId();
            const response = await fetch(`/api/users/${userId}/profile`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': currentUserId || ''
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
    
    // Display profile in modal
    function displayProfileInModal(profile) {
        const loading = document.getElementById('modal-loading');
        const content = document.getElementById('modal-profile-content');
        
        if (!loading || !content) return;
        
        // Hide loading, show content
        loading.style.display = 'none';
        content.style.display = 'block';
        
        cleanupModalPresenceSubscription();

        // Store profile gender for default image selection
        currentProfileGender = profile.gender;
        
        // Basic info
        const profileGenderLower = (profile.gender || '').toLowerCase().trim();
        const genderIcon = (profileGenderLower === 'male' || profileGenderLower === 'm') ? 'fa-mars' : 'fa-venus';
        const genderStyle = (profileGenderLower === 'male' || profileGenderLower === 'm') ? 'color: #3498db;' : 'color: #e91e63;';
        
        const real_nameEl = document.getElementById('modal-profile-real_name');
        if (real_nameEl) {
            real_nameEl.innerHTML = `${escapeHtml(profile.real_name || 'Unknown User')} <i class="fas ${genderIcon}" style="font-size: 1.8rem; margin-left: 0.3rem; ${genderStyle}"></i>`;
        }
        
        const avatarEl = document.getElementById('modal-profile-avatar');
        if (avatarEl) {
            removeModalAvatarInitial();
            avatarEl.style.display = '';

            if (!hasModalProfilePhoto(profile)) {
                avatarEl.removeAttribute('src');
                avatarEl.style.display = 'none';
                avatarEl.onerror = null;
                const span = document.createElement('span');
                span.id = 'modal-profile-avatar-initial';
                span.className = 'profile-avatar-initial';
                span.setAttribute('aria-hidden', 'true');
                span.textContent = modalInitialFromRealName(profile);
                avatarEl.insertAdjacentElement('afterend', span);
            } else {
                const defaultAvatar = getDefaultProfileImage(profile.gender);
                const avatarVariants = getProfileImageVariants(
                    profile?.profile_image || profile?.profileImage || profile?.image || '',
                    profile?.thumbnail_small_path,
                    profile?.thumbnail_medium_path
                );
                const toAbsoluteUrl = (path) => {
                    if (!path || typeof path !== 'string') return '';
                    try {
                        return new URL(path, window.location.origin).href;
                    } catch (error) {
                        return '';
                    }
                };

                const fallbackCandidates = buildVariantCandidates(avatarVariants, profile)
                    .map((path) => toAbsoluteUrl(path))
                    .filter(Boolean)
                    .filter((value, index, arr) => arr.indexOf(value) === index);
                const defaultAbsolute = toAbsoluteUrl(defaultAvatar);
                let fallbackIndex = 0;

                avatarEl.src = fallbackCandidates[0] || defaultAbsolute;
                avatarEl.onerror = function() {
                    fallbackIndex += 1;
                    if (fallbackIndex < fallbackCandidates.length) {
                        this.src = fallbackCandidates[fallbackIndex];
                        return;
                    }

                    if (defaultAbsolute && this.src !== defaultAbsolute) {
                        this.src = defaultAbsolute;
                        return;
                    }

                    this.onerror = null;
                    if (!document.getElementById('modal-profile-avatar-initial')) {
                        this.style.display = 'none';
                        const span = document.createElement('span');
                        span.id = 'modal-profile-avatar-initial';
                        span.className = 'profile-avatar-initial';
                        span.setAttribute('aria-hidden', 'true');
                        span.textContent = modalInitialFromRealName(profile);
                        this.insertAdjacentElement('afterend', span);
                    }
                };
            }
        }
        
        const locationTextEl = document.getElementById('modal-profile-location-text');
        if (locationTextEl) {
            locationTextEl.textContent = profile.location || 'Unknown location';
        }
        
        const ageEl = document.getElementById('modal-profile-age');
        if (ageEl) {
            ageEl.textContent = profile.age ? `${profile.age} years old` : 'Unknown';
        }
        
        // Status
        applyModalStatusFallback(profile);
        bindModalPresenceStatus(profile);
        
        // Basic Information section
        const occupationEl = document.getElementById('modal-info-occupation');
        if (occupationEl) {
            const occRaw = (profile.attributes && profile.attributes.occupation) ? profile.attributes.occupation : '';
            if (occRaw) {
                occupationEl.innerHTML = '<i class="fas fa-briefcase"></i> <span>' + escapeHtml(occRaw) + '</span>';
                occupationEl.setAttribute('data-tooltip', 'Career: ' + occRaw);
                occupationEl.removeAttribute('title');
                occupationEl.setAttribute('aria-label', 'Career: ' + occRaw);
                occupationEl.style.display = '';
            } else {
                occupationEl.style.display = 'none';
            }
        }
        
        const educationEl = document.getElementById('modal-info-education');
        if (educationEl) {
            const eduRaw = (profile.attributes && profile.attributes.education) ? profile.attributes.education : '';
            if (eduRaw) {
                educationEl.innerHTML = '<i class="fas fa-graduation-cap"></i> <span>' + escapeHtml(eduRaw) + '</span>';
                educationEl.setAttribute('data-tooltip', 'Education: ' + eduRaw);
                educationEl.removeAttribute('title');
                educationEl.setAttribute('aria-label', 'Education: ' + eduRaw);
                educationEl.style.display = '';
            } else {
                educationEl.style.display = 'none';
            }
        }

        const incomeEl = document.getElementById('modal-info-income');
        if (incomeEl) {
            const incRaw = (profile.attributes && (profile.attributes.income || profile.attributes.incomeName || profile.attributes.income_name))
                ? (profile.attributes.income || profile.attributes.incomeName || profile.attributes.income_name)
                : '';
            if (incRaw) {
                incomeEl.innerHTML = '<i class="fas fa-dollar-sign"></i> <span>' + escapeHtml(incRaw) + '</span>';
                incomeEl.setAttribute('data-tooltip', 'Salary per year: ' + incRaw);
                incomeEl.removeAttribute('title');
                incomeEl.setAttribute('aria-label', 'Salary per year: ' + incRaw);
                incomeEl.style.display = '';
            } else {
                incomeEl.style.display = 'none';
            }
        }

        const attrs = profile.attributes || {};
        const setBasicInfoItem = (elementId, iconClass, valueRaw, label) => {
            const element = document.getElementById(elementId);
            if (!element) {
                return;
            }
            const resolvedRaw = (valueRaw != null && String(valueRaw).trim() !== '')
                ? String(valueRaw)
                : null;
            if (!resolvedRaw) {
                element.style.display = 'none';
                return;
            }
            element.style.display = '';
            element.innerHTML = `<i class="fas ${iconClass}"></i> <span>${escapeHtml(resolvedRaw)}</span>`;
            element.setAttribute('data-tooltip', `${label}: ${resolvedRaw}`);
            element.removeAttribute('title');
            element.setAttribute('aria-label', `${label}: ${resolvedRaw}`);
        };

        setBasicInfoItem('modal-info-height', 'fa-ruler-vertical', attrs.height_cm ? `${attrs.height_cm} cm` : null, 'Height');
        setBasicInfoItem('modal-info-weight', 'fa-weight-scale', attrs.weight_kg ? `${attrs.weight_kg} kg` : null, 'Weight');
        setBasicInfoItem('modal-info-body-type', 'fa-person', attrs.body_type, 'Body type');
        setBasicInfoItem('modal-info-eye-color', 'fa-eye', attrs.eye_color, 'Eye color');
        setBasicInfoItem('modal-info-ethnicity', 'fa-earth-asia', attrs.ethnicity, 'Ethnicity');
        setBasicInfoItem('modal-info-religion', 'fa-pray', attrs.religion, 'Religion');
        setBasicInfoItem('modal-info-marital-status', 'fa-ring', attrs.marital_status, 'Marital status');
        setBasicInfoItem('modal-info-lifestyle', 'fa-seedling', attrs.lifestyle, 'Lifestyle');
        setBasicInfoItem('modal-info-living-situation', 'fa-house-user', attrs.living_situation, 'Living situation');
        setBasicInfoItem('modal-info-body-art', 'fa-palette', attrs.body_art, 'Body art');
        setBasicInfoItem('modal-info-english-ability', 'fa-language', attrs.english_ability, 'English ability');
        setBasicInfoItem('modal-info-relocation', 'fa-truck', attrs.relocation, 'Relocation');
        setBasicInfoItem('modal-info-smoking', 'fa-smoking', attrs.smoking, 'Smoking');
        setBasicInfoItem('modal-info-drinking', 'fa-wine-glass', attrs.drinking, 'Drinking');
        setBasicInfoItem('modal-info-exercise', 'fa-dumbbell', attrs.exercise_habits, 'Exercise habits');
        setBasicInfoItem('modal-info-have-children', 'fa-baby', attrs.have_children, 'Have children');
        
        // About
        const aboutElement = document.getElementById('modal-profile-about');
        if (aboutElement) {
            const aboutMeRaw = typeof profile.about_me === 'string' ? profile.about_me : '';
            const aboutMe = aboutMeRaw.trim();
            aboutElement.innerHTML = aboutMe
                ? `<div class="modal-profile-text-block">${escapeHtml(aboutMe)}</div>`
                : '<div class="modal-profile-empty"><i class="fas fa-pen-to-square"></i><span class="empty-dots">...</span><span class="empty-hover-text">not filled yet</span></div>';
        }
        
        // Interests and Hobbies - Use modal's render function if available
        if (window.renderModalInterests) {
            window.renderModalInterests(profile.interests || []);
        } else {
            const interestsElement = document.getElementById('modal-profile-interests');
            if (interestsElement) {
                if (profile.interests && profile.interests.length > 0) {
                    interestsElement.innerHTML = profile.interests.map(item => {
                        const itemLabel = item.type === 'hobby' ? 'Hobbies' : 'Interests';
                        return `<span class="interest-tag${item.type === 'hobby' ? ' hobby-tag' : ''}" title="${escapeHtml(item.name)}" aria-label="${itemLabel}: ${escapeHtml(item.name)}" style="background: ${item.type === 'hobby' ? 'linear-gradient(90deg, #c26a33, #de8f5a)' : 'linear-gradient(90deg, var(--primary), #764ba2)'}; color: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem; font-weight: 500;">${escapeHtml(item.name)}</span>`;
                    }).join('');
                } else {
                    interestsElement.innerHTML = '<span class="interest-tag" style="background: linear-gradient(90deg, var(--primary), #764ba2); color: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem; font-weight: 500;">No interests or hobbies listed</span>';
                }
            }
        }
        
        // I am looking for
        const lookingForElement = document.getElementById('modal-profile-looking-for');
        if (lookingForElement) {
            const lookingForParts = [];
            const cleanedValue = (value) => {
                if (value == null) return '';
                return String(value).trim();
            };

            const partnerPreferencesRaw = typeof profile.partner_preferences === 'string'
                ? profile.partner_preferences
                : '';
            const partnerPreferences = partnerPreferencesRaw.trim();
            const relationshipTypeRaw = cleanedValue(
                profile.relationship_type ||
                profile.attributes?.relationship_type ||
                profile.preferences?.relationship_type ||
                ''
            );
            const relationshipType = relationshipTypeRaw.toLowerCase() === 'any' ? '' : relationshipTypeRaw;
            const preferredGenderRaw = (
                profile.preferred_gender ??
                profile.seeking_gender ??
                profile.attributes?.preferred_gender ??
                profile.preferences?.preferred_gender ??
                null
            );
            const preferredAgeMin = (
                profile.age_min ??
                profile.preferred_age_min ??
                profile.seeking_age_min ??
                profile.attributes?.age_min ??
                profile.attributes?.preferred_age_min ??
                profile.preferences?.age_min ??
                null
            );
            const preferredAgeMax = (
                profile.age_max ??
                profile.preferred_age_max ??
                profile.seeking_age_max ??
                profile.attributes?.age_max ??
                profile.attributes?.preferred_age_max ??
                profile.preferences?.age_max ??
                null
            );
            
            // Build "I am seeking for: icon  age: X-Y" format with relationship type
            if (preferredGenderRaw || preferredAgeMin != null || preferredAgeMax != null || relationshipType) {
                const normalizedGender = typeof preferredGenderRaw === 'string' ? preferredGenderRaw.trim() : preferredGenderRaw;
                const ageText = (preferredAgeMin != null || preferredAgeMax != null)
                    ? `${preferredAgeMin ?? ''}${(preferredAgeMin != null && preferredAgeMax != null) ? '-' : ''}${preferredAgeMax ?? ''}`
                    : '';
                
                let genderIcon = '';
                if (normalizedGender) {
                    const genderLower = String(normalizedGender).toLowerCase();
                    const iconClass = genderLower === 'female' ? 'fa-venus' : (genderLower === 'male' ? 'fa-mars' : '');
                    const iconColor = genderLower === 'female' ? '#e91e63' : '#3498db';
                    if (iconClass) {
                        genderIcon = `<i class="fas ${iconClass} seeking-gender-icon" style="color: ${iconColor}; margin: 0 0.4rem; vertical-align: middle;" data-tooltip="${escapeHtml(genderLower.charAt(0).toUpperCase() + genderLower.slice(1))}"></i>`;
                    }
                }
                
                let relationshipIcon = '';
                if (relationshipType) {
                    const relIcon = getRelationshipTypeIcon(relationshipType);
                    if (relIcon.icon) {
                        if (relIcon.icon === 'fa-ring') {
                            relationshipIcon = `<span style="font-size: 1.21em; vertical-align: middle; margin: 0; line-height: 1;" data-tooltip="Relationship type: ${escapeHtml(relationshipType)}">💍</span>`;
                        } else {
                            relationshipIcon = `<i class="fas ${relIcon.icon}" style="color: ${relIcon.color}; font-size: 1rem; vertical-align: middle; margin: 0 0.2rem;" data-tooltip="Relationship type: ${escapeHtml(relationshipType)}"></i>`;
                        }
                    }
                }
                
                if (genderIcon || ageText || relationshipIcon) {
                    const ageDisplay = ageText ? `<span class="interest-text-item" style="padding: 0.4rem 0.6rem; margin-left: 5px;" data-tooltip="Seeking age: ${escapeHtml(ageText)}">${escapeHtml(ageText)}</span>` : '';
                    const badgesElement = document.getElementById('modal-looking-for-badges');
                    if (badgesElement) {
                        badgesElement.innerHTML = `${genderIcon} ${relationshipIcon} ${ageDisplay}`;
                    }
                }
            }
            
            // Add partner preferences if available
            if (partnerPreferences) {
                lookingForParts.push(`<div class="modal-profile-text-block">${escapeHtml(partnerPreferences)}</div>`);
            }
            
            lookingForElement.innerHTML = lookingForParts.length > 0
                ? lookingForParts.join('')
                : '<div class="modal-profile-empty"><i class="fas fa-pen-to-square"></i><span class="empty-dots">...</span><span class="empty-hover-text">not filled yet</span></div>';
        }
        
        // Photos
        const photosElement = document.getElementById('modal-profile-photos');
        if (photosElement) {
            const defaultImage = getDefaultProfileImage(profile.gender);
            if (profile.photos && profile.photos.length > 0) {
                // Normalize photo sources and remove invalid entries
                const photoSources = profile.photos
                    .map((photo) => {
                        const fileName = typeof photo === 'string' ? photo : photo?.file_name;
                        if (!fileName) return null;
                        const variants = getProfileImageVariants(
                            String(fileName),
                            typeof photo === 'object' ? photo?.thumbnail_small_path : null,
                            typeof photo === 'object' ? photo?.thumbnail_medium_path : null
                        );
                        return variants.original ? variants : null;
                    })
                    .filter(Boolean);

                if (photoSources.length === 0) {
                    photosElement.innerHTML = '<div class="photo-item profile-modal-photo-not-provided">Image not provided</div>';
                } else {
                    photosElement.innerHTML = '';
                    photosElement.style.display = '';
                    photosElement.style.gridTemplateColumns = '';
                    photosElement.style.gap = '';

                    photoSources.forEach((sources) => {
                        const photoDiv = document.createElement('div');
                        photoDiv.className = 'photo-item';
                        photoDiv.style.cssText = 'border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); cursor: pointer; transition: transform 0.3s;';

                        const img = document.createElement('img');
                        img.alt = '';
                        img.draggable = false;
                        img.style.cssText = 'width: 100%; height: 150px; object-fit: cover; display: block; user-select: none; -webkit-user-drag: none; opacity: 0; transition: opacity 0.15s ease;';
                        img.dataset.defaultSrc = defaultImage;
                        img.dataset.lightboxSrc = sources.original || sources.medium || sources.small || '';
                        const toAbsoluteUrl = (path) => {
                            if (!path || typeof path !== 'string') return '';
                            try {
                                return new URL(path, window.location.origin).href;
                            } catch (error) {
                                return '';
                            }
                        };

                        const fallbackCandidates = buildVariantCandidates(sources, profile)
                            .map((path) => toAbsoluteUrl(path))
                            .filter(Boolean)
                            .filter((value, index, arr) => arr.indexOf(value) === index);
                        const defaultAbsolute = toAbsoluteUrl(defaultImage);
                        let fallbackIndex = 0;

                        img.addEventListener('load', function() {
                            this.style.opacity = '1';
                        });
                        img.addEventListener('error', function() {
                            fallbackIndex += 1;
                            if (fallbackIndex < fallbackCandidates.length) {
                                this.src = fallbackCandidates[fallbackIndex];
                                return;
                            }

                            if (defaultAbsolute && this.src !== defaultAbsolute) {
                                this.src = defaultAbsolute;
                                return;
                            }

                            this.onerror = null;
                        });
                        img.src = fallbackCandidates[0] || defaultAbsolute;

                        photoDiv.addEventListener('mouseenter', function() {
                            this.style.transform = 'scale(1.05)';
                        });
                        photoDiv.addEventListener('mouseleave', function() {
                            this.style.transform = 'scale(1)';
                        });

                        photoDiv.appendChild(img);
                        photosElement.appendChild(photoDiv);
                    });
                }
            } else {
                photosElement.innerHTML = '<div class="photo-item profile-modal-photo-not-provided">Image not provided</div>';
            }
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
            likeBtn.style.background = 'linear-gradient(90deg, #00b894, #00a381)';
            if (likeBtnIcon) {
                likeBtnIcon.className = 'fas fa-thumbs-up';
            }
            if (likeBtnText) {
                likeBtnText.textContent = 'Liked';
            }
        } else if (likeBtn && !profile.is_liked) {
            likeBtn.style.background = 'linear-gradient(90deg, #f39c12, #e67e22)';
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
            favouriteBtn.style.background = 'linear-gradient(90deg, #00b894, #00a381)';
            if (favouriteBtnIcon) {
                favouriteBtnIcon.className = 'fas fa-heart';
            }
            if (favouriteBtnText) {
                favouriteBtnText.textContent = 'Added';
            }
        } else if (favouriteBtn && !profile.is_favorited) {
            favouriteBtn.style.background = 'linear-gradient(90deg, #e74c3c, #c44569)';
            if (favouriteBtnIcon) {
                favouriteBtnIcon.className = 'fas fa-heart';
            }
            if (favouriteBtnText) {
                favouriteBtnText.textContent = 'Add to Favourites';
            }
        }
    }
    
    // Close profile modal
    function closeProfileModal() {
        const modal = document.getElementById('userProfileModal');
        if (modal) {
            modal.style.display = 'none';
        }
        cleanupModalPresenceSubscription();
        currentProfileUserId = null;
    }
    
    // Get current profile user ID
    function getCurrentProfileUserId() {
        return currentProfileUserId;
    }
    
    // Expose functions globally
    window.openProfileModal = openProfileModal;
    window.closeProfileModal = closeProfileModal;
    window.displayProfileInModal = displayProfileInModal;
    window.getCurrentProfileUserId = getCurrentProfileUserId;
    
    // Allow pages to override getCurrentUserId and getSessionToken
    window.UserProfileModal = {
        getCurrentUserId: getCurrentUserId,
        getSessionToken: getSessionToken,
        setGetCurrentUserId: function(fn) {
            getCurrentUserId = fn;
        },
        setGetSessionToken: function(fn) {
            getSessionToken = fn;
        }
    };
})();



