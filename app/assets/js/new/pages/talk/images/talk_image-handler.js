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

async function handleImageSelect(event) {
    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) {
        return;
    }

    if (!currentConversation) {
        showNotification('No conversation selected', 'error');
        event.target.value = '';
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

    const maxFile = CONFIG.LIMITS.MAX_FILE_SIZE;
    // Compress before queue so uploads stay smaller/faster (reduces proxy resets after a heavy image).
    const compressMinBytes = 450 * 1024;

    try {
        for (const file of files) {
            const isImageMime = Boolean(file && file.type && file.type.toLowerCase().startsWith('image/'));
            if (!isImageMime) {
                showNotification(`Not an image: ${file.name}`, 'warning');
                continue;
            }

            let fileToQueue = file;
            const mime = (file.type || '').toLowerCase();
            const canCanvasCompress =
                mime === 'image/jpeg' ||
                mime === 'image/jpg' ||
                mime === 'image/pjpeg' ||
                mime === 'image/png' ||
                mime === 'image/webp';

            if (
                file.size > compressMinBytes &&
                file.size <= maxFile &&
                canCanvasCompress &&
                typeof Utils !== 'undefined' &&
                Utils.image &&
                typeof Utils.image.compress === 'function'
            ) {
                try {
                    const result = await Utils.image.compress(file);
                    if (result && result.file && result.file.size <= maxFile) {
                        fileToQueue = result.file;
                    }
                } catch (_) {
                    /* keep original */
                }
            }

            if (fileToQueue.size > maxFile) {
                showNotification(
                    `Image too large: ${file.name}. Max ${formatBytes(maxFile)}`,
                    'warning'
                );
                continue;
            }

            selectedImages.push(fileToQueue);
            createImagePreview(fileToQueue, URL.createObjectURL(fileToQueue));
        }
    } catch (err) {
        console.error('handleImageSelect:', err);
        showNotification('Could not add images. Please try again.', 'error');
    }

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












