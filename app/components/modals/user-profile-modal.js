/**
 * User Profile Modal JavaScript
 * External module for handling user profile modal functionality
 */

(function() {
    'use strict';
    
    // Global state
    let currentProfileUserId = null;
    let currentProfileGender = null;
    
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
            if (profile.profile_image) {
                avatarEl.src = `/uploads/profile_images/${profile.profile_image}`;
            } else {
                // Use gender-specific default image
                avatarEl.src = getDefaultProfileImage(profile.gender);
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
        const statusText = document.getElementById('modal-status-text');
        const modal = document.getElementById('userProfileModal');
        const isDark = modal && modal.classList.contains('dark');
        if (statusText) {
            if (profile.is_online) {
                statusText.innerHTML = '<i class="fas fa-circle" style="color: #00b894; font-size: 0.6rem;"></i> Online now';
                statusText.style.color = '#00b894';
            } else if (profile.last_active) {
                statusText.innerHTML = `<i class="fas fa-clock" style="margin-right: 0.3rem; color: #ffffff;"></i> Last active ${formatTimeAgo(profile.last_active)}`;
                statusText.style.color = '#ffffff';
            } else {
                statusText.textContent = 'Offline';
                statusText.style.color = '#ffffff';
            }
        }
        
        // Basic Information section
        const occupationEl = document.getElementById('modal-info-occupation');
        if (occupationEl) {
            occupationEl.textContent = (profile.attributes && profile.attributes.occupation) ? profile.attributes.occupation : 'Not specified';
        }
        
        const educationEl = document.getElementById('modal-info-education');
        if (educationEl) {
            educationEl.textContent = (profile.attributes && profile.attributes.education) ? profile.attributes.education : 'Not specified';
        }
        
        // About
        const aboutElement = document.getElementById('modal-profile-about');
        if (aboutElement) {
            if (profile.attributes && Object.keys(profile.attributes).length > 0) {
                const aboutText = [];
                if (profile.attributes.lifestyle) aboutText.push(`Lifestyle: ${escapeHtml(profile.attributes.lifestyle)}`);
                aboutElement.innerHTML = aboutText.length > 0 ? `<p>${aboutText.join('<br>')}</p>` : '<p>No information provided</p>';
            } else {
                aboutElement.innerHTML = '<p>No information provided</p>';
            }
        }
        
        // Interests and Hobbies - Use modal's render function if available
        if (window.renderModalInterests) {
            window.renderModalInterests(profile.interests || []);
        } else {
            const interestsElement = document.getElementById('modal-profile-interests');
            if (interestsElement) {
                if (profile.interests && profile.interests.length > 0) {
                    interestsElement.innerHTML = profile.interests.map(item => 
                        `<span class="interest-tag" style="background: linear-gradient(90deg, var(--primary), #764ba2); color: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem; font-weight: 500;">${escapeHtml(item.name)}</span>`
                    ).join('');
                } else {
                    interestsElement.innerHTML = '<span class="interest-tag" style="background: linear-gradient(90deg, var(--primary), #764ba2); color: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem; font-weight: 500;">No interests or hobbies listed</span>';
                }
            }
        }
        
        // I am looking for
        const lookingForElement = document.getElementById('modal-profile-looking-for');
        if (lookingForElement) {
            const lookingForParts = [];
            
            // Build "Seeking: Gender, Age-Age" format
            if (profile.preferred_gender || profile.age_min || profile.age_max) {
                const genderText = profile.preferred_gender ? 
                    (profile.preferred_gender.charAt(0).toUpperCase() + profile.preferred_gender.slice(1).toLowerCase()) : '';
                const ageText = (profile.age_min || profile.age_max) ? 
                    `${profile.age_min || ''}${(profile.age_min && profile.age_max) ? '-' : ''}${profile.age_max || ''}` : '';
                
                const seekingText = [genderText, ageText].filter(Boolean).join(', ');
                if (seekingText) {
                    lookingForParts.push(`<p style="margin: 0; font-size: 1rem; color: #333;"><strong>Seeking:</strong> ${escapeHtml(seekingText)}</p>`);
                }
            }
            
            // Add partner preferences if available
            if (profile.partner_preferences) {
                lookingForParts.push(`<p style="margin-top: 0.75rem; margin-bottom: 0; font-size: 0.95rem; color: #666;">${escapeHtml(profile.partner_preferences)}</p>`);
            }
            
            // Add relationship type if available
            if (profile.relationship_type) {
                lookingForParts.push(`<p style="margin-top: 0.75rem; margin-bottom: 0; font-size: 0.95rem; color: #666;"><strong>Relationship Type:</strong> ${escapeHtml(profile.relationship_type)}</p>`);
            }
            
            lookingForElement.innerHTML = lookingForParts.length > 0 ? lookingForParts.join('') : '<p style="margin: 0; color: #888;">No information provided</p>';
        }
        
        // Photos
        const photosElement = document.getElementById('modal-profile-photos');
        if (photosElement) {
            const defaultImage = getDefaultProfileImage(profile.gender);
            if (profile.photos && profile.photos.length > 0) {
                // Clear existing content
                photosElement.innerHTML = '';
                
                // Create photo items with CSP-safe event handlers
                profile.photos.forEach(photo => {
                    const photoDiv = document.createElement('div');
                    photoDiv.className = 'photo-item';
                    photoDiv.style.cssText = 'border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: transform 0.3s;';
                    
                    const img = document.createElement('img');
                    img.src = `/uploads/profile_images/${photo.file_name}`;
                    img.alt = 'Profile photo';
                    img.style.cssText = 'width: 100%; height: 150px; object-fit: cover;';
                    img.dataset.defaultSrc = defaultImage;
                    
                    // CSP-safe error handler
                    img.addEventListener('error', function() {
                        this.src = this.dataset.defaultSrc;
                        this.onerror = null; // Prevent infinite loop
                    });
                    
                    // CSP-safe hover handlers
                    photoDiv.addEventListener('mouseenter', function() {
                        this.style.transform = 'scale(1.05)';
                    });
                    photoDiv.addEventListener('mouseleave', function() {
                        this.style.transform = 'scale(1)';
                    });
                    
                    photoDiv.appendChild(img);
                    photosElement.appendChild(photoDiv);
                });
            } else {
                photosElement.innerHTML = `<div class="photo-item" style="border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);"><img src="${defaultImage}" alt="No photos" style="width: 100%; height: 150px; object-fit: cover;"></div>`;
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
    }
    
    // Close profile modal
    function closeProfileModal() {
        const modal = document.getElementById('userProfileModal');
        if (modal) {
            modal.style.display = 'none';
        }
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



