// Admin Export/Import JavaScript

let selectedFile = null;
let fileData = null;
const folderCollapsedState = {};

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupFileUpload();
    setupExportScope();
    setupUploadsZipUi();
    refreshUploadsGallery().catch(() => {});
});

// ── Uploads Folder: ZIP upload UI ─────────────────────────────────────────────
let selectedUploadsZip = null;

function setupUploadsZipUi() {
    const input = document.getElementById('uploadsZipInput');
    const dz = document.getElementById('uploadsZipDropzone');
    const meta = document.getElementById('uploadsZipMeta');
    const btn = document.getElementById('uploadsZipUploadBtn');
    if (!input || !dz || !meta || !btn) return;

    function setMeta(file) {
        if (!file) {
            meta.textContent = 'No file selected';
            btn.disabled = true;
            return;
        }
        meta.textContent = `${file.name} (${fmtBytes(file.size)})`;
        btn.disabled = false;
    }

    input.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
        selectedUploadsZip = file;
        setMeta(file);
    });

    const prevent = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, prevent));
    dz.addEventListener('dragover', () => dz.classList.add('dragover'));
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => {
        dz.classList.remove('dragover');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0] ? e.dataTransfer.files[0] : null;
        if (!file) return;
        if (!String(file.name || '').toLowerCase().endsWith('.zip')) {
            setUploadsStatus('❌ Only .zip files are allowed', 'error');
            return;
        }
        selectedUploadsZip = file;
        // reflect selection in input for user visibility
        try { input.files = e.dataTransfer.files; } catch {}
        setMeta(file);
    });
}

function clearUploadsZip() {
    selectedUploadsZip = null;
    const input = document.getElementById('uploadsZipInput');
    const meta = document.getElementById('uploadsZipMeta');
    const btn = document.getElementById('uploadsZipUploadBtn');
    if (input) input.value = '';
    if (meta) meta.textContent = 'No file selected';
    if (btn) btn.disabled = true;
}

async function uploadUploadsZip() {
    const btn = document.getElementById('uploadsZipUploadBtn');
    const note = document.getElementById('uploadsZipUploadNote');
    const overwrite = document.getElementById('uploadsZipOverwrite');

    if (!selectedUploadsZip) {
        setUploadsStatus('❌ Select a ZIP file first', 'error');
        return;
    }

    if (btn) btn.disabled = true;
    if (note) note.textContent = 'Uploading…';
    setUploadsStatus('Uploading ZIP to server…', 'info');

    try {
        const form = new FormData();
        form.append('zip', selectedUploadsZip);
        form.append('overwrite', overwrite && overwrite.checked ? 'true' : 'false');

        const res = await fetch('/api/export-import/images', {
            method: 'POST',
            body: form
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
            throw new Error(json.error || 'Upload failed');
        }

        const data = json.data || {};
        setUploadsStatus(
            `✅ Imported ZIP into <code>${escapeHtml(data.uploadsRoot || '')}</code>. Extracted ${Number(data.extractedFiles || 0)} files, skipped ${Number(data.skippedFiles || 0)}.`,
            'success'
        );
        clearUploadsZip();
        // Refresh scan + gallery (best effort)
        refreshUploadsGallery().catch(() => {});
    } catch (e) {
        setUploadsStatus('❌ ' + escapeHtml(e.message), 'error');
    } finally {
        if (btn) btn.disabled = !selectedUploadsZip;
        if (note) note.textContent = '';
    }
}

// ── Uploads Folder: Gallery ──────────────────────────────────────────────────
async function refreshUploadsGallery() {
    const folderEl = document.getElementById('uploadsGalleryFolder');
    const limitEl = document.getElementById('uploadsGalleryLimit');
    const grid = document.getElementById('uploadsGallery');
    const meta = document.getElementById('uploadsGalleryMeta');
    const btn = document.getElementById('uploadsGalleryRefreshBtn');

    if (!folderEl || !limitEl || !grid || !meta) return;

    const folder = folderEl.value;
    const limit = limitEl.value;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Refreshing…';
    }

    grid.innerHTML = '';
    meta.textContent = 'Loading…';

    try {
        const res = await fetch(`/api/export-import/images/list?folder=${encodeURIComponent(folder)}&limit=${encodeURIComponent(limit)}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.error || 'Failed to list files');
        }

        const data = json.data || {};
        const files = Array.isArray(data.files) ? data.files : [];
        if (files.length === 0) {
            meta.textContent = `No files found in ${folder}.`;
            return;
        }

        const html = files.map(f => {
            const url = f.url;
            const name = escapeHtml(f.name || '');
            const size = fmtBytes(Number(f.size || 0));
            const mod = fmtDate(f.modifiedAt);
            const href = escapeHtml(url);
            return `
                <div class="uploads-thumb">
                    <a href="${href}" target="_blank" rel="noopener">
                        <img src="${href}" alt="${name}" loading="lazy" onerror="this.style.display='none'">
                    </a>
                    <div class="uploads-thumb-meta">
                        <a href="${href}" target="_blank" rel="noopener" title="${name}">open</a>
                        <span title="${name}">${size}</span>
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML = html;
        meta.textContent = `Showing ${files.length} / ${Number(data.total || files.length)} files from ${folder}.`;
    } catch (e) {
        meta.textContent = '';
        setUploadsStatus('❌ ' + escapeHtml(e.message), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Refresh';
        }
    }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', ['uploads','data','import'][i] === name);
    });
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setUploadsStatus(msg, type) {
    const el = document.getElementById('uploadsStatus');
    el.innerHTML = msg;
    el.className = 'status-message show ' + (type || '');
    if (type !== 'info') setTimeout(() => el.classList.remove('show'), 6000);
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('importStatus');
    statusDiv.innerHTML = message;
    statusDiv.className = `status-message show ${type}`;
    statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (type !== 'info') setTimeout(() => statusDiv.classList.remove('show'), 5000);
}

function setExportStatus(msg, type) {
    const el = document.getElementById('exportStatus2');
    if (!el) return;
    el.innerHTML = msg;
    el.className = 'status-message show ' + (type || '');
    if (type !== 'info') setTimeout(() => el.classList.remove('show'), 5000);
}

// ── Uploads Folder: Scan ─────────────────────────────────────────────────────
async function scanUploads() {
    const panel = document.getElementById('uploadsPanel');
    const btn = document.getElementById('scanBtn');
    const dlBtn = document.getElementById('dlAllBtn');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Scanning…';
    panel.innerHTML = '<div class="scan-placeholder"><span class="spinner"></span> Scanning folder on server…</div>';
    dlBtn.disabled = true;
    setUploadsStatus('', '');

    try {
        const res = await fetch('/api/export-import/images/info');
        const scanHdr = res.headers.get('X-Totilove-Uploads-Scan');
        const raw = await res.text();
        let json;
        try {
            json = JSON.parse(raw);
        } catch {
            throw new Error(
                `Server returned ${res.status} (not JSON). First bytes: ${raw.slice(0, 160).replace(/\s+/g, ' ')}`
            );
        }

        if (scanHdr !== 'local-only-v2') {
            const extra =
                json && json.error
                    ? String(json.error)
                    : raw.slice(0, 200).replace(/\s+/g, ' ');
            throw new Error(
                `This admin API is an old deployment (expected header X-Totilove-Uploads-Scan: local-only-v2; got ${scanHdr || 'nothing'}). ` +
                    `Redeploy admin-server from latest GitHub main, wait for build, then hard-refresh (Ctrl+Shift+R). ` +
                    `Server said: ${extra}`
            );
        }

        if (!res.ok || !json.success) {
            const bits = [json.error || 'Scan failed'];
            if (json.hint) bits.push(json.hint);
            const err = new Error(bits.join('\n\n'));
            err.debug = json.debug;
            throw err;
        }

        renderUploadsTree(json.data);
        dlBtn.disabled = false;
        setUploadsStatus(`Scanned at ${fmtDate(json.data.scannedAt)}`, 'info');
    } catch (err) {
        let debugBlock = '';
        if (err.debug) {
            debugBlock = `<pre style="margin-top:8px;font-size:11px;overflow:auto;max-height:240px;background:#f8f9fa;padding:8px;border-radius:4px;">${escapeHtml(JSON.stringify(err.debug, null, 2))}</pre>`;
        }
        panel.innerHTML = `<div class="scan-placeholder" style="border-color:#f8d7da; color:#842029;">
            ❌ ${escapeHtml(err.message).replace(/\n/g, '<br>')}
            ${debugBlock}
        </div>`;
        setUploadsStatus(
            'Scan uses local volume only. Set ADMIN_DIAGNOSTIC_UPLOADS=true on the server and redeploy to show path checks.',
            'error'
        );
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔍 Scan Folder';
    }
}

function renderUploadsTree(data) {
    const panel = document.getElementById('uploadsPanel');

    function makeSafeNodeId(path) {
        return 'folder-node-' + String(path || 'root').replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function renderFolderNode(folder, level, rootTotalSize, parentPath) {
        const safeName = escapeHtml(folder.name || 'unknown');
        const fullPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
        const encodedPath = encodeURIComponent(fullPath);
        const nodeId = makeSafeNodeId(fullPath);
        const hasChildren = Array.isArray(folder.subfolders) && folder.subfolders.length > 0;
        const isCollapsed = folderCollapsedState[fullPath] === undefined ? level > 0 : folderCollapsedState[fullPath];
        const percent = rootTotalSize > 0 ? ((folder.totalSize / rootTotalSize) * 100).toFixed(1) : '0.0';
        const indent = Math.min(level * 20, 80);

        let nodeHtml = `
            <div class="subfolder-row" style="padding-left:${indent + 8}px;">
                <div class="subfolder-row-left">
                    ${hasChildren
                        ? `<button type="button" class="folder-toggle" data-node-path="${encodedPath}" onclick="toggleFolderNode(this)" aria-label="Toggle ${safeName}">${isCollapsed ? '+' : '-'}</button>`
                        : '<span class="folder-toggle-placeholder"></span>'}
                    📂 <strong>${safeName}/</strong>
                    <span class="badge badge-gray">${folder.fileCount.toLocaleString()} files</span>
                    <span class="badge badge-green">${fmtBytes(folder.totalSize)}</span>
                    <span style="font-size:11px;color:#aaa;">${percent}%</span>
                </div>
                <div class="subfolder-row-right">
                    <span class="time-chip">🕒 ${fmtDate(folder.lastModified)}</span>
                </div>
            </div>`;

        if (hasChildren) {
            const sortedChildren = [...folder.subfolders].sort((a, b) => b.totalSize - a.totalSize);
            nodeHtml += `<div class="folder-children ${isCollapsed ? 'collapsed' : ''}" id="${nodeId}">`;
            for (const child of sortedChildren) {
                nodeHtml += renderFolderNode(child, level + 1, rootTotalSize, fullPath);
            }
            nodeHtml += '</div>';
        }

        return nodeHtml;
    }

    // Summary stats
    const subCount = (data.subfolders || []).length;
    let html = `
    <div class="stats-row">
        <div class="stat-box">
            <div class="stat-val">${data.fileCount.toLocaleString()}</div>
            <div class="stat-lbl">Total Files</div>
        </div>
        <div class="stat-box">
            <div class="stat-val">${fmtBytes(data.totalSize)}</div>
            <div class="stat-lbl">Total Size</div>
        </div>
        <div class="stat-box">
            <div class="stat-val">${subCount}</div>
            <div class="stat-lbl">Subfolders</div>
        </div>
        <div class="stat-box">
            <div class="stat-val" style="font-size:14px;">${fmtDate(data.lastModified)}</div>
            <div class="stat-lbl">Last Modified</div>
        </div>
    </div>`;

    // Root folder card
    html += `
    <div class="folder-card">
        <div class="folder-header">
            <div class="folder-title">
                📁 <strong>uploads/</strong>
                <span class="badge badge-blue">root</span>
            </div>
            <div class="folder-meta">
                <span>📄 ${data.fileCount.toLocaleString()} files</span>
                <span>💾 ${fmtBytes(data.totalSize)}</span>
                <span class="time-chip">🕒 ${fmtDate(data.lastModified)}</span>
            </div>
        </div>`;

    if (data.subfolders && data.subfolders.length > 0) {
        html += `<div class="subfolder-list">`;

        // Sort subfolders by size desc
        const sorted = [...data.subfolders].sort((a, b) => b.totalSize - a.totalSize);

        for (const sf of sorted) {
            html += renderFolderNode(sf, 0, data.totalSize, '');
        }
        html += `</div>`; // subfolder-list
    } else {
        html += `<p style="margin-top:12px; color:#888; font-size:13px;">No subfolders found — files are in root.</p>`;
    }

    html += `</div>`; // folder-card

    // Server path info
    html += `<p style="font-size:12px; color:#999; margin-top:8px;">Server path: <code>${escapeHtml(data.path)}</code></p>`;

    panel.innerHTML = html;
}

function toggleFolderNode(btnEl) {
    const encodedPath = btnEl.getAttribute('data-node-path');
    const decodedPath = decodeURIComponent(encodedPath);
    folderCollapsedState[decodedPath] = !folderCollapsedState[decodedPath];
    const nodeId = 'folder-node-' + String(decodedPath || 'root').replace(/[^a-zA-Z0-9_-]/g, '_');
    const node = document.getElementById(nodeId);
    if (node) {
        node.classList.toggle('collapsed', folderCollapsedState[decodedPath]);
    }
    btnEl.textContent = folderCollapsedState[decodedPath] ? '+' : '-';
}

// ── Uploads Folder: Download ──────────────────────────────────────────────────
async function downloadUploads(subfolder) {
    const dlProgress = document.getElementById('dlProgress');
    const dlProgressText = document.getElementById('dlProgressText');
    const dlAllBtn = document.getElementById('dlAllBtn');

    dlProgress.classList.add('show');
    dlProgressText.textContent = 'Requesting ZIP from server — this may take a while for large folders…';
    dlAllBtn.disabled = true;
    setUploadsStatus('', '');

    try {
        let url = '/api/export-import/images';
        if (subfolder) url += `?subfolder=${encodeURIComponent(subfolder)}`;

        const res = await fetch(url);

        if (!res.ok) {
            let errMsg = 'Failed to download ZIP';
            try { const j = await res.json(); errMsg = j.error || errMsg; } catch {}
            throw new Error(errMsg);
        }

        dlProgressText.textContent = 'Downloading ZIP…';
        const blob = await res.blob();
        const disposition = res.headers.get('content-disposition') || '';
        const match = disposition.match(/filename="?([^";]+)"?/i);
        const filename = (match && match[1]) ? match[1] : 'uploads_export.zip';

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);

        setUploadsStatus(`✅ Downloaded: ${filename}`, 'success');
    } catch (err) {
        setUploadsStatus('❌ ' + err.message, 'error');
    } finally {
        dlProgress.classList.remove('show');
        dlAllBtn.disabled = false;
    }
}

// ── Data Export ───────────────────────────────────────────────────────────────
function setupExportScope() {
    document.querySelectorAll('input[name="exportScope"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('selectedIdsGroup').style.display =
                e.target.value === 'selected' ? 'block' : 'none';
        });
    });
}

async function exportData() {
    try {
        const exportType = document.getElementById('exportType').value;
        const format = document.getElementById('exportFormat').value;
        const scope = document.querySelector('input[name="exportScope"]:checked').value;
        const search = document.getElementById('exportSearch').value;
        const status = document.getElementById('exportStatus').value;

        let url = `/api/export-import/${exportType}?format=${format}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (status) url += `&status=${status}`;
        if (scope === 'selected') {
            const userIds = document.getElementById('selectedUserIds').value;
            if (!userIds) { setExportStatus('Please enter user IDs', 'error'); return; }
            url += `&user_ids=${encodeURIComponent(userIds)}`;
        }

        const link = document.createElement('a');
        link.href = url;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setExportStatus('Export started — file will download shortly.', 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        setExportStatus('Error exporting data: ' + error.message, 'error');
    }
}

// ── File Upload (Import) ──────────────────────────────────────────────────────
function setupFileUpload() {
    const uploadArea = document.getElementById('fileUploadArea');
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault(); uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFile(files[0]);
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) handleFile(file);
}

function handleFile(file) {
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const format = document.getElementById('importFormat').value;
        try {
            fileData = format === 'json' ? JSON.parse(content) : content;
            displayFileInfo(file);
            displayPreview(fileData, format);
            document.getElementById('importButton').style.display = 'block';
        } catch (error) {
            showStatus('Error parsing file: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

function displayFileInfo(file) {
    const fileInfo = document.getElementById('fileInfo');
    fileInfo.innerHTML = `
        <strong>File:</strong> ${escapeHtml(file.name)}<br>
        <strong>Size:</strong> ${(file.size / 1024).toFixed(2)} KB<br>
        <strong>Type:</strong> ${escapeHtml(file.type || 'text/plain')}`;
    fileInfo.classList.add('show');
}

function displayPreview(data, format) {
    const preview = document.getElementById('importPreview');
    if (format === 'json' && Array.isArray(data)) {
        if (data.length === 0) { preview.innerHTML = '<p>No data found in file</p>'; preview.style.display = 'block'; return; }
        const headers = Object.keys(data[0]);
        let html = '<table><thead><tr>' + headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead><tbody>';
        const rowsToShow = Math.min(10, data.length);
        for (let i = 0; i < rowsToShow; i++) {
            html += '<tr>' + headers.map(h => `<td>${escapeHtml(String(data[i][h] || ''))}</td>`).join('') + '</tr>';
        }
        html += '</tbody></table>';
        if (data.length > 10) html += `<p style="margin-top:8px;color:#666;">Showing first 10 of ${data.length} rows</p>`;
        preview.innerHTML = html;
        preview.style.display = 'block';
    } else {
        preview.innerHTML = '<p>Preview not available for CSV files</p>';
        preview.style.display = 'block';
    }
}

// ── Import ────────────────────────────────────────────────────────────────────
async function importData() {
    if (!fileData) { showStatus('Please select a file first', 'error'); return; }

    const confirmed = await showConfirm(
        `Are you sure you want to import ${Array.isArray(fileData) ? fileData.length : 'unknown'} users?`,
        'Import Users', 'Import', 'Cancel', 'warning'
    );
    if (!confirmed) return;

    try {
        const format = document.getElementById('importFormat').value;
        const response = await fetch('/api/export-import/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ format, data: fileData })
        });
        const result = await response.json();

        if (result.success) {
            let details = result.message;
            if (result.results) {
                details = `
                    <strong>Import Results:</strong><br>
                    ✅ Success: ${result.results.success}<br>
                    ❌ Failed: ${result.results.failed}<br>
                    ${result.results.errors.length > 0 ? `
                        <strong>Errors:</strong><br>
                        ${result.results.errors.slice(0, 10).map(e => `Row ${e.row}: ${escapeHtml(e.error)}`).join('<br>')}
                        ${result.results.errors.length > 10 ? `<br>… and ${result.results.errors.length - 10} more` : ''}
                    ` : ''}`;
            }
            showStatus(details, 'info');
        } else {
            showStatus('Error: ' + (result.error || 'Failed to import users'), 'error');
        }
    } catch (error) {
        console.error('Error importing data:', error);
        showStatus('Error importing data: ' + error.message, 'error');
    }
}


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

    const exportTypeSelect = document.getElementById('exportType');
    if (exportTypeSelect) {
        exportTypeSelect.addEventListener('change', toggleExportFiltersForType);
        toggleExportFiltersForType();
    }
}

function toggleExportFiltersForType() {
    const exportType = document.getElementById('exportType').value;
    const disableUserFilters = exportType === 'images';

    const exportFormat = document.getElementById('exportFormat');
    const exportSearch = document.getElementById('exportSearch');
    const exportStatus = document.getElementById('exportStatus');
    const selectedIdsGroup = document.getElementById('selectedIdsGroup');

    exportFormat.disabled = disableUserFilters;
    exportSearch.disabled = disableUserFilters;
    exportStatus.disabled = disableUserFilters;

    if (disableUserFilters) {
        selectedIdsGroup.style.display = 'none';
    }
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

        if (exportType === 'images') {
            const response = await fetch('/api/export-import/images', {
                method: 'GET'
            });

            if (!response.ok) {
                let errorMessage = 'Failed to export uploads ZIP';
                try {
                    const errorBody = await response.json();
                    errorMessage = errorBody.error || errorMessage;
                } catch (e) {
                    // Ignore JSON parse errors and keep default message.
                }
                showStatus(errorMessage, 'error');
                return;
            }

            const blob = await response.blob();
            const disposition = response.headers.get('content-disposition') || '';
            const match = disposition.match(/filename="?([^";]+)"?/i);
            const filename = (match && match[1]) ? match[1] : 'uploads_export.zip';

            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);

            showStatus('Uploads ZIP downloaded successfully.', 'success');
            return;
        }

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




















































