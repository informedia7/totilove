/**
 * Profile Photos Page JavaScript
 * Extracted from profile-photos.html - Phase 1 CSS/JS Extraction
 */

(function() {
    // Get session token and user ID
    const urlParams = new URLSearchParams(window.location.search);
    const sessionToken = urlParams.get('token');
    let currentUserId = null;

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
                const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
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

            const response = await fetch('/api/profile/upload-images', {
                method: 'POST',
                headers: sessionToken ? {
                    'Authorization': `Bearer ${sessionToken}`,
                    'X-Session-Token': sessionToken
                } : {},
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Check for errors even on success
                if (result.errors && result.errors.length > 0) {
                    const errorMessages = result.errors.map(e => `${e.filename}: ${e.error}`).join('\n');
                    showNotification(`Upload completed with errors:\n${errorMessages}`, 'error');
                } else {
                    showNotification('Photos uploaded successfully!', 'success');
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
            showNotification(`Upload failed: ${error.message}`, 'error');
        }
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
            const itemClass = 'gallery-item';
            
            const defaultImg = getDefaultProfileImage(currentUserGender);
            return `
                <div class="${itemClass}" data-image-id="${image.id}">
                    <div class="image-wrapper">
                        <img src="${imageSrc}" alt="Profile photo" onerror="if(!this.src.includes('default_profile_')){this.src='${defaultImg}';}">
                        ${isProfile ? '<div class="photo-badge profile" title="Profile Photo"><i class="fas fa-user"></i></div>' : ''}
                        ${isFeatured ? '<div class="photo-badge featured" title="Featured Photo"><i class="fas fa-heart"></i></div>' : ''}
                        <div class="overlay enhanced">
                            <div class="overlay-content">
                                <div class="photo-actions">
                                    ${!isProfile ? `<button class="photo-action-btn set-profile" onclick="setProfileImage(${image.id})" title="Set as Profile">
                                        <i class="fas fa-user"></i>
                                    </button>` : ''}
                                    ${!isFeatured ? `<button class="photo-action-btn set-featured" onclick="setFeaturedImage(${image.id})" title="Feature">
                                        <i class="fas fa-heart"></i>
                                    </button>` : ''}
                                    ${isFeatured ? `<button class="photo-action-btn set-featured" onclick="unsetFeaturedImage(${image.id})" title="Unfeature">
                                        <i class="fas fa-heart-broken"></i>
                                    </button>` : ''}
                                    <button class="photo-action-btn delete" onclick="deleteImage(${image.id}, '${image.file_name.replace(/'/g, "\\'")}')" title="Delete">
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
        galleryGrid.querySelectorAll('.gallery-item').forEach((item, index) => {
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
        });
    }

    // Set profile image
    window.setProfileImage = async function(imageId) {
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

    // Show notification
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--dark, #2c3e50);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            animation: slideInUp 0.4s ease-out;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.95rem;
        `;
        notification.innerHTML = `<i class="fas fa-${icon}"></i> <span>${message}</span>`;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutDown 0.4s ease-in';
            setTimeout(() => notification.remove(), 400);
        }, 3001);
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









































