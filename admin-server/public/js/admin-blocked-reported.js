// Admin Blocked & Reported Users JavaScript

let currentTab = 'blocked';
let currentPage = {
    blocked: 1,
    reported: 1
};
let currentFilters = {
    blocked: {},
    reported: {}
};

// Load data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadStatistics();
    loadBlockedUsers();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Search input with debounce
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            applyFilters();
        }, 500);
    });
}

// Switch tabs
function switchTab(tab, event) {
    currentTab = tab;
    
    // Validate tab exists
    const tabContent = document.getElementById(tab + 'Tab');
    if (!tabContent) {
        console.error(`Tab ${tab} not found`);
        return;
    }
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Use event parameter if provided, otherwise find the button
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: find button with matching onclick
        const buttons = document.querySelectorAll('.tab-btn');
        buttons.forEach(btn => {
            if (btn.onclick && btn.onclick.toString().includes(`switchTab('${tab}'`)) {
                btn.classList.add('active');
            }
        });
    }
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    tabContent.classList.add('active');
    
    // Load data for selected tab
    if (tab === 'blocked') {
        loadBlockedUsers();
    } else {
        loadReportedUsers();
    }
}

// Load statistics
async function loadStatistics() {
    try {
        const response = await fetch('/api/blocked-reported/statistics');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load statistics');
        }

        const stats = data.statistics;

        // Update stat boxes
        document.getElementById('totalBlocks').textContent = stats.blocked?.total_blocks || 0;
        document.getElementById('totalReports').textContent = stats.reported?.total_reports || 0;
        document.getElementById('pendingReports').textContent = stats.reported?.pending_reports || 0;
        document.getElementById('blocks7Days').textContent = stats.blocked?.blocks_last_7_days || 0;
        document.getElementById('reports7Days').textContent = stats.reported?.reports_last_7_days || 0;
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Load blocked users
async function loadBlockedUsers() {
    try {
        const filters = {
            ...currentFilters.blocked,
            page: currentPage.blocked,
            limit: 20,
            search: document.getElementById('searchInput').value,
            sort_by: document.getElementById('sortBy').value,
            sort_order: document.getElementById('sortOrder').value
        };

        const queryString = new URLSearchParams(filters).toString();
        const response = await fetch(`/api/blocked-reported/blocked?${queryString}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load blocked users');
        }

        renderBlockedUsers(data.data, data.pagination);
    } catch (error) {
        console.error('Error loading blocked users:', error);
        document.getElementById('blockedUsersTableBody').innerHTML = 
            '<tr><td colspan="7" class="loading">Error loading data</td></tr>';
    }
}

// Load reported users
async function loadReportedUsers() {
    try {
        const filters = {
            ...currentFilters.reported,
            page: currentPage.reported,
            limit: 20,
            search: document.getElementById('searchInput').value,
            sort_by: document.getElementById('sortBy').value,
            sort_order: document.getElementById('sortOrder').value
        };

        const queryString = new URLSearchParams(filters).toString();
        const response = await fetch(`/api/blocked-reported/reported?${queryString}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load reported users');
        }

        renderReportedUsers(data.data, data.pagination);
    } catch (error) {
        console.error('Error loading reported users:', error);
        document.getElementById('reportedUsersTableBody').innerHTML = 
            '<tr><td colspan="8" class="loading">Error loading data</td></tr>';
    }
}

// Render blocked users table
function renderBlockedUsers(users, pagination) {
    const tbody = document.getElementById('blockedUsersTableBody');

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No blocked users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(block => `
        <tr>
            <td>${block.id}</td>
            <td>
                <strong>${escapeHtml(block.blocker_username)}</strong><br>
                <small>${escapeHtml(block.blocker_email)}</small><br>
                <small>ID: ${block.blocker_id}</small>
            </td>
            <td>
                <strong>${escapeHtml(block.blocked_username)}</strong><br>
                <small>${escapeHtml(block.blocked_email)}</small><br>
                <small>ID: ${block.blocked_id}</small>
            </td>
            <td>${block.reason ? escapeHtml(block.reason) : '<em>No reason</em>'}</td>
            <td>${formatDate(block.created_at)}</td>
            <td>
                <span class="status-badge ${block.total_blocks_received > 5 ? 'banned' : 'active'}">
                    ${block.total_blocks_received} blocks
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view" onclick="viewMessages(${block.blocker_id}, ${block.blocked_id})">
                        View Messages
                    </button>
                    <button class="action-btn ban" onclick="unblockUser(${block.id})">
                        Unblock
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    renderPagination('blockedPagination', pagination, 'blocked');
}

// Render reported users table
function renderReportedUsers(reports, pagination) {
    const tbody = document.getElementById('reportedUsersTableBody');

    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No reported users found</td></tr>';
        return;
    }

    tbody.innerHTML = reports.map(report => `
        <tr>
            <td>${report.id}</td>
            <td>
                <strong>${escapeHtml(report.reporter_username)}</strong><br>
                <small>${escapeHtml(report.reporter_email)}</small><br>
                <small>ID: ${report.reporter_id}</small>
            </td>
            <td>
                <strong>${escapeHtml(report.reported_username)}</strong><br>
                <small>${escapeHtml(report.reported_email)}</small><br>
                <small>ID: ${report.reported_user_id}</small>
            </td>
            <td>${report.reason ? escapeHtml(report.reason) : '<em>No reason</em>'}</td>
            <td>${formatDate(report.created_at || report.report_date)}</td>
            <td>
                <span class="status-badge ${report.status === 'pending' ? 'pending' : report.status === 'resolved' ? 'active' : 'failed'}">
                    ${report.status || 'pending'}
                </span>
            </td>
            <td>
                <span class="status-badge ${report.total_reports_received > 5 ? 'banned' : 'active'}">
                    ${report.total_reports_received} reports
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view" onclick="viewMessages(${report.reporter_id}, ${report.reported_user_id})">
                        View Messages
                    </button>
                    ${report.status === 'pending' ? `
                        <button class="action-btn edit" onclick="updateReportStatus(${report.id}, 'resolved')">
                            Resolve
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');

    renderPagination('reportedPagination', pagination, 'reported');
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
        <button ${page === 1 ? 'disabled' : ''} onclick="changePage(${page - 1}, '${type}')">Previous</button>
        <span class="page-info">Page ${page} of ${totalPages}</span>
        <button ${page === totalPages ? 'disabled' : ''} onclick="changePage(${page + 1}, '${type}')">Next</button>
    `;
}

// Change page
function changePage(newPage, type) {
    currentPage[type] = newPage;
    if (type === 'blocked') {
        loadBlockedUsers();
    } else {
        loadReportedUsers();
    }
}

// Apply filters
function applyFilters() {
    currentPage[currentTab] = 1;
    if (currentTab === 'blocked') {
        loadBlockedUsers();
    } else {
        loadReportedUsers();
    }
}

// View messages between users
async function viewMessages(userId1, userId2) {
    try {
        const response = await fetch(`/api/blocked-reported/messages?user_id_1=${userId1}&user_id_2=${userId2}&limit=50`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load messages');
        }

        const messagesList = document.getElementById('messagesList');
        if (data.messages.length === 0) {
            messagesList.innerHTML = '<p>No messages found between these users.</p>';
        } else {
            messagesList.innerHTML = data.messages.map(msg => `
                <div class="message-item">
                    <div class="message-header">
                        <strong>${escapeHtml(msg.sender_username)}</strong> → ${escapeHtml(msg.receiver_username)}
                        <small>${formatDate(msg.timestamp)}</small>
                    </div>
                    <div class="message-content">
                        ${msg.is_image ? '<em>[Image]</em>' : escapeHtml(msg.message)}
                    </div>
                </div>
            `).join('');
        }

        document.getElementById('messagesModal').style.display = 'block';
    } catch (error) {
        console.error('Error loading messages:', error);
        showError('Failed to load messages: ' + error.message);
    }
}

// Close messages modal
function closeMessagesModal() {
    document.getElementById('messagesModal').style.display = 'none';
}

// Unblock user
async function unblockUser(blockId) {
    const confirmed = await showConfirm('Are you sure you want to unblock this user?', 'Unblock User', 'Unblock', 'Cancel', 'info');
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/blocked-reported/blocked/${blockId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to unblock user');
        }

        showSuccess('User unblocked successfully');
        loadBlockedUsers();
        loadStatistics();
    } catch (error) {
        console.error('Error unblocking user:', error);
        showError('Failed to unblock user: ' + error.message);
    }
}

// Update report status
async function updateReportStatus(reportId, status) {
    try {
        const response = await fetch(`/api/blocked-reported/reported/${reportId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to update report status');
        }

        showSuccess('Report status updated successfully');
        loadReportedUsers();
        loadStatistics();
    } catch (error) {
        console.error('Error updating report status:', error);
        showError('Failed to update report status: ' + error.message);
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

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('messagesModal');
    if (event.target === modal) {
        closeMessagesModal();
    }
}




















































