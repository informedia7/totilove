#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'views');
const publicDir = path.join(__dirname, 'public', 'js');

const issues = [];

// Scan HTML files for REAL issues
console.log('⚙️ Scanning HTML files for issues...\n');

const htmlFiles = fs.readdirSync(viewsDir).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
    const filePath = path.join(viewsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        
        // Only flag actual issues: implicit event usage
        if (line.includes('onclick=') && line.includes(', event)')) {
            issues.push({
                file,
                line: lineNum,
                severity: '⚠️',
                type: 'Implicit Event',
                code: line.trim().substring(0, 80)
            });
        }
        
        if (line.includes('onsubmit=') && line.includes(', event)')) {
            issues.push({
                file,
                line: lineNum,
                severity: '⚠️',
                type: 'Implicit Event',
                code: line.trim().substring(0, 80)
            });
        }
        
        // Check for missing modal/element references in close handlers
        if ((line.includes('closeModal') || line.includes('closeConfirm')) && 
            line.includes('onclick=') && !line.includes('Modal') && !line.includes('Confirm')) {
            const match = line.match(/onclick="([^"]*)"/);
            if (match && match[1].includes('close')) {
                issues.push({
                    file,
                    line: lineNum,
                    severity: '⚠️',
                    type: 'Ambiguous Modal Reference',
                    code: line.trim().substring(0, 80)
                });
            }
        }
    });
});

// Scan JavaScript for genuine event handling issues
console.log('⚙️ Scanning JavaScript files for issues...\n');

const jsFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.js'));

jsFiles.forEach(file => {
    const filePath = path.join(publicDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        
        // Flag functions that check for event existence but shouldn't need to
        if (line.includes('if (!event)') || line.includes('if (event &&')) {
            const funcMatch = content.split('\n').slice(Math.max(0, idx-10), idx)
                .reverse()
                .find(l => l.match(/function\s+\w+\s*\(\s*event\s*\)/));
            
            if (funcMatch) {
                const name = funcMatch.match(/function\s+(\w+)/)?.[1] || 'unknown';
                if (!issues.find(i => i.file === file && i.funcName === name)) {
                    issues.push({
                        file: path.basename(file),
                        line: lineNum,
                        severity: '⚠️',
                        type: 'Fragile Event Handling',
                        funcName: name,
                        code: `Function ${name}() has fallback for missing event parameter`
                    });
                }
            }
        }
    });
});

// Display report
console.log('\n📋 DIAGNOSTIC REPORT - Real Issues Found\n');
console.log('=' .repeat(100));

if (issues.length === 0) {
    console.log('✅ No real issues detected. All event handlers are properly structured.\n');
} else {
    issues.forEach((issue, i) => {
        console.log(`\n${i + 1}. ${issue.severity} ${issue.type}`);
        console.log(`   File: ${issue.file}:${issue.line}`);
        console.log(`   ${issue.code || issue.funcName}`);
    });
}

console.log('\n' + '='.repeat(100));
console.log(`\nTotal Issues: ${issues.length}`);
console.log(`Files Scanned: ${htmlFiles.length} HTML + ${jsFiles.length || 0} JS\n`);

process.exit(0);
