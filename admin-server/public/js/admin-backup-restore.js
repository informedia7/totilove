// Admin Backup & Restore JavaScript

let backups = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    checkPostgreSQLTools();
    loadBackups();
    
    // Setup confirm input handler
    const confirmInput = document.getElementById('confirmInput');
    const confirmBtn = document.getElementById('confirmRestoreBtn');
    
    if (confirmInput && confirmBtn) {
        confirmInput.addEventListener('input', function() {
            if (this.value.toUpperCase() === 'RESTORE') {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '1';
            } else {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
            }
        });
        
        confirmInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !confirmBtn.disabled) {
                confirmRestore();
            }
        });
    }
});

// Check PostgreSQL tools availability
async function checkPostgreSQLTools() {
    try {
        const response = await fetch('/api/backup/check-tools', {
            credentials: 'include'
        });
        const data = await response.json();
        
        const toolsCheck = document.getElementById('toolsCheck');
        const toolsStatus = document.getElementById('toolsStatus');
        
        if (!data.available) {
            toolsCheck.style.display = 'block';
            
            let suggestionsHtml = '';
            if (data.suggestions && data.suggestions.length > 0) {
                suggestionsHtml = `
                    <p style="margin: 1rem 0 0.5rem 0;"><strong>💡 Suggested paths found:</strong></p>
                    <ul style="margin: 0.5rem 0 1rem 0; padding-left: 1.5rem;">
                        ${data.suggestions.map(path => `
                            <li style="margin: 0.25rem 0;">
                                <code style="background: #f8f9fa; padding: 0.25rem 0.5rem; border-radius: 4px;">${escapeHtml(path)}</code>
                            </li>
                        `).join('')}
                    </ul>
                    <p style="margin: 0.5rem 0 0 0;">Add this to your <code>.env</code> file in the <code>admin-server</code> directory:</p>
                    <p style="margin: 0.5rem 0 0 0;"><code style="background: #f8f9fa; padding: 0.5rem; border-radius: 4px; display: block;">PG_BIN_PATH="${escapeHtml(data.suggestions[0])}"</code></p>
                `;
            }
            
            toolsStatus.innerHTML = `
                <div class="warning-box">
                    <strong>❌ PostgreSQL tools not found!</strong>
                    <p style="margin: 0.5rem 0 0 0;">${escapeHtml(data.error)}</p>
                    ${suggestionsHtml}
                    <p style="margin: 1rem 0 0.5rem 0;"><strong>Alternative solutions:</strong></p>
                    <ol style="margin: 0.5rem 0 0 0; padding-left: 1.5rem;">
                        <li style="margin: 0.25rem 0;">Run the find script: <code>node admin-server/scripts/find-postgresql.js</code></li>
                        <li style="margin: 0.25rem 0;">Manually find your PostgreSQL installation and set <code>PG_BIN_PATH</code></li>
                        <li style="margin: 0.25rem 0;">Add PostgreSQL bin directory to your system PATH</li>
                    </ol>
                </div>
            `;
        } else {
            toolsCheck.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking PostgreSQL tools:', error);
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.className = `status-message ${type}`;
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    
    // Auto-hide after 5 seconds for success/info
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

// Create backup
async function createBackup() {
    const backupNameInput = document.getElementById('backupName');
    const createBtn = document.getElementById('createBackupBtn');
    const progressDiv = document.getElementById('backupProgress');
    
    const backupName = backupNameInput.value.trim();
    
    createBtn.disabled = true;
    progressDiv.style.display = 'block';
    
    try {
        const response = await fetch('/api/backup/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                name: backupName || undefined
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus(`✅ Backup created successfully: ${data.backup.name}`, 'success');
            backupNameInput.value = '';
            loadBackups();
        } else {
            showStatus(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
        createBtn.disabled = false;
        progressDiv.style.display = 'none';
    }
}

// Load backups list
async function loadBackups() {
    const backupList = document.getElementById('backupList');
    const restoreSelect = document.getElementById('restoreBackupSelect');
    
    backupList.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--muted-color);"><div class="loading"></div> Loading backups...</div>';
    
    try {
        const response = await fetch('/api/backup/list', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            backups = data.backups;
            
            // Update restore select
            restoreSelect.innerHTML = '<option value="">Select a backup to restore...</option>';
            if (backups.length > 0) {
                backups.forEach(backup => {
                    const option = document.createElement('option');
                    option.value = backup.name;
                    option.textContent = backup.name;
                    restoreSelect.appendChild(option);
                });
                document.getElementById('restoreBackupBtn').disabled = false;
            } else {
                document.getElementById('restoreBackupBtn').disabled = true;
            }
            
            // Update backup list
            if (backups.length === 0) {
                backupList.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--muted-color);">No backups found. Create your first backup above.</div>';
            } else {
                backupList.innerHTML = backups.map(backup => {
                    const sizeMB = (backup.size / 1024 / 1024).toFixed(2);
                    const date = new Date(backup.mtime).toLocaleString();
                    const createdBy = backup.info?.createdBy ? ` by ${backup.info.createdBy}` : '';
                    
                    return `
                        <div class="backup-item">
                            <div class="backup-item-info">
                                <div class="backup-item-name">${escapeHtml(backup.name)}</div>
                                <div class="backup-item-details">
                                    📅 ${date} • 💾 ${sizeMB} MB${createdBy}
                                </div>
                            </div>
                            <div class="backup-item-actions">
                                <button class="btn btn-secondary" onclick="restoreBackupFromList('${backup.name}')" style="font-size: 0.85rem; padding: 0.5rem 1rem;">
                                    <i class="fas fa-undo"></i> Restore
                                </button>
                                <button class="btn btn-danger" onclick="deleteBackup('${backup.name}')" style="font-size: 0.85rem; padding: 0.5rem 1rem;">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } else {
            backupList.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--danger-color);">Error: ${data.error}</div>`;
        }
    } catch (error) {
        backupList.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--danger-color);">Error: ${error.message}</div>`;
    }
}

// Restore backup from select
function restoreBackup() {
    const select = document.getElementById('restoreBackupSelect');
    const backupName = select.value;
    
    if (!backupName) {
        showStatus('Please select a backup to restore', 'error');
        return;
    }
    
    showConfirmModal(backupName);
}

// Restore backup from list
function restoreBackupFromList(backupName) {
    showConfirmModal(backupName);
}

// Show confirmation modal
function showConfirmModal(backupName) {
    const modal = document.getElementById('confirmModal');
    const message = document.getElementById('confirmMessage');
    const input = document.getElementById('confirmInput');
    const btn = document.getElementById('confirmRestoreBtn');
    
    window.pendingRestoreName = backupName;
    message.textContent = `You are about to restore backup: "${backupName}". This will replace your current database.`;
    input.value = '';
    btn.disabled = true;
    btn.style.opacity = '0.5';
    modal.style.display = 'flex';
    input.focus();
}

// Close confirmation modal
function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
}

// Confirm and perform restore
async function confirmRestore() {
    const select = document.getElementById('restoreBackupSelect');
    const backupName = select.value || window.pendingRestoreName;
    const restoreBtn = document.getElementById('restoreBackupBtn');
    const progressDiv = document.getElementById('restoreProgress');
    
    if (!backupName) {
        showStatus('No backup selected', 'error');
        return;
    }
    
    closeConfirmModal();
    restoreBtn.disabled = true;
    progressDiv.style.display = 'block';
    
    try {
        const response = await fetch('/api/backup/restore', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                name: backupName
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus(`✅ Database restored successfully from: ${data.backup.name}`, 'success');
            loadBackups();
            
            // Reload page after 2 seconds to ensure fresh data
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            showStatus(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
        restoreBtn.disabled = false;
        progressDiv.style.display = 'none';
    }
}

// Delete backup
async function deleteBackup(backupName) {
    const confirmed = await showConfirm(`Are you sure you want to delete backup "${backupName}"?`, 'Delete Backup', 'Delete', 'Cancel', 'danger');
    if (!confirmed) {
        return;
    }
    
    try {
        const response = await fetch(`/api/backup/${encodeURIComponent(backupName)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus(`✅ Backup deleted: ${backupName}`, 'success');
            loadBackups();
        } else {
            showStatus(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Error: ${error.message}`, 'error');
    }
}

// Utility: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

