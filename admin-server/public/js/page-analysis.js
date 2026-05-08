/**
 * Page Analysis Dashboard JavaScript
 * Handles analysis execution, report display, and interaction
 */

class PageAnalysisDashboard {
    constructor() {
        this.report = null;
        this.currentFilter = 'all';
        this.init();
    }

    init() {
        // Run analysis button
        const runBtn = document.getElementById('run-analysis-btn');
        if (runBtn) {
            runBtn.addEventListener('click', () => this.runAnalysis());
        }

        // Issue filter buttons
        document.querySelectorAll('.issue-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentFilter = e.target.dataset.severity;
                document.querySelectorAll('.issue-filter-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'white';
                    b.style.color = b.style.borderColor;
                });
                e.target.classList.add('active');
                e.target.style.background = '#667eea';
                e.target.style.color = 'white';
                this.displayIssues();
            });
        });

        // Page search
        const searchInput = document.getElementById('page-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterPages(e.target.value));
        }

        // Load cached report on page load
        this.loadCachedReport();
    }

    async runAnalysis() {
        const loadingDiv = document.getElementById('analysis-loading');
        const resultsDiv = document.getElementById('analysis-results');
        const runBtn = document.getElementById('run-analysis-btn');

        // Show loading
        loadingDiv.style.display = 'block';
        resultsDiv.style.display = 'none';
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

            if (data.success) {
                this.report = data.report;
                this.displayReport();
            } else {
                alert('Analysis failed: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Analysis error:', error);
            alert('Failed to run analysis: ' + error.message);
        } finally {
            loadingDiv.style.display = 'none';
            runBtn.disabled = false;
            runBtn.textContent = '🔍 Run Analysis';
        }
    }

    async loadCachedReport() {
        try {
            const response = await fetch('/api/page-analysis/report');
            const data = await response.json();

            if (data.success) {
                this.report = data.report;
                this.displayReport();
            }
        } catch (error) {
            // No cached report, that's okay
            console.log('No cached report found');
        }
    }

    displayReport() {
        if (!this.report) return;

        const resultsDiv = document.getElementById('analysis-results');
        resultsDiv.style.display = 'block';

        // Update summary stats
        document.getElementById('stat-total-pages').textContent = this.report.totalPages;
        document.getElementById('stat-total-functions').textContent = this.report.summary.totalFunctions;
        document.getElementById('stat-total-api-calls').textContent = this.report.summary.totalApiCalls;
        document.getElementById('stat-total-issues').textContent = this.report.summary.totalIssues;
        document.getElementById('stat-pages-with-errors').textContent = this.report.summary.pagesWithErrors;

        // Display issues
        this.displayIssues();

        // Display pages
        this.displayPages();
    }

    displayIssues() {
        const issuesList = document.getElementById('issues-list');
        if (!issuesList || !this.report) return;

        let issues = [];
        if (this.currentFilter === 'all') {
            issues = [
                ...this.report.issues.error,
                ...this.report.issues.warning,
                ...this.report.issues.info
            ];
        } else {
            issues = this.report.issues[this.currentFilter] || [];
        }

        if (issues.length === 0) {
            issuesList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No issues found</p>';
            return;
        }

        issuesList.innerHTML = issues.map(issue => `
            <div class="issue-item ${issue.severity}">
                <div style="font-weight: 600; margin-bottom: 4px;">
                    ${issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'} 
                    ${issue.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </div>
                <div style="color: #666; font-size: 14px; margin-bottom: 4px;">
                    <strong>Page:</strong> ${issue.page}
                </div>
                <div style="color: #333;">
                    ${issue.message}
                </div>
                ${issue.line ? `<div style="color: #999; font-size: 12px; margin-top: 4px;">Line: ${issue.line}</div>` : ''}
            </div>
        `).join('');
    }

    displayPages() {
        const pagesList = document.getElementById('pages-list');
        if (!pagesList || !this.report) return;

        pagesList.innerHTML = this.report.pages.map(page => `
            <div class="page-item" data-page="${page.name}">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                            ${page.name}
                            ${page.stats.hasErrors ? '<span style="color: #dc3545; margin-left: 8px;">⚠️</span>' : ''}
                        </div>
                        <div style="display: flex; gap: 16px; color: #666; font-size: 14px;">
                            <span>📝 ${page.stats.totalFunctions} functions</span>
                            <span>🔌 ${page.stats.totalApiCalls} API calls</span>
                            <span>👂 ${page.stats.totalEventListeners} listeners</span>
                            ${page.issues.length > 0 ? `<span style="color: #dc3545;">⚠️ ${page.issues.length} issues</span>` : ''}
                        </div>
                    </div>
                    <button class="expand-page-btn" style="padding: 4px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">
                        ▼
                    </button>
                </div>
                <div class="page-details" style="display: none; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
                    ${this.renderPageDetails(page)}
                </div>
            </div>
        `).join('');

        // Add expand/collapse functionality
        document.querySelectorAll('.page-item').forEach(item => {
            const expandBtn = item.querySelector('.expand-page-btn');
            const details = item.querySelector('.page-details');
            
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = details.style.display !== 'none';
                details.style.display = isExpanded ? 'none' : 'block';
                expandBtn.textContent = isExpanded ? '▼' : '▲';
                item.classList.toggle('expanded');
            });
        });
    }

    renderPageDetails(page) {
        let html = '';

        // Functions
        if (page.functions.length > 0) {
            html += `
                <div style="margin-bottom: 16px;">
                    <h4 style="margin-bottom: 8px; color: #667eea;">Functions (${page.functions.length})</h4>
                    <div style="max-height: 200px; overflow-y: auto;">
                        ${page.functions.map(f => `
                            <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-bottom: 4px; font-family: monospace; font-size: 13px;">
                                ${f.type === 'async' ? '<span style="color: #17a2b8;">async</span>' : ''} 
                                <strong>${f.name}</strong>()
                                ${f.hasApiCalls ? '<span style="color: #28a745;">🔌</span>' : ''}
                                ${f.hasErrors ? '<span style="color: #ffc107;">⚠️</span>' : ''}
                                <span style="color: #999; font-size: 11px;">(Line ${f.line})</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // API Calls
        if (page.apiCalls.length > 0) {
            html += `
                <div style="margin-bottom: 16px;">
                    <h4 style="margin-bottom: 8px; color: #667eea;">API Calls (${page.apiCalls.length})</h4>
                    <div style="max-height: 200px; overflow-y: auto;">
                        ${page.apiCalls.map(api => `
                            <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; margin-bottom: 4px; font-family: monospace; font-size: 13px;">
                                <span style="color: #667eea; font-weight: 600;">${api.method}</span> 
                                <span>${api.url}</span>
                                ${api.isApiCall ? '<span style="color: #28a745;">✓</span>' : ''}
                                <span style="color: #999; font-size: 11px;">(Line ${api.line})</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Issues
        if (page.issues.length > 0) {
            html += `
                <div style="margin-bottom: 16px;">
                    <h4 style="margin-bottom: 8px; color: #dc3545;">Issues (${page.issues.length})</h4>
                    <div>
                        ${page.issues.map(issue => `
                            <div class="issue-item ${issue.severity}" style="margin-bottom: 8px;">
                                <div style="font-weight: 600;">${issue.type}</div>
                                <div style="font-size: 13px; color: #666;">${issue.message}</div>
                                ${issue.line ? `<div style="font-size: 11px; color: #999;">Line: ${issue.line}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        return html || '<p style="color: #666;">No additional details available</p>';
    }

    filterPages(searchTerm) {
        const pages = document.querySelectorAll('.page-item');
        const term = searchTerm.toLowerCase();

        pages.forEach(page => {
            const pageName = page.dataset.page.toLowerCase();
            if (pageName.includes(term)) {
                page.style.display = 'block';
            } else {
                page.style.display = 'none';
            }
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pageAnalysisDashboard = new PageAnalysisDashboard();
    });
} else {
    window.pageAnalysisDashboard = new PageAnalysisDashboard();
}





















