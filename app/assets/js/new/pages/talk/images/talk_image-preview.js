function createImagePreview(file, dataUrl) {

    const previewList = document.getElementById('imagePreviewList');

    if (!previewList) {
        return;
    }



    const previewItem = document.createElement('div');
    previewItem.className = 'image-preview-item';
    previewItem.setAttribute('data-filename', file.name);

    // Create safe filename for onclick (escape special characters)
    const safeFilename = file.name.replace(/'/g, "\\'");

    previewItem.innerHTML = `
                                        <img src="${dataUrl}" alt="" class="image-preview-img">
                                        <button class="image-preview-remove" onclick="removeImagePreview('${safeFilename}')">×</button>
                                    `;

    previewList.appendChild(previewItem);


    // Update preview area visibility
    const previewArea = document.getElementById('imagePreviewArea');
    if (previewArea) {
        previewArea.style.display = 'block';
    }
}

function removeImagePreview(filename) {


    // Remove from selected images array
    selectedImages = selectedImages.filter(file => file.name !== filename);


    // Remove preview element
    const previewItem = document.querySelector(`[data-filename="${filename}"]`);
    if (previewItem) {
        previewItem.remove();
    }

    // Hide preview area if no images left
    if (selectedImages.length === 0) {
        const previewArea = document.getElementById('imagePreviewArea');
        if (previewArea) {
            previewArea.style.display = 'none';

        }
    }
}

function clearImagePreviews() {

    selectedImages = [];
    document.getElementById('imagePreviewList').innerHTML = '';
    document.getElementById('imagePreviewArea').style.display = 'none';

}

// Helper function to display uploaded images (for sender)
function replaceProgressWithImages(messageElement, attachments) {
    // CRITICAL: Remove any duplicate timestamps before updating images
    const existingTimeElements = messageElement.querySelectorAll('.message-time');
    if (existingTimeElements.length > 1) {
        // Keep only the last one (most recent)
        for (let i = 0; i < existingTimeElements.length - 1; i++) {
            existingTimeElements[i].remove();
        }
    }

    const attachmentsDiv = messageElement.querySelector('.message-images-container') || messageElement.querySelector('.message-attachments');


    if (attachmentsDiv) {
        attachmentsDiv.innerHTML = '';

        const imageAttachments = attachments.filter((attachment) => attachment.attachment_type === 'image');
        const galleryItems = imageAttachments
            .filter((att) => att.file_path || att.thumbnail_path)
            .map((att) => ({
                file_path: att.file_path || att.thumbnail_path,
                thumbnail_path: att.thumbnail_path || att.file_path,
                original_filename: att.original_filename || ''
            }));

        attachments.forEach((attachment, index) => {
            if (attachment.attachment_type === 'image') {
                const imageContainer = document.createElement('div');
                imageContainer.className = 'message-image-wrapper';

                const eyeBtn = document.createElement('button');
                eyeBtn.type = 'button';
                eyeBtn.className = 'mobile-eye-btn';
                eyeBtn.setAttribute('aria-label', 'Open image');
                eyeBtn.textContent = '👁️';

                const img = document.createElement('img');
                img.className = 'message-image-clean';
                img.classList.add('message__image-clean');
                img.alt = '';
                img.style.cursor = 'pointer';
                img.style.opacity = '0';
                imageContainer.classList.add('loading');

                const imagePaths = [];
                if (attachment.thumbnail_path) {
                    imagePaths.push(attachment.thumbnail_path);
                }
                if (attachment.file_path && attachment.file_path !== attachment.thumbnail_path) {
                    imagePaths.push(attachment.file_path);
                }

                img.onload = function () {
                    this.style.transition = 'all 0.3s ease';
                    this.style.opacity = '1';
                    imageContainer.classList.remove('loading');
                };

                img.onerror = function () {
                    imageContainer.innerHTML = `<div class="image-error">📷 Failed to load</div>`;
                };

                loadImageWithFallback(img, imagePaths);

                const galleryIndex = galleryItems.findIndex((item) =>
                    item.file_path === (attachment.file_path || attachment.thumbnail_path)
                );

                img.onclick = () => {
                    if (typeof openImageViewer === 'function') {
                        openImageViewer(
                            attachment.file_path || attachment.thumbnail_path,
                            '',
                            galleryItems,
                            galleryIndex >= 0 ? galleryIndex : 0
                        );
                    }
                };

                eyeBtn.onclick = (event) => {
                    event.stopPropagation();
                    if (typeof openImageViewer === 'function') {
                        openImageViewer(
                            attachment.file_path || attachment.thumbnail_path,
                            '',
                            galleryItems,
                            galleryIndex >= 0 ? galleryIndex : 0
                        );
                    }
                };

                imageContainer.appendChild(img);
                imageContainer.appendChild(eyeBtn);
                attachmentsDiv.appendChild(imageContainer);
            }
        });

        // Timestamp is handled by message-time class in message factory - no need to add separate timestamp here

        // Re-bind hover / mobile image listeners: addMessageActions early-returns if .message-actions exists,
        // and clearing images may have left a stale bar on another anchor — remove so hooks match new DOM.
        messageElement.querySelectorAll('.message-actions').forEach((el) => el.remove());
        messageElement.querySelectorAll('.message-action-anchor').forEach((el) => {
            el.classList.remove('message-action-anchor');
        });

        const message = {
            id: messageElement.getAttribute('data-message-id'),
            type: messageElement.classList.contains('sent') ? 'sent' : 'received',
            isUploading: false
        };
        addMessageActions(messageElement, message);
    }
}

// Enhanced function to load image with fallback paths (matches reference)
function loadImageWithFallback(img, paths, currentIndex = 0) {
    if (typeof Utils !== 'undefined' && Utils.image && typeof Utils.image.loadWithFallback === 'function') {
        Utils.image.loadWithFallback(img, paths, currentIndex);
    } else {
        // Fallback implementation if Utils not available
        if (currentIndex >= paths.length) {
            img.style.display = 'none';
            const fallbackDiv = document.createElement('div');
            fallbackDiv.className = 'image-error-fallback';
            fallbackDiv.innerHTML = '<span>📷 Image unavailable</span>';
            fallbackDiv.style.cssText = 'padding: 20px; text-align: center; color: #666; background: #f8f9fa; border-radius: 8px;';
            if (img.parentNode) {
                img.parentNode.appendChild(fallbackDiv);
            }
            return;
        }
        const path = paths[currentIndex];
        const originalOnload = img.onload;
        const originalOnerror = img.onerror;
        img.onload = () => {
            if (originalOnload) originalOnload.call(img);
        };
        img.onerror = () => {
            setTimeout(() => {
                loadImageWithFallback(img, paths, currentIndex + 1);
            }, 100);
        };
        img.src = path;
    }
}

// Make functions globally available
window.createImagePreview = createImagePreview;
window.removeImagePreview = removeImagePreview;
window.clearImagePreviews = clearImagePreviews;
window.replaceProgressWithImages = replaceProgressWithImages;
window.loadImageWithFallback = loadImageWithFallback;












