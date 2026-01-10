// Admin Image Approval JavaScript

let currentTab = 'pending';
let currentImageId = null;
let currentPage = {
    pending: 1,
    all: 1
};

// Load data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadStatistics();
    loadPendingImages();
    setupEventListeners();
    
    // Setup apply filters button
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }
});

// Setup event listeners
function setupEventListeners() {
    let searchTimeout;
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                applyFilters();
            }, 500);
        });
    }

    // Setup modal close buttons
    const closeImagePreviewBtn = document.getElementById('closeImagePreviewBtn');
    if (closeImagePreviewBtn) {
        closeImagePreviewBtn.addEventListener('click', closeImagePreview);
    }

    const closeRejectionModalBtn = document.getElementById('closeRejectionModal');
    if (closeRejectionModalBtn) {
        closeRejectionModalBtn.addEventListener('click', closeRejectionModal);
    }

    const cancelRejectBtn = document.getElementById('cancelRejectBtn');
    if (cancelRejectBtn) {
        cancelRejectBtn.addEventListener('click', closeRejectionModal);
    }

    const confirmRejectBtn = document.getElementById('confirmRejectBtn');
    if (confirmRejectBtn) {
        confirmRejectBtn.addEventListener('click', confirmReject);
    }
}

// Switch tabs
function switchTab(tab) {
    currentTab = tab;
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        }
    });
    
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tab + 'Tab').classList.add('active');
    
    if (tab === 'pending') {
        loadPendingImages();
    } else {
        loadAllImages();
    }
}

// Setup tab event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
});

// Load statistics
async function loadStatistics() {
    try {
        const response = await fetch('/api/image-approval/statistics');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load statistics');
        }

        const stats = data.statistics;

        document.getElementById('totalImages').textContent = stats.total_images || 0;
        document.getElementById('pendingImages').textContent = stats.pending_images || 0;
        document.getElementById('approvedImages').textContent = stats.approved_images || 0;
        document.getElementById('rejectedImages').textContent = stats.rejected_images || 0;
        document.getElementById('images7Days').textContent = stats.images_last_7_days || 0;
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Load pending images
async function loadPendingImages() {
    try {
        const filters = {
            page: currentPage.pending,
            limit: 20,
            search: document.getElementById('searchInput').value,
            sort_by: document.getElementById('sortBy').value,
            sort_order: document.getElementById('sortOrder').value
        };

        const queryString = new URLSearchParams(filters).toString();
        const response = await fetch(`/api/image-approval/pending?${queryString}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load pending images');
        }

        renderImages(data.data, data.pagination, 'pending');
    } catch (error) {
        console.error('Error loading pending images:', error);
        document.getElementById('pendingImagesGrid').innerHTML = 
            '<div class="loading">Error loading data</div>';
    }
}

// Load all images
async function loadAllImages() {
    try {
        const filters = {
            page: currentPage.all,
            limit: 20,
            search: document.getElementById('searchInput').value,
            status: document.getElementById('statusFilter').value,
            sort_by: document.getElementById('sortBy').value,
            sort_order: document.getElementById('sortOrder').value
        };

        const queryString = new URLSearchParams(filters).toString();
        const response = await fetch(`/api/image-approval?${queryString}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load images');
        }

        renderImages(data.data, data.pagination, 'all');
    } catch (error) {
        console.error('Error loading images:', error);
        document.getElementById('allImagesGrid').innerHTML = 
            '<div class="loading">Error loading data</div>';
    }
}

// Render images
function renderImages(images, pagination, type) {
    const gridId = type === 'pending' ? 'pendingImagesGrid' : 'allImagesGrid';
    const grid = document.getElementById(gridId);

    if (images.length === 0) {
        grid.innerHTML = '<div class="loading">No images found</div>';
        return;
    }

    grid.innerHTML = images.map(image => {
        // Try static path first, fallback to API endpoint
        const imageUrl = `/uploads/profile_images/${image.file_name}`;
        const imageApiUrl = `/api/image-approval/image/${image.file_name}`;
        const status = image.approval_status || 'pending';
        
        return `
            <div class="image-card" data-image-id="${image.id}" data-image-url="${imageUrl}" data-status="${status}">
                <img src="${imageUrl}" alt="${escapeHtml(image.file_name)}" 
                     data-fallback="${imageApiUrl}"
                     style="cursor: pointer;">
                <div class="image-info">
                    <h4>${escapeHtml(image.real_name || 'Unknown')}</h4>
                    <p>ID: ${image.user_id}</p>
                    <p>${escapeHtml(image.email || '')}</p>
                    <p><small>${formatDate(image.uploaded_at)}</small></p>
                    <span class="status-badge ${status}">${status}</span>
                    ${image.is_profile ? '<span class="status-badge active">Profile</span>' : ''}
                    ${image.featured ? '<span class="status-badge active">Featured</span>' : ''}
                    ${image.rejection_reason ? `
                        <div class="rejection-reason">
                            <strong>Rejection Reason:</strong> ${escapeHtml(image.rejection_reason)}
                        </div>
                    ` : ''}
                    ${status === 'pending' ? `
                        <div class="image-actions">
                            <button class="btn-approve" data-action="approve" data-image-id="${image.id}">Approve</button>
                            <button class="btn-reject" data-action="reject" data-image-id="${image.id}">Reject</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Attach event listeners to avoid CSP violations
    grid.querySelectorAll('.image-card img').forEach(img => {
        // Track retry attempts using a data attribute to persist across event handler calls
        if (!img.dataset.retryAttempts) {
            img.dataset.retryAttempts = '0';
        }
        
        img.addEventListener('error', function() {
            const retryAttempts = parseInt(this.dataset.retryAttempts || '0');
            
            // Only try fallback once, and only if we haven't exceeded max retries
            if (retryAttempts === 0 && this.dataset.fallback && this.src !== this.dataset.fallback) {
                // Try fallback URL once
                this.dataset.retryAttempts = '1';
                this.src = this.dataset.fallback;
            } else {
                // Both attempts failed or max retries exceeded - show placeholder to prevent infinite retries
                this.removeEventListener('error', arguments.callee); // Remove this specific error handler
                this.onerror = null; // Remove any other error handlers
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-family="Arial" font-size="14"%3EImage not found%3C/text%3E%3C/svg%3E';
                this.style.opacity = '0.6';
            }
        }, { once: false });
        img.addEventListener('click', function() {
            const card = this.closest('.image-card');
            previewImage(
                parseInt(card.dataset.imageId),
                card.dataset.imageUrl,
                card.dataset.status
            );
        });
    });

    grid.querySelectorAll('[data-action="approve"]').forEach(btn => {
        btn.addEventListener('click', function() {
            approveImage(parseInt(this.dataset.imageId));
        });
    });

    grid.querySelectorAll('[data-action="reject"]').forEach(btn => {
        btn.addEventListener('click', function() {
            showRejectionModal(parseInt(this.dataset.imageId));
        });
    });

    renderPagination(type + 'Pagination', pagination, type);
}

// Render pagination
function renderPagination(elementId, pagination, type) {
    const paginationDiv = document.getElementById(elementId);
    const { page, totalPages } = pagination;

    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    paginationDiv.innerHTML = `
        <button class="pagination-btn" data-action="prev" data-page="${page - 1}" data-type="${type}" ${page === 1 ? 'disabled' : ''}>Previous</button>
        <span class="page-info">Page ${page} of ${totalPages}</span>
        <button class="pagination-btn" data-action="next" data-page="${page + 1}" data-type="${type}" ${page === totalPages ? 'disabled' : ''}>Next</button>
    `;

    // Attach event listeners
    paginationDiv.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (!this.disabled) {
                changePage(parseInt(this.dataset.page), this.dataset.type);
            }
        });
    });
}

// Change page
function changePage(newPage, type) {
    currentPage[type] = newPage;
    if (type === 'pending') {
        loadPendingImages();
    } else {
        loadAllImages();
    }
}

// Apply filters
function applyFilters() {
    currentPage[currentTab] = 1;
    if (currentTab === 'pending') {
        loadPendingImages();
    } else {
        loadAllImages();
    }
}

// Preview image
function previewImage(imageId, imageUrl, status) {
    currentImageId = imageId;
    // Extract filename from URL for fallback
    const filename = imageUrl.split('/').pop();
    const imageApiUrl = `/api/image-approval/image/${filename}`;
    const previewContent = document.getElementById('imagePreviewContent');
    previewContent.innerHTML = `
        <img src="${imageUrl}" alt="Preview" data-fallback="${imageApiUrl}" data-retry-attempts="0">
    `;
    
    // Add error handler to prevent infinite retries
    const previewImg = previewContent.querySelector('img');
    if (previewImg) {
        previewImg.addEventListener('error', function() {
            const retryAttempts = parseInt(this.dataset.retryAttempts || '0');
            if (retryAttempts === 0 && this.dataset.fallback && this.src !== this.dataset.fallback) {
                this.dataset.retryAttempts = '1';
                this.src = this.dataset.fallback;
            } else {
                this.removeEventListener('error', arguments.callee);
                this.onerror = null;
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect width="400" height="400" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-family="Arial" font-size="16"%3EImage not found%3C/text%3E%3C/svg%3E';
                this.style.opacity = '0.6';
            }
        });
    }
    
    let actionsHtml = '';
    if (status === 'pending') {
        actionsHtml = `
            <button class="btn btn-primary" onclick="approveImage(${imageId})">Approve</button>
            <button class="btn btn-danger" onclick="showRejectionModal(${imageId})">Reject</button>
        `;
    }
    document.getElementById('imagePreviewActions').innerHTML = actionsHtml;
    
    document.getElementById('imagePreviewModal').style.display = 'block';
}

// Close image preview
function closeImagePreview() {
    document.getElementById('imagePreviewModal').style.display = 'none';
    currentImageId = null;
}

// Show rejection modal
function showRejectionModal(imageId) {
    currentImageId = imageId;
    document.getElementById('rejectionReason').value = '';
    document.getElementById('rejectionModal').style.display = 'block';
}

// Close rejection modal
function closeRejectionModal() {
    document.getElementById('rejectionModal').style.display = 'none';
    currentImageId = null;
}

// Confirm reject
async function confirmReject() {
    if (!currentImageId) return;

    const reason = document.getElementById('rejectionReason').value;

    try {
        const response = await fetch(`/api/image-approval/${currentImageId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to reject image');
        }

        showSuccess('Image rejected successfully');
        closeRejectionModal();
        closeImagePreview();
        
        if (currentTab === 'pending') {
            loadPendingImages();
        } else {
            loadAllImages();
        }
        loadStatistics();
    } catch (error) {
        console.error('Error rejecting image:', error);
        showError('Failed to reject image: ' + error.message);
    }
}

// Approve image
async function approveImage(imageId) {
    const confirmed = await showConfirm('Are you sure you want to approve this image?', 'Approve Image', 'Approve', 'Cancel', 'info');
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/image-approval/${imageId}/approve`, {
            method: 'POST'
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to approve image');
        }

        showSuccess('Image approved successfully');
        closeImagePreview();
        
        if (currentTab === 'pending') {
            loadPendingImages();
        } else {
            loadAllImages();
        }
        loadStatistics();
    } catch (error) {
        console.error('Error approving image:', error);
        showError('Failed to approve image: ' + error.message);
    }
}

// Utility functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Close modals when clicking outside
window.onclick = function(event) {
    const imageModal = document.getElementById('imagePreviewModal');
    const rejectionModal = document.getElementById('rejectionModal');
    
    if (event.target === imageModal) {
        closeImagePreview();
    }
    if (event.target === rejectionModal) {
        closeRejectionModal();
    }
}










