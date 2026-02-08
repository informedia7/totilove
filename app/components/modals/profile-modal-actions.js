/**
 * Profile Modal Actions Handler
 * Centralized handler for like and favorite actions in user profile modals
 * Used across results.html, activity.html, and search.html
 */

(function() {
    'use strict';

    let verificationScriptPromise = null;

    function ensureEmailVerificationScriptLoaded() {
        if (typeof window.checkEmailVerificationStatus === 'function') {
            return Promise.resolve();
        }

        if (verificationScriptPromise) {
            return verificationScriptPromise;
        }

        verificationScriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/assets/js/new/shared/email-verification-check.js';
            script.async = true;
            script.dataset.emailVerification = 'true';
            script.onload = () => resolve();
            script.onerror = (error) => {
                console.error('Failed to load email verification script', error);
                verificationScriptPromise = null;
                reject(error);
            };
            document.head.appendChild(script);
        });

        return verificationScriptPromise;
    }

    async function ensureUserVerified(actionDescription) {
        try {
            await ensureEmailVerificationScriptLoaded();
        } catch (error) {
            // Fall back to backend enforcement if the script fails to load
            return true;
        }

        if (typeof window.checkEmailVerificationStatus !== 'function') {
            return true;
        }

        const isVerified = await window.checkEmailVerificationStatus();
        if (!isVerified) {
            if (typeof window.showVerificationMessage === 'function') {
                window.showVerificationMessage();
            } else if (config.showNotification) {
                config.showNotification(`Please verify your email to ${actionDescription}.`, 'warning');
            } else {
                alert(`Please verify your email to ${actionDescription}.`);
            }
            return false;
        }

        return true;
    }

    // Default configuration
    let config = {
        getCurrentUserId: null,
        getCurrentProfileUserId: null,
        getSessionToken: null,
        showNotification: null
    };

    /**
     * Initialize the module with page-specific configuration
     * @param {Object} options - Configuration object
     * @param {Function} options.getCurrentUserId - Function to get current user ID
     * @param {Function} options.getCurrentProfileUserId - Function to get profile user ID
     * @param {Function} options.getSessionToken - Function to get session token
     * @param {Function} options.showNotification - Function to show notifications (accepts message, type)
     */
    function init(options) {
        config = Object.assign({}, config, options);
    }

    /**
     * Show notification with custom duration (3 seconds for "already" messages)
     * @param {string} message - Notification message
     * @param {string} type - Notification type (success, error, info)
     * @param {number} duration - Duration in milliseconds (default: uses page's default)
     */
    function showNotificationWithDuration(message, type, duration) {
        if (!config.showNotification) return;

        // If duration is specified, create a custom notification
        if (duration) {
            // Create a notification with custom duration
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            
            // Determine background color based on type
            const bgColor = type === 'success' ? '#00b894' : 
                           type === 'error' ? '#e74c3c' : 
                           '#667eea';
            
            // Use common toast styling with inline animation
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${bgColor};
                color: white;
                padding: 1rem 1.5rem;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                max-width: 300px;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
            `;
            
            toast.innerHTML = `
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            `;
            
            document.body.appendChild(toast);
            
            // Animate in
            setTimeout(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(0)';
            }, 10);
            
            // Auto remove after specified duration
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.remove();
                    }
                }, 300);
            }, duration);
        } else {
            // Use the page's default notification function
            config.showNotification(message, type);
        }
    }

    /**
     * Handle like profile action in modal
     */
    async function likeProfileInModal() {
        const currentProfileUserId = config.getCurrentProfileUserId ? config.getCurrentProfileUserId() : null;
        if (!currentProfileUserId) {
            console.log('No profile user ID');
            return;
        }

        const currentUserId = config.getCurrentUserId ? config.getCurrentUserId() : null;
        if (!currentUserId) {
            if (config.showNotification) {
                config.showNotification('Please log in to like profiles', 'error');
            }
            return;
        }

        const isVerified = await ensureUserVerified('like profiles');
        if (!isVerified) {
            return;
        }

        // Get like button and check current state
        const likeBtn = document.querySelector('.modal-like-btn');
        if (!likeBtn) {
            console.error('Like button not found');
            return;
        }

        const likeBtnText = likeBtn.querySelector('.like-btn-text');
        const isAlreadyLiked = likeBtnText && likeBtnText.textContent.trim() === 'Liked';

        // Store original state
        const originalText = likeBtn.innerHTML;
        const originalBackground = likeBtn.style.background;

        // Show like animation
        likeBtn.innerHTML = '<i class="fas fa-thumbs-up"></i> <span class="like-btn-text">Liked!</span>';
        likeBtn.style.background = '#00b894';

        // Send like request
        fetch('/api/like-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId,
                'Authorization': `Bearer ${config.getSessionToken ? config.getSessionToken() : ''}`
            },
            body: JSON.stringify({
                from_user: currentUserId,
                to_user: currentProfileUserId
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Like response:', data);
            if (data.success) {
                if (config.showNotification) {
                    config.showNotification('Profile liked successfully', 'success');
                }
                // Update to "Liked" state (orange background)
                setTimeout(() => {
                    likeBtn.innerHTML = '<i class="fas fa-thumbs-up"></i> <span class="like-btn-text">Liked</span>';
                    likeBtn.style.background = 'linear-gradient(90deg, #f39c12, #e67e22)';
                }, 2000);
            } else if (data.alreadyExists || data.message?.toLowerCase().includes('already')) {
                // Get real_name from modal
                const real_nameElement = document.getElementById('modal-profile-real_name');
                const real_name = real_nameElement ? real_nameElement.textContent.trim().split(' ')[0] : 'this user';
                // Keep "Liked" state (orange background) if already liked
                likeBtn.innerHTML = '<i class="fas fa-thumbs-up"></i> <span class="like-btn-text">Liked</span>';
                likeBtn.style.background = 'linear-gradient(90deg, #f39c12, #e67e22)';
                // Show notification for 3 seconds
                showNotificationWithDuration(`You already liked ${real_name}`, 'info', 3001);
            } else {
                // Reset to original state on error
                likeBtn.innerHTML = originalText;
                likeBtn.style.background = originalBackground;
                if (config.showNotification) {
                    config.showNotification(data.message || 'Failed to like profile', 'error');
                }
            }
        })
        .catch(error => {
            console.error('Error liking profile:', error);
            // Reset to original state on error
            likeBtn.innerHTML = originalText;
            likeBtn.style.background = originalBackground;
            if (config.showNotification) {
                config.showNotification('Failed to like profile', 'error');
            }
        });
    }

    /**
     * Handle favorite profile action in modal
     */
    async function favouriteProfileInModal() {
        const currentProfileUserId = config.getCurrentProfileUserId ? config.getCurrentProfileUserId() : null;
        if (!currentProfileUserId) {
            console.log('No profile user ID');
            return;
        }

        const currentUserId = config.getCurrentUserId ? config.getCurrentUserId() : null;
        if (!currentUserId) {
            if (config.showNotification) {
                config.showNotification('Please log in to add favourites', 'error');
            }
            return;
        }

        const isVerified = await ensureUserVerified('add favourites');
        if (!isVerified) {
            return;
        }

        // Get favorite button and check current state
        const favouriteBtn = document.querySelector('.modal-favourite-btn');
        if (!favouriteBtn) {
            console.error('Favourite button not found');
            return;
        }

        const favouriteBtnText = favouriteBtn.querySelector('.favourite-btn-text');
        const isAlreadyFavorited = favouriteBtnText && favouriteBtnText.textContent.trim() === 'Added';

        // Store original state
        const originalText = favouriteBtn.innerHTML;
        const originalBackground = favouriteBtn.style.background;

        // Show favourite animation
        favouriteBtn.innerHTML = '<i class="fas fa-heart"></i> <span class="favourite-btn-text">Added!</span>';
        favouriteBtn.style.background = '#00b894';

        // Send favourite request
        fetch('/api/favorites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId,
                'Authorization': `Bearer ${config.getSessionToken ? config.getSessionToken() : ''}`
            },
            body: JSON.stringify({ userId: currentProfileUserId })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Favourite response:', data);
            if (data.success) {
                if (config.showNotification) {
                    config.showNotification('Added to favourites successfully', 'success');
                }
                // Update to "Added" state (red background)
                setTimeout(() => {
                    favouriteBtn.innerHTML = '<i class="fas fa-heart"></i> <span class="favourite-btn-text">Added</span>';
                    favouriteBtn.style.background = 'linear-gradient(90deg, #e74c3c, #c44569)';
                }, 2000);
                
                // Refresh favorites list on activity page if ActivityManager exists
                if (window.ActivityManager && typeof window.ActivityManager.loadFavorites === 'function') {
                    window.ActivityManager.loadFavorites();
                }
            } else if (data.alreadyExists) {
                // Get real_name from modal
                const real_nameElement = document.getElementById('modal-profile-real_name');
                const real_name = real_nameElement ? real_nameElement.textContent.trim().split(' ')[0] : 'this user';
                // Keep "Added" state (red background) if already favorited
                favouriteBtn.innerHTML = '<i class="fas fa-heart"></i> <span class="favourite-btn-text">Added</span>';
                favouriteBtn.style.background = 'linear-gradient(90deg, #e74c3c, #c44569)';
                // Show notification for 3 seconds
                showNotificationWithDuration(data.message || 'Already in your favourites', 'info', 3001);
            } else {
                // Reset to original state on error
                favouriteBtn.innerHTML = originalText;
                favouriteBtn.style.background = originalBackground;
                if (config.showNotification) {
                    config.showNotification(data.message || data.error || 'Failed to add to favourites', 'error');
                }
            }
        })
        .catch(error => {
            console.error('Error adding to favourites:', error);
            // Reset to original state on error
            favouriteBtn.innerHTML = originalText;
            favouriteBtn.style.background = originalBackground;
            if (config.showNotification) {
                config.showNotification('Failed to add to favourites', 'error');
            }
        });
    }

    // Export functions to global scope
    window.ProfileModalActions = {
        init: init,
        likeProfileInModal: likeProfileInModal,
        favouriteProfileInModal: favouriteProfileInModal
    };

})();


