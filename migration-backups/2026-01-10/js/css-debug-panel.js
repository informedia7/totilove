/**
 * CSS Debug Panel - Browser Console Tool
 * Add this script to your layout.html during development
 * Automatically detects CSS issues and displays them in a debug panel
 */

(function() {
    // Only load in development
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.location.search.includes('debug=css')) {
        
        // Create debug panel
        const debugPanel = document.createElement('div');
        debugPanel.id = 'css-debug-panel';
        debugPanel.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 15px;
            border-radius: 8px;
            z-index: 9999;
            font-family: monospace;
            font-size: 12px;
            max-width: 400px;
            max-height: 500px;
            overflow-y: auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        
        debugPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; align-items: center;">
                <strong style="color: #3498db;">🔧 CSS Debug Panel</strong>
                <button onclick="this.parentElement.parentElement.remove()" style="background: #e74c3c; color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer;">X</button>
            </div>
            <div id="css-debug-content">Analyzing...</div>
        `;
        
        document.body.appendChild(debugPanel);
        
        // Function to analyze CSS
        function analyzeCSS() {
            const issues = [];
            const elements = document.querySelectorAll('*');
            
            // Check for common issues
            elements.forEach(el => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                
                // Check touch targets
                if (['button', 'a', 'input', 'select', 'textarea'].some(tag => 
                    el.tagName.toLowerCase() === tag || 
                    el.classList.contains('button') || 
                    el.classList.contains('btn') ||
                    el.getAttribute('role') === 'button')) {
                    if (rect.height < 44 || rect.width < 44) {
                        issues.push({
                            type: 'critical',
                            message: `Small touch target: ${el.tagName}.${Array.from(el.classList).join('.') || 'no-class'}`,
                            details: `Size: ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}px`,
                            element: el
                        });
                    }
                }
                
                // Check for missing CSS variables usage
                const computedColor = style.color || style.backgroundColor;
                if (computedColor && 
                    !computedColor.includes('var(') && 
                    !['transparent', 'inherit', 'initial', 'unset', 'rgba(0, 0, 0, 0)', 'rgb(0, 0, 0)'].includes(computedColor)) {
                    // Might be hard-coded color (but skip common defaults)
                    if (!computedColor.match(/^(#fff|#ffffff|white|#000|#000000|black)$/i)) {
                        issues.push({
                            type: 'info',
                            message: `Possible hard-coded color`,
                            details: `Color: ${computedColor}`,
                            element: el
                        });
                    }
                }
            });
            
            // Check CSS variables
            const computed = getComputedStyle(document.documentElement);
            const tokens = ['--primary', '--secondary', '--md', '--lg', '--touch', '--r-md'];
            tokens.forEach(token => {
                const value = computed.getPropertyValue(token);
                if (!value || value.trim() === '') {
                    issues.push({
                        type: 'critical',
                        message: `Missing CSS token: ${token}`,
                        details: 'Token not defined',
                        element: null
                    });
                }
            });
            
            // Check for #app-root wrapper
            const appRoot = document.getElementById('app-root');
            if (!appRoot) {
                issues.push({
                    type: 'critical',
                    message: 'Missing #app-root wrapper',
                    details: 'New CSS requires #app-root wrapper',
                    element: null
                });
            }
            
            // Check CSS files loaded
            const newCSSFiles = document.querySelectorAll('link[href*="/assets/css/0"]');
            if (newCSSFiles.length === 0) {
                issues.push({
                    type: 'warning',
                    message: 'New CSS files not loaded',
                    details: 'Check if CSS links are present in HTML',
                    element: null
                });
            }
            
            return issues;
        }
        
        // Update debug panel
        function updateDebugPanel() {
            const issues = analyzeCSS();
            const content = document.getElementById('css-debug-content');
            
            const elementCount = document.querySelectorAll('*').length;
            const cssFiles = Array.from(document.styleSheets).filter(s => s.href).length;
            const appRoot = document.getElementById('app-root') ? '✅' : '❌';
            
            let html = `
                <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #444;">
                    <strong>Page Analysis:</strong><br>
                    Elements: ${elementCount}<br>
                    CSS Files: ${cssFiles}<br>
                    #app-root: ${appRoot}<br>
                    Issues: <span style="color: ${issues.length > 0 ? '#e74c3c' : '#2ecc71'}">${issues.length}</span>
                </div>
            `;
            
            if (issues.length > 0) {
                html += '<div style="border-top: 1px solid #444; padding-top: 10px;">';
                html += '<strong>Issues Found:</strong><br>';
                
                const critical = issues.filter(i => i.type === 'critical');
                const warning = issues.filter(i => i.type === 'warning');
                const info = issues.filter(i => i.type === 'info');
                
                [...critical, ...warning, ...info].forEach((issue, i) => {
                    const color = issue.type === 'critical' ? '#e74c3c' : 
                                 issue.type === 'warning' ? '#f39c12' : '#3498db';
                    
                    html += `
                        <div style="border-left: 3px solid ${color}; padding-left: 5px; margin: 5px 0; font-size: 11px;">
                            <strong style="color: ${color};">[${issue.type.toUpperCase()}]</strong><br>
                            ${issue.message}<br>
                            <small style="color: #aaa;">${issue.details}</small>
                            ${issue.element ? `<br><button onclick="window.debugHighlight(${i})" style="font-size: 10px; margin-top: 2px; background: ${color}; border: none; color: white; padding: 1px 4px; border-radius: 2px; cursor: pointer;">Highlight</button>` : ''}
                        </div>
                    `;
                });
                
                html += '</div>';
            } else {
                html += '<div style="color: #2ecc71; padding: 10px; text-align: center;">✅ No issues found!</div>';
            }
            
            content.innerHTML = html;
        }
        
        // Store issues for highlight function
        let currentIssues = [];
        
        // Add highlight function
        window.debugHighlight = function(index) {
            const issues = analyzeCSS();
            currentIssues = issues;
            
            if (issues[index] && issues[index].element) {
                const el = issues[index].element;
                const originalOutline = el.style.outline;
                const originalZIndex = el.style.zIndex;
                
                el.style.outline = '3px solid red';
                el.style.zIndex = '99999';
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                setTimeout(() => {
                    el.style.outline = originalOutline;
                    el.style.zIndex = originalZIndex;
                }, 3001);
            }
        };
        
        // Run analysis periodically
        setInterval(updateDebugPanel, 5000);
        updateDebugPanel();
        
        console.log('🔧 CSS Debug Panel loaded. Check top-left corner of page.');
        console.log('💡 Use ?debug=css in URL to always show debug panel');
    }
})();



