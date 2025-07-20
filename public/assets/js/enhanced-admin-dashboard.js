// Enhanced Admin Dashboard JavaScript
class AdminDashboard {
    constructor() {
        this.init();
    }

    async init() {
        try {
            await this.loadStats();
            await this.loadUsers();
            this.setupSearch();
            this.showDashboard();
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
        }
    }

    async loadStats() {
        try {
            const response = await fetch('/api/admin/stats');
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('total-users').textContent = data.stats.totalUsers;
                document.getElementById('active-users').textContent = data.stats.activeUsers;
                document.getElementById('total-reports').textContent = data.stats.totalReports;
                document.getElementById('blocked-users').textContent = data.stats.blockedUsers;
                
                // Admin stats (placeholder values)
                document.getElementById('total-admins').textContent = '2';
                document.getElementById('active-sessions').textContent = '1';
                document.getElementById('managed-users').textContent = data.stats.totalUsers;
                document.getElementById('moderation-queue').textContent = '0';
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
            this.showStatsError('Failed to load statistics');
        }
    }

    async loadUsers() {
        try {
            const response = await fetch('/api/admin/users');
            const data = await response.json();
            
            if (data.success) {
                this.renderUsers(data.users);
            }
        } catch (error) {
            console.error('Failed to load users:', error);
            this.showUsersError('Failed to load users');
        }
    }

    renderUsers(users) {
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            const joinDate = new Date(user.date_joined).toLocaleDateString();
            const lastLogin = user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never';
            
            // Determine status based on last login
            let status = 'dormant';
            let statusText = 'Dormant';
            if (user.last_login) {
                const daysSinceLogin = (Date.now() - new Date(user.last_login)) / (1000 * 60 * 60 * 24);
                if (daysSinceLogin <= 7) {
                    status = 'active';
                    statusText = 'Active';
                } else if (daysSinceLogin <= 30) {
                    status = 'inactive';
                    statusText = 'Inactive';
                }
            }

            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username || 'N/A'}</td>
                <td>${user.email || 'N/A'}</td>
                <td><span class="status-badge status-${status}">${statusText}</span></td>
                <td>${joinDate}</td>
                <td>
                    <button class="action-btn btn-edit" onclick="editUser(${user.id})">Edit</button>
                    <button class="action-btn btn-delete" onclick="deleteUser(${user.id})">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    setupSearch() {
        const searchBox = document.getElementById('user-search');
        searchBox.addEventListener('input', (e) => {
            this.filterUsers(e.target.value);
        });
    }

    filterUsers(searchTerm) {
        const rows = document.querySelectorAll('#users-tbody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            const matches = text.includes(searchTerm.toLowerCase());
            row.style.display = matches ? '' : 'none';
        });
    }

    showDashboard() {
        document.getElementById('dashboard').style.display = 'block';
    }

    showStatsError(message) {
        const errorDiv = document.getElementById('stats-error-message');
        errorDiv.innerHTML = `<div style="color: red; padding: 1rem; background: #ffe6e6; border-radius: 4px; margin-bottom: 1rem;">${message}</div>`;
        errorDiv.style.display = 'block';
    }

    showUsersError(message) {
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center; padding: 2rem;">${message}</td></tr>`;
    }

    // Placeholder functions for admin sections
    loadAdminUsers() {
        const tbody = document.getElementById('admin-users-tbody');
        tbody.innerHTML = `
            <tr>
                <td>admin</td>
                <td>Super Admin</td>
                <td><span class="status-badge status-active">Active</span></td>
                <td>
                    <button class="action-btn btn-edit">Edit</button>
                </td>
            </tr>
        `;
    }

    loadAdminSessions() {
        const tbody = document.getElementById('admin-sessions-tbody');
        tbody.innerHTML = `
            <tr>
                <td>admin</td>
                <td>127.0.0.1</td>
                <td><span class="status-badge status-active">Active</span></td>
                <td>${new Date().toLocaleDateString()}</td>
            </tr>
        `;
    }

    loadContentReports() {
        const tbody = document.getElementById('content-reports-tbody');
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: #7f8c8d;">No reports to display</td>
            </tr>
        `;
    }

    loadModerationQueue() {
        const tbody = document.getElementById('moderation-queue-tbody');
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: #7f8c8d;">Queue is empty</td>
            </tr>
        `;
    }

    loadAdminActions() {
        const tbody = document.getElementById('admin-actions-tbody');
        tbody.innerHTML = `
            <tr>
                <td>admin</td>
                <td>Dashboard Access</td>
                <td>System</td>
                <td>${new Date().toLocaleDateString()}</td>
            </tr>
        `;
    }

    loadSystemLogs() {
        const tbody = document.getElementById('system-logs-tbody');
        tbody.innerHTML = `
            <tr>
                <td><span class="status-badge status-active">INFO</span></td>
                <td>Dashboard loaded successfully</td>
                <td>System</td>
                <td>${new Date().toLocaleDateString()}</td>
            </tr>
        `;
    }
}

// Global functions for user actions
function editUser(userId) {
    alert(`Edit user functionality for user ID: ${userId} (To be implemented)`);
}

function deleteUser(userId) {
    if (confirm(`Are you sure you want to delete user ${userId}?`)) {
        alert(`Delete user functionality for user ID: ${userId} (To be implemented)`);
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new AdminDashboard();
    
    // Load admin sections with placeholder data
    setTimeout(() => {
        dashboard.loadAdminUsers();
        dashboard.loadAdminSessions();
        dashboard.loadContentReports();
        dashboard.loadModerationQueue();
        dashboard.loadAdminActions();
        dashboard.loadSystemLogs();
    }, 1000);
});
