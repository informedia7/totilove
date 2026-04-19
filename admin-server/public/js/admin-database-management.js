// Admin Database Management JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Corruption Checker
    const checkCorruptionBtn = document.getElementById('check-corruption-btn');
    const fixCorruptionBtn = document.getElementById('fix-corruption-btn');
    const corruptionStatus = document.getElementById('corruption-status');
    const corruptionSummary = document.getElementById('corruption-summary');
    const corruptionDetails = document.getElementById('corruption-details');
    const corruptionLoading = document.getElementById('corruption-loading');

    if (checkCorruptionBtn) {
        checkCorruptionBtn.addEventListener('click', async function() {
            checkCorruptionBtn.disabled = true;
            checkCorruptionBtn.textContent = 'Checking...';
            corruptionLoading.style.display = 'block';
            corruptionStatus.style.display = 'none';
            fixCorruptionBtn.style.display = 'none';

            try {
                const response = await fetch('/api/corruption/check', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const data = await response.json();
                corruptionLoading.style.display = 'none';

                if (response.ok && data.success) {
                    displayCorruptionResults(data.summary);
                    if (data.summary.totalIssues > 0) {
                        fixCorruptionBtn.style.display = 'inline-block';
                    }
                } else {
                    showCorruptionError(data.error || 'Failed to check corruption');
                }
            } catch (error) {
                corruptionLoading.style.display = 'none';
                showCorruptionError('An error occurred. Please try again.');
                console.error('Corruption check error:', error);
            } finally {
                checkCorruptionBtn.disabled = false;
                checkCorruptionBtn.textContent = 'Check Corruption';
            }
        });
    }

    if (fixCorruptionBtn) {
        fixCorruptionBtn.addEventListener('click', async function() {
            const confirmed = await showConfirm('Are you sure you want to fix all corruption issues? This action cannot be undone.', 'Fix Corruption Issues', 'Fix All', 'Cancel', 'warning');
            if (!confirmed) {
                return;
            }

            fixCorruptionBtn.disabled = true;
            fixCorruptionBtn.textContent = 'Fixing...';
            corruptionLoading.style.display = 'block';

            try {
                const response = await fetch('/api/corruption/fix', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const data = await response.json();
                corruptionLoading.style.display = 'none';

                if (response.ok && data.success) {
                    displayCorruptionResults(data.summary, true);
                    if (data.summary.totalIssues === 0) {
                        fixCorruptionBtn.style.display = 'none';
                    }
                } else {
                    showCorruptionError(data.error || 'Failed to fix corruption');
                }
            } catch (error) {
                corruptionLoading.style.display = 'none';
                showCorruptionError('An error occurred. Please try again.');
                console.error('Corruption fix error:', error);
            } finally {
                fixCorruptionBtn.disabled = false;
                fixCorruptionBtn.textContent = 'Fix Issues';
            }
        });
    }

    function displayCorruptionResults(summary, isAfterFix = false) {
        corruptionStatus.style.display = 'block';
        
        const statusColor = summary.totalIssues === 0 ? '#28a745' : '#dc3545';
        const statusIcon = summary.totalIssues === 0 ? '✅' : '❌';
        const statusText = summary.totalIssues === 0 ? 'Database is clean!' : `${summary.totalIssues} issue(s) found`;
        
        corruptionSummary.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <span style="font-size: 24px;">${statusIcon}</span>
                <h3 style="margin: 0; color: ${statusColor};">${statusText}</h3>
                ${isAfterFix ? '<span style="color: #28a745; font-weight: 500;">(Fixes applied)</span>' : ''}
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-top: 16px;">
                <div style="padding: 12px; background: #f8f9fa; border-radius: 6px;">
                    <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${summary.highSeverity}</div>
                    <div style="color: #666; font-size: 12px;">High Severity</div>
                </div>
                <div style="padding: 12px; background: #f8f9fa; border-radius: 6px;">
                    <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${summary.mediumSeverity}</div>
                    <div style="color: #666; font-size: 12px;">Medium Severity</div>
                </div>
                <div style="padding: 12px; background: #f8f9fa; border-radius: 6px;">
                    <div style="font-size: 24px; font-weight: bold; color: #17a2b8;">${summary.lowSeverity}</div>
                    <div style="color: #666; font-size: 12px;">Low Severity</div>
                </div>
                <div style="padding: 12px; background: #f8f9fa; border-radius: 6px;">
                    <div style="font-size: 24px; font-weight: bold; color: #667eea;">${summary.affectedUsers}</div>
                    <div style="color: #666; font-size: 12px;">Affected Users</div>
                </div>
            </div>
        `;

        if (summary.issues && summary.issues.length > 0) {
            const groupedByUser = {};
            summary.issues.forEach(issue => {
                if (!groupedByUser[issue.user_id]) {
                    groupedByUser[issue.user_id] = [];
                }
                groupedByUser[issue.user_id].push(issue);
            });

            let detailsHTML = '<h4 style="margin-top: 20px; margin-bottom: 12px;">Detailed Issues:</h4>';
            Object.entries(groupedByUser).forEach(([userId, userIssues]) => {
                const user = userIssues[0];
                detailsHTML += `
                    <div style="padding: 12px; margin-bottom: 12px; background: #fff; border-left: 4px solid #dc3545; border-radius: 4px;">
                        <div style="font-weight: 500; margin-bottom: 8px;">User ${userId} (${user.email || 'N/A'}):</div>
                        <ul style="margin: 0; padding-left: 20px;">
                            ${userIssues.map(issue => `
                                <li style="margin-bottom: 4px;">
                                    <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; 
                                        background: ${issue.severity === 'high' ? '#dc3545' : issue.severity === 'medium' ? '#ffc107' : '#17a2b8'}; 
                                        color: white; margin-right: 8px;">
                                        ${issue.severity.toUpperCase()}
                                    </span>
                                    ${issue.issue}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            });
            corruptionDetails.innerHTML = detailsHTML;
        } else {
            corruptionDetails.innerHTML = '<p style="color: #28a745; font-weight: 500;">✅ No corruption issues found. Database is healthy!</p>';
        }
    }

    function showCorruptionError(message) {
        corruptionStatus.style.display = 'block';
        corruptionSummary.innerHTML = `
            <div style="padding: 12px; background: #f8d7da; color: #721c24; border-radius: 6px; border: 1px solid #f5c6cb;">
                <strong>Error:</strong> ${message}
            </div>
        `;
        corruptionDetails.innerHTML = '';
    }

    // Database Tables Overview
    const refreshTablesBtn = document.getElementById('refresh-tables-btn');
    const tablesLoading = document.getElementById('tables-loading');
    const tablesOverview = document.getElementById('tables-overview');
    const tablesStats = document.getElementById('tables-stats');

    if (refreshTablesBtn) {
        refreshTablesBtn.addEventListener('click', async function() {
            refreshTablesBtn.disabled = true;
            refreshTablesBtn.textContent = 'Loading...';
            tablesLoading.style.display = 'block';
            tablesOverview.style.display = 'none';

            try {
                const response = await fetch('/api/corruption/tables', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const data = await response.json();
                tablesLoading.style.display = 'none';

                if (response.ok && data.success) {
                    displayTablesStats(data.tables);
                    tablesOverview.style.display = 'block';
                } else {
                    showError(data.error || 'Failed to load table statistics');
                }
            } catch (error) {
                tablesLoading.style.display = 'none';
                showError('An error occurred. Please try again.');
                console.error('Tables overview error:', error);
            } finally {
                refreshTablesBtn.disabled = false;
                refreshTablesBtn.textContent = 'Refresh Statistics';
            }
        });

        // Auto-load on page load
        refreshTablesBtn.click();
    }

    // Orphan Cleanup Elements
    const cleanupBtn = document.getElementById('cleanup-orphans-btn');
    const cleanupLoading = document.getElementById('orphan-cleanup-loading');
    const cleanupResults = document.getElementById('orphan-cleanup-results');
    const cleanupSummary = document.getElementById('orphan-cleanup-summary');
    const cleanupTables = document.getElementById('orphan-cleanup-table-results');
    const cleanupFiles = document.getElementById('orphan-cleanup-file-results');
    const cleanupWarnings = document.getElementById('orphan-cleanup-warnings');

    if (cleanupBtn) {
        cleanupBtn.addEventListener('click', async function() {
            const confirmed = typeof showConfirm === 'function'
                ? await showConfirm(
                    'This will permanently delete orphaned database rows and remove stray upload files. Only run this after ensuring recent deletions are complete.',
                    'Clean Orphaned Data',
                    'Clean & Remove',
                    'Cancel',
                    'danger'
                )
                : window.confirm('Clean orphaned records and files now?');

            if (!confirmed) {
                return;
            }

            const defaultLabel = cleanupBtn.textContent;
            cleanupBtn.disabled = true;
            cleanupBtn.textContent = 'Cleaning...';
            cleanupLoading.style.display = 'block';
            cleanupResults.style.display = 'none';

            try {
                const response = await fetch('/api/corruption/cleanup-orphans', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const data = await response.json();
                cleanupLoading.style.display = 'none';

                if (response.ok && data.success) {
                    renderOrphanCleanupResults(data.summary);
                    if (typeof showSuccess === 'function') {
                        showSuccess('Orphaned data cleanup completed.');
                    }
                } else {
                    const message = data.error || 'Failed to clean orphaned data';
                    if (typeof showError === 'function') {
                        showError(message);
                    }
                }
            } catch (error) {
                cleanupLoading.style.display = 'none';
                console.error('Orphan cleanup error:', error);
                if (typeof showError === 'function') {
                    showError('Unexpected error while cleaning orphaned data.');
                }
            } finally {
                cleanupBtn.disabled = false;
                cleanupBtn.textContent = defaultLabel;
            }
        });
    }

    function renderOrphanCleanupResults(summary) {
        if (!summary || !cleanupResults) {
            return;
        }

        cleanupResults.style.display = 'block';

        const runAt = summary.timestamp ? new Date(summary.timestamp).toLocaleString() : 'Just now';
        const totalRows = summary.totalDeletedRecords || 0;
        const fileCleanup = summary.fileCleanup || {};
        const removedFiles = fileCleanup.removedFiles || 0;
        const checkedFiles = fileCleanup.checkedFiles || 0;
        const skippedRecent = fileCleanup.skippedRecent || 0;
        const directories = fileCleanup.directoriesScanned || [];

        cleanupSummary.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
                <div style="padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #28a745;">
                    <div style="font-size: 28px; font-weight: 700; color: #28a745;">${totalRows.toLocaleString()}</div>
                    <div style="color: #666; font-size: 13px;">Orphaned DB rows removed</div>
                </div>
                <div style="padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #e67e22;">
                    <div style="font-size: 28px; font-weight: 700; color: #e67e22;">${removedFiles.toLocaleString()}</div>
                    <div style="color: #666; font-size: 13px;">Stray upload files deleted</div>
                </div>
                <div style="padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #667eea;">
                    <div style="font-size: 20px; font-weight: 600; color: #667eea;">${runAt}</div>
                    <div style="color: #666; font-size: 13px;">Last cleanup run</div>
                </div>
            </div>
        `;

        const tableRows = (summary.tableResults || []).map(result => {
            const state = result.error ? 'Error'
                : result.skipped ? 'Skipped'
                : result.deleted > 0 ? 'Cleaned'
                : 'No change';
            const color = result.error ? '#dc3545' : result.skipped ? '#ffc107' : '#28a745';
            return `
                <tr>
                    <td>${escapeHtml(result.table)}</td>
                    <td>${escapeHtml(result.description)}</td>
                    <td style="text-align:center; font-weight:600;">${result.deleted}</td>
                    <td style="text-align:center; color:${color}; font-weight:600;">${state}</td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="4" style="text-align:center; color:#777;">No tables were processed.</td></tr>';

        cleanupTables.innerHTML = `
            <h4 style="margin-bottom: 8px;">Database Tables</h4>
            <div style="overflow-x: auto;">
                <table style="width:100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f0f2f5;">
                            <th style="padding: 10px; text-align: left;">Table</th>
                            <th style="padding: 10px; text-align: left;">Scope</th>
                            <th style="padding: 10px; text-align: center; width: 140px;">Deleted Rows</th>
                            <th style="padding: 10px; text-align: center; width: 120px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;

        const sampleFiles = (fileCleanup.sampleFilenames || []).map(file => `<li>${escapeHtml(file)}</li>`).join('');
        const failures = (fileCleanup.failures || []).map(item => `<li>${escapeHtml(item.file || item.directory)} — ${escapeHtml(item.error)}</li>`).join('');

        cleanupFiles.innerHTML = `
            <h4 style="margin-bottom: 8px;">Uploads Directory</h4>
            <div style="padding: 14px; border-radius: 8px; background: #f8f9fa; border-left: 4px solid #e67e22;">
                <p style="margin: 0 0 8px 0; color: #444;">
                    Checked <strong>${checkedFiles.toLocaleString()}</strong> files across
                    <strong>${directories.length}</strong> directories.
                    Skipped <strong>${skippedRecent}</strong> recent uploads to avoid deleting in-progress files.
                </p>
                <p style="margin: 0 0 8px 0; color: #444;">Directories scanned:</p>
                <ul style="margin: 0 0 12px 20px; color: #666;">
                    ${directories.length ? directories.map(dir => `<li>${escapeHtml(dir)}</li>`).join('') : '<li>No directories detected</li>'}
                </ul>
                ${sampleFiles ? `<p style="margin: 0 0 6px 0; color: #444;">Sample removed files:</p><ul style="margin: 0 0 0 20px; color: #666;">${sampleFiles}</ul>` : ''}
                ${failures ? `<p style="margin: 12px 0 6px 0; color: #b23c17;">Files that could not be removed:</p><ul style="margin: 0 0 0 20px; color: #b23c17;">${failures}</ul>` : ''}
            </div>
        `;

        if (cleanupWarnings) {
            const warnings = summary.warnings?.filter(Boolean) || [];
            if (warnings.length > 0) {
                cleanupWarnings.style.display = 'block';
                cleanupWarnings.innerHTML = `
                    <strong>Warnings:</strong>
                    <ul style="margin: 8px 0 0 18px;">
                        ${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
                    </ul>
                `;
            } else {
                cleanupWarnings.style.display = 'none';
                cleanupWarnings.innerHTML = '';
            }
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function displayTablesStats(tables) {
        if (!tables || tables.length === 0) {
            tablesStats.innerHTML = '<p style="color: #666;">No table statistics available</p>';
            return;
        }

        const tablesHTML = tables.map(table => `
            <div style="padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #667eea;">
                <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px; color: #333;">
                    ${table.table_name}
                </div>
                <div style="font-size: 24px; font-weight: bold; color: #667eea; margin-bottom: 4px;">
                    ${table.row_count.toLocaleString()}
                </div>
                <div style="color: #666; font-size: 12px;">
                    ${table.row_count === 1 ? 'row' : 'rows'}
                </div>
            </div>
        `).join('');

        tablesStats.innerHTML = tablesHTML;
    }
});


