// Admin Image Approval JavaScript

let currentTab = 'all';
let currentImageId = null;
let currentPage = {
    all: 1
};

// Load data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadStatistics();
    loadAllImages();
    setupEventListeners();
    
    // Setup apply filters button
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }
});

function setupImagePreviewModalInteractions() {
    const previewModal = document.getElementById('imagePreviewModal');
    const previewActions = document.getElementById('imagePreviewActions');
    if (previewModal && !previewModal.dataset.backdropBound) {
        previewModal.dataset.backdropBound = '1';
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) {
                closeImagePreview();
            }
        });
    }
    if (previewActions && !previewActions.dataset.delegationBound) {
        previewActions.dataset.delegationBound = '1';
        previewActions.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-ia-action]');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const action = btn.dataset.iaAction;
            const imageId = btn.dataset.imageId != null && btn.dataset.imageId !== '' ? parseInt(btn.dataset.imageId, 10) : NaN;
            const userId =
                btn.dataset.userId !== undefined && btn.dataset.userId !== '' ? parseInt(btn.dataset.userId, 10) : NaN;
            switch (action) {
                case 'approve':
                    if (Number.isFinite(imageId)) approveImage(imageId);
                    break;
                case 'reject':
                    if (Number.isFinite(imageId)) rejectImage(imageId);
                    break;
                case 'disapprove':
                    if (Number.isFinite(imageId)) disapproveImage(imageId);
                    break;
                case 'suspend':
                    if (Number.isFinite(userId)) imageApprovalSuspendAccount(userId);
                    break;
                case 'unsuspend':
                    if (Number.isFinite(userId)) imageApprovalUnsuspendAccount(userId);
                    break;
                case 'delete_account':
                    if (Number.isFinite(userId)) imageApprovalDeleteAccount(userId);
                    break;
                case 'delete_blacklist':
                    if (Number.isFinite(userId)) imageApprovalBlacklistAccount(userId);
                    break;
                default:
                    break;
            }
        });
    }
}

// Setup event listeners
function setupEventListeners() {
    setupImagePreviewModalInteractions();
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

    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            updateActiveStatusChip(statusFilter.value);
            applyFilters();
        });
        updateActiveStatusChip(statusFilter.value);
    }

    const statusChipRow = document.getElementById('statusChipRow');
    if (statusChipRow) {
        statusChipRow.querySelectorAll('.status-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const status = chip.dataset.status || '';
                const filter = document.getElementById('statusFilter');
                if (filter) {
                    filter.value = status;
                }
                updateActiveStatusChip(status);
                applyFilters();
            });
        });
    }
}

function updateActiveStatusChip(statusValue) {
    const chips = document.querySelectorAll('#statusChipRow .status-chip');
    chips.forEach((chip) => {
        chip.classList.toggle('active', (chip.dataset.status || '') === (statusValue || ''));
    });
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

    window.__imageApprovalRowCache = window.__imageApprovalRowCache || {};
    images.forEach((im) => {
        window.__imageApprovalRowCache[im.id] = im;
    });

    if (images.length === 0) {
        grid.innerHTML = '<div class="loading">No images found</div>';
        return;
    }

    grid.innerHTML = images.map(image => {
        // Try static path first, fallback to API endpoint
        const base = (window.__TOTILOVE_URL || '').replace(/\/$/, '');
        const imageUrl = `${base}/uploads/profile_images/${image.file_name}`;
        const imageApiUrl = `/api/image-approval/image/${image.file_name}`;
        const status = image.approval_status || 'pending';
        
        return `
            <div class="image-card" data-image-id="${image.id}" data-image-url="${imageUrl}" data-status="${status}">
                <img src="${imageUrl}" alt="${escapeHtml(image.file_name)}" 
                     data-fallback="${imageApiUrl}"
                     style="cursor: pointer;">
                <div class="image-info">
                    <h4>${escapeHtml(image.real_name || 'Unknown')}${image.user_is_suspended === true || image.user_is_suspended === 't' ? ' <span class="status-badge rejected" title="Account suspended">Suspended</span>' : ''}</h4>
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
                            <button class="btn-reject" data-action="reject" data-image-id="${image.id}">Delete image</button>
                            <a class="btn btn-secondary btn-sm" href="${imageUrl}" target="_blank" rel="noopener">Open</a>
                        </div>
                    ` : status === 'approved' ? `
                        <div class="image-actions">
                            <button class="btn-disapprove" data-action="disapprove" data-image-id="${image.id}">Disapprove</button>
                            <button class="btn-reject" data-action="reject" data-image-id="${image.id}">Delete image</button>
                            <a class="btn btn-secondary btn-sm" href="${imageUrl}" target="_blank" rel="noopener">Open</a>
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
            rejectImage(parseInt(this.dataset.imageId));
        });
    });

    grid.querySelectorAll('[data-action="disapprove"]').forEach(btn => {
        btn.addEventListener('click', function() {
            disapproveImage(parseInt(this.dataset.imageId));
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
    const selectedStatus = document.getElementById('statusFilter').value;
    updateActiveStatusChip(selectedStatus);

    // Status filtering is handled by /api/image-approval (all-images endpoint),
    // so move out of the pending-only tab when a status is selected.
    if (selectedStatus && currentTab === 'pending') {
        currentPage.all = 1;
        switchTab('all');
        return;
    }

    currentPage[currentTab] = 1;
    if (currentTab === 'pending') {
        loadPendingImages();
    } else {
        loadAllImages();
    }
}

function imageApprovalUserSuspended(row) {
    return row && (row.user_is_suspended === true || row.user_is_suspended === 't');
}

// Preview image
function previewImage(imageId, imageUrl, status) {
    currentImageId = imageId;
    const row = window.__imageApprovalRowCache && window.__imageApprovalRowCache[imageId];
    const uid = row && row.user_id != null ? Number(row.user_id) : null;
    const suspended = imageApprovalUserSuspended(row);

    // Extract filename from URL for fallback
    const filename = imageUrl.split('/').pop();
    const imageApiUrl = `/api/image-approval/image/${filename}`;
    const previewContent = document.getElementById('imagePreviewContent');
    let metaHtml = '';
    if (row && Number.isFinite(uid) && uid > 0) {
        metaHtml = `
            <div class="image-preview-user-meta" style="margin-bottom:14px;padding:12px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.5;color:#334155;">
                <strong style="color:#0f172a;">Uploader</strong><br>
                ${escapeHtml(row.real_name || 'Unknown')} · User ID <strong>${uid}</strong><br>
                ${escapeHtml(row.email || '—')}
                ${suspended ? '<br><span style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:12px;font-weight:600;">Suspended</span>' : '<br><span style="display:inline-block;margin-top:6px;font-size:12px;color:#64748b;">Account active</span>'}
            </div>
        `;
    }
    previewContent.innerHTML = `
        ${metaHtml}
        <img src="${imageUrl}" alt="Preview" data-fallback="${imageApiUrl}" data-retry-attempts="0" style="max-width:100%;max-height:55vh;object-fit:contain;">
    `;

    const previewImg = previewContent.querySelector('img');
    if (previewImg) {
        previewImg.addEventListener('error', function () {
            const retryAttempts = parseInt(this.dataset.retryAttempts || '0', 10);
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

    let imageActionsHtml = '';
    if (status === 'pending') {
        imageActionsHtml = `
            <button type="button" class="btn btn-primary" data-ia-action="approve" data-image-id="${imageId}">Approve</button>
            <button type="button" class="btn btn-danger" data-ia-action="reject" data-image-id="${imageId}">Delete image</button>
        `;
    } else if (status === 'approved') {
        imageActionsHtml = `
            <button type="button" class="btn btn-secondary" data-ia-action="disapprove" data-image-id="${imageId}">Disapprove</button>
            <button type="button" class="btn btn-danger" data-ia-action="reject" data-image-id="${imageId}">Delete image</button>
        `;
    }

    let accountActionsHtml = '';
    if (Number.isFinite(uid) && uid > 0) {
        accountActionsHtml = `
            <div style="margin-top:18px;padding-top:16px;border-top:1px solid #e2e8f0;">
                <div style="font-weight:600;color:#0f172a;margin-bottom:10px;">Account actions</div>
                <div style="display:flex;flex-wrap:wrap;gap:10px;">
                    ${suspended
            ? `<button type="button" class="btn btn-account-unsuspend" data-ia-action="unsuspend" data-user-id="${uid}" title="Allow this user to log in again">Unsuspend</button>`
            : `<button type="button" class="btn btn-account-suspend" data-ia-action="suspend" data-user-id="${uid}" title="Block login; account data remains">Suspend</button>`
        }
                    <button type="button" class="btn btn-account-delete" data-ia-action="delete_account" data-user-id="${uid}" title="Permanently delete this user">Delete account</button>
                    <button type="button" class="btn btn-account-delete-blacklist" data-ia-action="delete_blacklist" data-user-id="${uid}" title="Record on admin blacklist and delete account">Delete+Blacklist</button>
                </div>
            </div>
        `;
    }

    document.getElementById('imagePreviewActions').innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:10px;">${imageActionsHtml}</div>
        ${accountActionsHtml}
    `;

    document.getElementById('imagePreviewModal').style.display = 'block';
}

// Close image preview
function closeImagePreview() {
    document.getElementById('imagePreviewModal').style.display = 'none';
    currentImageId = null;
}

function selectSuspensionReasonForImageApproval(title = 'Select Suspension Reason') {
    const reasons = [
        'Inappropriate profile images',
        'Inappropriate chat images',
        'Spam or scam behavior',
        'Harassment or abusive messages',
        'Inappropriate profile content',
        'Fake account or impersonation',
        'Payments expired',
        'Chargeback or payment fraud risk'
    ];

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10950;pointer-events:auto;';
        const dialog = document.createElement('div');
        dialog.style.cssText =
            'background:#fff;border-radius:8px;padding:20px;width:100%;max-width:420px;box-shadow:0 10px 30px rgba(0,0,0,0.2);';
        const heading = document.createElement('h3');
        heading.textContent = title;
        heading.style.margin = '0 0 12px 0';
        const label = document.createElement('label');
        label.textContent = 'Reason (required)';
        label.style.display = 'block';
        label.style.marginBottom = '8px';
        const select = document.createElement('select');
        select.style.cssText =
            'width:100%;padding:10px;border:1px solid #d0d7de;border-radius:6px;margin-bottom:16px;';
        reasons.forEach((reason) => {
            const option = document.createElement('option');
            option.value = reason;
            option.textContent = reason;
            select.appendChild(option);
        });
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btn btn-secondary';
        cancelButton.textContent = 'Cancel';
        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'btn btn-account-suspend';
        confirmButton.textContent = 'Continue';
        actions.appendChild(cancelButton);
        actions.appendChild(confirmButton);
        dialog.appendChild(heading);
        dialog.appendChild(label);
        dialog.appendChild(select);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        const close = (value) => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            resolve(value);
        };
        cancelButton.addEventListener('click', () => close(null));
        confirmButton.addEventListener('click', () => close(select.value));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(null);
        });
    });
}

async function imageApprovalSuspendAccount(userId) {
    const reason = await selectSuspensionReasonForImageApproval('Suspend user (image approval)');
    if (!reason) {
        showWarning('Suspension reason is required.');
        return;
    }
    const msg = `Suspend this user?\n\nReason: ${reason}\n\nThey will not be able to log in until unsuspended.`;
    const ok = await showConfirm(msg, 'Suspend user', 'Suspend', 'Cancel', 'account_suspend');
    if (!ok) return;
    try {
        const res = await fetch(`/api/users/${userId}/suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('User suspended.');
            const row = window.__imageApprovalRowCache && currentImageId != null && window.__imageApprovalRowCache[currentImageId];
            if (row) row.user_is_suspended = true;
            closeImagePreview();
            applyFilters();
            loadStatistics();
        } else {
            showError(data.error || 'Failed to suspend');
        }
    } catch (e) {
        showError(e.message);
    }
}

async function imageApprovalUnsuspendAccount(userId) {
    const ok = await showConfirm('Unsuspend this user?', 'Unsuspend', 'Unsuspend', 'Cancel', 'success');
    if (!ok) return;
    try {
        const res = await fetch(`/api/users/${userId}/suspend`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showSuccess('User unsuspended.');
            const row = window.__imageApprovalRowCache && currentImageId != null && window.__imageApprovalRowCache[currentImageId];
            if (row) row.user_is_suspended = false;
            closeImagePreview();
            applyFilters();
            loadStatistics();
        } else {
            showError(data.error || 'Failed to unsuspend');
        }
    } catch (e) {
        showError(e.message);
    }
}

async function imageApprovalBlacklistAccount(userId) {
    const reason = typeof prompt === 'function' ? prompt('Delete+Blacklist reason (optional):', 'Policy violation') : '';
    if (reason === null) return;
    const notes = typeof prompt === 'function' ? prompt('Internal notes (optional):', '') : '';
    if (notes === null) return;

    const ok = await showConfirm(
        'Delete+Blacklist saves this user to the admin blacklist and permanently deletes their account (same as User Management). Continue?',
        'Delete+Blacklist',
        'Delete+Blacklist',
        'Cancel',
        'account_delete_blacklist'
    );
    if (!ok) return;

    try {
        const res = await fetch(`/api/users/${userId}/blacklist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason || '', notes: notes || '' })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('User removed from accounts and recorded on the admin blacklist.');
            closeImagePreview();
            applyFilters();
            loadStatistics();
        } else {
            showError(data.error || 'Failed to blacklist');
        }
    } catch (e) {
        showError(e.message);
    }
}

async function imageApprovalDeleteAccount(userId) {
    const ok = await showConfirm(
        'Permanently DELETE this user account? All messages, images, likes, and profile data will be removed. This cannot be undone.',
        'Delete account',
        'Continue',
        'Cancel',
        'account_delete'
    );
    if (!ok) return;
    const typed = typeof prompt === 'function' ? prompt('Type DELETE in capital letters to confirm:', '') : '';
    if (typed !== 'DELETE') {
        showWarning('Deletion cancelled (confirmation text did not match).');
        return;
    }
    try {
        const res = await fetch(`/api/users/${userId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        showSuccess('Account deleted.');
        closeImagePreview();
        applyFilters();
        loadStatistics();
    } catch (e) {
        showError(e.message || 'Delete failed');
    }
}

// Reject image (API: /reject — removes image from gallery)
async function rejectImage(imageId) {
    const confirmed = await showConfirm(
        'Are you sure you want to delete this image?',
        'Delete image',
        'Delete image',
        'Cancel',
        'warning'
    );
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/image-approval/${imageId}/reject`, {
            method: 'POST',
            credentials: 'same-origin'
        });

        const data = await response.json().catch(() => ({}));

        if (!data.success) {
            throw new Error(data.error || `Failed to delete image (${response.status})`);
        }

        showSuccess('Image deleted successfully');
        closeImagePreview();
        
        if (currentTab === 'pending') {
            loadPendingImages();
        } else {
            loadAllImages();
        }
        loadStatistics();
    } catch (error) {
        console.error('Error deleting image:', error);
        showError('Failed to delete image: ' + error.message);
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
            method: 'POST',
            credentials: 'same-origin'
        });

        const data = await response.json().catch(() => ({}));

        if (!data.success) {
            throw new Error(data.error || `Failed to approve image (${response.status})`);
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

// Disapprove image (move approved image back to pending)
async function disapproveImage(imageId) {
    const confirmed = await showConfirm(
        'Move this approved image back to pending review?',
        'Disapprove Image',
        'Disapprove',
        'Cancel',
        'warning'
    );
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/image-approval/${imageId}/disapprove`, {
            method: 'POST',
            credentials: 'same-origin'
        });

        const data = await response.json().catch(() => ({}));

        if (!data.success) {
            throw new Error(data.error || `Failed to disapprove image (${response.status})`);
        }

        const selectedStatus = document.getElementById('statusFilter')?.value || '';
        if (currentTab === 'all' && selectedStatus === 'approved') {
            const staleCard = document.querySelector(`.image-card[data-image-id="${imageId}"]`);
            if (staleCard) {
                staleCard.remove();
            }
        }

        showSuccess('Image moved back to pending review');
        closeImagePreview();

        applyFilters();
        loadStatistics();
    } catch (error) {
        console.error('Error disapproving image:', error);
        showError('Failed to disapprove image: ' + error.message);
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










