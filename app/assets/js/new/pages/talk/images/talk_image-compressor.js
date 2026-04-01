// Image compression function to compress images to target size
function compressImage(file, maxSizeKB = CONFIG.LIMITS.COMPRESSION_TARGET, quality = CONFIG.LIMITS.COMPRESSION_QUALITY) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            // Calculate dimensions to maintain aspect ratio
            let { width, height } = img;
            const maxDimension = CONFIG.LIMITS.MAX_IMAGE_SIZE; // Max width or height

            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = (height * maxDimension) / width;
                    width = maxDimension;
                } else {
                    width = (width * maxDimension) / height;
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;

            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);

            // Try different quality levels to reach target size
            let currentQuality = quality;
            let compressedDataUrl = canvas.toDataURL('image/jpeg', currentQuality);

            // Calculate size in KB
            const getDataUrlSizeKB = (dataUrl) => {
                return Math.round((dataUrl.length * 3) / 4 / 1024);
            };

            // Reduce quality until we reach target size
            while (getDataUrlSizeKB(compressedDataUrl) > maxSizeKB && currentQuality > 0.1) {
                currentQuality -= 0.1;
                compressedDataUrl = canvas.toDataURL('image/jpeg', currentQuality);
            }

            // Convert dataURL to blob
            canvas.toBlob((blob) => {
                const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });

                // Show compression success notification
                const originalKB = Math.round(file.size / 1024);
                const compressedKB = Math.round(blob.size / 1024);
                showNotification(`🗜️ ${originalKB}KB → ${compressedKB}KB`, 'success');

                resolve({
                    file: compressedFile,
                    dataUrl: compressedDataUrl,
                    originalSize: file.size,
                    compressedSize: blob.size,
                    quality: currentQuality
                });
            }, 'image/jpeg', currentQuality);
        };

        img.src = URL.createObjectURL(file);
    });
}

// Make function globally available
window.compressImage = compressImage;












