/* Chat images monitor — card grid; click opens detail modal with large image + all controls */

let currentPage = 1;
let totalPages = 1;
let limit = 30;
/** @type {Array<object>} */
let lastLoadedImages = [];
/** @type {Set<number>} */
let selectedAttachmentIds = new Set();

function getChatImageSelectionMode() {
    const el = document.getElementById('chatImageSelectionMode');
    return el && el.value === 'multiple' ? 'multiple' : 'single';
}

function updateChatImageBulkPanel() {
    const panel = document.getElementById('chatImageBulkPanel');
    const label = document.getElementById('chatImageSelectedCountLabel');
    if (!panel || !label) {
        return;
    }
    if (getChatImageSelectionMode() !== 'multiple') {
        panel.style.display = 'none';
        return;
    }
    const n = selectedAttachmentIds.size;
    if (n > 0) {
        panel.style.display = 'flex';
        label.textContent = n === 1 ? '1 selected' : `${n} selected`;
    } else {
        panel.style.display = 'none';
    }
}

function updateChatImageSelectAllState() {
    const el = document.getElementById('chatImageSelectAll');
    if (!el || getChatImageSelectionMode() !== 'multiple') {
        return;
    }
    const ids = lastLoadedImages.map((r) => r.attachment_id).filter((id) => id != null);
    if (ids.length === 0) {
        el.checked = false;
        el.indeterminate = false;
        return;
    }
    const nSel = ids.filter((id) => selectedAttachmentIds.has(id)).length;
    el.checked = nSel === ids.length;
    el.indeterminate = nSel > 0 && nSel < ids.length;
}

function applyChatImageSelectionModeUI() {
    const mode = getChatImageSelectionMode();
    const grid = document.getElementById('chatImagesGrid');
    const selectAllRow = document.getElementById('chatImageSelectAllRow');
    if (grid) {
        grid.classList.toggle('selection-mode-multiple', mode === 'multiple');
    }
    if (selectAllRow) {
        selectAllRow.style.display = mode === 'multiple' ? 'flex' : 'none';
    }
    if (mode === 'single') {
        selectedAttachmentIds.clear();
        const sa = document.getElementById('chatImageSelectAll');
        if (sa) {
            sa.checked = false;
            sa.indeterminate = false;
        }
    }
    updateChatImageBulkPanel();
    renderImageGrid(lastLoadedImages);
}

function toggleChatImageAttachmentSelection(attachmentId, checked) {
    if (checked) {
        selectedAttachmentIds.add(attachmentId);
    } else {
        selectedAttachmentIds.delete(attachmentId);
        const sa = document.getElementById('chatImageSelectAll');
        if (sa) {
            sa.checked = false;
        }
    }
    updateChatImageBulkPanel();
    updateChatImageSelectAllState();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function resolveMediaUrl(path) {
    if (!path) return '';
    const s = String(path).trim();
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    const base = (typeof window !== 'undefined' && window.__TOTILOVE_URL)
        ? String(window.__TOTILOVE_URL).replace(/\/$/, '')
        : '';
    const rel = s.startsWith('/') ? s : `/${s}`;
    // Files are stored on the main Totilove app volume; admin Railway service usually does not share it.
    if (base && rel.startsWith('/uploads/')) {
        return `${base}${rel}`;
    }
    return rel;
}

function selectSuspensionReason(title = 'Select Suspension Reason') {
    const reasons = [
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
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;width:100%;max-width:420px;box-shadow:0 10px 30px rgba(0,0,0,0.2);';
        const heading = document.createElement('h3');
        heading.textContent = title;
        heading.style.margin = '0 0 12px 0';
        const label = document.createElement('label');
        label.textContent = 'Reason (required)';
        label.style.display = 'block';
        label.style.marginBottom = '8px';
        const select = document.createElement('select');
        select.style.cssText = 'width:100%;padding:10px;border:1px solid #d0d7de;border-radius:6px;margin-bottom:16px;';
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

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadImages();
    document.getElementById('applyFilters').addEventListener('click', () => {
        currentPage = 1;
        loadImages();
    });
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
    document.getElementById('limitSelect').addEventListener('change', (e) => {
        limit = parseInt(e.target.value, 10) || 30;
        currentPage = 1;
        loadImages();
    });
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadImages();
        }, 450);
    });

    document.getElementById('chatImageSelectionMode')?.addEventListener('change', applyChatImageSelectionModeUI);
    document.getElementById('chatImageBulkRemoveBtn')?.addEventListener('click', bulkRemoveSelectedChatImages);
    document.getElementById('chatImageClearSelectionBtn')?.addEventListener('click', clearChatImageSelection);
    document.getElementById('chatImageSelectAll')?.addEventListener('change', (e) => {
        if (getChatImageSelectionMode() !== 'multiple') {
            return;
        }
        const checked = e.target.checked;
        lastLoadedImages.forEach((row) => {
            const id = row.attachment_id;
            if (id == null) {
                return;
            }
            if (checked) {
                selectedAttachmentIds.add(id);
            } else {
                selectedAttachmentIds.delete(id);
            }
        });
        updateChatImageBulkPanel();
        renderImageGrid(lastLoadedImages);
    });

    const detailModal = document.getElementById('chatImageDetailModal');
    document.getElementById('chatImageDetailClose').addEventListener('click', closeChatImageDetailModal);
    detailModal.addEventListener('click', () => closeChatImageDetailModal());

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && detailModal.classList.contains('open')) {
            closeChatImageDetailModal();
        }
    });
});

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('messageIdFilter').value = '';
    document.getElementById('senderFilter').value = '';
    document.getElementById('receiverFilter').value = '';
    selectedAttachmentIds.clear();
    const sa = document.getElementById('chatImageSelectAll');
    if (sa) {
        sa.checked = false;
        sa.indeterminate = false;
    }
    updateChatImageBulkPanel();
    currentPage = 1;
    loadImages();
}

function clearChatImageSelection() {
    selectedAttachmentIds.clear();
    document.querySelectorAll('.chat-image-checkbox').forEach((cb) => {
        cb.checked = false;
    });
    const sa = document.getElementById('chatImageSelectAll');
    if (sa) {
        sa.checked = false;
        sa.indeterminate = false;
    }
    updateChatImageBulkPanel();
    updateChatImageSelectAllState();
    renderImageGrid(lastLoadedImages);
}

async function loadStats() {
    try {
        const res = await fetch('/api/chat-images/stats');
        const data = await res.json();
        if (data.success && data.stats) {
            document.getElementById('statTotal').textContent = data.stats.totalImages ?? 0;
            document.getElementById('stat24h').textContent = data.stats.images24h ?? 0;
            document.getElementById('stat7d').textContent = data.stats.images7d ?? 0;
        }
    } catch (e) {
        console.error(e);
    }
}

function buildQuery() {
    const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(limit)
    });
    const search = document.getElementById('searchInput').value.trim();
    const messageId = document.getElementById('messageIdFilter').value.trim();
    const senderId = document.getElementById('senderFilter').value.trim();
    const receiverId = document.getElementById('receiverFilter').value.trim();
    if (search) params.append('search', search);
    if (messageId) params.append('message_id', messageId);
    if (senderId) params.append('sender_id', senderId);
    if (receiverId) params.append('receiver_id', receiverId);
    return params.toString();
}

async function loadImages() {
    const grid = document.getElementById('chatImagesGrid');
    grid.innerHTML = '<div class="loading" style="grid-column:1/-1;text-align:center;padding:40px;">Loading…</div>';
    try {
        const res = await fetch(`/api/chat-images?${buildQuery()}`);
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to load');
        }
        totalPages = data.pagination?.total_pages || 1;
        lastLoadedImages = data.images || [];
        renderImageGrid(lastLoadedImages);
        renderPagination(data.pagination);
        loadStats();
    } catch (err) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:#b91c1c;">${escapeHtml(err.message)}</div>`;
    }
}

function chatImageSenderSuspended(row) {
    return row && (row.sender_is_suspended === true || row.sender_is_suspended === 't');
}

function renderImageGrid(images) {
    const grid = document.getElementById('chatImagesGrid');
    const multi = getChatImageSelectionMode() === 'multiple';
    grid.classList.toggle('selection-mode-multiple', multi);

    if (!images.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:#64748b;">No chat images found.</div>';
        updateChatImageSelectAllState();
        return;
    }
    grid.innerHTML = images.map((row, idx) => {
        const thumbSrc = resolveMediaUrl(row.thumbnail_path || row.file_path);
        const suspended = chatImageSenderSuspended(row);
        const when = formatWhen(row.uploaded_at || row.message_timestamp);
        const sName = row.sender_username || 'User';
        const rName = row.receiver_username || 'User';
        const attachmentId = row.attachment_id;
        const checkOverlay = multi
            ? `<label class="card-cb-overlay" onclick="event.stopPropagation()"><input type="checkbox" class="chat-image-checkbox" data-attachment-id="${attachmentId}" ${selectedAttachmentIds.has(attachmentId) ? 'checked' : ''} onchange="toggleChatImageAttachmentSelection(${attachmentId}, this.checked)"></label>`
            : '';
        return `
            <article class="chat-image-card" role="listitem" tabindex="0" data-index="${idx}"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openChatImageDetail(${idx});}">
                ${checkOverlay}
                <div class="card-thumb-wrap" onclick="openChatImageDetail(${idx})">
                    <img class="card-thumb" src="${escapeHtml(thumbSrc)}" alt="" loading="lazy"
                        onerror="this.style.opacity=0.35;this.alt='(missing)'">
                </div>
                <div class="card-foot" onclick="openChatImageDetail(${idx})">
                    <span class="card-msg-id">Message ${row.message_id}</span>
                    <span class="sender-badge ${suspended ? 'suspended' : ''}" style="margin-left:6px;">${suspended ? 'Suspended' : 'Active'}</span>
                    <div class="card-users-line">${escapeHtml(sName)}:id ${row.sender_id} → ${escapeHtml(rName)}:id ${row.receiver_id}</div>
                    <div class="card-hint">${escapeHtml(when)}</div>
                </div>
            </article>
        `;
    }).join('');
    updateChatImageSelectAllState();
    updateChatImageBulkPanel();
}

function openChatImageDetail(index) {
    const row = lastLoadedImages[index];
    if (!row) return;

    const fullSrc = resolveMediaUrl(row.file_path);
    const img = document.getElementById('chatImageDetailImg');
    img.src = fullSrc;
    img.alt = row.original_filename ? `Chat image: ${row.original_filename}` : 'Chat attachment';

    const suspended = chatImageSenderSuspended(row);
    const uploadedMismatch = row.uploaded_by != null && Number(row.uploaded_by) !== Number(row.sender_id);
    const caption = row.message_caption || '—';
    const sName = row.sender_username || 'User';
    const rName = row.receiver_username || 'User';
    const senderEmail = row.sender_email != null && String(row.sender_email).trim() ? String(row.sender_email).trim() : '—';

    const meta = document.getElementById('chatImageDetailMeta');
    meta.innerHTML = `
        <div class="chat-image-uploader-meta" style="margin-bottom:14px;padding:12px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.5;color:#334155;">
            <strong style="color:#0f172a;">Uploader</strong><br>
            ${escapeHtml(sName)} · User ID <strong>${row.sender_id}</strong><br>
            ${escapeHtml(senderEmail)}
            ${suspended
        ? '<br><span style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:12px;font-weight:600;">Suspended</span>'
        : '<br><span style="display:inline-block;margin-top:6px;font-size:12px;color:#64748b;">Account active</span>'}
        </div>
        <dl>
            <dt>Message ID</dt><dd><strong>${row.message_id}</strong></dd>
            <dt>To (receiver)</dt><dd>${escapeHtml(rName)} · User ID ${row.receiver_id}</dd>
            <dt>Caption</dt><dd>${escapeHtml(caption)}</dd>
            <dt>Uploaded</dt><dd>${escapeHtml(formatWhen(row.uploaded_at || row.message_timestamp))}</dd>
            <dt>File</dt><dd>${escapeHtml(row.original_filename || '—')}${row.width && row.height ? ` · ${row.width}×${row.height}` : ''}</dd>
            ${uploadedMismatch ? `<dt>Uploaded by</dt><dd>User ID ${row.uploaded_by}</dd>` : ''}
        </dl>
    `;

    const senderId = row.sender_id;
    const attachmentId = row.attachment_id;
    const actions = document.getElementById('chatImageDetailActions');
    actions.innerHTML = `
        <div style="font-weight:600;color:#0f172a;margin-bottom:10px;">Attachment</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;">
            <button type="button" class="btn btn-info" onclick="removeChatImage(${attachmentId})" title="Deletes this chat attachment and files only (does not change the sender account)">Remove</button>
        </div>
        <div style="padding-top:16px;border-top:1px solid #e2e8f0;">
            <div style="font-weight:600;color:#0f172a;margin-bottom:10px;">Account actions</div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
                ${suspended
        ? `<button type="button" class="btn btn-account-unsuspend" onclick="unsuspendSender(${senderId})" title="Allow this user to log in again">Unsuspend</button>`
        : `<button type="button" class="btn btn-account-suspend" onclick="suspendSender(${senderId})" title="Block login; account data remains">Suspend</button>`}
                <button type="button" class="btn btn-account-delete" onclick="deleteSenderAccount(${senderId})" title="Permanently delete this user">Delete account</button>
                <button type="button" class="btn btn-account-delete-blacklist" onclick="blacklistSender(${senderId})" title="Record on admin blacklist and delete account">Delete+Blacklist</button>
            </div>
        </div>
    `;

    const modal = document.getElementById('chatImageDetailModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeChatImageDetailModal() {
    const modal = document.getElementById('chatImageDetailModal');
    const img = document.getElementById('chatImageDetailImg');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    img.removeAttribute('src');
    img.alt = '';
}

function formatWhen(v) {
    if (!v) return '—';
    try {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return String(v);
        return d.toLocaleString();
    } catch {
        return String(v);
    }
}

function renderPagination(p) {
    const el = document.getElementById('pagination');
    if (!p || p.total_pages <= 1) {
        el.innerHTML = p && p.total_count != null
            ? `<span style="color:#64748b;font-size:13px;">${p.total_count} image(s)</span>`
            : '';
        return;
    }
    const parts = [];
    parts.push(`<span style="margin-right:12px;color:#64748b;">Page ${p.current_page} / ${p.total_pages} (${p.total_count} images)</span>`);
    if (p.has_prev) {
        parts.push(`<button type="button" class="btn btn-secondary" onclick="goPage(${p.current_page - 1})">Prev</button>`);
    }
    if (p.has_next) {
        parts.push(`<button type="button" class="btn btn-secondary" onclick="goPage(${p.current_page + 1})">Next</button>`);
    }
    el.innerHTML = parts.join(' ');
}

function goPage(p) {
    closeChatImageDetailModal();
    currentPage = p;
    loadImages();
}

async function removeChatImageById(attachmentId) {
    const response = await fetch(`/api/chat-images/${attachmentId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || 'Failed to remove chat image');
    }
}

async function removeChatImage(attachmentId) {
    const confirmed = await showConfirm(
        'Remove this chat image permanently? The attachment row will be deleted and the image files removed from disk.',
        'Remove Chat Image',
        'Remove',
        'Cancel',
        'warning'
    );
    if (!confirmed) return;

    try {
        await removeChatImageById(attachmentId);
        showSuccess('Chat image removed successfully');
        selectedAttachmentIds.delete(attachmentId);
        updateChatImageBulkPanel();
        closeChatImageDetailModal();
        loadImages();
    } catch (error) {
        console.error('Error removing chat image:', error);
        showError('Failed to remove chat image: ' + error.message);
    }
}

async function bulkRemoveSelectedChatImages() {
    if (getChatImageSelectionMode() !== 'multiple') {
        return;
    }
    if (selectedAttachmentIds.size === 0) {
        showWarning('No images selected');
        return;
    }
    const n = selectedAttachmentIds.size;
    const confirmed = await showConfirm(
        `Remove ${n} selected chat image(s) permanently? Attachment rows will be deleted and files removed from disk.`,
        'Remove chat images',
        'Remove',
        'Cancel',
        'warning'
    );
    if (!confirmed) {
        return;
    }

    const ids = [...selectedAttachmentIds];
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
        try {
            await removeChatImageById(id);
            ok++;
            selectedAttachmentIds.delete(id);
        } catch (err) {
            fail++;
            console.error('Bulk remove failed for attachment', id, err);
        }
    }
    if (ok > 0) {
        showSuccess(`Removed ${ok} image(s).`);
    }
    if (fail > 0) {
        showError(`Failed to remove ${fail} image(s).`);
    }
    closeChatImageDetailModal();
    await loadImages();
    updateChatImageSelectAllState();
    updateChatImageBulkPanel();
}

async function suspendSender(userId) {
    const reason = await selectSuspensionReason('Suspend sender (chat images)');
    if (!reason) {
        showWarning('Suspension reason is required.');
        return;
    }
    const msg = `Suspend this user (sender)?\n\nReason: ${reason}\n\nThey will not be able to log in until unsuspended.`;
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
            closeChatImageDetailModal();
            loadImages();
        } else {
            showError(data.error || 'Failed to suspend');
        }
    } catch (e) {
        showError(e.message);
    }
}

async function unsuspendSender(userId) {
    const ok = await showConfirm('Unsuspend this user?', 'Unsuspend', 'Unsuspend', 'Cancel', 'success');
    if (!ok) return;
    try {
        const res = await fetch(`/api/users/${userId}/suspend`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showSuccess('User unsuspended.');
            closeChatImageDetailModal();
            loadImages();
        } else {
            showError(data.error || 'Failed to unsuspend');
        }
    } catch (e) {
        showError(e.message);
    }
}

async function blacklistSender(userId) {
    const reason = typeof prompt === 'function' ? prompt('Delete+Blacklist reason (optional):', 'Chat policy violation') : '';
    if (reason === null) return;
    const notes = typeof prompt === 'function' ? prompt('Internal notes (optional):', '') : '';
    if (notes === null) return;

    const ok = await showConfirm(
        'Delete+Blacklist saves this user to the admin blacklist and permanently deletes their account (same as admin delete). Continue?',
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
            closeChatImageDetailModal();
            loadImages();
        } else {
            showError(data.error || 'Failed to blacklist');
        }
    } catch (e) {
        showError(e.message);
    }
}

async function deleteSenderAccount(userId) {
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
        closeChatImageDetailModal();
        loadImages();
    } catch (e) {
        showError(e.message || 'Delete failed');
    }
}
