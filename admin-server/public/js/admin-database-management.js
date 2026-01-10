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


