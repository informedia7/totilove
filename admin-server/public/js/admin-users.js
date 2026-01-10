// Admin Users Management JavaScript

let currentPage = 1;
let currentFilters = {};
let selectedUsers = new Set();
let currentSort = { field: 'date_joined', order: 'DESC' };
let currentUsersRequest = null; // For request cancellation
let itemsPerPage = 50; // Default items per page

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Search input with debounce
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentFilters.search = e.target.value;
            currentPage = 1;
            loadUsers();
        }, 500);
    });

    // Filter inputs
    ['statusFilter', 'genderFilter', 'ageMin', 'ageMax', 'emailVerifiedFilter', 'hasImagesFilter', 'sortBy', 'sortOrder'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            applyFilters();
        });
    });

    // Items per page dropdown
    document.getElementById('itemsPerPage').addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1; // Reset to first page when changing items per page
        loadUsers();
    });

    // Apply filters button
    document.getElementById('applyFilters').addEventListener('click', applyFilters);

    // Clear filters
    document.getElementById('clearFilters').addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        document.getElementById('statusFilter').value = '';
        document.getElementById('genderFilter').value = '';
        document.getElementById('ageMin').value = '';
        document.getElementById('ageMax').value = '';
        document.getElementById('emailVerifiedFilter').value = '';
        document.getElementById('hasImagesFilter').value = '';
        document.getElementById('sortBy').value = 'date_joined';
        document.getElementById('sortOrder').value = 'DESC';
        document.getElementById('itemsPerPage').value = '50';
        currentFilters = {};
        currentSort = { field: 'date_joined', order: 'DESC' };
        itemsPerPage = 50;
        currentPage = 1;
        updateSortIndicators();
        loadUsers();
    });

    // Select all checkbox
    document.getElementById('selectAll').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.user-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            if (e.target.checked) {
                selectedUsers.add(parseInt(cb.value));
            } else {
                selectedUsers.delete(parseInt(cb.value));
            }
        });
        updateBulkActions();
    });

    // Bulk operations
    document.getElementById('executeBulk').addEventListener('click', executeBulkOperation);
    document.getElementById('clearSelection').addEventListener('click', () => {
        selectedUsers.clear();
        document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = false);
        document.getElementById('selectAll').checked = false;
        updateBulkActions();
    });

    // Modal close
    document.querySelector('.close')?.addEventListener('click', () => {
        document.getElementById('userModal').style.display = 'none';
    });

    // Sortable table headers
    document.querySelectorAll('.users-table th.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const sortField = header.dataset.sort;
            handleHeaderSort(sortField);
        });
    });
}

// Handle header sort click
function handleHeaderSort(field) {
    // Map header field names to API field names
    // Note: Some fields (age, location, status, images, messages, likes) 
    // may not be directly sortable by the API, so we map to closest supported field
    const fieldMap = {
        'id': 'id',
        'username': 'real_name',
        'real_name': 'real_name',
        'email': 'email',
        'age': 'date_joined', // Age not directly sortable, use date_joined as fallback
        'gender': 'gender',
        'location': 'date_joined', // Location not directly sortable, use date_joined as fallback
        'status': 'date_joined', // Status not directly sortable, use date_joined as fallback
        'image_count': 'date_joined', // Image count not directly sortable, use date_joined as fallback
        'messages': 'date_joined', // Messages not directly sortable, use date_joined as fallback
        'likes': 'date_joined', // Likes not directly sortable, use date_joined as fallback
        'last_login': 'last_login'
    };

    const apiField = fieldMap[field] || 'date_joined';

    // Toggle order if clicking the same field, otherwise default to ASC
    if (currentSort.field === apiField) {
        currentSort.order = currentSort.order === 'ASC' ? 'DESC' : 'ASC';
    } else {
        currentSort.field = apiField;
        currentSort.order = 'ASC';
    }

    // Update UI
    updateSortIndicators();
    
    // Update filter dropdowns
    document.getElementById('sortBy').value = apiField;
    document.getElementById('sortOrder').value = currentSort.order;

    // Apply filters with new sort
    applyFilters();
}

// Update sort indicators in table headers
function updateSortIndicators() {
    // Remove all sort classes
    document.querySelectorAll('.users-table th.sortable').forEach(header => {
        header.classList.remove('sorted', 'sorted-asc', 'sorted-desc');
    });

    // Find the header for current sort field
    const fieldMap = {
        'id': 'id',
        'username': 'real_name',
        'real_name': 'real_name',
        'email': 'email',
        'age': 'age',
        'gender': 'gender',
        'location': 'location',
        'status': 'status',
        'image_count': 'image_count',
        'messages': 'messages',
        'likes': 'likes',
        'last_login': 'last_login'
    };

    // Reverse lookup to find header data-sort value
    const headerField = Object.keys(fieldMap).find(key => fieldMap[key] === currentSort.field);
    
    if (headerField) {
        const header = document.querySelector(`.users-table th.sortable[data-sort="${headerField}"]`);
        if (header) {
            header.classList.add('sorted');
            header.classList.add(currentSort.order === 'ASC' ? 'sorted-asc' : 'sorted-desc');
        }
    }
}

// Apply filters
function applyFilters() {
    currentFilters = {
        status: document.getElementById('statusFilter').value,
        gender: document.getElementById('genderFilter').value,
        ageMin: document.getElementById('ageMin').value || null,
        ageMax: document.getElementById('ageMax').value || null,
        emailVerified: document.getElementById('emailVerifiedFilter').value || null,
        hasImages: document.getElementById('hasImagesFilter').value || null,
        sortBy: currentSort.field,
        sortOrder: currentSort.order
    };
    currentPage = 1;
    loadUsers();
}

// Load users with retry logic
async function loadUsers(retryCount = 0) {
    const tbody = document.getElementById('usersTableBody');
    if (retryCount === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="loading">Loading users...</td></tr>';
    }

    // Cancel previous request
    if (currentUsersRequest) {
        currentUsersRequest.abort();
    }
    
    currentUsersRequest = new AbortController();

    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: itemsPerPage,
            ...currentFilters
        });

        const response = await fetch(`/api/users?${params}`, {
            signal: currentUsersRequest.signal
        });
        
        // Handle rate limiting with retry
        if (response.status === 429) {
            const maxRetries = 3;
            if (retryCount < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, retryCount) * 1000;
                tbody.innerHTML = `<tr><td colspan="13" class="loading">Rate limited. Retrying in ${delay/1000}s... (${retryCount + 1}/${maxRetries})</td></tr>`;
                await new Promise(resolve => setTimeout(resolve, delay));
                return loadUsers(retryCount + 1);
            } else {
                throw new Error('Too many requests. Please wait a moment and refresh the page.');
            }
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load users');
        }

        renderUsers(data.users);
        renderPagination(data.pagination);
        updateSortIndicators();
        currentUsersRequest = null; // Clear request on success
    } catch (error) {
        if (error.name === 'AbortError') {
            // Request was cancelled, ignore
            return;
        }
        console.error('Error loading users:', error);
        tbody.innerHTML = `<tr><td colspan="13" class="loading">Error: ${error.message}</td></tr>`;
        currentUsersRequest = null; // Clear request on error
    }
}

// Render users table
function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="loading">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr class="user-row" data-user-id="${user.id}" style="cursor: pointer;">
            <td onclick="event.stopPropagation()"><input type="checkbox" class="user-checkbox" value="${user.id}" onchange="toggleUserSelection(${user.id}, this.checked)"></td>
            <td>${user.id}</td>
            <td>${escapeHtml(user.real_name || user.username || 'N/A')}</td>
            <td>${escapeHtml(user.email || 'N/A')}</td>
            <td>${user.age || 'N/A'}</td>
            <td>${user.gender || 'N/A'}</td>
            <td>${[user.city_name, user.state_name, user.country_name].filter(Boolean).join(', ') || 'N/A'}</td>
            <td><span class="status-badge ${user.status}">${user.status === 'banned' ? 'Suspended' : user.status}</span></td>
            <td>${user.image_count || 0}</td>
            <td>${(user.messages_sent || 0) + (user.messages_received || 0)}</td>
            <td>${(user.likes_received || 0) + (user.likes_given || 0)}</td>
            <td>${user.last_seen || 'Never'}</td>
        </tr>
    `).join('');

    // Add click handlers to rows
    tbody.querySelectorAll('.user-row').forEach(row => {
        row.addEventListener('click', function(e) {
            // Don't trigger if clicking on checkbox
            if (e.target.type === 'checkbox') return;
            const userId = parseInt(this.dataset.userId);
            viewUser(userId);
        });
    });
}

// Render pagination
function renderPagination(pagination) {
    const paginationDiv = document.getElementById('pagination');
    if (!pagination || pagination.pages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = `
        <button ${!pagination.hasPrev ? 'disabled' : ''} onclick="goToPage(${pagination.page - 1})">Previous</button>
        <span class="page-info">Page ${pagination.page} of ${pagination.pages} (${pagination.total} total)</span>
        <button ${!pagination.hasNext ? 'disabled' : ''} onclick="goToPage(${pagination.page + 1})">Next</button>
    `;

    paginationDiv.innerHTML = html;
}

// Go to page
function goToPage(page) {
    currentPage = page;
    loadUsers();
}

// Toggle user selection
function toggleUserSelection(userId, checked) {
    if (checked) {
        selectedUsers.add(userId);
    } else {
        selectedUsers.delete(userId);
        document.getElementById('selectAll').checked = false;
    }
    updateBulkActions();
}

// Update bulk actions visibility
function updateBulkActions() {
    const bulkActions = document.getElementById('bulkActions');
    const selectedCount = document.getElementById('selectedCount');
    
    if (selectedUsers.size > 0) {
        bulkActions.style.display = 'flex';
        selectedCount.textContent = selectedUsers.size;
    } else {
        bulkActions.style.display = 'none';
    }
}

// View user
async function viewUser(userId) {
    const modal = document.getElementById('userModal');
    const modalBody = document.getElementById('userModalBody');
    modal.style.display = 'block';
    modalBody.innerHTML = 'Loading user details...';

    try {
        const response = await fetch(`/api/users/${userId}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load user');
        }

        const user = data.user;
        modalBody.innerHTML = `
            <h2>User Details: ${escapeHtml(user.real_name || user.username || 'N/A')}</h2>
            <div style="margin-top: 20px;">
                <h3>Basic Information</h3>
                <p><strong>ID:</strong> ${user.id}</p>
                <p><strong>Real Name:</strong> ${escapeHtml(user.real_name || user.username || 'N/A')}</p>
                <p><strong>Email:</strong> ${escapeHtml(user.email || 'N/A')}</p>
                <p><strong>Age:</strong> ${user.age || 'N/A'}</p>
                <p><strong>Gender:</strong> ${user.gender || 'N/A'}</p>
                <p><strong>Location:</strong> ${[user.city_name, user.state_name, user.country_name].filter(Boolean).join(', ') || 'N/A'}</p>
                <p><strong>Status:</strong> <span class="status-badge ${user.is_banned ? 'banned' : 'active'}">${user.is_banned ? 'Suspended' : 'Active'}</span></p>
                <p><strong>Email Verified:</strong> ${user.email_verified ? 'Yes' : 'No'}</p>
                <p><strong>Profile Verified:</strong> ${user.profile_verified ? 'Yes' : 'No'}</p>
                <p><strong>Date Joined:</strong> ${new Date(user.date_joined).toLocaleString()}</p>
                <p><strong>Last Login:</strong> ${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</p>
            </div>
            ${user.stats ? `
            <div style="margin-top: 20px;">
                <h3>Statistics</h3>
                <p><strong>Messages Sent:</strong> ${user.stats.messages_sent || 0}</p>
                <p><strong>Messages Received:</strong> ${user.stats.messages_received || 0}</p>
                <p><strong>Likes Received:</strong> ${user.stats.likes_received || 0}</p>
                <p><strong>Likes Given:</strong> ${user.stats.likes_given || 0}</p>
                <p><strong>Profile Views:</strong> ${user.stats.profile_views || 0}</p>
            </div>
            ` : ''}
            <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
                <h3 style="margin-bottom: 15px;">Actions</h3>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="editUser(${user.id})">Edit User</button>
                    ${user.is_banned 
                        ? `<button class="btn btn-secondary" onclick="unbanUser(${user.id})">Unsuspend User</button>`
                        : `<button class="btn btn-danger" onclick="banUser(${user.id})">Suspend User</button>`
                    }
                    ${!user.email_verified 
                        ? `<button class="btn btn-success" onclick="verifyUserEmail(${user.id})">Verify Email</button>`
                        : `<button class="btn btn-warning" onclick="unverifyUserEmail(${user.id})">Unverify Email</button>`
                    }
                    ${!user.profile_verified 
                        ? `<button class="btn btn-success" onclick="verifyUserProfile(${user.id})">Verify Profile</button>`
                        : `<button class="btn btn-warning" onclick="unverifyUserProfile(${user.id})">Unverify Profile</button>`
                    }
                    ${user.real_name !== 'Deleted User' && user.username !== 'Deleted User' 
                        ? `<button class="btn btn-warning" onclick="blacklistUser(${user.id})" style="background: #ff9800; border-color: #ff9800; margin-right: 10px;">Blacklist User</button>
                        <button class="btn btn-danger" onclick="deactivateUserAccount(${user.id})" style="background: #dc3545; border-color: #dc3545;">Delete Account</button>`
                        : `<span style="color: #dc3545; font-weight: bold;">Account Already Deleted</span>`
                    }
                </div>
            </div>
        `;
    } catch (error) {
        modalBody.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
}

// Edit user
async function editUser(userId) {
    const modal = document.getElementById('userModal');
    const modalBody = document.getElementById('userModalBody');
    modal.style.display = 'block';
    modalBody.innerHTML = 'Loading user details...';

    try {
        const response = await fetch(`/api/users/${userId}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load user');
        }

        const user = data.user;
        modalBody.innerHTML = `
            <h2>Edit User: ${escapeHtml(user.real_name || user.username || 'N/A')}</h2>
            <form id="editUserForm" style="margin-top: 20px;">
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">Real Name</label>
                    <input type="text" id="editUsername" value="${escapeHtml(user.real_name || user.username || '')}" 
                           style="width: 100%; max-width: 400px; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">Email</label>
                    <input type="email" id="editEmail" value="${escapeHtml(user.email || '')}" 
                           style="width: 100%; max-width: 400px; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">Gender</label>
                    <select id="editGender" style="width: 100%; max-width: 400px; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px;">
                        <option value="" ${!user.gender ? 'selected' : ''}>Not specified</option>
                        <option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male</option>
                        <option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female</option>
                        <option value="other" ${user.gender === 'other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="editEmailVerified" ${user.email_verified ? 'checked' : ''}>
                        Email Verified
                    </label>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="editProfileVerified" ${user.profile_verified ? 'checked' : ''}>
                        Profile Verified
                    </label>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="editIsBanned" ${user.is_banned ? 'checked' : ''}>
                        Suspended
                    </label>
                </div>
                <div id="editUserMessage" style="margin-bottom: 16px; display: none;"></div>
                <div style="display: flex; gap: 12px; margin-top: 24px;">
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('userModal').style.display='none'">Cancel</button>
                </div>
            </form>
        `;

        // Handle form submission
        document.getElementById('editUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveUserChanges(userId);
        });
    } catch (error) {
        modalBody.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
}

// Save user changes
async function saveUserChanges(userId) {
    const messageDiv = document.getElementById('editUserMessage');
    messageDiv.style.display = 'block';
    messageDiv.innerHTML = 'Saving...';
    messageDiv.style.color = '#666';

    try {
        const updateData = {
            real_name: document.getElementById('editUsername').value.trim(),
            email: document.getElementById('editEmail').value.trim(),
            gender: document.getElementById('editGender').value || null,
            email_verified: document.getElementById('editEmailVerified').checked,
            profile_verified: document.getElementById('editProfileVerified').checked,
            is_banned: document.getElementById('editIsBanned').checked
        };

        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });

        const data = await response.json();

        if (data.success) {
            messageDiv.innerHTML = 'User updated successfully!';
            messageDiv.style.color = '#28a745';
            setTimeout(() => {
                document.getElementById('userModal').style.display = 'none';
                loadUsers();
            }, 1500);
        } else {
            messageDiv.innerHTML = 'Error: ' + (data.error || 'Failed to update user');
            messageDiv.style.color = '#dc3545';
        }
    } catch (error) {
        messageDiv.innerHTML = 'Error: ' + error.message;
        messageDiv.style.color = '#dc3545';
    }
}

// Suspend user
async function banUser(userId) {
    const confirmMessage = `Are you sure you want to SUSPEND this user?\n\n` +
        `Suspending will:\n` +
        `- Prevent the user from logging in\n` +
        `- Set email_verified to false\n` +
        `- User account remains active but inaccessible\n\n` +
        `Note: This is different from anonymizing an account. ` +
        `Suspended users can be unsuspended later.`;
    
    const confirmed = await showConfirm(confirmMessage, 'Suspend User', 'Suspend', 'Cancel', 'warning');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/${userId}/ban`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: '' })
        });

        const data = await response.json();
        if (data.success) {
            showSuccess('User suspended successfully');
            document.getElementById('userModal').style.display = 'none';
            loadUsers();
        } else {
            showError('Error: ' + (data.error || 'Failed to suspend user'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Unsuspend user
async function unbanUser(userId) {
    const confirmed = await showConfirm('Are you sure you want to unsuspend this user?', 'Unsuspend User', 'Unsuspend', 'Cancel', 'info');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/${userId}/ban`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            showSuccess('User unsuspended successfully');
            document.getElementById('userModal').style.display = 'none';
            loadUsers();
        } else {
            showError('Error: ' + (data.error || 'Failed to unsuspend user'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Verify user email
async function verifyUserEmail(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/verify/email`, {
            method: 'POST'
        });

        const data = await response.json();
        if (data.success) {
            showSuccess('Email verified successfully');
            viewUser(userId); // Refresh modal
            loadUsers();
        } else {
            showError('Error: ' + (data.error || 'Failed to verify email'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Unverify user email
async function unverifyUserEmail(userId) {
    const confirmed = await showConfirm('Are you sure you want to unverify this user\'s email?', 'Unverify Email', 'Unverify', 'Cancel', 'warning');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/${userId}/verify/email`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            showSuccess('Email unverified successfully');
            viewUser(userId); // Refresh modal
            loadUsers();
        } else {
            showError('Error: ' + (data.error || 'Failed to unverify email'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Verify user profile
async function verifyUserProfile(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/verify/profile`, {
            method: 'POST'
        });

        const data = await response.json();
        if (data.success) {
            showSuccess('Profile verified successfully');
            viewUser(userId); // Refresh modal
            loadUsers();
        } else {
            showError('Error: ' + (data.error || 'Failed to verify profile'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Unverify user profile
async function unverifyUserProfile(userId) {
    const confirmed = await showConfirm('Are you sure you want to unverify this user\'s profile?', 'Unverify Profile', 'Unverify', 'Cancel', 'warning');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/${userId}/verify/profile`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            showSuccess('Profile unverified successfully');
            viewUser(userId); // Refresh modal
            loadUsers();
        } else {
            showError('Error: ' + (data.error || 'Failed to unverify profile'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Execute bulk operation
async function executeBulkOperation() {
    const operation = document.getElementById('bulkOperation').value;
    if (!operation) {
        showWarning('Please select an operation');
        return;
    }

    if (selectedUsers.size === 0) {
        showWarning('Please select at least one user');
        return;
    }

    // Format operation name for confirmation message
    const operationNames = {
        'ban': 'suspend',
        'unban': 'unsuspend',
        'verify_email': 'verify email for',
        'unverify_email': 'unverify email for',
        'verify_profile': 'verify profile for',
        'unverify_profile': 'unverify profile for',
        'blacklist': 'blacklist',
        'delete': 'delete'
    };
    const operationName = operationNames[operation] || operation.replace(/_/g, ' ');
    
    // For blacklist, get reason and notes
    let requestBody = {
        userIds: Array.from(selectedUsers),
        operation: operation
    };
    
    if (operation === 'blacklist') {
        const reason = prompt('Enter reason for blacklisting (optional):');
        if (reason === null) return; // User cancelled
        
        const notes = prompt('Enter internal notes (optional):');
        if (notes === null) return; // User cancelled
        
        requestBody.data = {
            reason: reason || '',
            notes: notes || ''
        };
    }
    
    const confirmed = await showConfirm(`Are you sure you want to ${operationName} ${selectedUsers.size} user(s)?`, 'Confirm Bulk Operation', 'Confirm', 'Cancel', 'warning');
    if (!confirmed) return;

    try {
        const response = await fetch('/api/users/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        if (data.success) {
            showSuccess(data.message);
            selectedUsers.clear();
            document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = false);
            document.getElementById('selectAll').checked = false;
            updateBulkActions();
            loadUsers();
        } else {
            showError('Error: ' + (data.error || 'Failed to perform bulk operation'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Blacklist user - adds user to admin_blacklisted_users table
async function blacklistUser(userId) {
    const reason = prompt('Enter reason for blacklisting (optional):');
    if (reason === null) return; // User cancelled
    
    const notes = prompt('Enter internal notes (optional):');
    if (notes === null) return; // User cancelled

    const confirmMessage = `⚠️ BLACKLIST USER:\n\n` +
        `This will:\n` +
        `- Add user to blacklist (admin_blacklisted_users table)\n` +
        `- User will be permanently blacklisted\n` +
        `- Reason: ${reason || 'Not specified'}`;
    
    const confirmed = await showConfirm(confirmMessage, 'Blacklist User', 'Blacklist', 'Cancel', 'warning');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/${userId}/blacklist`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reason: reason || '',
                notes: notes || ''
            })
        });

        const data = await response.json();
        if (data.success) {
            showSuccess('User has been blacklisted successfully.');
            document.getElementById('userModal').style.display = 'none';
            loadUsers();
        } else {
            showError('Error: ' + (data.error || 'Failed to blacklist user'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Delete user account (hard delete) - calls DELETE endpoint which permanently deletes the account
async function deactivateUserAccount(userId) {
    const confirmMessage = `This action is PERMANENT and IRREVERSIBLE:\n\n` +
        `This will:\n` +
        `- Permanently delete the user account\n` +
        `- Permanently delete ALL messages (sent and received)\n` +
        `- Permanently delete ALL profile images\n` +
        `- Permanently delete ALL user data (likes, favorites, matches, etc.)\n` +
        `- Receivers will see "Account Deactivated" with real name\n\n` +
        `This action CANNOT be undone. All data will be permanently removed from the database.`;
    
    const confirmed = await showConfirm(confirmMessage, '⚠️ HARD DELETE - Confirm Deletion', 'Delete Permanently', 'Cancel', 'danger');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (data.success) {
            showSuccess('User account permanently deleted.\n\nAll user data has been removed. Receivers will see "Account Deactivated" in their conversation list.');
            document.getElementById('userModal').style.display = 'none';
            loadUsers();
        } else {
            showError('Error: ' + (data.error || 'Failed to delete account'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Utility: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}










