let allMessages = [];
let currentPage = 1;
let totalPages = 1;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadMessages();
    loadStats();
    setupEventListeners();
});

function setupEventListeners() {
    // Filter buttons
    document.getElementById('applyFilters')?.addEventListener('click', () => {
        currentPage = 1;
        loadMessages();
    });

    document.getElementById('clearFilters')?.addEventListener('click', clearFilters);
    document.getElementById('addMessageBtn')?.addEventListener('click', showAddModal);
    document.getElementById('exportCSVBtn')?.addEventListener('click', exportToCSV);
    
    // Search input with debounce
    let searchTimeout;
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentPage = 1;
                loadMessages();
            }, 500);
        });
    }

    // Modal close buttons
    document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
    document.getElementById('closeAddModal').addEventListener('click', closeAddModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
    document.getElementById('cancelAddBtn').addEventListener('click', closeAddModal);

    // Form submissions
    document.getElementById('editForm').addEventListener('submit', handleEditSubmit);
    document.getElementById('addForm').addEventListener('submit', handleAddSubmit);

    // Close modals on outside click
    window.onclick = function(event) {
        const editModal = document.getElementById('editModal');
        const addModal = document.getElementById('addModal');
        if (event.target === editModal) {
            closeEditModal();
        }
        if (event.target === addModal) {
            closeAddModal();
        }
    };
}

async function loadMessages() {
    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: 50
        });

        const messageId = document.getElementById('messageIdFilter').value;
        const search = document.getElementById('searchInput').value;
        const usernameSearch = document.getElementById('usernameSearchInput').value;
        const senderId = document.getElementById('senderFilter').value;
        const receiverId = document.getElementById('receiverFilter').value;
        const status = document.getElementById('statusFilter').value;

        if (messageId) params.append('message_id', messageId);
        if (search) params.append('search', search);
        if (usernameSearch) params.append('username_search', usernameSearch);
        if (senderId) params.append('sender_id', senderId);
        if (receiverId) params.append('receiver_id', receiverId);
        if (status) params.append('status', status);

        const response = await fetch(`/api/messages?${params.toString()}`);
        const data = await response.json();

        if (data.success) {
            allMessages = data.messages;
            displayMessages(data.messages);
            updatePagination(data.pagination);
        } else {
            throw new Error(data.error || 'Failed to load messages');
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        document.getElementById('messagesTableBody').innerHTML = 
            `<tr><td colspan="10" style="text-align: center; padding: 20px; color: red;">Error: ${error.message}</td></tr>`;
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/messages/stats');
        const data = await response.json();

        if (data.success) {
            document.getElementById('totalMessages').textContent = data.stats.totalMessages || 0;
            document.getElementById('recalledMessages').textContent = data.stats.recalledMessages || 0;
            document.getElementById('unreadMessages').textContent = data.stats.unreadMessages || 0;
            document.getElementById('savedMessages').textContent = data.stats.savedMessages || 0;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function displayMessages(messages) {
    const tbody = document.getElementById('messagesTableBody');

    if (messages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px;">No messages found</td></tr>';
        return;
    }

    tbody.innerHTML = messages.map(msg => {
        const recallBadgeClass = `badge-recall-${msg.recall_type || 'none'}`;
        const statusBadgeClass = `badge-${msg.status || 'sent'}`;
        
        return `
            <tr>
                <td><strong>${msg.id || '-'}</strong></td>
                <td>
                    <div>ID: ${msg.sender_id || '-'}</div>
                    <div style="font-size: 11px; color: #666;">@${msg.sender_username || 'Unknown'}</div>
                </td>
                <td>
                    <div>ID: ${msg.receiver_id || '-'}</div>
                    <div style="font-size: 11px; color: #666;">@${msg.receiver_username || 'Unknown'}</div>
                </td>
                <td>
                    <div class="message-content-cell" title="${escapeHtml(msg.message || '')}">
                        ${escapeHtml((msg.message || 'No content').substring(0, 50))}${(msg.message || '').length > 50 ? '...' : ''}
                    </div>
                </td>
                <td>${formatDateTime(msg.timestamp) || '-'}</td>
                <td><span class="badge ${statusBadgeClass}">${msg.status || 'sent'}</span></td>
                <td>${msg.read_at ? formatDateTime(msg.read_at) : '-'}</td>
                <td><span class="badge ${recallBadgeClass}">${msg.recall_type || 'none'}</span></td>
                <td>${(msg.saved_by_sender || msg.saved_by_receiver) ? 'Yes' : 'No'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-sm btn-primary" onclick="editMessage(${msg.id})" title="Edit">✏️</button>
                        <button class="btn-sm btn-danger" onclick="confirmDelete(${msg.id})" title="Delete">🗑️</button>
                        <button class="btn-sm btn-warning" onclick="toggleRecall(${msg.id})" title="Toggle Recall">
                            ${(msg.recall_type && msg.recall_type !== 'none') ? '🔄' : '⏹️'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updatePagination(pagination) {
    const paginationDiv = document.getElementById('pagination');
    const { current_page, total_pages, has_next, has_prev } = pagination;

    currentPage = current_page;
    totalPages = total_pages;

    let html = '';

    if (has_prev) {
        html += `<button onclick="changePage(${currentPage - 1})">← Previous</button>`;
    }

    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }

    if (has_next) {
        html += `<button onclick="changePage(${currentPage + 1})">Next →</button>`;
    }

    paginationDiv.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    loadMessages();
}

function clearFilters() {
    document.getElementById('messageIdFilter').value = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('usernameSearchInput').value = '';
    document.getElementById('senderFilter').value = '';
    document.getElementById('receiverFilter').value = '';
    document.getElementById('statusFilter').value = '';
    currentPage = 1;
    loadMessages();
}

function editMessage(messageId) {
    const message = allMessages.find(m => m.id === messageId);
    if (!message) {
        showError('Message not found');
        return;
    }

    document.getElementById('editMessageId').value = message.id;
    document.getElementById('editSenderId').value = message.sender_id;
    document.getElementById('editReceiverId').value = message.receiver_id;
    document.getElementById('editContent').value = message.message || '';
    document.getElementById('editStatus').value = message.status || 'sent';
    document.getElementById('editRecallType').value = message.recall_type || 'none';
    document.getElementById('editSavedBySender').value = message.saved_by_sender ? 'true' : 'false';
    document.getElementById('editSavedByReceiver').value = message.saved_by_receiver ? 'true' : 'false';

    document.getElementById('editModal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

function showAddModal() {
    document.getElementById('addModal').style.display = 'block';
}

function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
}

async function handleEditSubmit(e) {
    e.preventDefault();

    try {
        const messageId = document.getElementById('editMessageId').value;
        const formData = {
            sender_id: parseInt(document.getElementById('editSenderId').value),
            receiver_id: parseInt(document.getElementById('editReceiverId').value),
            message: document.getElementById('editContent').value,
            status: document.getElementById('editStatus').value,
            recall_type: document.getElementById('editRecallType').value,
            saved_by_sender: document.getElementById('editSavedBySender').value === 'true',
            saved_by_receiver: document.getElementById('editSavedByReceiver').value === 'true'
        };

        const response = await fetch(`/api/messages/${messageId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Message updated successfully!');
            closeEditModal();
            loadMessages();
            loadStats();
        } else {
            throw new Error(data.error || 'Failed to update message');
        }
    } catch (error) {
        console.error('Error updating message:', error);
        showError(`Error: ${error.message}`);
    }
}

async function handleAddSubmit(e) {
    e.preventDefault();

    try {
        const formData = {
            sender_id: parseInt(document.getElementById('addSenderId').value),
            receiver_id: parseInt(document.getElementById('addReceiverId').value),
            message: document.getElementById('addContent').value,
            status: document.getElementById('addStatus').value
        };

        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Message added successfully!');
            closeAddModal();
            document.getElementById('addForm').reset();
            currentPage = 1;
            loadMessages();
            loadStats();
        } else {
            throw new Error(data.error || 'Failed to add message');
        }
    } catch (error) {
        console.error('Error adding message:', error);
        showError(`Error: ${error.message}`);
    }
}

async function confirmDelete(messageId) {
    const confirmed = await showConfirm('Are you sure you want to delete this message? This action cannot be undone.', 'Delete Message', 'Delete', 'Cancel', 'danger');
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/messages/${messageId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Message deleted successfully!');
            loadMessages();
            loadStats();
        } else {
            throw new Error(data.error || 'Failed to delete message');
        }
    } catch (error) {
        console.error('Error deleting message:', error);
        showError(`Error: ${error.message}`);
    }
}

async function toggleRecall(messageId) {
    try {
        const response = await fetch(`/api/messages/${messageId}/toggle-recall`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(`Message recall ${data.recall_type !== 'none' ? 'enabled' : 'disabled'}!`);
            loadMessages();
        } else {
            throw new Error(data.error || 'Failed to toggle recall');
        }
    } catch (error) {
        console.error('Error toggling recall:', error);
        showError(`Error: ${error.message}`);
    }
}

function exportToCSV() {
    if (allMessages.length === 0) {
        showWarning('No messages to export');
        return;
    }

    const headers = ['ID', 'Sender ID', 'Sender Username', 'Receiver ID', 'Receiver Username', 'Message', 'Timestamp', 'Status', 'Read At', 'Recall Type', 'Saved'];
    const csvContent = [
        headers.join(','),
        ...allMessages.map(msg => [
            msg.id,
            msg.sender_id,
            `"${(msg.sender_username || '').replace(/"/g, '""')}"`,
            msg.receiver_id,
            `"${(msg.receiver_username || '').replace(/"/g, '""')}"`,
            `"${(msg.message || '').replace(/"/g, '""')}"`,
            msg.timestamp,
            msg.status,
            msg.read_at || '',
            msg.recall_type || 'none',
            (msg.saved_by_sender || msg.saved_by_receiver) ? 'Yes' : 'No'
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `messages_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function formatDateTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}



















































