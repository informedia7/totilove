/**
 * Profile Photos Page JavaScript
 * Extracted from profile-photos.html - Phase 1 CSS/JS Extraction
 */

(function() {
    // Get session token and user ID
    const urlParams = new URLSearchParams(window.location.search);
    let sessionToken = urlParams.get('token');
    let currentUserId = null;
    const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']);
    const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

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

    let currentUserGender = null;
    const MOBILE_PORTRAIT_QUERY = '(max-width: 600px) and (orientation: portrait)';
    let mobileDocClickHandler = null;

    function isSupportedImageFile(file) {
        if (!file) {
            return false;
        }

        const fileName = typeof file.name === 'string' ? file.name.toLowerCase() : '';
        const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';

        return ALLOWED_IMAGE_MIME_TYPES.has(file.type) || ALLOWED_IMAGE_EXTENSIONS.has(extension);
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

        // Setup file input and upload button
        const fileInput = document.getElementById('file-input');
        const addPhotosBtn = document.getElementById('add-photos-btn');
        
        if (addPhotosBtn && fileInput) {
            addPhotosBtn.addEventListener('click', () => {
                fileInput.click();
            });
            
            fileInput.addEventListener('change', (e) => {
                const selectedFiles = Array.from(e.target.files || []);
                const unsupportedFiles = selectedFiles.filter(file => !isSupportedImageFile(file));
                const files = selectedFiles.filter(isSupportedImageFile);

                if (unsupportedFiles.length > 0) {
                    const unsupportedNames = unsupportedFiles.map(file => file.name).join(', ');
                    showNotification(`Unsupported image format: ${unsupportedNames}. Please use JPEG, PNG, GIF, or WebP.`, 'error');
                }

                if (files.length > 0) {
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
                if (!isSupportedImageFile(file)) {
                    throw new Error(`Unsupported file type for ${file.name}. Please use JPEG, PNG, GIF, or WebP.`);
                }

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
            if (uploadToast) {
                uploadToast.complete(`Upload failed: ${error.message}`, 'error');
            } else {
                showNotification(`Upload failed: ${error.message}`, 'error');
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
        if (photoCountText) {
            photoCountText.textContent = `${count} Photo${count !== 1 ? 's' : ''}`;
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
            
            const imageSrc = `/uploads/profile_images/${image.file_name}`;
            const itemClass = `gallery-item${isProfile ? ' profile-photo' : ''}${isFeatured ? ' featured-photo' : ''}`;
            const safeFileName = (image.file_name || '').replace(/'/g, "\\'");
            
            const defaultImg = getDefaultProfileImage(currentUserGender);
            return `
                <div class="${itemClass}" data-image-id="${image.id}" data-image-index="${index}">
                    <div class="image-wrapper">
                        <button type="button" class="mobile-eye-btn" aria-label="Open photo" data-image-index="${index}">
                            <i class="fas fa-eye"></i>
                        </button>
                        <img src="${imageSrc}" alt="Profile photo" onerror="if(!this.src.includes('default_profile_')){this.src='${defaultImg}';}">
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
                        const alreadyActive = item.classList.contains('show-mobile-actions');
                        galleryGrid.querySelectorAll('.gallery-item.show-mobile-actions')
                            .forEach(activeItem => activeItem.classList.remove('show-mobile-actions'));
                        if (!alreadyActive) {
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

    // Apply current dark-mode class to modal (mirrors account.js pattern)
    function applyThemeToDeleteModal(modal) {
        const root = document.documentElement;
        const isDark = root.dataset.theme === 'dark' ||
            root.classList.contains('theme-dark') ||
            document.body.classList.contains('dark-mode');
        modal.classList.toggle('theme-dark-active', isDark);
    }

    // Show delete confirmation modal
    function showDeleteConfirmation() {
        return new Promise((resolve) => {
            const modal = document.getElementById('delete-confirmation-modal');
            const cancelBtn = document.getElementById('delete-cancel-btn');
            const confirmBtn = document.getElementById('delete-confirm-btn');

            applyThemeToDeleteModal(modal);
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

    function createNotificationElement(message, type = 'info', withProgress = false) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        const icon = getNotificationIcon(type);

        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${icon}"></i>
                <span class="notification-message">${String(message).replace(/\n/g, '<br>')}</span>
            </div>
            ${withProgress ? `
            <div class="notification-progress">
                <div class="notification-progress-bar"></div>
            </div>
            ` : ''}
        `;

        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 100);

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
    function showNotification(message, type = 'info') {
        const notification = createNotificationElement(message, type, false);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
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

    // Lightbox functionality
    function showImageLightbox(currentIndex, allImages) {
        const existing = document.querySelector('.lightbox');
        if(existing) existing.remove();

        let currentImageIndex = currentIndex;
        let rotation = 0;

        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.9);
            z-index: 2000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease-out;
        `;
        
        const lightboxContent = document.createElement('div');
        lightboxContent.className = 'lightbox-content';
        lightboxContent.style.cssText = 'position: relative; max-width: 90vw; max-height: 90vh;';
        
        const img = document.createElement('img');
        img.src = `/uploads/profile_images/${allImages[currentImageIndex].file_name}`;
        img.alt = 'Profile photo';
        img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 8px; transition: transform 0.3s ease;';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'lightbox-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: rgba(0,0,0,0.5);
            border: none;
            color: white;
            font-size: 2rem;
            cursor: pointer;
            padding: 0.5rem;
            width: 40px;
            height: 40px;
            line-height: 30px;
            border-radius: 50%;
            z-index: 10;
            transition: all 0.3s ease;
        `;
        
        const rotateBtn = document.createElement('button');
        rotateBtn.className = 'lightbox-rotate';
        rotateBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        rotateBtn.title = 'Rotate 90°';
        rotateBtn.style.cssText = `
            position: absolute;
            top: 1rem;
            right: 4rem;
            background: rgba(0,0,0,0.5);
            border: none;
            color: white;
            font-size: 1.2rem;
            cursor: pointer;
            padding: 0.5rem;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            z-index: 10;
            transition: all 0.3s ease;
        `;
        
        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'lightbox-prev';
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.title = 'Previous photo';
        prevBtn.style.cssText = `
            position: absolute;
            left: 1rem;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0,0,0,0.5);
            border: none;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0.75rem;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            z-index: 10;
            transition: all 0.3s ease;
        `;
        
        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'lightbox-next';
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.title = 'Next photo';
        nextBtn.style.cssText = `
            position: absolute;
            right: 1rem;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0,0,0,0.5);
            border: none;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0.75rem;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            z-index: 10;
            transition: all 0.3s ease;
        `;
        
        // Photo counter
        const counter = document.createElement('div');
        counter.className = 'lightbox-counter';
        counter.style.cssText = `
            position: absolute;
            bottom: 1rem;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.5);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-size: 0.9rem;
            z-index: 10;
        `;
        
        function updateImage() {
            img.src = `/uploads/profile_images/${allImages[currentImageIndex].file_name}`;
            counter.textContent = `${currentImageIndex + 1} / ${allImages.length}`;
            rotation = 0;
            img.style.transform = `rotate(0deg)`;
        }
        
        updateImage();
        
        rotateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            rotation = (rotation + 90) % 360;
            img.style.transform = `rotate(${rotation}deg)`;
        });
        
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentImageIndex = (currentImageIndex - 1 + allImages.length) % allImages.length;
            updateImage();
        });
        
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentImageIndex = (currentImageIndex + 1) % allImages.length;
            updateImage();
        });
        
        // Button hover effects
        [closeBtn, rotateBtn, prevBtn, nextBtn].forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(139, 92, 246, 0.8)';
                btn.style.transform = btn === prevBtn || btn === nextBtn ? 'translateY(-50%) scale(1.1)' : 'scale(1.1)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(0,0,0,0.5)';
                btn.style.transform = btn === prevBtn || btn === nextBtn ? 'translateY(-50%) scale(1)' : 'scale(1)';
            });
        });
        
        lightboxContent.appendChild(img);
        lightboxContent.appendChild(rotateBtn);
        lightboxContent.appendChild(closeBtn);
        lightbox.appendChild(lightboxContent);
        lightbox.appendChild(prevBtn);
        lightbox.appendChild(nextBtn);
        lightbox.appendChild(counter);
        document.body.appendChild(lightbox);
        
        const close = () => lightbox.remove();
        closeBtn.addEventListener('click', close);
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                close();
            }
        });
        
        // Keyboard navigation
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                close();
            } else if (e.key === 'ArrowLeft') {
                currentImageIndex = (currentImageIndex - 1 + allImages.length) % allImages.length;
                updateImage();
            } else if (e.key === 'ArrowRight') {
                currentImageIndex = (currentImageIndex + 1) % allImages.length;
                updateImage();
            }
        };
        
        document.addEventListener('keydown', handleKeydown);
        lightbox.addEventListener('remove', () => {
            document.removeEventListener('keydown', handleKeydown);
        });
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









































