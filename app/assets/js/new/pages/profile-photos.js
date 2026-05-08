/**
 * Profile Photos Page JavaScript
 * Extracted from profile-photos.html - Phase 1 CSS/JS Extraction
 */

(function() {
    const MAX_PROFILE_PHOTOS = 6;

    // Get session token and user ID
    const urlParams = new URLSearchParams(window.location.search);
    const sessionToken = urlParams.get('token');
    let currentUserId = null;
    let currentPhotoCount = 0;

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Get default profile image based on gender
    function getDefaultProfileImage(gender) {
        const genderLower = (gender || '').toLowerCase().trim();
        if (genderLower === 'female' || genderLower === 'f') {
            return '/assets/images/default_profile_female.svg';
        }
        // Default to male
        return '/assets/images/default_profile_male.svg';
    }

    function repairThumbnailPath(rawPath) {
        const value = (rawPath || '').toString().trim();
        if (!value) {
            return '';
        }

        return value.replace(
            /(\.[^.\/]+)_thumb_(small|medium)\.jpg$/i,
            '_thumb_$2.jpg'
        );
    }

    function hasMalformedThumbnailSuffix(rawPath) {
        const value = (rawPath || '').toString().trim();
        return /(\.[^.\/]+)_thumb_(small|medium)\.jpg$/i.test(value);
    }

    function getProfileImageVariants(image) {
        const rawFileName = image && image.file_name ? repairThumbnailPath(image.file_name) : '';
        if (!rawFileName) {
            return { original: null, medium: null, small: null };
        }

        const rawSmall = image && image.thumbnail_small_path ? String(image.thumbnail_small_path).trim() : '';
        const rawMedium = image && image.thumbnail_medium_path ? String(image.thumbnail_medium_path).trim() : '';

        const normalizePath = (value) => {
            if (hasMalformedThumbnailSuffix(value)) return '';
            const repaired = repairThumbnailPath(value);
            if (!repaired) return '';
            if (/^https?:\/\//i.test(repaired)) return repaired;
            return repaired.startsWith('/') ? repaired : `/${repaired}`;
        };

        const explicitSmall = normalizePath(rawSmall);
        const explicitMedium = normalizePath(rawMedium);

        if (/^https?:\/\//i.test(rawFileName)) {
            return {
                original: rawFileName,
                medium: explicitMedium || rawFileName,
                small: explicitSmall || explicitMedium || rawFileName
            };
        }

        let normalized = rawFileName;
        if (normalized.startsWith('/uploads/profile_images/')) {
            normalized = normalized.replace('/uploads/profile_images/', '');
        } else if (normalized.startsWith('uploads/profile_images/')) {
            normalized = normalized.replace('uploads/profile_images/', '');
        } else if (normalized.startsWith('/')) {
            normalized = normalized.slice(1);
        }

        const originalPath = `/uploads/profile_images/${normalized}`;
        return {
            original: originalPath,
            medium: explicitMedium || originalPath,
            small: explicitSmall || explicitMedium || originalPath
        };
    }

    let currentUserGender = null;
    const MOBILE_PORTRAIT_QUERY = '(max-width: 600px) and (orientation: portrait)';
    let mobileDocClickHandler = null;

    function isUploadableImageFile(file) {
        if (!file) {
            return false;
        }

        const mimeType = (file.type || '').toLowerCase();
        const name = (file.name || '').toLowerCase();
        const extension = name.includes('.') ? name.split('.').pop() : '';

        // HEIC/HEIF-like files are intentionally blocked for this flow.
        if (mimeType.includes('heic') || mimeType.includes('heif') || extension === 'heic' || extension === 'heif' || extension === 'hiec') {
            return false;
        }

        if (mimeType.startsWith('image/')) {
            return true;
        }

        const supportedExtensions = new Set([
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff',
            'svg'
        ]);

        return supportedExtensions.has(extension);
    }

    function setupGalleryPolicyTooltip() {
        const trigger = document.getElementById('gallery-policy-tooltip-trigger');
        const tooltip = document.getElementById('gallery-policy-tooltip');

        if (!trigger || !tooltip) {
            return;
        }

        const hideTooltip = () => {
            tooltip.classList.remove('is-visible');
            tooltip.setAttribute('aria-hidden', 'true');
            trigger.setAttribute('aria-expanded', 'false');
        };

        const showTooltip = () => {
            tooltip.classList.add('is-visible');
            tooltip.setAttribute('aria-hidden', 'false');
            trigger.setAttribute('aria-expanded', 'true');
        };

        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const isVisible = tooltip.classList.contains('is-visible');
            if (isVisible) {
                hideTooltip();
            } else {
                showTooltip();
            }
        });

        document.addEventListener('click', (event) => {
            if (!tooltip.classList.contains('is-visible')) {
                return;
            }

            if (trigger.contains(event.target) || tooltip.contains(event.target)) {
                return;
            }

            hideTooltip();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                hideTooltip();
            }
        });
    }

    async function init() {
        // Get user ID - same way as stats-count.js (from window.currentUser)
        const user = window.currentUser || {};
        currentUserId = user.id;
        currentUserGender = user.gender;
        
        // Fallback: Try to get from sessionManager
        if (!currentUserId && window.sessionManager && window.sessionManager.getSession) {
            const session = window.sessionManager.getSession();
            if (session && session.user) {
                currentUserId = session.user.id;
                if (!currentUserGender) {
                    currentUserGender = session.user.gender;
                }
            }
        }
        
        // Fallback: Try embedded JSON data
        if (!currentUserId) {
            try {
                const profileDataEl = document.getElementById('profile-data');
                if (profileDataEl) {
                    const profileData = JSON.parse(profileDataEl.textContent);
                    if (profileData.userId && profileData.userId !== '{{userId}}') {
                        currentUserId = parseInt(profileData.userId);
                    }
                    if (profileData.sessionToken && profileData.sessionToken !== '{{sessionToken}}') {
                        sessionToken = profileData.sessionToken;
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        }

        if (!currentUserId) {
            showNotification('Unable to identify user. Please refresh the page.', 'error');
            return;
        }

        setupGalleryPolicyTooltip();

        // Setup file input and upload button
        const fileInput = document.getElementById('file-input');
        const addPhotosBtn = document.getElementById('add-photos-btn');
        
        if (addPhotosBtn && fileInput) {
            addPhotosBtn.addEventListener('click', () => {
                fileInput.click();
            });
            
            fileInput.addEventListener('change', (e) => {
                const selectedFiles = Array.from(e.target.files || []);
                const files = selectedFiles.filter(isUploadableImageFile);
                const unsupportedFiles = selectedFiles.filter((file) => !isUploadableImageFile(file));

                if (unsupportedFiles.length > 0) {
                    showNotification('heic extension not supported,\nPlease upload jpg or png images', 'error');
                }

                if (files.length > 0) {
                    const availableSlots = MAX_PROFILE_PHOTOS - currentPhotoCount;
                    if (availableSlots <= 0) {
                        showNotification(
                            `Maximum ${MAX_PROFILE_PHOTOS} profile photos allowed.\nYou already have ${currentPhotoCount} photos. Delete one to upload a new image.`,
                            'error',
                            { persistent: true }
                        );
                        e.target.value = '';
                        return;
                    }

                    if (files.length > availableSlots) {
                        showNotification(
                            `Upload exceeds the ${MAX_PROFILE_PHOTOS}-photo limit.\nYou selected ${files.length} image(s) but only ${availableSlots} slot(s) available.`,
                            'error',
                            { persistent: true }
                        );
                        e.target.value = '';
                        return;
                    }

                    uploadImages(files);
                }
                // Reset input
                e.target.value = '';
            });
        }
        
        // Setup refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Refresh button clicked - reloading photos...');
                loadUserImages();
            });
        }
        
        loadUserImages();
    }

    // Upload images
    async function uploadImages(files) {
        let uploadToast = null;
        try {
            const formData = new FormData();
            files.forEach(file => {
                // Check file size (5MB limit)
                if (file.size > 5 * 1024 * 1024) {
                    throw new Error(`File ${file.name} exceeds 5MB limit`);
                }
                formData.append('images', file);
            });

            formData.append('userId', currentUserId);

            uploadToast = showProgressNotification('Your Image uploading.', 'info');

            const result = await uploadImagesWithProgress(formData, (percent) => {
                if (uploadToast) {
                    uploadToast.updateProgress(percent);
                }
            });

            if (result.success) {
                // Check for errors even on success
                if (result.errors && result.errors.length > 0) {
                    const errorMessages = result.errors.map(e => `${e.filename}: ${e.error}`).join('\n');
                    if (uploadToast) {
                        uploadToast.complete(`Upload completed with errors:\n${errorMessages}`, 'error');
                    } else {
                        showNotification(`Upload completed with errors:\n${errorMessages}`, 'error');
                    }
                } else {
                    if (uploadToast) {
                        uploadToast.complete('Your image uploaded successfully!', 'success');
                    } else {
                        showNotification('Your image uploaded successfully!', 'success');
                    }
                }
                
                // Reload images immediately, then again after a short delay to ensure they're in the database
                loadUserImages();
                setTimeout(() => {
                    loadUserImages();
                }, 1500);
            } else {
                throw new Error(result.error || 'Upload failed');
            }

        } catch (error) {
            const errorMessage = String(error && error.message ? error.message : 'Upload failed');
            const isMaxPhotoLimitError = /(max|maximum|limit).*(6|photo)|6.*(max|maximum|limit|photo)/i.test(errorMessage);
            if (isMaxPhotoLimitError) {
                showNotification(`Upload blocked: ${errorMessage}`, 'error', { persistent: true });
                return;
            }

            if (uploadToast) {
                uploadToast.complete(`Upload failed: ${errorMessage}`, 'error');
            } else {
                showNotification(`Upload failed: ${errorMessage}`, 'error');
            }
        }
    }

    function uploadImagesWithProgress(formData, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/profile/upload-images');

            if (sessionToken) {
                xhr.setRequestHeader('Authorization', `Bearer ${sessionToken}`);
                xhr.setRequestHeader('X-Session-Token', sessionToken);
            }

            xhr.upload.onprogress = (event) => {
                if (!event.lengthComputable || typeof onProgress !== 'function') {
                    return;
                }
                const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
                onProgress(percent);
            };

            xhr.onload = () => {
                let result;
                try {
                    result = JSON.parse(xhr.responseText || '{}');
                } catch (error) {
                    reject(new Error('Invalid upload response from server'));
                    return;
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(result);
                    return;
                }

                reject(new Error(result.error || result.message || `Upload failed with status ${xhr.status}`));
            };

            xhr.onerror = () => {
                reject(new Error('Network error during upload'));
            };

            xhr.send(formData);
        });
    }

    // Load user images
    window.refreshPhotos = function() {
        console.log('Refresh button clicked - reloading photos...');
        loadUserImages();
    };
    
    async function loadUserImages() {
        try {
            if (!currentUserId) {
                displayImages([]);
                return;
            }

            const url = `/api/user/${currentUserId}/images`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                displayImages([]);
                return;
            }

            const result = await response.json();
            
            // Extract images array
            let images = [];
            if (result && result.images && Array.isArray(result.images)) {
                images = result.images;
            } else if (result && result.success) {
                images = result.images || [];
            }
            
            displayImages(images);
            
        } catch (error) {
            displayImages([]);
        }
    }

    // Display images
    function displayImages(images) {
        const galleryGrid = document.getElementById('gallery-grid');
        let emptyState = document.getElementById('empty-state');
        const editGalleryBtn = document.getElementById('edit-gallery-btn');
        const photoCountText = document.getElementById('photo-count-text');

        // Update photo count
        const count = images ? images.length : 0;
        currentPhotoCount = count;
        if (photoCountText) {
            photoCountText.textContent = `${count}`;
        }

        if (!images || images.length === 0) {
            // Recreate empty state if it doesn't exist
            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.id = 'empty-state';
                emptyState.className = 'empty-state';
                emptyState.innerHTML = `
                    <i class="fas fa-images"></i>
                    <p>No photos yet. Upload your first photo to get started!</p>
                `;
            }
            emptyState.style.display = 'block';
            galleryGrid.innerHTML = '';
            galleryGrid.appendChild(emptyState);
            if (editGalleryBtn) editGalleryBtn.style.display = 'none';
            return;
        }

        if (emptyState) {
            emptyState.style.display = 'none';
        }
        if (editGalleryBtn) editGalleryBtn.style.display = 'inline-flex';
        
        galleryGrid.innerHTML = images.map((image, index) => {
            // Handle boolean conversion (PostgreSQL might return 1/0 or true/false)
            const isProfile = image.is_profile === true || image.is_profile === 1 || image.is_profile === '1' || image.is_profile === 'true';
            const isFeatured = image.featured === true || image.featured === 1 || image.featured === '1' || image.featured === 'true';
            
            const variants = getProfileImageVariants(image);
            const imageSrc = variants.small || variants.medium || variants.original;
            const itemClass = `gallery-item${isProfile ? ' profile-photo' : ''}${isFeatured ? ' featured-photo' : ''}`;
            const safeFileName = (image.file_name || '').replace(/'/g, "\\'");
            const safeMedium = (variants.medium || '').replace(/'/g, "\\'");
            const safeOriginal = (variants.original || '').replace(/'/g, "\\'");
            
            const defaultImg = getDefaultProfileImage(currentUserGender);
            return `
                <div class="${itemClass}" data-image-id="${image.id}" data-image-index="${index}">
                    <div class="image-wrapper">
                        <button type="button" class="mobile-eye-btn" aria-label="Open photo" data-image-index="${index}">
                            <i class="fas fa-eye"></i>
                        </button>
                        <img src="${imageSrc}" data-medium-src="${safeMedium}" data-original-src="${safeOriginal}" loading="lazy" alt="Profile photo" onerror="if(this.dataset.mediumSrc && !this.dataset.triedMedium && this.src !== this.dataset.mediumSrc){this.dataset.triedMedium='1';this.src=this.dataset.mediumSrc;return;} if(this.dataset.originalSrc && !this.dataset.triedOriginal && this.src !== this.dataset.originalSrc){this.dataset.triedOriginal='1';this.src=this.dataset.originalSrc;return;} if(!this.src.includes('default_profile_')){this.src='${defaultImg}';}">
                        ${isProfile ? '<div class="photo-badge profile" title="Profile Photo"><i class="fas fa-user"></i></div>' : ''}
                        ${isFeatured ? '<div class="photo-badge featured" title="Featured Photo"><i class="fas fa-heart"></i></div>' : ''}
                        <div class="overlay enhanced">
                            <div class="overlay-content">
                                <div class="photo-actions">
                                    ${!isProfile ? `<button class="photo-action-btn set-profile" onclick="setProfileImage(${image.id}, '${safeFileName}')" title="Set as Profile">
                                        <i class="fas fa-user"></i>
                                    </button>` : ''}
                                    ${!isFeatured ? `<button class="photo-action-btn set-featured" onclick="setFeaturedImage(${image.id})" title="Feature">
                                        <i class="fas fa-heart"></i>
                                    </button>` : ''}
                                    ${isFeatured ? `<button class="photo-action-btn set-featured" onclick="unsetFeaturedImage(${image.id})" title="Unfeature">
                                        <i class="fas fa-heart-broken"></i>
                                    </button>` : ''}
                                    <button class="photo-action-btn delete" onclick="deleteImage(${image.id}, '${safeFileName}')" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // All photos maintain consistent size - no special sizing for single photos

        // Add lightbox functionality
        const galleryItems = galleryGrid.querySelectorAll('.gallery-item');
        const isPortraitMobile = window.matchMedia(MOBILE_PORTRAIT_QUERY).matches;

        if (isPortraitMobile) {
            if (mobileDocClickHandler) {
                document.removeEventListener('click', mobileDocClickHandler);
            }
            mobileDocClickHandler = function(event) {
                if (!event.target.closest('.gallery-item')) {
                    galleryGrid.querySelectorAll('.gallery-item.show-mobile-actions')
                        .forEach(item => item.classList.remove('show-mobile-actions'));
                }
            };
            document.addEventListener('click', mobileDocClickHandler);
        } else if (mobileDocClickHandler) {
            document.removeEventListener('click', mobileDocClickHandler);
            mobileDocClickHandler = null;
        }

        galleryItems.forEach((item, index) => {
            const eyeBtn = item.querySelector('.mobile-eye-btn');
            if (eyeBtn) {
                eyeBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    showImageLightbox(index, images);
                });
            }

            if (isPortraitMobile) {
                const imageWrapper = item.querySelector('.image-wrapper');
                if (imageWrapper) {
                    imageWrapper.addEventListener('click', (event) => {
                        if (event.target.closest('.photo-action-btn') || event.target.closest('.mobile-eye-btn')) {
                            return;
                        }
                        event.stopPropagation();

                        const isAlreadyOpen = item.classList.contains('show-mobile-actions');

                        galleryItems.forEach((galleryItem) => {
                            if (galleryItem !== item) {
                                galleryItem.classList.remove('show-mobile-actions');
                            }
                        });

                        if (isAlreadyOpen) {
                            item.classList.remove('show-mobile-actions');
                        } else {
                            item.classList.add('show-mobile-actions');
                        }
                    });
                }
            } else {
                item.addEventListener('click', function(e) {
                    // Don't trigger lightbox if clicking on buttons
                    if (e.target.closest('.photo-action-btn')) {
                        return;
                    }
                    const img = this.querySelector('img');
                    if (img) {
                        showImageLightbox(index, images);
                    }
                });
            }
        });
    }

    // Set profile image
    window.setProfileImage = async function(imageId, fileName) {
        try {
            const url = `/api/profile/set-profile-image`;
            
            const fetchResponse = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sessionToken ? {
                        'Authorization': `Bearer ${sessionToken}`,
                        'X-Session-Token': sessionToken
                    } : {})
                },
                body: JSON.stringify({ imageId })
            });
            
            const responseText = await fetchResponse.text();
            const response = JSON.parse(responseText);

            if (response.success) {
                showNotification('Profile photo updated!', 'success');
                updateLayoutAvatarImage(fileName);
                loadUserImages();
            } else {
                throw new Error(response.error || response.message || 'Failed to set profile image');
            }
        } catch (error) {
            showNotification(`Failed to set profile image: ${error.message}`, 'error');
        }
    };

    // Set featured image
    window.setFeaturedImage = async function(imageId) {
        try {
            const url = `/api/profile/set-featured-image`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sessionToken ? {
                        'Authorization': `Bearer ${sessionToken}`,
                        'X-Session-Token': sessionToken
                    } : {})
                },
                body: JSON.stringify({ imageId, featured: true })
            }).then(r => r.json());

            if (response.success) {
                showNotification('Photo featured!', 'success');
                loadUserImages();
            } else {
                throw new Error(response.error || 'Failed to feature image');
            }
        } catch (error) {
            showNotification(`Failed to feature image: ${error.message}`, 'error');
        }
    };

    // Unset featured image
    window.unsetFeaturedImage = async function(imageId) {
        try {
            const url = `/api/profile/set-featured-image`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sessionToken ? {
                        'Authorization': `Bearer ${sessionToken}`,
                        'X-Session-Token': sessionToken
                    } : {})
                },
                body: JSON.stringify({ imageId, featured: false })
            }).then(r => r.json());

            if (response.success) {
                showNotification('Photo unfeatured', 'success');
                loadUserImages();
            } else {
                throw new Error(response.error || 'Failed to unfeature image');
            }
        } catch (error) {
            showNotification(`Failed to unfeature image: ${error.message}`, 'error');
        }
    };

    // Show delete confirmation modal
    function showDeleteConfirmation() {
        return new Promise((resolve) => {
            const modal = document.getElementById('delete-confirmation-modal');
            const cancelBtn = document.getElementById('delete-cancel-btn');
            const confirmBtn = document.getElementById('delete-confirm-btn');

            modal.style.display = 'flex';

            const handleCancel = () => {
                modal.style.display = 'none';
                cancelBtn.removeEventListener('click', handleCancel);
                confirmBtn.removeEventListener('click', handleConfirm);
                resolve(false);
            };

            const handleConfirm = () => {
                modal.style.display = 'none';
                cancelBtn.removeEventListener('click', handleCancel);
                confirmBtn.removeEventListener('click', handleConfirm);
                resolve(true);
            };

            cancelBtn.addEventListener('click', handleCancel);
            confirmBtn.addEventListener('click', handleConfirm);

            // Close on overlay click
            const overlay = modal.querySelector('.modal-overlay');
            const handleOverlayClick = (e) => {
                if (e.target === overlay) {
                    handleCancel();
                }
            };
            overlay.addEventListener('click', handleOverlayClick);
        });
    }

    // Delete image
    window.deleteImage = async function(imageId, fileName) {
        // Show confirmation modal
        const confirmed = await showDeleteConfirmation();
        if (!confirmed) {
            return;
        }

        try {
            const url = `/api/profile/delete-image`;
            
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sessionToken ? {
                        'Authorization': `Bearer ${sessionToken}`,
                        'X-Session-Token': sessionToken
                    } : {})
                },
                body: JSON.stringify({ imageId, fileName })
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    errorData = { error: errorText || 'Failed to delete image' };
                }
                throw new Error(errorData.error || errorData.message || `HTTP error: ${response.status}`);
            }

            const result = await response.json();

            if (result && result.success) {
                showNotification('Photo deleted successfully', 'success');
                loadUserImages();
            } else {
                throw new Error(result?.error || result?.message || 'Failed to delete image');
            }
        } catch (error) {
            showNotification(`Failed to delete image: ${error.message}`, 'error');
        }
    };

    function getNotificationIcon(type) {
        return type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    }

    function isMobilePortrait() {
        try {
            return window.matchMedia && window.matchMedia(MOBILE_PORTRAIT_QUERY).matches;
        } catch (_) {
            return false;
        }
    }

    function clearExistingNotifications() {
        document.querySelectorAll('.notification').forEach((el) => el.remove());
    }

    function createNotificationElement(message, type = 'info', withProgress = false, persistent = false) {
        // On mobile portrait, keep only one toast so it never stacks off-screen.
        if (isMobilePortrait()) {
            clearExistingNotifications();
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        const icon = getNotificationIcon(type);

        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${icon}"></i>
                <span class="notification-message">${String(message).replace(/\n/g, '<br>')}</span>
            </div>
            ${persistent ? '<button class="notification-close" aria-label="Close notification" style="margin-left:0.5rem;background:transparent;border:none;color:inherit;font-size:1rem;cursor:pointer;line-height:1;">&times;</button>' : ''}
            ${withProgress ? `
            <div class="notification-progress">
                <div class="notification-progress-bar"></div>
            </div>
            ` : ''}
        `;

        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 100);

        if (persistent) {
            const closeBtn = notification.querySelector('.notification-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    notification.classList.remove('show');
                    setTimeout(() => notification.remove(), 300);
                });
            }
        }

        return notification;
    }

    function showProgressNotification(message, type = 'info') {
        const notification = createNotificationElement(message, type, true);
        const progressBar = notification.querySelector('.notification-progress-bar');
        const messageEl = notification.querySelector('.notification-message');
        const iconEl = notification.querySelector('.notification-content i');

        return {
            updateProgress(percent) {
                if (!progressBar) {
                    return;
                }
                const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
                progressBar.style.width = `${safePercent}%`;
            },
            complete(finalMessage, finalType = 'success') {
                if (messageEl) {
                    messageEl.innerHTML = String(finalMessage).replace(/\n/g, '<br>');
                }

                if (iconEl) {
                    iconEl.className = `fas fa-${getNotificationIcon(finalType)}`;
                }

                notification.classList.remove('notification-info', 'notification-success', 'notification-error');
                notification.classList.add(`notification-${finalType}`);
                this.updateProgress(100);

                setTimeout(() => {
                    notification.classList.remove('show');
                    setTimeout(() => notification.remove(), 300);
                }, 1500);
            }
        };
    }

    // Show notification (same toast UI pattern as profile-edit, with progress bar)
    function showNotification(message, type = 'info', options = {}) {
        const persistent = Boolean(options && options.persistent);
        const notification = createNotificationElement(message, type, false, persistent);

        if (!persistent) {
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, 5000);
        }

        return notification;
    }

    function updateLayoutAvatarImage(fileName) {
        if (!fileName) {
            return;
        }

        const avatar = document.getElementById('layoutUserAvatar');
        const fallback = document.getElementById('layoutUserAvatarFallback');
        const timestamp = Date.now();
        const newSrcBase = `/uploads/profile_images/${fileName}`;

        if (avatar) {
            avatar.src = `${newSrcBase}?v=${timestamp}`;
            avatar.style.display = 'block';
        }

        if (fallback) {
            fallback.style.display = 'none';
        }

        if (window.currentUser) {
            window.currentUser.avatar = `${newSrcBase}?v=${timestamp}`;
        }
    }

    // Lightbox functionality matching full profile modal behavior/UI
    function showImageLightbox(currentIndex, allImages) {
        const existing = document.querySelector('[data-profile-photo-lightbox="true"]');
        if (existing) {
            existing.remove();
        }

        const srcs = (allImages || [])
            .map((image) => {
                const variants = getProfileImageVariants(image);
                return variants.original || variants.medium || variants.small || '';
            })
            .filter(Boolean);

        if (!srcs.length) {
            return;
        }

        let idx = Number.isInteger(currentIndex) ? currentIndex : 0;
        if (idx < 0 || idx >= srcs.length) {
            idx = 0;
        }

        const box = document.createElement('div');
        box.setAttribute('data-profile-photo-lightbox', 'true');
        box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;z-index:20000;';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:1.5rem;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:3;touch-action:manipulation;';
        box.appendChild(closeBtn);

        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;width:100%;max-width:1200px;max-height:90vh;overflow:hidden;';

        const photo = document.createElement('img');
        photo.alt = 'Profile photo';
        photo.style.cssText = 'max-width:100%;max-height:90vh;width:auto;height:auto;object-fit:contain;border-radius:12px;display:block;pointer-events:none;user-select:none;';
        const defaultLightboxImage = getDefaultProfileImage(currentUserGender);
        photo.onerror = function() {
            this.onerror = null;
            this.src = defaultLightboxImage;
        };
        wrap.appendChild(photo);
        box.appendChild(wrap);

        const show = (newIdx) => {
            idx = (newIdx + srcs.length) % srcs.length;
            photo.src = srcs[idx];
        };
        show(idx);

        if (srcs.length > 1) {
            [['prev', 'left:8px'], ['next', 'right:8px']].forEach(([dir, side]) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.innerHTML = dir === 'prev' ? '<i class="fas fa-chevron-left"></i>' : '<i class="fas fa-chevron-right"></i>';
                btn.style.cssText = `position:absolute;top:50%;${side};transform:translateY(-50%);width:44px;height:44px;border:none;border-radius:50%;background:rgba(0,0,0,0.55);color:#fff;font-size:1.2rem;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2;touch-action:manipulation;`;
                btn.addEventListener('pointerdown', (ev) => {
                    ev.stopPropagation();
                    show(dir === 'prev' ? idx - 1 : idx + 1);
                });
                wrap.appendChild(btn);
            });

            let touchStartX = 0;
            wrap.addEventListener('touchstart', (ev) => {
                touchStartX = ev.touches[0].clientX;
            }, { passive: true });
            wrap.addEventListener('touchend', (ev) => {
                const deltaX = ev.changedTouches[0].clientX - touchStartX;
                if (Math.abs(deltaX) > 40) {
                    show(deltaX < 0 ? idx + 1 : idx - 1);
                }
            }, { passive: true });
        }

        const onKey = (ev) => {
            if (ev.key === 'Escape') {
                close();
                return;
            }
            if (srcs.length > 1 && ev.key === 'ArrowRight') {
                show(idx + 1);
            }
            if (srcs.length > 1 && ev.key === 'ArrowLeft') {
                show(idx - 1);
            }
        };

        const close = () => {
            document.removeEventListener('keydown', onKey);
            box.remove();
        };

        closeBtn.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            close();
        });

        box.addEventListener('pointerdown', (ev) => {
            if (ev.target === box) {
                close();
            }
        });

        document.addEventListener('keydown', onKey);
        document.body.appendChild(box);
    }

    // Add animation styles
    if (!document.getElementById('photo-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'photo-animation-styles';
        style.textContent = `
            @keyframes slideInUp {
                from {
                    transform: translate(-50%, 100px);
                    opacity: 0;
                }
                to {
                    transform: translate(-50%, 0);
                    opacity: 1;
                }
            }
            @keyframes slideOutDown {
                from {
                    transform: translate(-50%, 0);
                    opacity: 1;
                }
                to {
                    transform: translate(-50%, 100px);
                    opacity: 0;
                }
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
})();









































