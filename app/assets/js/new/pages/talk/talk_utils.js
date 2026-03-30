/**
 * TALK UTILITIES
 * Utility functions for image handling, file operations, date formatting, and DOM manipulation
 * Extracted from talk.html (lines 1048-1387)
 * 
 * Dependencies: CONFIG (talk_config.js), showNotification (global function)
 */

// Note: CONFIG should be available globally or imported
// Note: showNotification should be available globally

const Utils = {
    // Debounce function (single definition)
    debounce: function (func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Image utilities
    image: {
        loadWithFallback: function (img, paths, currentIndex = 0) {
            if (currentIndex >= paths.length) {
                img.style.display = 'none';
                const fallbackDiv = document.createElement('div');
                fallbackDiv.className = 'image-error-fallback';
                fallbackDiv.innerHTML = '<span>📷 Image unavailable</span>';
                fallbackDiv.style.cssText = 'padding: 20px; text-align: center; color: #666; background: #f8f9fa; border-radius: 8px;';
                img.parentNode.appendChild(fallbackDiv);
                return;
            }

            const path = paths[currentIndex];
            const originalOnload = img.onload;
            const originalOnerror = img.onerror;

            const successHandler = () => {
                clearTimeout(timeout);
                if (originalOnload) {
                    originalOnload.call(img);
                }
            };

            const errorHandler = () => {
                clearTimeout(timeout);
                setTimeout(() => {
                    Utils.image.loadWithFallback(img, paths, currentIndex + 1);
                }, 100);
            };

            const timeout = setTimeout(() => {
                if (img.src === path && !img.complete) {
                    errorHandler();
                }
            }, CONFIG.LIMITS.IMAGE_LOAD_TIMEOUT);

            img.onload = successHandler;
            img.onerror = errorHandler;
            img.src = path;
        },

        compress: function (file, maxSizeKB = CONFIG.LIMITS.COMPRESSION_TARGET, quality = CONFIG.LIMITS.COMPRESSION_QUALITY) {
            return new Promise((resolve) => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();

                img.onload = () => {
                    let { width, height } = img;
                    const maxDimension = CONFIG.LIMITS.MAX_IMAGE_SIZE;

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
                    ctx.drawImage(img, 0, 0, width, height);

                    let currentQuality = quality;
                    let compressedDataUrl = canvas.toDataURL('image/jpeg', currentQuality);

                    const getDataUrlSizeKB = (dataUrl) => {
                        return Math.round((dataUrl.length * 3) / 4 / 1024);
                    };

                    while (getDataUrlSizeKB(compressedDataUrl) > maxSizeKB && currentQuality > 0.1) {
                        currentQuality -= 0.1;
                        compressedDataUrl = canvas.toDataURL('image/jpeg', currentQuality);
                    }

                    canvas.toBlob((blob) => {
                        const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });

                        const originalKB = Math.round(file.size / 1024);
                        const compressedKB = Math.round(blob.size / 1024);
                        if (typeof showNotification === 'function') {
                            showNotification(`🗜️ ${originalKB}KB → ${compressedKB}KB`, 'success');
                        }

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
        },

        createContainer: function (attachment, isSingle = false, index = 0, messageType = null) {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'message-image-container';

            if (isSingle) {
                imageContainer.classList.add('single-image');
            } else {
                imageContainer.classList.add('grid-image');
                imageContainer.style.order = index;
            }

            const img = document.createElement('img');
            img.className = 'message-image';
            img.classList.add('message__image-clean');
            img.alt = attachment.original_filename || 'Image';
            img.loading = 'lazy';
            img.style.opacity = '0';
            imageContainer.classList.add('loading');

            const imagePaths = [];
            if (attachment.thumbnail_path) {
                imagePaths.push(
                    attachment.thumbnail_path.startsWith('/') ? attachment.thumbnail_path : '/' + attachment.thumbnail_path
                );
            }
            if (attachment.file_path && attachment.file_path !== attachment.thumbnail_path) {
                imagePaths.push(
                    attachment.file_path.startsWith('/') ? attachment.file_path : '/' + attachment.file_path
                );
            }

            img.onload = function () {
                this.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                this.style.opacity = '1';
                imageContainer.classList.remove('loading');
                this.style.transform = 'scale(1)';
                this.onmouseenter = () => {
                    this.style.transform = 'scale(1.02)';
                };
                this.onmouseleave = () => {
                    this.style.transform = 'scale(1)';
                };
            };

            img.onerror = function () {
                // Try to load placeholder image first
                const placeholderPath = '/assets/images/image-placeholder.svg';
                
                // Check if placeholder exists, otherwise show error
                fetch(placeholderPath)
                    .then(response => {
                        if (response.ok) {
                            // Show placeholder image
                            this.src = placeholderPath;
                            this.style.opacity = '0.6';
                            this.style.filter = 'grayscale(100%)';
                            this.title = 'Image not available - showing placeholder';
                        } else {
                            // Show error message if no placeholder
                            imageContainer.innerHTML = `
                                <div class="image-error-enhanced">
                                    <div class="error-icon">📷</div>
                                    <div class="error-text">Image not available</div>
                                    <div class="error-actions">
                                        <button onclick="retryImageLoad('${attachment.file_path || attachment.thumbnail_path}', this)" class="retry-btn-enhanced">Retry</button>
                                        <button onclick="reloadConversation()" class="reload-btn">Reload Chat</button>
                                    </div>
                                </div>
                            `;
                        }
                    })
                    .catch(() => {
                        // Show error message if fetch fails
                        imageContainer.innerHTML = `
                            <div class="image-error-enhanced">
                                <div class="error-icon">📷</div>
                                <div class="error-text">Image not available</div>
                                <div class="error-actions">
                                    <button onclick="retryImageLoad('${attachment.file_path || attachment.thumbnail_path}', this)" class="retry-btn-enhanced">Retry</button>
                                    <button onclick="reloadConversation()" class="reload-btn">Reload Chat</button>
                                </div>
                            </div>
                        `;
                    });
            };

            const isSenderMessage = messageType === 'sent';
            if (isSenderMessage) {
                Utils.image.loadWithFallback(img, imagePaths);
            } else {
                Utils.image.optimizeForDisplay(img, attachment);
            }

            img.onclick = () => {
                if (typeof openImageViewer === 'function') {
                    const imagePath = attachment.file_path || attachment.thumbnail_path;
                    const filename = attachment.original_filename || 'Image';
                    openImageViewer(imagePath, filename);
                }
            };

            imageContainer.appendChild(img);
            return imageContainer;
        },

        optimizeForDisplay: function (img, attachment) {
            const messageElement = img.closest('.message');
            const isSenderMessage = messageElement && messageElement.classList.contains('sent');
            const isVisible = messageElement && messageElement.offsetParent !== null;

            const shouldLoadImmediately = isSenderMessage || isVisible || !('IntersectionObserver' in window);

            if (shouldLoadImmediately) {
                const imagePaths = Utils.image.getOptimizedPaths(attachment);
                Utils.image.loadWithFallback(img, imagePaths);
            } else {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const imagePaths = Utils.image.getOptimizedPaths(attachment);
                            Utils.image.loadWithFallback(img, imagePaths);
                            observer.unobserve(img);
                        }
                    });
                }, {
                    rootMargin: '50px'
                });

                observer.observe(img);
            }

            if (attachment.file_size) {
                img.setAttribute('data-size', Utils.formatFileSize(attachment.file_size));
            }

            if (attachment.original_filename) {
                img.setAttribute('data-filename', attachment.original_filename);
            }
        },

        getOptimizedPaths: function (attachment) {
            const paths = [];

            if (attachment.thumbnail_path) {
                const thumbnailPath = attachment.thumbnail_path.startsWith('/') ? attachment.thumbnail_path : '/' + attachment.thumbnail_path;
                paths.push(thumbnailPath);
            }

            if (attachment.file_path && attachment.file_path !== attachment.thumbnail_path) {
                const filePath = attachment.file_path.startsWith('/') ? attachment.file_path : '/' + attachment.file_path;
                paths.push(filePath);
            }

            if (attachment.file_path) {
                const filename = attachment.file_path.split('/').pop();
                const fallbackPaths = [
                    `/uploads/${filename}`,
                    `/api/images/${filename}`,
                    `/images/${filename}`
                ];
                paths.push(...fallbackPaths);
            }

            return [...new Set(paths)];
        }
    },

    // File utilities
    formatFileSize: function (bytes) {
        if (!bytes || bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    // Date utilities
    date: {
        getMinDate: function () {
            const today = new Date();
            today.setFullYear(today.getFullYear() - CONFIG.DATES.MAX_YEARS_BACK);
            return today.toISOString().split('T')[0];
        },

        getMaxDate: function () {
            return new Date().toISOString().split('T')[0];
        },

        formatRelativeTime: function (timestamp) {
            if (!timestamp) return '';

            const date = new Date(timestamp);
            if (Number.isNaN(date.getTime())) {
                return '';
            }

            const diff = Math.max(0, Date.now() - date.getTime());

            const formatUnit = (value, label) => {
                const amount = Math.max(1, Math.floor(value));
                return `${amount} ${label}${amount === 1 ? '' : 's'} ago`;
            };

            const seconds = Math.floor(diff / 1000);
            if (seconds < 60) {
                return formatUnit(seconds || 1, 'second');
            }
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) {
                return formatUnit(minutes, 'minute');
            }
            const hours = Math.floor(minutes / 60);
            if (hours < 24) {
                return formatUnit(hours, 'hour');
            }
            const days = Math.floor(hours / 24);
            if (days < 7) {
                return formatUnit(days, 'day');
            }
            const weeks = Math.floor(days / 7);
            if (weeks < 4) {
                return formatUnit(weeks, 'week');
            }
            const months = Math.floor(days / 30);
            if (months < 12) {
                return formatUnit(months, 'month');
            }
            const years = Math.floor(days / 365);
            return formatUnit(years, 'year');
        }
    },

    // DOM utilities
    dom: {
        createElement: function (tag, className, attributes = {}) {
            const element = document.createElement(tag);
            if (className) element.className = className;
            Object.entries(attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
            return element;
        },

        addEventListeners: function (element, events) {
            Object.entries(events).forEach(([event, handler]) => {
                element.addEventListener(event, handler);
            });
        }
    }
};

// Expose globally for legacy scripts expecting window.TalkUtils
if (typeof window !== 'undefined') {
    window.TalkUtils = Utils;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}
















