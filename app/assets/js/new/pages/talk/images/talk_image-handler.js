function isUploadableImageFile(file) {
    if (!file) {
        return false;
    }

    const mimeType = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    const extension = name.includes('.') ? name.split('.').pop() : '';

    // Keep chat uploads aligned with profile-photo restrictions.
    if (mimeType.includes('heic') || mimeType.includes('heif') || extension === 'heic' || extension === 'heif' || extension === 'hiec') {
        return false;
    }

    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    if (allowedMimeTypes.has(mimeType)) {
        return true;
    }

    const supportedExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
    return supportedExtensions.has(extension);
}

function handleImageSelect(event) {
    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) {
        return;
    }

    if (!currentConversation) {
        showNotification('No conversation selected', 'error');
        return;
    }

    const files = selectedFiles.filter(isUploadableImageFile);
    const unsupportedFiles = selectedFiles.filter((file) => !isUploadableImageFile(file));

    if (unsupportedFiles.length > 0) {
        showNotification('heic extension not supported,\nPlease upload jpg or png images', 'error');
    }

    if (files.length === 0) {
        event.target.value = '';
        return;
    }

    const remainingSlots = 5 - selectedImages.length;
    if (remainingSlots <= 0) {
        showNotification('Maximum 5 images allowed per message', 'warning');
        event.target.value = '';
        return;
    }

    if (files.length > remainingSlots) {
        showNotification('Maximum 5 images allowed per message', 'warning');
        event.target.value = '';
        return;
    }

    const formatBytes = (bytes) => {
        const value = Number(bytes) || 0;
        const kb = Math.max(0, Math.round(value / 1024));
        const mb = Math.max(0, Math.round((value / (1024 * 1024)) * 10) / 10);
        return mb >= 1 ? `${mb} MB (${kb} KB)` : `${kb} KB`;
    };

    // Keep chat upload input identical to profile-photo flow (no client recompression).
    Array.from(files).forEach((file) => {
        const isImageMime = Boolean(file && file.type && file.type.toLowerCase().startsWith('image/'));
        if (!isImageMime) {
            showNotification(`Not an image: ${file.name}`, 'warning');
            return;
        }

        if (file.size > CONFIG.LIMITS.MAX_FILE_SIZE) {
            showNotification(
                `Image too large: ${file.name}. Max ${formatBytes(CONFIG.LIMITS.MAX_FILE_SIZE)}`,
                'warning'
            );
            return;
        }

        if (file.type.startsWith('image/') && file.size <= CONFIG.LIMITS.MAX_FILE_SIZE) {
            selectedImages.push(file);
            createImagePreview(file, URL.createObjectURL(file));
        }
    });

    // Show preview area
    const previewArea = document.getElementById('imagePreviewArea');
    if (previewArea) {
        previewArea.style.display = 'block';
    }

    // Clear the file input
    event.target.value = '';
}

function selectImage() {
    if (!currentConversation) {
        showNotification('Please select a conversation first', 'error');
        return;
    }

    const fileInput = document.getElementById('imageInput');

    if (fileInput) {
        fileInput.click();
    } else {
        showNotification('File input not found', 'error');
    }
}

function uploadImages(event) {
    handleImageSelect(event);
}

// Make functions globally available
window.selectImage = selectImage;
window.handleImageSelect = handleImageSelect;
window.uploadImages = uploadImages;












