#!/usr/bin/env node

/**
 * Comprehensive Page Analysis Script
 * Analyzes all pages in app/pages folder and extracts:
 * - Functions
 * - API calls
 * - Event listeners
 * - External dependencies
 * - Potential issues
 */

const fs = require('fs').promises;
const path = require('path');

class PageAnalyzer {
    constructor() {
        this.pagesDir = path.join(__dirname, '..', '..', 'app', 'pages');
        this.results = [];
    }

    async analyzeAllPages() {
        console.log('🔍 Starting comprehensive page analysis...\n');
        
        try {
            const pages = await this.getPageFiles();
            console.log(`📄 Found ${pages.length} pages to analyze\n`);

            for (const page of pages) {
                console.log(`Analyzing: ${page.name}...`);
                const analysis = await this.analyzePage(page);
                this.results.push(analysis);
            }

            return this.results;
        } catch (error) {
            console.error('❌ Error during analysis:', error);
            throw error;
        }
    }

    async getPageFiles() {
        const files = [];
        const entries = await fs.readdir(this.pagesDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.html')) {
                const filePath = path.join(this.pagesDir, entry.name);
                const content = await fs.readFile(filePath, 'utf-8');
                files.push({
                    name: entry.name,
                    path: filePath,
                    content: content
                });
            } else if (entry.isDirectory() && entry.name !== 'demo') {
                // Skip demo folder for now, but could recurse if needed
            }
        }

        return files;
    }

    analyzePage(page) {
        const analysis = {
            name: page.name,
            path: page.path,
            size: page.content.length,
            functions: [],
            apiCalls: [],
            eventListeners: [],
            imports: [],
            issues: [],
            stats: {
                totalFunctions: 0,
                totalApiCalls: 0,
                totalEventListeners: 0,
                hasErrors: false
            }
        };

        // Extract functions
        analysis.functions = this.extractFunctions(page.content);
        analysis.stats.totalFunctions = analysis.functions.length;

        // Extract API calls
        analysis.apiCalls = this.extractApiCalls(page.content);
        analysis.stats.totalApiCalls = analysis.apiCalls.length;

        // Extract event listeners
        analysis.eventListeners = this.extractEventListeners(page.content);
        analysis.stats.totalEventListeners = analysis.eventListeners.length;

        // Extract imports
        analysis.imports = this.extractImports(page.content);

        // Check for issues
        analysis.issues = this.checkIssues(page.content, analysis);

        analysis.stats.hasErrors = analysis.issues.some(issue => issue.severity === 'error');

        return analysis;
    }

    extractFunctions(content) {
        const functions = [];
        
        // Match function declarations: function name() or async function name()
        const functionRegex = /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g;
        let match;
        
        while ((match = functionRegex.exec(content)) !== null) {
            const funcName = match[1];
            const startPos = match.index;
            
            // Find function body
            const bodyStart = match.index + match[0].length;
            const body = this.extractFunctionBody(content, bodyStart);
            
            functions.push({
                name: funcName,
                type: match[0].includes('async') ? 'async' : 'sync',
                line: this.getLineNumber(content, startPos),
                bodyLength: body.length,
                hasApiCalls: /fetch|axios|XMLHttpRequest/.test(body),
                hasErrors: /\.catch|try\s*\{|catch\s*\(/.test(body)
            });
        }

        // Match arrow functions: const name = () => or const name = async () =>
        const arrowFunctionRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
        while ((match = arrowFunctionRegex.exec(content)) !== null) {
            const funcName = match[1];
            const startPos = match.index;
            
            functions.push({
                name: funcName,
                type: match[0].includes('async') ? 'async' : 'sync',
                line: this.getLineNumber(content, startPos),
                bodyLength: 0, // Arrow functions harder to extract
                hasApiCalls: false,
                hasErrors: false
            });
        }

        return functions;
    }

    extractFunctionBody(content, startPos) {
        let depth = 1;
        let pos = startPos;
        
        while (pos < content.length && depth > 0) {
            if (content[pos] === '{') depth++;
            if (content[pos] === '}') depth--;
            pos++;
        }
        
        return content.substring(startPos, pos);
    }

    extractApiCalls(content) {
        const apiCalls = [];
        
        // Match fetch calls
        const fetchRegex = /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g;
        let match;
        
        while ((match = fetchRegex.exec(content)) !== null) {
            const url = match[1];
            const method = this.extractHttpMethod(content, match.index);
            
            apiCalls.push({
                type: 'fetch',
                url: url,
                method: method || 'GET',
                line: this.getLineNumber(content, match.index),
                isApiCall: url.startsWith('/api/') || url.startsWith('http'),
                endpoint: url.startsWith('/api/') ? url : null
            });
        }

        // Match XMLHttpRequest
        const xhrRegex = /\.open\s*\(\s*['"](GET|POST|PUT|DELETE|PATCH)['"]\s*,\s*['"`]([^'"`]+)['"`]/g;
        while ((match = xhrRegex.exec(content)) !== null) {
            apiCalls.push({
                type: 'XMLHttpRequest',
                url: match[2],
                method: match[1],
                line: this.getLineNumber(content, match.index),
                isApiCall: match[2].startsWith('/api/') || match[2].startsWith('http'),
                endpoint: match[2].startsWith('/api/') ? match[2] : null
            });
        }

        return apiCalls;
    }

    extractHttpMethod(content, fetchIndex) {
        const beforeFetch = content.substring(Math.max(0, fetchIndex - 50), fetchIndex);
        const methodMatch = beforeFetch.match(/method:\s*['"](GET|POST|PUT|DELETE|PATCH)['"]/i);
        return methodMatch ? methodMatch[1].toUpperCase() : 'GET';
    }

    extractEventListeners(content) {
        const listeners = [];
        
        // Match addEventListener
        const listenerRegex = /\.addEventListener\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g;
        let match;
        
        while ((match = listenerRegex.exec(content)) !== null) {
            listeners.push({
                event: match[1],
                handler: match[2],
                line: this.getLineNumber(content, match.index),
                element: this.extractElement(content, match.index)
            });
        }

        // Match inline event handlers: onclick, onsubmit, etc.
        const inlineRegex = /on(\w+)\s*=\s*['"]([^'"]+)['"]/g;
        while ((match = inlineRegex.exec(content)) !== null) {
            listeners.push({
                event: match[1].toLowerCase(),
                handler: match[2],
                line: this.getLineNumber(content, match.index),
                type: 'inline'
            });
        }

        return listeners;
    }

    extractElement(content, index) {
        const before = content.substring(Math.max(0, index - 200), index);
        const elementMatch = before.match(/(\w+)\.addEventListener/);
        return elementMatch ? elementMatch[1] : 'unknown';
    }

    extractImports(content) {
        const imports = [];
        
        // Match script src
        const scriptRegex = /<script\s+src\s*=\s*['"]([^'"]+)['"]/g;
        let match;
        
        while ((match = scriptRegex.exec(content)) !== null) {
            imports.push({
                type: 'script',
                path: match[1],
                line: this.getLineNumber(content, match.index)
            });
        }

        // Match link stylesheet
        const linkRegex = /<link[^>]+href\s*=\s*['"]([^'"]+)['"]/g;
        while ((match = linkRegex.exec(content)) !== null) {
            imports.push({
                type: 'stylesheet',
                path: match[1],
                line: this.getLineNumber(content, match.index)
            });
        }

        return imports;
    }

    checkIssues(content, analysis) {
        const issues = [];

        // Check for console.error without proper error handling
        const consoleErrors = content.match(/console\.error/g);
        if (consoleErrors && consoleErrors.length > 0) {
            issues.push({
                type: 'console_error',
                severity: 'warning',
                message: `Found ${consoleErrors.length} console.error calls - ensure proper error handling`,
                count: consoleErrors.length
            });
        }

        // Check for missing error handling in async functions
        analysis.functions.forEach(func => {
            if (func.type === 'async' && func.hasApiCalls && !func.hasErrors) {
                issues.push({
                    type: 'missing_error_handling',
                    severity: 'warning',
                    message: `Async function "${func.name}" makes API calls but may lack error handling`,
                    function: func.name,
                    line: func.line
                });
            }
        });

        // Check for duplicate function names
        const functionNames = analysis.functions.map(f => f.name);
        const duplicates = functionNames.filter((name, index) => functionNames.indexOf(name) !== index);
        if (duplicates.length > 0) {
            issues.push({
                type: 'duplicate_functions',
                severity: 'error',
                message: `Duplicate function names found: ${[...new Set(duplicates)].join(', ')}`,
                functions: [...new Set(duplicates)]
            });
        }

        // Check for API calls without error handling
        analysis.apiCalls.forEach(api => {
            const context = this.getContextAround(content, api.line, 10);
            if (!/\.catch|try\s*\{/.test(context)) {
                issues.push({
                    type: 'api_no_error_handling',
                    severity: 'warning',
                    message: `API call to ${api.url} may lack error handling`,
                    endpoint: api.endpoint,
                    line: api.line
                });
            }
        });

        // Check for missing CSRF tokens in POST/PUT/DELETE
        analysis.apiCalls.forEach(api => {
            if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(api.method)) {
                const context = this.getContextAround(content, api.line, 15);
                if (!/csrf|CSRF|X-CSRF/.test(context)) {
                    issues.push({
                        type: 'missing_csrf',
                        severity: 'warning',
                        message: `${api.method} request to ${api.url} may be missing CSRF token`,
                        endpoint: api.endpoint,
                        line: api.line
                    });
                }
            }
        });

        return issues;
    }

    getContextAround(content, lineNumber, lines) {
        const linesArray = content.split('\n');
        const start = Math.max(0, lineNumber - lines);
        const end = Math.min(linesArray.length, lineNumber + lines);
        return linesArray.slice(start, end).join('\n');
    }

    getLineNumber(content, index) {
        return content.substring(0, index).split('\n').length;
    }

    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            totalPages: this.results.length,
            summary: {
                totalFunctions: this.results.reduce((sum, r) => sum + r.stats.totalFunctions, 0),
                totalApiCalls: this.results.reduce((sum, r) => sum + r.stats.totalApiCalls, 0),
                totalEventListeners: this.results.reduce((sum, r) => sum + r.stats.totalEventListeners, 0),
                pagesWithErrors: this.results.filter(r => r.stats.hasErrors).length,
                totalIssues: this.results.reduce((sum, r) => sum + r.issues.length, 0)
            },
            pages: this.results,
            endpoints: this.extractAllEndpoints(),
            issues: this.categorizeIssues()
        };

        return report;
    }

    extractAllEndpoints() {
        const endpoints = new Map();
        
        this.results.forEach(page => {
            page.apiCalls.forEach(api => {
                if (api.endpoint) {
                    if (!endpoints.has(api.endpoint)) {
                        endpoints.set(api.endpoint, {
                            endpoint: api.endpoint,
                            method: api.method,
                            pages: [],
                            count: 0
                        });
                    }
                    const endpoint = endpoints.get(api.endpoint);
                    endpoint.pages.push(page.name);
                    endpoint.count++;
                }
            });
        });

        return Array.from(endpoints.values());
    }

    categorizeIssues() {
        const categories = {
            error: [],
            warning: [],
            info: []
        };

        this.results.forEach(page => {
            page.issues.forEach(issue => {
                categories[issue.severity].push({
                    page: page.name,
                    ...issue
                });
            });
        });

        return categories;
    }
}

// Run analysis if called directly
if (require.main === module) {
    const analyzer = new PageAnalyzer();
    analyzer.analyzeAllPages()
        .then(() => {
            const report = analyzer.generateReport();
            console.log('\n📊 Analysis Complete!\n');
            console.log('Summary:');
            console.log(`  Total Pages: ${report.totalPages}`);
            console.log(`  Total Functions: ${report.summary.totalFunctions}`);
            console.log(`  Total API Calls: ${report.summary.totalApiCalls}`);
            console.log(`  Total Event Listeners: ${report.summary.totalEventListeners}`);
            console.log(`  Pages with Errors: ${report.summary.pagesWithErrors}`);
            console.log(`  Total Issues: ${report.summary.totalIssues}`);
            
            // Save report
            const reportPath = path.join(__dirname, '..', 'data', 'page-analysis-report.json');
            fs.mkdir(path.dirname(reportPath), { recursive: true })
                .then(() => fs.writeFile(reportPath, JSON.stringify(report, null, 2)))
                .then(() => console.log(`\n✅ Report saved to: ${reportPath}`))
                .catch(err => console.error('❌ Error saving report:', err));
        })
        .catch(err => {
            console.error('❌ Analysis failed:', err);
            process.exit(1);
        });
}

module.exports = PageAnalyzer;





















