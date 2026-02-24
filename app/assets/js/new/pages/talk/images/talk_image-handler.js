function handleImageSelect(event) {
    const files = event.target.files;

    if (!files || files.length === 0) {
        return;
    }

    if (!currentConversation) {
        showNotification('No conversation selected', 'error');
        return;
    }

    // Show processing message
    if (files.length > 0) {
        showNotification(`🗜️ Compressing ${files.length} image(s) to 100KB...`, 'info');
    }

    // Add files to preview with compression
    Array.from(files).forEach(async (file, index) => {


        if (file.type.startsWith('image/') && file.size <= CONFIG.LIMITS.MAX_FILE_SIZE) { // Configurable file size limit
            try {
                // Compress image to 100KB
                const compressed = await compressImage(file, 100);

                // Replace original file with compressed version
                selectedImages.push(compressed.file);


                // Use compressed dataUrl for preview
                createImagePreview(compressed.file, compressed.dataUrl);

                // Show compression result
                const originalSizeMB = (compressed.originalSize / (1024 * 1024)).toFixed(1);
                const compressedSizeKB = Math.round(compressed.compressedSize / 1024);
                showNotification(`✅ ${file.name}: ${originalSizeMB}MB → ${compressedSizeKB}KB`, 'success');

            } catch (error) {
                showNotification(`Failed to process ${file.name}`, 'error');
            }
        } else {

            showNotification(`File ${file.name} is too large or not an image`, 'warning');
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












