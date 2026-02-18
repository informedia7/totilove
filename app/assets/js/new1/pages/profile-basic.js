(function() {
    // Get user ID from currentUser (set by inline script in profile-basic.html)
    const currentUserId = window.currentUser?.id;
    const urlParams = new URLSearchParams(window.location.search);
    const sessionToken = urlParams.get('token');

    // Load user images
    async function loadUserImages() {
        const gallery = document.getElementById('gallery');
        if (!gallery) return;

        try {
            if (!currentUserId) {
                gallery.innerHTML = 'No photos uploaded.';
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
                gallery.innerHTML = 'No photos uploaded.';
                return;
            }

            const result = await response.json();
            let images = [];
            if (result && result.images && Array.isArray(result.images)) {
                images = result.images;
            } else if (result && result.success) {
                images = result.images || [];
            }

            displayImages(images);
        } catch (error) {
            gallery.innerHTML = 'No photos uploaded.';
        }
    }

    // Display images
    function displayImages(images) {
        const gallery = document.getElementById('gallery');
        if (!gallery) return;

        if (!images || images.length === 0) {
            gallery.innerHTML = 'No photos uploaded.';
            return;
        }

        // Get current user's gender for default image fallback
        const currentUserGender = window.currentUser?.gender || '';
        const defaultImg = (currentUserGender && currentUserGender.toString().toLowerCase() === 'f') ? '/assets/images/default_profile_female.svg' : '/assets/images/default_profile_male.svg';
        
        gallery.innerHTML = images.map((image) => {
            const isProfile = image.is_profile === true || image.is_profile === 1 || image.is_profile === '1' || image.is_profile === 'true';
            const isFeatured = image.featured === true || image.featured === 1 || image.featured === '1' || image.featured === 'true';
            
            return `
                <div class="gallery-item ${isFeatured ? 'featured' : ''}" data-image-id="${image.id}">
                    <img data-src="/uploads/profile_images/${image.file_name}" alt="Profile photo">
                    ${isProfile ? '<div class="photo-status-icon profile-icon" title="Profile Photo"><i class="fas fa-user"></i></div>' : ''}
                    ${isFeatured ? '<div class="photo-status-icon featured-icon" title="Featured Photo"><i class="fas fa-heart"></i></div>' : ''}
                </div>
            `;
        }).join('');

        // Set image sources and attach error handlers (CSP-safe)
        gallery.querySelectorAll('img').forEach(img => {
            img.src = img.dataset.src;
            img.addEventListener('error', () => {
                img.src = defaultImg;
            });
        });

        // Add class for single photo (50% smaller) - same as profile-photos
        const galleryItems = gallery.querySelectorAll('.gallery-item');
        if (galleryItems.length === 1) {
            gallery.classList.add('single-photo');
            galleryItems[0].classList.add('single-photo-item');
        } else {
            gallery.classList.remove('single-photo');
            galleryItems.forEach(item => item.classList.remove('single-photo-item'));
        }

        // Add lightbox functionality to gallery images
        setupLightbox();
    }

    // Photo lightbox functionality - set up once using event delegation
    let lightboxSetup = false;
    function setupLightbox() {
        const gallery = document.getElementById('gallery');
        if (!gallery || lightboxSetup) return;
        
        lightboxSetup = true;

        // Use event delegation on the gallery container
        gallery.addEventListener('click', function(e) {
            const img = e.target.closest('.gallery-item img');
            if (!img) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            if (img.src.includes('default_profile_')) return;
            
            const box = document.createElement('div');
            box.className = 'lightbox';
            box.innerHTML = '<img src="' + img.src + '" alt="Profile photo">';
            
            // Close on Escape key
            const handleEscape = function(e) {
                if (e.key === 'Escape') {
                    box.remove();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
            
            // Close on click
            box.onclick = function(e) {
                if (e.target === box || e.target.tagName === 'IMG') {
                    box.remove();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            
            document.body.appendChild(box);
        });
    }

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadUserImages);
    } else {
        loadUserImages();
    }
})();





