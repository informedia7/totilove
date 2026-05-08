/**
 * Analysis & Testing Page JavaScript
 * Handles tab navigation and both Presence Diagnostics and Page Analysis features
 */

let currentAnalysisData = null;
let analysisFilter = 'all';

document.addEventListener('DOMContentLoaded', function() {
    initializeTabs();
    initializePresenceDiagnostics();
    initializePageAnalysis();
});

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update button states
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update tab content
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
}

// ============================================================================
// PRESENCE DIAGNOSTICS
// ============================================================================

function initializePresenceDiagnostics() {
    const runBtn = document.getElementById('run-presence-tests');
    
    if (runBtn) {
        runBtn.addEventListener('click', runPresenceDiagnostics);
        // Load cached results on page load
        loadPresenceDiagnosticsCache();
    }
}

async function runPresenceDiagnostics() {
    const runBtn = document.getElementById('run-presence-tests');
    const resultsContainer = document.getElementById('presence-tests-results');
    const statusChip = document.getElementById('presence-tests-status');
    
    // Set loading state
    runBtn.disabled = true;
    runBtn.textContent = '⏳ Running...';
    statusChip.textContent = 'Running';
    statusChip.className = 'presence-status-chip presence-status-running';
    
    try {
        const response = await fetch('/api/presence-tests/run', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Update timestamp
            const lastRun = new Date(data.timestamp).toLocaleString();
            document.getElementById('presence-tests-last-run').textContent = lastRun;
            
            // Update summary
            updatePresenceSummary(data.summary);
            
            // Display results
            displayPresenceResults(data.tests);
            
            // Update status
            const failed = data.summary.failed > 0;
            statusChip.textContent = failed ? 'Attention required' : 'All passing';
            statusChip.className = failed ? 
                'presence-status-chip presence-status-failed' : 
                'presence-status-chip presence-status-passed';
            
            // Show alert if there are failures
            const alertElement = document.getElementById('presence-tests-alert');
            if (failed) {
                alertElement.className = 'presence-tests-alert alert-error';
                alertElement.innerHTML = `<strong>⚠️ Attention required</strong><br>Some diagnostic tests have failed.`;
                alertElement.style.display = 'block';
            } else {
                alertElement.style.display = 'none';
            }
        } else {
            showError(resultsContainer, 'Failed to run diagnostics', data.error);
        }
    } catch (error) {
        console.error('Diagnostics error:', error);
        showError(resultsContainer, 'Error running diagnostics', error.message);
        statusChip.textContent = 'Error';
        statusChip.className = 'presence-status-chip presence-status-error';
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = '▶ Run Diagnostics';
    }
}

function updatePresenceSummary(summary) {
    document.querySelector('[data-summary="total"]').textContent = summary.total;
    document.querySelector('[data-summary="passed"]').textContent = summary.passing;
    document.querySelector('[data-summary="failed"]').textContent = summary.failing;
    document.querySelector('[data-summary="usersTested"]').textContent = summary.usersTested || '—';
    document.querySelector('[data-summary="usersPassing"]').textContent = summary.usersPassing || '—';
}

function displayPresenceResults(tests) {
    const resultsContainer = document.getElementById('presence-tests-results');
    resultsContainer.innerHTML = '';
    
    tests.forEach(test => {
        const testCard = document.createElement('div');
        testCard.className = `presence-test-result ${test.status}`;
        
        const statusIcon = test.status === 'pass' ? '✅' : '❌';
        const details = test.status === 'pass' ? 
            formatJSON(test.details) : 
            `<strong>Error:</strong> ${test.error}`;
        
        testCard.innerHTML = `
            <div class="presence-test-header">
                <h3>${statusIcon} ${test.label}</h3>
                <span class="presence-test-duration">${test.durationMs}ms</span>
            </div>
            <p class="presence-test-description">${test.description}</p>
            <pre class="presence-test-details">${details}</pre>
        `;
        
        resultsContainer.appendChild(testCard);
    });
}

function loadPresenceDiagnosticsCache() {
    // In a production app, you might load cached results here
    // For now, we keep the placeholder until the user runs diagnostics
}

// ============================================================================
// PAGE ANALYSIS
// ============================================================================

function initializePageAnalysis() {
    const runBtn = document.getElementById('run-analysis-btn');
    const searchInput = document.getElementById('page-search');
    const filterButtons = document.querySelectorAll('.issue-filter-btn');
    
    if (runBtn) {
        runBtn.addEventListener('click', runPageAnalysis);
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', filterPages);
    }
    
    if (filterButtons) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                analysisFilter = this.getAttribute('data-severity');
                filterIssues(analysisFilter);
                updateFilterButtons();
            });
        });
    }
    
    // Load cached analysis on page load
    loadPageAnalysisCache();
}

async function runPageAnalysis() {
    const runBtn = document.getElementById('run-analysis-btn');
    const loadingDiv = document.getElementById('analysis-loading');
    const resultsDiv = document.getElementById('analysis-results');
    const placeholderDiv = document.getElementById('analysis-placeholder');
    
    // Hide placeholder and results, show loading
    placeholderDiv.style.display = 'none';
    resultsDiv.style.display = 'none';
    loadingDiv.style.display = 'block';
    
    // Disable button
    runBtn.disabled = true;
    runBtn.textContent = '⏳ Analyzing...';
    
    try {
        const response = await fetch('/api/page-analysis/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            currentAnalysisData = data.report;
            displayPageAnalysisResults(data.report);
            resultsDiv.style.display = 'block';
        } else {
            placeholderDiv.innerHTML = `<p style="color: #dc3545;">Error: ${data.error}</p>`;
            placeholderDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Analysis error:', error);
        placeholderDiv.innerHTML = `<p style="color: #dc3545;">Error analyzing pages: ${error.message}</p>`;
        placeholderDiv.style.display = 'block';
    } finally {
        loadingDiv.style.display = 'none';
        runBtn.disabled = false;
        runBtn.textContent = '🔍 Run Analysis';
    }
}

function displayPageAnalysisResults(report) {
    // Update summary statistics
    document.getElementById('stat-total-pages').textContent = report.totalPages || 0;
    document.getElementById('stat-total-functions').textContent = report.summary?.totalFunctions || 0;
    document.getElementById('stat-total-api-calls').textContent = report.summary?.totalApiCalls || 0;
    document.getElementById('stat-total-issues').textContent = report.summary?.totalIssues || 0;
    document.getElementById('stat-pages-with-errors').textContent = report.summary?.pagesWithErrors || 0;
    
    // Display issues
    displayIssues(report.pages);
    
    // Display pages
    displayPages(report.pages);
}

function displayIssues(pages) {
    const issuesList = document.getElementById('issues-list');
    issuesList.innerHTML = '';
    
    const allIssues = [];
    
    pages.forEach(page => {
        if (page.issues && page.issues.length > 0) {
            page.issues.forEach(issue => {
                allIssues.push({
                    page: page.name,
                    ...issue
                });
            });
        }
    });
    
    if (allIssues.length === 0) {
        issuesList.innerHTML = '<p style="color: #666;">No issues found</p>';
        return;
    }
    
    allIssues.forEach(issue => {
        const issueEl = document.createElement('div');
        issueEl.className = `issue-item issue-${issue.severity}`;
        issueEl.setAttribute('data-severity', issue.severity);
        
        const severityIcon = {
            'error': '❌',
            'warning': '⚠️'
        }[issue.severity] || 'ℹ️';
        
        issueEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong>${severityIcon} ${issue.message}</strong>
                <span style="color: #999;">Page: ${issue.page}</span>
            </div>
            ${issue.line ? `<div style="color: #666; font-size: 12px;">Line: ${issue.line}</div>` : ''}
            ${issue.type ? `<div style="color: #888; font-size: 11px; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${issue.type.replace(/_/g, ' ')}</div>` : ''}
        `;
        
        issuesList.appendChild(issueEl);
    });
}

function displayPages(pages) {
    const pagesList = document.getElementById('pages-list');
    pagesList.innerHTML = '';
    
    pages.forEach(page => {
        const pageEl = document.createElement('div');
        pageEl.className = 'page-item';
        pageEl.setAttribute('data-page-name', page.name.toLowerCase());
        
        const hasIssues = page.issues && page.issues.length > 0;
        const hasErrors = page.issues && page.issues.some(i => i.severity === 'error');
        const issueIcon = hasErrors ? '❌' : hasIssues ? '⚠️' : '✅';

        const issuesHtml = hasIssues ? page.issues.map(issue => {
            const icon = issue.severity === 'error' ? '❌' : '⚠️';
            const color = issue.severity === 'error' ? '#dc3545' : '#856404';
            const bg = issue.severity === 'error' ? '#fff5f5' : '#fffbea';
            const border = issue.severity === 'error' ? '#dc3545' : '#ffc107';
            return `
                <div style="margin-top: 8px; padding: 8px 10px; background: ${bg}; border-left: 3px solid ${border}; border-radius: 0 4px 4px 0; font-size: 12px;">
                    <div style="color: ${color}; font-weight: 600; margin-bottom: 2px;">${icon} ${issue.message}</div>
                    <div style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;">${(issue.type || '').replace(/_/g, ' ')}${issue.line ? ` · Line ${issue.line}` : ''}</div>
                </div>`;
        }).join('') : '';

        pageEl.innerHTML = `
            <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong>${issueIcon} ${page.name}</strong>
                    <span style="color: #999; font-size: 12px;">${page.size} bytes</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; font-size: 12px;">
                    <div>📝 ${page.functions?.length || 0} functions</div>
                    <div>🔌 ${page.apiCalls?.length || 0} API calls</div>
                    <div>👂 ${page.eventListeners?.length || 0} listeners</div>
                    ${hasIssues ? `<div style="color: ${hasErrors ? '#dc3545' : '#856404'}; font-weight: 600;">${issueIcon} ${page.issues.length} issue${page.issues.length !== 1 ? 's' : ''}</div>` : '<div style="color: #28a745;">✅ No issues</div>'}
                </div>
                ${issuesHtml}
            </div>
        `;
        
        pagesList.appendChild(pageEl);
    });
}

function filterIssues(severity) {
    const issuesList = document.getElementById('issues-list');
    const issueItems = issuesList.querySelectorAll('.issue-item');
    
    issueItems.forEach(item => {
        const itemSeverity = item.getAttribute('data-severity');
        
        if (severity === 'all' || itemSeverity === severity) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

function filterPages() {
    const searchInput = document.getElementById('page-search');
    const searchTerm = searchInput.value.toLowerCase();
    const pagesList = document.getElementById('pages-list');
    const pageItems = pagesList.querySelectorAll('.page-item');
    
    pageItems.forEach(item => {
        const pageName = item.getAttribute('data-page-name');
        
        if (pageName.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

function updateFilterButtons() {
    const filterButtons = document.querySelectorAll('.issue-filter-btn');
    filterButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-severity') === analysisFilter) {
            btn.classList.add('active');
            btn.style.background = '#667eea';
            btn.style.color = 'white';
        } else {
            btn.style.background = 'white';
            btn.style.color = btn.getAttribute('data-severity') === 'error' ? '#dc3545' : '#ffc107';
        }
    });
}

async function loadPageAnalysisCache() {
    try {
        const response = await fetch('/api/page-analysis/report');
        if (!response.ok) return;
        const data = await response.json();
        if (data.success && data.report) {
            currentAnalysisData = data.report;
            displayPageAnalysisResults(data.report);
            const resultsDiv = document.getElementById('analysis-results');
            const placeholderDiv = document.getElementById('analysis-placeholder');
            if (resultsDiv) resultsDiv.style.display = 'block';
            if (placeholderDiv) placeholderDiv.style.display = 'none';
        }
    } catch (error) {
        // No cached report available yet
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatJSON(obj) {
    return JSON.stringify(obj, null, 2);
}

function showError(container, title, error) {
    container.innerHTML = `
        <div style="background: #ffe6e6; border-left: 4px solid #dc3545; padding: 16px; border-radius: 6px;">
            <strong style="color: #dc3545;">${title}</strong>
            <p style="margin: 8px 0 0 0; color: #666;">${error}</p>
        </div>
    `;
}
