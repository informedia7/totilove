// Admin Export/Import JavaScript

let selectedFile = null;
let fileData = null;

// Setup event listeners
document.addEventListener('DOMContentLoaded', () => {
    setupFileUpload();
    setupExportScope();
});

// Setup file upload drag and drop
function setupFileUpload() {
    const uploadArea = document.getElementById('fileUploadArea');
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
}

// Setup export scope radio buttons
function setupExportScope() {
    document.querySelectorAll('input[name="exportScope"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'selected') {
                document.getElementById('selectedIdsGroup').style.display = 'block';
            } else {
                document.getElementById('selectedIdsGroup').style.display = 'none';
            }
        });
    });
}

// Handle file input change
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// Handle file
function handleFile(file) {
    selectedFile = file;
    const reader = new FileReader();

    reader.onload = (e) => {
        const content = e.target.result;
        const format = document.getElementById('importFormat').value;

        try {
            if (format === 'json') {
                fileData = JSON.parse(content);
            } else {
                // CSV will be parsed on server
                fileData = content;
            }

            displayFileInfo(file);
            displayPreview(fileData, format);
            document.getElementById('importButton').style.display = 'block';
        } catch (error) {
            showStatus('Error parsing file: ' + error.message, 'error');
        }
    };

    reader.readAsText(file);
}

// Display file info
function displayFileInfo(file) {
    const fileInfo = document.getElementById('fileInfo');
    fileInfo.innerHTML = `
        <strong>File:</strong> ${file.name}<br>
        <strong>Size:</strong> ${(file.size / 1024).toFixed(2)} KB<br>
        <strong>Type:</strong> ${file.type || 'text/plain'}
    `;
    fileInfo.classList.add('show');
}

// Display preview
function displayPreview(data, format) {
    const preview = document.getElementById('importPreview');
    
    if (format === 'json' && Array.isArray(data)) {
        if (data.length === 0) {
            preview.innerHTML = '<p>No data found in file</p>';
            preview.style.display = 'block';
            return;
        }

        const headers = Object.keys(data[0]);
        let html = '<table><thead><tr>';
        headers.forEach(header => {
            html += `<th>${escapeHtml(header)}</th>`;
        });
        html += '</tr></thead><tbody>';

        // Show first 10 rows
        const rowsToShow = Math.min(10, data.length);
        for (let i = 0; i < rowsToShow; i++) {
            html += '<tr>';
            headers.forEach(header => {
                const value = data[i][header];
                html += `<td>${escapeHtml(String(value || ''))}</td>`;
            });
            html += '</tr>';
        }
        html += '</tbody></table>';

        if (data.length > 10) {
            html += `<p style="margin-top: 8px; color: #666;">Showing first 10 of ${data.length} rows</p>`;
        }

        preview.innerHTML = html;
        preview.style.display = 'block';
    } else {
        preview.innerHTML = '<p>Preview not available for CSV files</p>';
        preview.style.display = 'block';
    }
}

// Export data
async function exportData() {
    try {
        const exportType = document.getElementById('exportType').value;
        const format = document.getElementById('exportFormat').value;
        const scope = document.querySelector('input[name="exportScope"]:checked').value;
        const search = document.getElementById('exportSearch').value;
        const status = document.getElementById('exportStatus').value;

        let url = `/api/export-import/${exportType}?format=${format}`;
        
        if (search) {
            url += `&search=${encodeURIComponent(search)}`;
        }
        if (status) {
            url += `&status=${status}`;
        }
        if (scope === 'selected') {
            const userIds = document.getElementById('selectedUserIds').value;
            if (!userIds) {
                showWarning('Please enter user IDs');
                return;
            }
            url += `&user_ids=${encodeURIComponent(userIds)}`;
        }

        // Create download link
        const link = document.createElement('a');
        link.href = url;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showStatus('Export started. File will download shortly.', 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        showStatus('Error exporting data: ' + error.message, 'error');
    }
}

// Import data
async function importData() {
    if (!fileData) {
        showStatus('Please select a file first', 'error');
        return;
    }

    const confirmed = await showConfirm(`Are you sure you want to import ${Array.isArray(fileData) ? fileData.length : 'unknown'} users?`, 'Import Users', 'Import', 'Cancel', 'warning');
    if (!confirmed) {
        return;
    }

    try {
        const format = document.getElementById('importFormat').value;

        const response = await fetch('/api/export-import/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                format: format,
                data: fileData
            })
        });

        const result = await response.json();

        if (result.success) {
            showStatus(result.message, 'success');
            
            // Display detailed results
            if (result.results) {
                const details = `
                    <strong>Import Results:</strong><br>
                    ✅ Success: ${result.results.success}<br>
                    ❌ Failed: ${result.results.failed}<br>
                    ${result.results.errors.length > 0 ? `
                        <strong>Errors:</strong><br>
                        ${result.results.errors.slice(0, 10).map(e => `Row ${e.row}: ${e.error}`).join('<br>')}
                        ${result.results.errors.length > 10 ? `<br>... and ${result.results.errors.length - 10} more errors` : ''}
                    ` : ''}
                `;
                showStatus(details, 'info');
            }
        } else {
            showStatus('Error: ' + (result.error || 'Failed to import users'), 'error');
        }
    } catch (error) {
        console.error('Error importing data:', error);
        showStatus('Error importing data: ' + error.message, 'error');
    }
}

// Show status message
function showStatus(message, type) {
    const statusDiv = document.getElementById('importStatus');
    statusDiv.innerHTML = message;
    statusDiv.className = `status-message show ${type}`;
    
    // Scroll to status
    statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (type !== 'info') {
        setTimeout(() => {
            statusDiv.classList.remove('show');
        }, 5000);
    }
}

// Utility functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}




















































