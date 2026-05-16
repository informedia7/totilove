// Admin Users Management JavaScript

let currentPage = 1;
let currentFilters = {};
let selectedUsers = new Set();
let currentSort = { field: 'date_joined', order: 'DESC' };
let currentUsersRequest = null; // For request cancellation
let itemsPerPage = 50; // Default items per page
let currentModalUser = null;
let currentEditUserSnapshot = null;
let deleteModalUserId = null;
let pendingAnchorUserId = null;
let pendingAnchorTimeout = null;
let currentQuickTab = 'custom';
/** Set from GET /api/users when blacklisted=true — real column keys from DB rows (no schema discovery in UI). `id` and `ip_address` are omitted from the table. */
let lastBlacklistColumns = null;

function blacklistColumnsWithoutId(cols) {
    if (!Array.isArray(cols)) return [];
    return cols.filter((c) => c && c.key !== 'id' && c.key !== 'ip_address');
}

/** Place `blacklisted_at` immediately after `stop_this_ip` in the table (DB order may differ). */
function orderBlacklistColumnsForDisplay(cols) {
    const list = blacklistColumnsWithoutId(cols);
    const si = list.findIndex((c) => c.key === 'stop_this_ip');
    const bi = list.findIndex((c) => c.key === 'blacklisted_at');
    if (bi === -1 || si === -1) {
        return list;
    }
    if (bi === si + 1) {
        return list;
    }
    const [blacklistedCol] = list.splice(bi, 1);
    const stopIdx = list.findIndex((c) => c.key === 'stop_this_ip');
    list.splice(stopIdx + 1, 0, blacklistedCol);
    return list;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    loadUserSummary();
    setupEventListeners();
    updateQuickTabState();
    toggleAdvancedFiltersPanel();
    setupDeleteUserModal();
    setupEditBlacklistModal();
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
    ['statusFilter', 'genderFilter', 'ageMin', 'ageMax', 'emailVerifiedFilter', 'profileVerifiedFilter', 'hasImagesFilter', 'sortBy', 'sortOrder'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            applyFilters();
        });
    });

    document.querySelectorAll('#quickFilterTabs .tab-btn').forEach((tabButton) => {
        tabButton.addEventListener('click', (event) => {
            event.preventDefault();
            applyQuickTab(tabButton.dataset.tab);
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

    document.getElementById('addBlacklistEntryBtn')?.addEventListener('click', () => {
        openAddBlacklistModal();
    });

    // Clear filters
    document.getElementById('clearFilters').addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        document.getElementById('statusFilter').value = '';
        document.getElementById('genderFilter').value = '';
        document.getElementById('ageMin').value = '';
        document.getElementById('ageMax').value = '';
        document.getElementById('emailVerifiedFilter').value = '';
        document.getElementById('profileVerifiedFilter').value = '';
        document.getElementById('hasImagesFilter').value = '';
        document.getElementById('sortBy').value = 'date_joined';
        document.getElementById('sortOrder').value = 'DESC';
        document.getElementById('itemsPerPage').value = '50';
        currentFilters = {};
        currentQuickTab = 'all';
        updateQuickTabState();
        toggleAdvancedFiltersPanel();
        currentSort = { field: 'date_joined', order: 'DESC' };
        itemsPerPage = 50;
        currentPage = 1;
        updateSortIndicators();
        loadUsers();
    });

    const usersTable = document.querySelector('.users-table');
    if (usersTable && !usersTable.dataset.chromeWired) {
        usersTable.dataset.chromeWired = '1';
        usersTable.addEventListener('change', (e) => {
            if (e.target.id !== 'selectAll') return;
            const checkboxes = document.querySelectorAll('.user-checkbox');
            checkboxes.forEach((cb) => {
                cb.checked = e.target.checked;
                if (e.target.checked) {
                    selectedUsers.add(parseInt(cb.value, 10));
                } else {
                    selectedUsers.delete(parseInt(cb.value, 10));
                }
            });
            updateBulkActions();
        });
        usersTable.addEventListener('click', (e) => {
            const th = e.target.closest('th.sortable');
            const head = document.getElementById('usersTableHead');
            if (!th || !head || !head.contains(th)) return;
            const sortField = th.dataset.sort;
            if (!sortField) return;
            e.preventDefault();
            handleHeaderSort(sortField);
        });
    }

    // Bulk operations
    document.getElementById('executeBulk').addEventListener('click', executeBulkOperation);
    document.getElementById('clearSelection').addEventListener('click', () => {
        selectedUsers.clear();
        document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = false);
        const sa = document.getElementById('selectAll');
        if (sa) sa.checked = false;
        updateBulkActions();
    });

    // Modal close
    const userModalClose = document.querySelector('#userModal .close');
    if (userModalClose) {
        userModalClose.addEventListener('click', () => {
            document.getElementById('userModal').style.display = 'none';
            currentModalUser = null;
        });
    }
}

// Handle header sort click
function handleHeaderSort(field) {
    let fieldMap;
    if (currentQuickTab === 'blacklisted') {
        fieldMap = {};
        if (lastBlacklistColumns && lastBlacklistColumns.length) {
            lastBlacklistColumns.forEach((c) => {
                fieldMap[c.sortKey] = c.sortKey;
            });
        }
    } else {
        fieldMap = {
            id: 'id',
            username: 'real_name',
            real_name: 'real_name',
            email: 'email',
            age: 'date_joined',
            gender: 'gender',
            location: 'date_joined',
            status: 'date_joined',
            image_count: 'date_joined',
            messages: 'date_joined',
            likes: 'date_joined',
            last_login: 'last_login',
            date_joined: 'date_joined'
        };
    }

    const apiField = fieldMap[field] || (currentQuickTab === 'blacklisted' ? 'date_joined' : 'date_joined');

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
    document.querySelectorAll('.users-table th.sortable').forEach(header => {
        header.classList.remove('sorted', 'sorted-asc', 'sorted-desc');
    });

    if (currentQuickTab === 'blacklisted') {
        const fallbackKey =
            lastBlacklistColumns && lastBlacklistColumns.length
                ? lastBlacklistColumns[0].sortKey
                : 'email';
        const headerSort =
            lastBlacklistColumns && lastBlacklistColumns.some((c) => c.sortKey === currentSort.field)
                ? currentSort.field
                : fallbackKey;
        const header = document.querySelector(`.users-table th.sortable[data-sort="${headerSort}"]`);
        if (header) {
            header.classList.add('sorted');
            header.classList.add(currentSort.order === 'ASC' ? 'sorted-asc' : 'sorted-desc');
        }
        return;
    }

    const fieldMap = {
        id: 'id',
        username: 'real_name',
        real_name: 'real_name',
        email: 'email',
        age: 'age',
        gender: 'gender',
        location: 'location',
        status: 'status',
        image_count: 'image_count',
        messages: 'messages',
        likes: 'likes',
        last_login: 'last_login',
        date_joined: 'date_joined'
    };

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
    const activeQuickTabBtn = document.querySelector('#quickFilterTabs .tab-btn.active');
    const domQuickTab = activeQuickTabBtn?.dataset?.tab;
    if (domQuickTab === 'blacklisted') {
        currentQuickTab = 'blacklisted';
    } else {
        currentQuickTab = detectQuickTabFromFilters();
    }
    updateQuickTabState();
    toggleAdvancedFiltersPanel();

    // Keep `currentSort` in sync with dropdowns (custom tab uses these as the primary sort UI).
    const sortBySelect = document.getElementById('sortBy');
    const sortOrderSelect = document.getElementById('sortOrder');
    const nextSortField = (sortBySelect?.value || '').trim();
    const nextSortOrderRaw = (sortOrderSelect?.value || '').trim();
    const nextSortOrder = nextSortOrderRaw ? nextSortOrderRaw.toUpperCase() : '';
    if (nextSortField) {
        currentSort.field = nextSortField;
    }
    if (nextSortOrder === 'ASC' || nextSortOrder === 'DESC') {
        currentSort.order = nextSortOrder;
    }

    const searchRaw = (document.getElementById('searchInput')?.value || '').trim();
    currentFilters = {
        ...(searchRaw ? { search: searchRaw } : {}),
        status: document.getElementById('statusFilter').value,
        gender: document.getElementById('genderFilter').value,
        ageMin: document.getElementById('ageMin').value || null,
        ageMax: document.getElementById('ageMax').value || null,
        emailVerified: document.getElementById('emailVerifiedFilter').value || null,
        profileVerified: document.getElementById('profileVerifiedFilter').value || null,
        hasImages: document.getElementById('hasImagesFilter').value || null,
        sortBy: currentSort.field,
        sortOrder: currentSort.order
    };
    currentPage = 1;
    loadUsers();
}

function applyQuickTab(tab) {
    currentQuickTab = tab;

    // Tabs are authoritative: non-custom tabs reset advanced filters.
    document.getElementById('searchInput').value = '';
    currentFilters = {};

    if (tab !== 'custom') {
        document.getElementById('genderFilter').value = '';
        document.getElementById('ageMin').value = '';
        document.getElementById('ageMax').value = '';
        document.getElementById('hasImagesFilter').value = '';
    }

    if (tab === 'all') {
        document.getElementById('statusFilter').value = '';
        document.getElementById('emailVerifiedFilter').value = '';
        document.getElementById('profileVerifiedFilter').value = '';
    } else if (tab === 'active') {
        document.getElementById('statusFilter').value = 'active';
        document.getElementById('emailVerifiedFilter').value = '';
        document.getElementById('profileVerifiedFilter').value = '';
    } else if (tab === 'suspended') {
        document.getElementById('statusFilter').value = 'suspended';
        document.getElementById('emailVerifiedFilter').value = '';
        document.getElementById('profileVerifiedFilter').value = '';
    } else if (tab === 'blacklisted') {
        document.getElementById('statusFilter').value = '';
        document.getElementById('emailVerifiedFilter').value = '';
        document.getElementById('profileVerifiedFilter').value = '';
        currentSort = { field: 'date_joined', order: 'DESC' };
        document.getElementById('sortBy').value = 'date_joined';
        document.getElementById('sortOrder').value = 'DESC';
    } else if (tab === 'email_verified') {
        document.getElementById('statusFilter').value = '';
        document.getElementById('emailVerifiedFilter').value = 'true';
        document.getElementById('profileVerifiedFilter').value = '';
    } else if (tab === 'email_unverified') {
        document.getElementById('statusFilter').value = '';
        document.getElementById('emailVerifiedFilter').value = 'false';
        document.getElementById('profileVerifiedFilter').value = '';
    } else if (tab === 'profile_verified') {
        document.getElementById('statusFilter').value = '';
        document.getElementById('emailVerifiedFilter').value = '';
        document.getElementById('profileVerifiedFilter').value = 'true';
    } else if (tab === 'custom') {
        // Keep current advanced filter selections in custom mode.
    }

    updateQuickTabState();
    toggleAdvancedFiltersPanel();
    applyFilters();
}

function detectQuickTabFromFilters() {
    if (currentQuickTab === 'custom') {
        return 'custom';
    }
    if (currentQuickTab === 'blacklisted') {
        return 'blacklisted';
    }

    const status = document.getElementById('statusFilter').value;
    const emailVerified = document.getElementById('emailVerifiedFilter').value;
    const profileVerified = document.getElementById('profileVerifiedFilter').value;

    if (status === 'active' && !emailVerified && !profileVerified) return 'active';
    if (status === 'suspended' && !emailVerified && !profileVerified) return 'suspended';
    if (!status && emailVerified === 'true' && !profileVerified) return 'email_verified';
    if (!status && emailVerified === 'false' && !profileVerified) return 'email_unverified';
    if (!status && !emailVerified && profileVerified === 'true') return 'profile_verified';
    if (!status && !emailVerified && !profileVerified) return 'all';
    return 'custom';
}

function usersTableColspan() {
    if (currentQuickTab !== 'blacklisted') return 13;
    const n = lastBlacklistColumns && lastBlacklistColumns.length ? lastBlacklistColumns.length : 1;
    return n + 2;
}

function syncBlacklistTableChrome() {
    const table = document.querySelector('.users-table');
    const wrap = table?.closest('.table-container');
    const on = currentQuickTab === 'blacklisted';
    if (table) table.classList.toggle('users-table--blacklist', on);
    if (wrap) wrap.classList.toggle('table-container--blacklist', on);
}

function syncUsersTableHead() {
    const thead = document.getElementById('usersTableHead');
    if (!thead) return;
    if (currentQuickTab === 'blacklisted') {
        const cols =
            lastBlacklistColumns && lastBlacklistColumns.length
                ? lastBlacklistColumns
                : [{ key: 'email', label: 'Email', sortKey: 'email' }];
        const ths = cols
            .map(
                (c) =>
                    `<th class="sortable" data-sort="${String(c.sortKey).replace(/"/g, '')}">${escapeHtml(c.label)} <span class="sort-arrow"></span></th>`
            )
            .join('');
        thead.innerHTML = `<tr><th class="bl-corner"></th>${ths}<th class="bl-actions-col">Actions</th></tr>`;
        return;
    }
    thead.innerHTML = `
        <tr>
            <th><input type="checkbox" id="selectAll"></th>
            <th class="sortable" data-sort="id">ID <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="real_name">Real Name <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="email">Email <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="age">Age <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="gender">Gender <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="location">Location <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="status">Status <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="image_count">Images <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="messages">Messages <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="likes">Likes <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="last_login">Last Login <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort="date_joined">Date Joined <span class="sort-arrow"></span></th>
        </tr>`;
}

function updateQuickTabState() {
    document.querySelectorAll('#quickFilterTabs .tab-btn').forEach((tabButton) => {
        const isActive = tabButton.dataset.tab === currentQuickTab;
        tabButton.classList.toggle('active', isActive);
        tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    const addBlBtn = document.getElementById('addBlacklistEntryBtn');
    if (addBlBtn) {
        addBlBtn.style.display = currentQuickTab === 'blacklisted' ? 'inline-block' : 'none';
    }
    syncUsersTableHead();
    syncBlacklistTableChrome();
    updateSortIndicators();
}

function updateAllUsersTabCount(total) {
    const countEl = document.getElementById('allUsersTabCount');
    if (!countEl) return;

    if (typeof total === 'number' && !Number.isNaN(total)) {
        countEl.textContent = String(total);
        return;
    }

    if (typeof total === 'string' && total.trim() !== '' && !Number.isNaN(Number(total))) {
        countEl.textContent = String(Number(total));
    }
}

function setTextIfExists(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = String(value ?? 0);
    }
}

function updateUsersTotalTop(total) {
    const n = typeof total === 'number' ? total : Number(total);
    setTextIfExists('usersTotalTop', `Total: ${Number.isFinite(n) ? n : 0}`);
}

function applyUserSummary(summary = {}) {
    setTextIfExists('summaryTotalUsers', summary.totalUsers ?? 0);
    setTextIfExists('summaryWithPhotosUsers', summary.withPhotosUsers ?? 0);
    setTextIfExists('summaryNoPhotosUsers', summary.noPhotosUsers ?? 0);
    setTextIfExists('summaryMaleUsers', summary.maleUsers ?? 0);
    setTextIfExists('summaryFemaleUsers', summary.femaleUsers ?? 0);
    setTextIfExists('summaryActiveUsers', summary.activeUsers ?? 0);
    setTextIfExists('summaryNotActiveUsers', summary.notActiveUsers ?? 0);
    setTextIfExists('summarySuspendedUsers', summary.suspendedUsers ?? 0);
    setTextIfExists('summaryBlacklistedUsers', summary.blacklistedUsers ?? 0);
    setTextIfExists('summaryEmailVerifiedUsers', summary.emailVerifiedUsers ?? 0);
    setTextIfExists('summaryEmailUnverifiedUsers', summary.emailUnverifiedUsers ?? 0);
    setTextIfExists('summaryProfileVerifiedUsers', summary.profileVerifiedUsers ?? 0);
    setTextIfExists('allUsersTabCount', summary.totalUsers ?? 0);
    setTextIfExists('blacklistedTabCount', summary.blacklistedUsers ?? 0);
}

async function loadUserSummary() {
    try {
        const response = await fetch('/api/users/summary');
        if (!response.ok) {
            return;
        }

        const data = await response.json();
        if (!data.success || !data.summary) {
            return;
        }

        applyUserSummary(data.summary);
    } catch (error) {
        console.warn('Could not load user summary:', error.message);
    }
}

function toggleAdvancedFiltersPanel() {
    const panel = document.getElementById('advancedFiltersPanel');
    const controls = document.querySelectorAll('[data-advanced-filter-control="true"]');
    const breakdownPanel = document.getElementById('usersBreakdownPanel');
    const showAdvanced = currentQuickTab === 'custom';
    const showBreakdown = currentQuickTab === 'all';

    if (panel) {
        panel.style.display = showAdvanced ? '' : 'none';
    }

    controls.forEach((control) => {
        control.style.display = showAdvanced ? '' : 'none';
    });

    if (breakdownPanel) {
        breakdownPanel.style.display = showBreakdown ? '' : 'none';
    }
}

// Load users with retry logic
async function loadUsers(retryCount = 0) {
    const tbody = document.getElementById('usersTableBody');
    const colspan = usersTableColspan();
    if (retryCount === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading">Loading users...</td></tr>`;
    }
    updateUsersTotalTop(0);

    // Cancel previous request
    if (currentUsersRequest) {
        currentUsersRequest.abort();
    }
    
    currentUsersRequest = new AbortController();

    try {
        const filteredFilters = Object.fromEntries(
            Object.entries(currentFilters).filter(([, v]) => v !== null && v !== undefined && v !== '')
        );
        if (currentQuickTab === 'blacklisted') {
            filteredFilters.blacklisted = 'true';
        }
        const params = new URLSearchParams({
            page: currentPage,
            limit: itemsPerPage,
            ...filteredFilters
        });

        const response = await fetch(`/api/users?${params}`, {
            signal: currentUsersRequest.signal
        });
        
        // Handle rate limiting - rate limiting disabled
        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load users');
        }

        updateUsersTotalTop(data.pagination?.total ?? 0);

        if (currentQuickTab !== 'blacklisted') {
            updateAllUsersTabCount(data.pagination?.total);
        }
        if (data.summary) {
            applyUserSummary(data.summary);
        }

        if (currentQuickTab === 'blacklisted') {
            lastBlacklistColumns = orderBlacklistColumnsForDisplay(
                Array.isArray(data.blacklistColumns) ? data.blacklistColumns : []
            );
            syncUsersTableHead();
        } else {
            lastBlacklistColumns = null;
        }

        renderUsers(data.users);
        syncBlacklistTableChrome();
        renderPagination(data.pagination);
        updateSortIndicators();
        restoreAnchoredUserRow();
        await loadUserSummary();
        currentUsersRequest = null; // Clear request on success
    } catch (error) {
        if (error.name === 'AbortError') {
            // Request was cancelled, ignore
            return;
        }
        console.error('Error loading users:', error);
        tbody.innerHTML = `<tr><td colspan="${usersTableColspan()}" class="loading">Error: ${error.message}</td></tr>`;
        currentUsersRequest = null; // Clear request on error
    }
}

function formatBlacklistTimestamp(val) {
    if (!val) return '—';
    try {
        const d = new Date(val);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return '—';
    }
}

function blacklistTableCell(raw) {
    if (raw == null || String(raw).trim() === '') return '—';
    return escapeHtml(String(raw));
}

/** Strip legacy `| name_at_blacklist: …` tail from archived reason text. */
function displayBlacklistReason(val) {
    if (val == null) return '';
    const s = String(val);
    const m = s.match(/\s*\|\s*name_at_blacklist:/i);
    if (!m || m.index == null) return s.trim();
    return s.slice(0, m.index).trim();
}

/** Same preset `<select>` for add and edit blacklist modals. */
function buildBlacklistReasonSelectHtml(colKey, rawVal) {
    const reasons = BLACKLIST_REASON_OPTIONS;
    const c = displayBlacklistReason(rawVal);
    const currentTrim = c != null ? String(c).trim() : '';
    const inList = currentTrim && reasons.includes(currentTrim);
    let html = `<select class="bl-entry-form__control" data-bl-col="${escapeHtml(String(colKey))}">`;
    if (currentTrim && !inList) {
        html += `<option value="${escapeAttr(currentTrim)}" selected>${escapeHtml(currentTrim)}</option>`;
    }
    for (const r of reasons) {
        const sel = inList ? r === currentTrim : !currentTrim && r === reasons[0];
        html += `<option value="${escapeAttr(r)}"${sel ? ' selected' : ''}>${escapeHtml(r)}</option>`;
    }
    html += '</select>';
    return html;
}

function formatBlacklistCell(key, val) {
    if (val == null || val === '') return '—';
    if (key === 'reason' && typeof val === 'string') {
        const cleaned = displayBlacklistReason(val);
        return blacklistTableCell(cleaned || '—');
    }
    if (typeof val === 'boolean') {
        return val ? 'Yes' : 'No';
    }
    if (/_at$/i.test(String(key)) || /(^|_)(date|time)(_|$)/i.test(String(key))) {
        const formatted = formatBlacklistTimestamp(val);
        if (formatted !== '—') return formatted;
    }
    return blacklistTableCell(val);
}

function blacklistDataCell(key, val) {
    const inner = formatBlacklistCell(key, val);
    let tipRaw = '';
    if (val != null && String(val).trim() !== '') {
        tipRaw = String(val).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
    }
    const titleAttr = tipRaw ? ` title="${escapeAttr(tipRaw)}"` : '';
    return `<td class="bl-data-cell"${titleAttr}>${inner}</td>`;
}

// Render users table
function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    const colspan = usersTableColspan();

    window.__blacklistEntryCache = {};

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="loading">No users found</td></tr>`;
        return;
    }

    const blacklistLayout = currentQuickTab === 'blacklisted';

    tbody.innerHTML = users.map(user => {
        const rowSource = user.row_source || 'user';
        const isBlacklistEntry = rowSource === 'blacklist_entry';
        const rowKey = isBlacklistEntry && user.blacklist_entry_id ? user.blacklist_entry_id : user.id;
        const viewUserId = isBlacklistEntry ? null : user.id;

        if (blacklistLayout) {
            const cols =
                lastBlacklistColumns && lastBlacklistColumns.length
                    ? lastBlacklistColumns
                    : [{ key: 'email', label: 'Email', sortKey: 'email' }];
            const cells = cols.map((c) => blacklistDataCell(c.key, user[c.key])).join('');
            if (user.blacklist_entry_id) {
                window.__blacklistEntryCache[String(user.blacklist_entry_id)] = user;
            }
            const removeBtn = user.blacklist_entry_id
                ? `<div class="bl-actions"><button type="button" class="bl-action bl-action--edit" onclick="event.stopPropagation();openEditBlacklistModalById(${user.blacklist_entry_id})" title="Edit this entry">Edit</button><button type="button" class="bl-action bl-action--remove" onclick="event.stopPropagation();removeFromBlacklist(${user.blacklist_entry_id}, null)" title="Remove from blacklist">Remove</button></div>`
                : '—';
            return `
        <tr id="user-row-${rowKey}" class="user-row user-row--blacklist" data-user-id="${rowKey}" data-row-source="${rowSource}" data-view-user-id="${viewUserId != null ? viewUserId : ''}" data-blacklist-entry-id="${user.blacklist_entry_id || ''}" tabindex="-1" style="cursor: default">
            <td class="bl-corner"></td>
            ${cells}
            <td class="bl-actions-cell" onclick="event.stopPropagation()">${removeBtn}</td>
        </tr>
    `;
        }

        return `
        <tr id="user-row-${user.id}" class="user-row" data-user-id="${user.id}" data-row-source="${rowSource}" data-view-user-id="${user.id}" data-blacklist-entry-id="" tabindex="-1" style="cursor: pointer;">
            <td onclick="event.stopPropagation()"><input type="checkbox" class="user-checkbox" value="${user.id}" onchange="toggleUserSelection(${user.id}, this.checked)"></td>
            <td>${user.id}</td>
            <td>${escapeHtml(user.real_name || user.username || 'N/A')}</td>
            <td>${escapeHtml(user.email || 'N/A')}</td>
            <td>${user.age || 'N/A'}</td>
            <td>${user.gender || 'N/A'}</td>
            <td>${[user.city_name, user.state_name, user.country_name].filter(Boolean).join(', ') || 'N/A'}</td>
            <td>
                <span class="status-badge ${user.status}">${user.status === 'suspended' ? 'Suspended' : user.status}</span>
                ${user.status === 'suspended' && user.suspended_reason ? `<div style="margin-top:4px;font-size:12px;color:#6b7280;">Reason: ${escapeHtml(user.suspended_reason)}</div>` : ''}
            </td>
            <td>${user.image_count || 0}</td>
            <td>${(user.messages_sent || 0) + (user.messages_received || 0)}</td>
            <td>${(user.likes_received || 0) + (user.likes_given || 0)}</td>
            <td>${user.last_seen || 'Never'}</td>
            <td>${user.date_joined ? new Date(user.date_joined).toLocaleDateString() : 'N/A'}</td>
        </tr>
    `;
    }).join('');

    tbody.querySelectorAll('.user-row').forEach(row => {
        row.addEventListener('click', function(e) {
            if (e.target.type === 'checkbox') return;
            if (this.dataset.rowSource === 'blacklist_entry') return;
            const vid = this.dataset.viewUserId ? parseInt(this.dataset.viewUserId, 10) : NaN;
            if (!Number.isFinite(vid)) return;
            viewUser(vid);
        });
    });
}

function restoreAnchoredUserRow() {
    if (!pendingAnchorUserId) {
        return;
    }

    const row = document.querySelector(`.user-row[data-user-id="${pendingAnchorUserId}"]`);
    if (!row) {
        pendingAnchorUserId = null;
        return;
    }

    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.focus({ preventScroll: true });
    row.style.transition = 'background-color 0.3s ease';
    row.style.backgroundColor = '#fff3cd';
    window.location.hash = `user-row-${pendingAnchorUserId}`;

    if (pendingAnchorTimeout) {
        clearTimeout(pendingAnchorTimeout);
    }

    pendingAnchorTimeout = setTimeout(() => {
        row.style.backgroundColor = '';
    }, 2500);

    pendingAnchorUserId = null;
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
        const sa = document.getElementById('selectAll');
        if (sa) sa.checked = false;
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
    currentModalUser = null;
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
        currentModalUser = user;
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
                <p><strong>About Me:</strong></p>
                <div style="white-space: pre-wrap; word-break: break-word; margin: 4px 0 12px 0;">${escapeHtml(user.about_me || 'N/A')}</div>
                <p><strong>Partner Preferences:</strong></p>
                <div style="white-space: pre-wrap; word-break: break-word; margin: 4px 0 12px 0;">${escapeHtml(user.partner_preferences || 'N/A')}</div>
                <p><strong>Status:</strong> <span class="status-badge ${user.is_suspended ? 'suspended' : 'active'}">${user.is_suspended ? 'Suspended' : 'Active'}</span></p>
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
                <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                    <button class="btn btn-primary" onclick="editUser(${user.id})">Edit User</button>
                    ${!user.email_verified 
                        ? `<button class="btn btn-success" onclick="verifyUserEmail(${user.id})">Verify Email</button>`
                        : `<button class="btn btn-warning" onclick="unverifyUserEmail(${user.id})">Unverify Email</button>`
                    }
                    ${!user.profile_verified 
                        ? `<button class="btn btn-success" onclick="verifyUserProfile(${user.id})">Verify Profile</button>`
                        : `<button class="btn btn-warning" onclick="unverifyUserProfile(${user.id})">Unverify Profile</button>`
                    }
                    ${user.real_name !== 'Deleted User' && user.username !== 'Deleted User'
                        ? `<span aria-hidden="true" style="width:100%;height:0;flex-basis:100%;"></span>
                        ${user.is_suspended 
                        ? `<button class="btn btn-account-unsuspend" onclick="unsuspendUser(${user.id})">Unsuspend User</button>`
                        : `<button class="btn btn-account-suspend" onclick="suspendUser(${user.id})">Suspend User</button>`
                    }
                        <button class="btn btn-account-delete" onclick="deactivateUserAccount(${user.id})">Delete Account</button>
                        <button class="btn btn-account-delete-blacklist" onclick="blacklistUser(${user.id})">Delete+Blacklist</button>`
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
        currentEditUserSnapshot = user;
        modalBody.innerHTML = `
            <h2>Edit User: ${escapeHtml(user.real_name || user.username || 'N/A')}</h2>
            <form id="editUserForm" style="margin-top: 20px;">
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">Real Name</label>
                    <input type="text" id="editUsername" value="${escapeHtml(user.real_name || user.username || '')}" 
                           style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">Email</label>
                    <input type="email" id="editEmail" value="${escapeHtml(user.email || '')}" 
                           style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">Gender</label>
                    <select id="editGender" style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; box-sizing: border-box;">
                        <option value="" ${!user.gender ? 'selected' : ''}>Not specified</option>
                        <option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male</option>
                        <option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female</option>
                        <option value="other" ${user.gender === 'other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">Birthday</label>
                    <input type="date" id="editBirthdate" value="${escapeHtml((user.birthdate || '').toString().slice(0, 10))}"
                           style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">About Me</label>
                    <textarea id="editAboutMe"
                              style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; resize: vertical; min-height: 144px; box-sizing: border-box; font-size: 1.2em; line-height: 1.5;">${escapeHtml(user.about_me || '')}</textarea>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">Partner Preferences</label>
                    <textarea id="editPartnerPreferences"
                              style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; resize: vertical; min-height: 144px; box-sizing: border-box; font-size: 1.2em; line-height: 1.5;">${escapeHtml(user.partner_preferences || '')}</textarea>
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
                        <input type="checkbox" id="editIsSuspended" ${user.is_suspended ? 'checked' : ''}>
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

        setupAutoResizeTextarea('editAboutMe');
        setupAutoResizeTextarea('editPartnerPreferences');
    } catch (error) {
        modalBody.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
}

function setupAutoResizeTextarea(elementId) {
    const textarea = document.getElementById(elementId);
    if (!textarea) return;

    const resizeToContent = () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    };

    textarea.addEventListener('input', resizeToContent);
    resizeToContent();
}

// Save user changes
async function saveUserChanges(userId) {
    const messageDiv = document.getElementById('editUserMessage');
    messageDiv.style.display = 'block';
    messageDiv.innerHTML = 'Saving...';
    messageDiv.style.color = '#666';

    try {
        const normalizeOptionalText = (value) => {
            const v = (value ?? '').toString().trim();
            if (!v) return null;
            const lower = v.toLowerCase();
            if (lower === 'n/a' || lower === 'not specified') return null;
            return v;
        };

        const normalizeBool = (value) => value === true || value === 'true' || value === 't' || value === '1' || value === 1;

        const candidate = {
            real_name: (document.getElementById('editUsername').value ?? '').trim(),
            email: (document.getElementById('editEmail').value ?? '').trim(),
            gender: document.getElementById('editGender').value || null,
            birthdate: document.getElementById('editBirthdate').value || null,
            about_me: normalizeOptionalText(document.getElementById('editAboutMe').value),
            partner_preferences: normalizeOptionalText(document.getElementById('editPartnerPreferences').value),
            email_verified: document.getElementById('editEmailVerified').checked,
            profile_verified: document.getElementById('editProfileVerified').checked,
            is_suspended: document.getElementById('editIsSuspended').checked
        };

        // Only send changed fields. This prevents "suspend" from accidentally flipping email verification.
        const snapshot = currentEditUserSnapshot || {};
        const updateData = {};

        if (((snapshot.real_name ?? '').toString().trim()) !== candidate.real_name) updateData.real_name = candidate.real_name;
        if (((snapshot.email ?? '').toString().trim()) !== candidate.email) updateData.email = candidate.email;
        if (((snapshot.gender ?? null) !== candidate.gender)) updateData.gender = candidate.gender;
        if (((snapshot.birthdate ?? null) ? snapshot.birthdate.toString().slice(0, 10) : null) !== candidate.birthdate) updateData.birthdate = candidate.birthdate;

        if (normalizeOptionalText(snapshot.about_me) !== candidate.about_me) updateData.about_me = candidate.about_me;
        if (normalizeOptionalText(snapshot.partner_preferences) !== candidate.partner_preferences) updateData.partner_preferences = candidate.partner_preferences;

        if (normalizeBool(snapshot.email_verified) !== candidate.email_verified) updateData.email_verified = candidate.email_verified;
        if (normalizeBool(snapshot.profile_verified) !== candidate.profile_verified) updateData.profile_verified = candidate.profile_verified;
        if (normalizeBool(snapshot.is_suspended) !== candidate.is_suspended) updateData.is_suspended = candidate.is_suspended;

        if (Object.keys(updateData).length === 0) {
            messageDiv.innerHTML = 'No changes to save.';
            messageDiv.style.color = '#666';
            return;
        }

        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });

        const data = await response.json();

        if (data.success) {
            messageDiv.innerHTML = 'User updated successfully!';
            messageDiv.style.color = '#28a745';
            pendingAnchorUserId = userId;
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
function selectSuspensionReason(title = 'Select Suspension Reason') {
    const reasons = [
        'Spam or scam behavior',
        'Harassment or abusive messages',
        'Inappropriate profile content',
        'Fake account or impersonation',
        'Payments expired',
        'Chargeback or payment fraud risk'
    ];

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0, 0, 0, 0.5)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '2000';

        const dialog = document.createElement('div');
        dialog.style.background = '#fff';
        dialog.style.borderRadius = '8px';
        dialog.style.padding = '20px';
        dialog.style.width = '100%';
        dialog.style.maxWidth = '420px';
        dialog.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.2)';

        const heading = document.createElement('h3');
        heading.textContent = title;
        heading.style.margin = '0 0 12px 0';

        const label = document.createElement('label');
        label.textContent = 'Reason (required)';
        label.style.display = 'block';
        label.style.marginBottom = '8px';

        const select = document.createElement('select');
        select.style.width = '100%';
        select.style.padding = '10px';
        select.style.border = '1px solid #d0d7de';
        select.style.borderRadius = '6px';
        select.style.marginBottom = '16px';

        reasons.forEach((reason) => {
            const option = document.createElement('option');
            option.value = reason;
            option.textContent = reason;
            select.appendChild(option);
        });

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'flex-end';
        actions.style.gap = '10px';

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
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            resolve(value);
        };

        cancelButton.addEventListener('click', () => close(null));
        confirmButton.addEventListener('click', () => close(select.value));
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close(null);
        });
    });
}

/** Preset reasons: shared by bulk blacklist, user blacklist, and Add blacklist entry. */
const BLACKLIST_REASON_OPTIONS = [
    'Financial scam',
    'Asking for money, gifts, or off-platform payment',
    'Minor safety / underage concern',
    'Threats, violence, or self-harm risk',
    'Hate speech, slurs, or discrimination',
    'Sexual harassment or unwanted explicit content',
    'Stalking, doxxing, or privacy violation',
    'Spam, bot, or mass messaging',
    'Fake photos, catfish, or stolen identity',
    'Impersonation of staff or another user',
    'Terms of service violation',
    'Other'
];

/** Predefined blacklist reasons (in-page select, no browser prompt). */
function selectBlacklistReason(title = 'Delete+Blacklist — select reason') {
    const reasons = BLACKLIST_REASON_OPTIONS;
    const scaleReasonUi = currentQuickTab === 'blacklisted';

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0, 0, 0, 0.5)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '2000';

        const dialog = document.createElement('div');
        dialog.className = 'bl-reason-dialog' + (scaleReasonUi ? ' bl-reason-dialog--scaled' : '');
        dialog.style.background = '#fff';
        dialog.style.borderRadius = '8px';
        dialog.style.padding = '20px';
        dialog.style.width = '100%';
        dialog.style.maxWidth = '440px';
        dialog.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.2)';

        const heading = document.createElement('h3');
        heading.textContent = title;
        heading.style.margin = '0 0 12px 0';

        const reasonLabel = document.createElement('label');
        reasonLabel.textContent = 'Reason (required)';
        reasonLabel.style.display = 'block';
        reasonLabel.style.marginBottom = '8px';

        const select = document.createElement('select');
        select.className = 'bl-reason-dialog__select';
        select.style.width = '100%';
        select.style.padding = '10px';
        select.style.border = '1px solid #d0d7de';
        select.style.borderRadius = '6px';
        select.style.marginBottom = '16px';

        reasons.forEach((reason) => {
            const option = document.createElement('option');
            option.value = reason;
            option.textContent = reason;
            select.appendChild(option);
        });

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'flex-end';
        actions.style.gap = '10px';

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btn btn-secondary';
        cancelButton.textContent = 'Cancel';

        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'btn btn-account-delete-blacklist';
        confirmButton.textContent = 'Continue';

        actions.appendChild(cancelButton);
        actions.appendChild(confirmButton);
        dialog.appendChild(heading);
        dialog.appendChild(reasonLabel);
        dialog.appendChild(select);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const close = (value) => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            resolve(value);
        };

        cancelButton.addEventListener('click', () => close(null));
        confirmButton.addEventListener('click', () =>
            close({
                reason: select.value,
                notes: ''
            })
        );
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close(null);
        });
    });
}

async function suspendUser(userId) {
    const reason = await selectSuspensionReason('Select Suspension Reason');
    if (!reason) {
        showWarning('Suspension reason selection is required.');
        return;
    }

    const confirmMessage = `Are you sure you want to SUSPEND this user?\n\n` +
        `Suspending will:\n` +
        `- Prevent the user from logging in\n` +
        `- Keep user email verification status unchanged\n` +
        `- User account remains active but inaccessible\n` +
        `- Record reason: ${reason}\n\n` +
        `Note: This is different from anonymizing an account. ` +
        `Suspended users can be unsuspended later.`;
    
    const confirmed = await showConfirm(confirmMessage, 'Suspend User', 'Suspend', 'Cancel', 'account_suspend');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/${userId}/suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
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
async function unsuspendUser(userId) {
    const confirmed = await showConfirm('Are you sure you want to unsuspend this user?', 'Unsuspend User', 'Unsuspend', 'Cancel', 'success');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/${userId}/suspend`, {
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
        'suspend': 'suspend',
        'unsuspend': 'unsuspend',
        'verify_email': 'verify email for',
        'unverify_email': 'unverify email for',
        'verify_profile': 'verify profile for',
        'unverify_profile': 'unverify profile for',
        'blacklist': 'delete+blacklist',
        'delete': 'delete'
    };
    const operationName = operationNames[operation] || operation.replace(/_/g, ' ');
    
    // For blacklist, get reason and notes
    let requestBody = {
        userIds: Array.from(selectedUsers),
        operation: operation
    };
    
    if (operation === 'suspend') {
        const reason = await selectSuspensionReason('Select Bulk Suspension Reason');
        if (!reason) {
            showWarning('Suspension reason selection is required.');
            return;
        }

        requestBody.data = { reason };
    }

    if (operation === 'blacklist') {
        const picked = await selectBlacklistReason('Bulk Delete+Blacklist — select reason');
        if (!picked) return;

        requestBody.data = {
            reason: picked.reason || '',
            notes: picked.notes || ''
        };
    }

    const bulkConfirmType =
        operation === 'suspend'
            ? 'account_suspend'
            : operation === 'delete'
              ? 'account_delete'
              : operation === 'blacklist'
                ? 'account_delete_blacklist'
                : 'warning';

    const confirmed = await showConfirm(
        `Are you sure you want to ${operationName} ${selectedUsers.size} user(s)?`,
        'Confirm Bulk Operation',
        'Confirm',
        'Cancel',
        bulkConfirmType
    );
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
            const sa = document.getElementById('selectAll');
            if (sa) sa.checked = false;
            updateBulkActions();
            loadUsers();
        } else {
            showError('Error: ' + (data.error || data.message || 'Failed to perform bulk operation'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

let blacklistFormMode = 'edit';
let blacklistEditEntryId = null;

function escapeAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function buildBlacklistAddFormBody(user) {
    const emailVal = user.email != null ? String(user.email) : '';
    const uip = user.user_ip_address != null ? String(user.user_ip_address) : '';
    const checked =
        user.stop_this_ip === true ||
        user.stop_this_ip === 't' ||
        user.stop_this_ip === 'true' ||
        user.stop_this_ip === 1;
    let html = '<form id="editBlacklistForm" class="bl-entry-form">';

    html += `<div class="bl-entry-form__row"><label class="bl-entry-form__label">Email (required)</label>`;
    html += `<input type="email" class="bl-entry-form__control" autocomplete="off" data-bl-col="email" value="${escapeAttr(
        emailVal
    )}"></div>`;

    html += `<div class="bl-entry-form__row"><label class="bl-entry-form__label">Reason (required)</label>`;
    html += buildBlacklistReasonSelectHtml('reason', user.reason);
    html += '</div>';

    html += `<div class="bl-entry-form__row"><label class="bl-entry-form__label">User IP address</label>`;
    html += `<input type="text" class="bl-entry-form__control" data-bl-col="user_ip_address" value="${escapeAttr(uip)}"></div>`;

    html += `<div class="bl-entry-form__row"><label class="bl-entry-form__check">`;
    html += `<input type="checkbox" data-bl-col="stop_this_ip" id="bl-add-stop-this-ip" ${checked ? 'checked' : ''}>`;
    html += `<span>Stop this IP</span></label></div>`;

    html += `<div class="bl-entry-form__row"><label class="bl-entry-form__label">Blacklisted at</label>`;
    html += `<p class="bl-entry-form__hint">Auto (server default)</p></div>`;

    html += '</form>';
    return html;
}

function buildBlacklistEditFormBody(user) {
    if (!user.blacklist_entry_id) {
        return buildBlacklistAddFormBody(user);
    }

    const cols =
        lastBlacklistColumns && lastBlacklistColumns.length
            ? lastBlacklistColumns
            : Object.keys(user)
                  .filter((k) => !['row_source', 'blacklist_entry_id'].includes(k))
                  .map((k) => ({ key: k, label: k }));
    const editable = cols.filter((c) => c.key !== 'id');
    const blacklistFieldLabels = {
        email: 'Email (required)',
        reason: 'Reason (required)',
        user_ip_address: 'User IP address',
        notes: 'Notes',
        blacklisted_at: 'Blacklisted at'
    };
    let html = '';
    html += '<form id="editBlacklistForm" class="bl-entry-form">';
    for (const c of editable) {
        const key = c.key;
        const val = user[key];
        if (key === 'stop_this_ip') {
            const checked = val === true || val === 't' || val === 'true' || val === 1;
            html += '<div class="bl-entry-form__row">';
            html += `<label class="bl-entry-form__check">`;
            html += `<input type="checkbox" data-bl-col="${escapeHtml(key)}" id="bl-edit-${escapeHtml(key)}" ${
                checked ? 'checked' : ''
            }>`;
            html += `<span>Stop this IP</span></label></div>`;
            continue;
        }
        const label = blacklistFieldLabels[key] ?? c.label ?? key;
        html += '<div class="bl-entry-form__row">';
        html += `<label class="bl-entry-form__label">${escapeHtml(String(label))}</label>`;
        if (key === 'blacklisted_at') {
            const display = formatBlacklistTimestamp(val);
            html += `<p class="bl-entry-form__hint">${escapeHtml(display)}</p>`;
        } else if (key === 'reason') {
            html += buildBlacklistReasonSelectHtml('reason', val);
        } else if (key === 'notes') {
            const textVal = val == null ? '' : String(val);
            html += `<textarea class="bl-entry-form__control" data-bl-col="${escapeHtml(key)}" id="bl-edit-${escapeHtml(
                key
            )}" rows="4">${escapeHtml(textVal)}</textarea>`;
        } else {
            html += `<input type="text" class="bl-entry-form__control" data-bl-col="${escapeHtml(
                key
            )}" id="bl-edit-${escapeHtml(key)}" value="${escapeAttr(val == null ? '' : String(val))}">`;
        }
        html += '</div>';
    }
    html += '</form>';
    return html;
}

function collectBlacklistEditPayload() {
    const payload = {};
    const form = document.getElementById('editBlacklistForm');
    if (!form) return payload;
    form.querySelectorAll('[data-bl-col]').forEach((el) => {
        const col = el.getAttribute('data-bl-col');
        if (!col) return;
        if (el.type === 'checkbox') {
            payload[col] = el.checked;
        } else {
            payload[col] = el.value;
        }
    });
    return payload;
}

function openAddBlacklistModal() {
    blacklistFormMode = 'add';
    blacklistEditEntryId = null;
    const blank = {
        row_source: 'blacklist_entry',
        email: '',
        reason: BLACKLIST_REASON_OPTIONS[0],
        user_ip_address: '',
        stop_this_ip: true
    };
    const titleEl = document.getElementById('editBlacklistModalTitle');
    if (titleEl) titleEl.textContent = 'Add blacklist entry';
    const body = document.getElementById('editBlacklistModalBody');
    const err = document.getElementById('editBlacklistModalError');
    if (err) {
        err.style.display = 'none';
        err.textContent = '';
    }
    if (body) body.innerHTML = buildBlacklistEditFormBody(blank);
    const modal = document.getElementById('editBlacklistModal');
    if (modal) modal.style.display = 'block';
}

function openEditBlacklistModal(user) {
    blacklistFormMode = 'edit';
    blacklistEditEntryId = user.blacklist_entry_id || user.id;
    const titleEl = document.getElementById('editBlacklistModalTitle');
    if (titleEl) titleEl.textContent = 'Edit blacklist entry';
    const body = document.getElementById('editBlacklistModalBody');
    const err = document.getElementById('editBlacklistModalError');
    if (err) {
        err.style.display = 'none';
        err.textContent = '';
    }
    if (body) body.innerHTML = buildBlacklistEditFormBody(user);
    const modal = document.getElementById('editBlacklistModal');
    if (modal) modal.style.display = 'block';
}

function closeEditBlacklistModal() {
    blacklistFormMode = 'edit';
    blacklistEditEntryId = null;
    const modal = document.getElementById('editBlacklistModal');
    if (modal) modal.style.display = 'none';
}

function setupEditBlacklistModal() {
    const modal = document.getElementById('editBlacklistModal');
    if (!modal) return;
    document.getElementById('editBlacklistModalClose')?.addEventListener('click', closeEditBlacklistModal);
    document.getElementById('editBlacklistModalCancel')?.addEventListener('click', closeEditBlacklistModal);
    document.getElementById('editBlacklistModalSave')?.addEventListener('click', saveEditBlacklistModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeEditBlacklistModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeEditBlacklistModal();
        }
    });
}

async function saveEditBlacklistModal() {
    const isAdd = blacklistFormMode === 'add';
    if (!isAdd && !blacklistEditEntryId) return;
    const errEl = document.getElementById('editBlacklistModalError');
    const saveBtn = document.getElementById('editBlacklistModalSave');
    if (errEl) {
        errEl.style.display = 'none';
        errEl.textContent = '';
    }
    const payload = collectBlacklistEditPayload();
    if (isAdd) {
        delete payload.blacklisted_at;
    }
    if (saveBtn) saveBtn.disabled = true;
    try {
        const url = isAdd ? '/api/users/blacklist' : `/api/users/blacklist/${blacklistEditEntryId}`;
        const method = isAdd ? 'POST' : 'PUT';
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success) {
            showSuccess(data.message || (isAdd ? 'Blacklist entry created.' : 'Blacklist entry saved.'));
            closeEditBlacklistModal();
            loadUsers();
            loadUserSummary();
        } else {
            const msg = data.error || data.message || `Failed to save (${response.status})`;
            if (errEl) {
                errEl.textContent = msg;
                errEl.style.display = 'block';
            }
            showError(msg);
        }
    } catch (e) {
        if (errEl) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        }
        showError(e.message);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

window.openEditBlacklistModalById = function (entryId) {
    const cache = window.__blacklistEntryCache || {};
    const row = cache[String(entryId)];
    if (!row) {
        showError('Entry not found on this page. Refresh the list and try again.');
        return;
    }
    openEditBlacklistModal(row);
};

async function removeFromBlacklist(blacklistEntryId, modalUserId) {
    const confirmed = await showConfirm(
        'Remove this blacklist entry? The email will no longer be treated as blacklisted by this list.',
        'Remove from blacklist',
        'Remove',
        'Cancel',
        'info'
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/blacklist/${blacklistEntryId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            showSuccess(data.message || 'Blacklist entry removed.');
            if (modalUserId != null && Number.isFinite(Number(modalUserId))) {
                viewUser(Number(modalUserId));
            }
            loadUsers();
            loadUserSummary();
        } else {
            showError('Error: ' + (data.error || data.message || 'Failed to remove from blacklist'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Blacklist user — archive on admin blacklist then hard-delete account (admin-server1 behavior)
async function blacklistUser(userId) {
    const picked = await selectBlacklistReason('Delete+Blacklist — select reason');
    if (!picked) return;

    const { reason, notes } = picked;

    const confirmMessage =
        `⚠️ DELETE+BLACKLIST:\n\n` +
        `This will:\n` +
        `- Save their details to the admin blacklist table\n` +
        `- Permanently delete their account from the users table (same as admin delete)\n` +
        `- Reason: ${reason}`;

    const confirmed = await showConfirm(confirmMessage, 'Delete+Blacklist', 'Delete+Blacklist', 'Cancel', 'account_delete_blacklist');
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
            let msg = data.message || 'User removed from accounts and recorded on the admin blacklist.';
            if (data.notice) {
                msg += '\n\n' + data.notice;
            }
            showSuccess(msg);
            document.getElementById('userModal').style.display = 'none';
            loadUsers();
        } else {
            showError('Error: ' + (data.error || 'Failed to blacklist user'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Delete user account (hard delete)
function deactivateUserAccount(userId) {
    openDeleteUserModal(userId);
}

function setupDeleteUserModal() {
    const modal = document.getElementById('adminDeleteUserModal');
    if (!modal) return;

    const closeButtons = modal.querySelectorAll('[data-action="close-delete-modal"]');
    closeButtons.forEach((button) => button.addEventListener('click', closeDeleteUserModal));

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeDeleteUserModal();
        }
    });

    const confirmBtn = document.getElementById('adminDeleteConfirmBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmAdminDelete);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.style.display === 'block') {
            closeDeleteUserModal();
        }
    });
}

function openDeleteUserModal(userId) {
    const modal = document.getElementById('adminDeleteUserModal');
    if (!modal) return;

    deleteModalUserId = userId;

    const targetName = currentModalUser?.real_name || currentModalUser?.username || `User #${userId}`;
    const targetEmail = currentModalUser?.email || 'Not provided';

    const nameEl = document.getElementById('adminDeleteUserName');
    if (nameEl) nameEl.textContent = targetName;

    const emailEl = document.getElementById('adminDeleteUserEmail');
    if (emailEl) emailEl.textContent = targetEmail;

    const serverError = document.getElementById('adminDeleteServerError');
    if (serverError) {
        serverError.textContent = '';
        serverError.style.display = 'none';
    }

    const confirmBtn = document.getElementById('adminDeleteConfirmBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
    }

    resetDeleteProcessingState();
    showDeleteUserStep(1);
    modal.style.display = 'block';
}

function closeDeleteUserModal() {
    const modal = document.getElementById('adminDeleteUserModal');
    if (!modal) return;

    modal.style.display = 'none';
    deleteModalUserId = null;

    const confirmBtn = document.getElementById('adminDeleteConfirmBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
    }

    const serverError = document.getElementById('adminDeleteServerError');
    if (serverError) {
        serverError.textContent = '';
        serverError.style.display = 'none';
    }

    showDeleteUserStep(1);
}

function showDeleteUserStep(step) {
    const steps = {
        1: document.getElementById('admin-delete-step1'),
        2: document.getElementById('admin-delete-step2')
    };

    Object.entries(steps).forEach(([key, element]) => {
        if (element) {
            element.style.display = parseInt(key, 10) === step ? 'block' : 'none';
        }
    });

    if (step === 2) {
        resetDeleteProcessingState();
    }
}

function resetDeleteProcessingState() {
    const spinner = document.getElementById('adminDeleteSpinner');
    if (spinner) {
        spinner.style.display = 'block';
    }

    const title = document.getElementById('adminDeleteProcessingTitle');
    if (title) {
        title.textContent = 'Deleting Account...';
    }

    const text = document.getElementById('adminDeleteProcessingText');
    if (text) {
        text.textContent = 'Please wait while we permanently remove this account.';
    }

    const resultMessage = document.getElementById('adminDeleteResultMessage');
    if (resultMessage) {
        resultMessage.textContent = '';
        resultMessage.classList.remove('success');
    }
}

async function confirmAdminDelete() {
    if (!deleteModalUserId) return;

    const serverErrorEl = document.getElementById('adminDeleteServerError');
    if (serverErrorEl) {
        serverErrorEl.textContent = '';
        serverErrorEl.style.display = 'none';
    }

    const confirmBtn = document.getElementById('adminDeleteConfirmBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
    }

    showDeleteUserStep(2);

    const spinner = document.getElementById('adminDeleteSpinner');
    const resultMessage = document.getElementById('adminDeleteResultMessage');
    const title = document.getElementById('adminDeleteProcessingTitle');
    const text = document.getElementById('adminDeleteProcessingText');

    if (resultMessage) {
        resultMessage.textContent = '';
        resultMessage.classList.remove('success');
    }

    try {
        const response = await fetch(`/api/users/${deleteModalUserId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        let data = {};
        try {
            data = await response.json();
        } catch (jsonError) {
            data = {};
        }

        if (!response.ok || !data.success) {
            throw new Error(data.error || `Server error (${response.status})`);
        }

        if (spinner) {
            spinner.style.display = 'none';
        }

        if (title) {
            title.textContent = 'Account Deleted';
        }

        if (text) {
            text.textContent = 'The user has been permanently removed.';
        }

        if (resultMessage) {
            resultMessage.innerHTML = '✅ Account deleted. All user data has been purged.';
            resultMessage.classList.add('success');
        }

        showSuccess('User account permanently deleted.');

        setTimeout(() => {
            closeDeleteUserModal();
            const userModal = document.getElementById('userModal');
            if (userModal) {
                userModal.style.display = 'none';
            }
            currentModalUser = null;
            loadUsers();
        }, 1500);
    } catch (error) {
        showDeleteUserStep(1);
        const serverError = document.getElementById('adminDeleteServerError');
        if (serverError) {
            serverError.textContent = `Failed to delete account: ${error.message}`;
            serverError.style.display = 'block';
        }
        if (confirmBtn) {
            confirmBtn.disabled = false;
        }
        showError('Error: ' + error.message);
    }
}

// Utility: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}















