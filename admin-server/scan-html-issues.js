#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'views');
const publicDir = path.join(__dirname, 'public', 'js');

const issues = [];

// Scan HTML files
console.log('⚙️ Scanning HTML files for issues...\n');

const htmlFiles = fs.readdirSync(viewsDir).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
    const filePath = path.join(viewsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        
        // Check 1: Implicit event usage - onclick with event parameter
        if (line.includes('onclick=') && line.includes('event')) {
            const match = line.match(/onclick="([^"]*)"/);
            if (match && match[1].includes('event')) {
                issues.push({
                    file,
                    page: file,
                    line: lineNum,
                    severity: '⚠️',
                    type: 'Handler Issue',
                    message: `Implicit event usage: ${match[1].trim()}`
                });
            }
        }
        
        // Check 2: onsubmit with event parameter
        if (line.includes('onsubmit=') && line.includes('event')) {
            const match = line.match(/onsubmit="([^"]*)"/);
            if (match && match[1].includes('event')) {
                issues.push({
                    file,
                    page: file,
                    line: lineNum,
                    severity: '⚠️',
                    type: 'Form Handler',
                    message: `Implicit event in form: ${match[1].trim()}`
                });
            }
        }
        
        // Check 3: Missing handler parameters
        if ((line.includes('onclick=') || line.includes('onchange=')) && line.includes('()')) {
            const match = line.match(/on(?:click|change)="([^"]*)"/);
            if (match && match[1].match(/\w+\(\)$/)) {
                issues.push({
                    file,
                    page: file,
                    line: lineNum,
                    severity: '⚠️',
                    type: 'Missing Parameters',
                    message: `Handler call without required parameters: ${match[1].trim()}`
                });
            }
        }
    });
});

// Scan JavaScript files for undefined checks
console.log('⚙️ Scanning JavaScript files for event handling issues...\n');

const jsFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.js'));

jsFiles.forEach(file => {
    const filePath = path.join(publicDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        
        // Check: Functions expecting event parameter with fallback logic
        if (line.includes('if (!event)') || line.includes('if (event &&') || 
            line.includes('event &&') || line.includes('event.target')) {
            const funcMatch = content.split('\n').slice(Math.max(0, idx-5), idx)
                .reverse()
                .find(l => l.includes('function '));
            
            if (funcMatch) {
                const name = funcMatch.match(/function\s+(\w+)/)?.[1] || 'unknown';
                issues.push({
                    file: path.basename(file),
                    page: 'JavaScript',
                    line: lineNum,
                    severity: '⚠️',
                    type: 'Event Dependency',
                    message: `Function uses implicit event handling: line checks for event parameter`
                });
            }
        }
    });
});

// Display issues by severity
console.log('\n📋 DIAGNOSTIC REPORT - HTML & JavaScript Issues\n');
console.log('=' .repeat(90));

if (issues.length === 0) {
    console.log('✅ No issues found!');
} else {
    // Group by severity
    const warnings = issues.filter(i => i.severity === '⚠️');
    const errors = issues.filter(i => i.severity === '❌');
    
    if (warnings.length > 0) {
        console.log('\n⚠️  WARNINGS (' + warnings.length + ')\n');
        warnings.forEach(issue => {
            console.log(`📄 ${issue.page} (Line ${issue.line})`);
            console.log(`   Type: ${issue.type}`);
            console.log(`   Issue: ${issue.message}`);
            console.log('');
        });
    }
    
    if (errors.length > 0) {
        console.log('\n❌ ERRORS (' + errors.length + ')\n');
        errors.forEach(issue => {
            console.log(`📄 ${issue.page} (Line ${issue.line})`);
            console.log(`   Type: ${issue.type}`);
            console.log(`   Issue: ${issue.message}`);
            console.log('');
        });
    }
}

console.log('\n' + '='.repeat(90));
console.log(`Total Issues: ${issues.length}\n`);

// Summary
const byFile = {};
issues.forEach(i => {
    byFile[i.file] = (byFile[i.file] || 0) + 1;
});

if (Object.keys(byFile).length > 0) {
    console.log('Issues by File:\n');
    Object.entries(byFile).sort((a, b) => b[1] - a[1]).forEach(([file, count]) => {
        console.log(`  ${file}: ${count} issue(s)`);
    });
}

process.exit(issues.length > 0 ? 1 : 0);
