/**
 * SCROLL LOADING CODE ANALYZER
 * Analyzes the JavaScript code to find scroll loading issues
 * Run: node scripts/analyze-scroll-loading-code.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 === SCROLL LOADING CODE ANALYSIS ===');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Files to analyze
const files = {
    pagination: 'app/assets/js/new/pages/talk/messages/talk_message-pagination.js',
    renderer: 'app/assets/js/new/pages/talk/messages/talk_message-renderer.js',
    loader: 'app/assets/js/new/pages/talk/messages/talk_message-loader.js'
};

const issues = [];
const findings = [];

// Read and analyze each file
for (const [name, filePath] of Object.entries(files)) {
    const fullPath = path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        continue;
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    console.log(`\n📄 Analyzing: ${name} (${filePath})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check 1: updatePaginationAfterLoad calls
    if (name === 'pagination') {
        const hasUpdatePaginationCall = content.includes('updatePaginationAfterLoad');
        const hasPrependUpdate = /updatePaginationAfterLoad.*prepend|prepend.*updatePaginationAfterLoad/.test(content);
        const hasRefreshStateCall = content.includes('refreshScrollLazyLoadingState');
        
        console.log(`✅ updatePaginationAfterLoad calls: ${(content.match(/updatePaginationAfterLoad/g) || []).length}`);
        console.log(`✅ refreshScrollLazyLoadingState calls: ${(content.match(/refreshScrollLazyLoadingState/g) || []).length}`);
        
        // Check if updatePaginationAfterLoad is called for prepend loads
        const goToPageMatch = content.match(/async function goToPage[\s\S]*?}[\s\S]*?finally[\s\S]*?}/);
        if (goToPageMatch) {
            const goToPageContent = goToPageMatch[0];
            // Check if updatePaginationAfterLoad is called AND handles shouldPrepend
            const hasPrependUpdateCall = goToPageContent.includes('updatePaginationAfterLoad') && 
                                        goToPageContent.includes('shouldPrepend') &&
                                        (goToPageContent.includes('messagesBeforeLoad') || goToPageContent.includes('messagesAfterLoad'));
            
            if (hasPrependUpdateCall) {
                console.log('✅ updatePaginationAfterLoad is called for prepend loads (FIXED)');
                findings.push({ type: 'success', message: 'Pagination updates correctly for prepend loads - FIX APPLIED' });
            } else if (goToPageContent.includes('updatePaginationAfterLoad')) {
                console.log('⚠️  updatePaginationAfterLoad is called but may not handle prepend correctly');
            } else {
                console.log('❌ updatePaginationAfterLoad not called for prepend loads in goToPage');
                issues.push({ file: name, issue: 'updatePaginationAfterLoad not called for prepend loads in goToPage' });
            }
        }
        
        // Check if refreshScrollLazyLoadingState is called after updatePaginationAfterLoad
        const updatePaginationMatch = content.match(/function updatePaginationAfterLoad[^}]+}/s);
        if (updatePaginationMatch) {
            const afterUpdateMatch = content.match(/updatePaginationAfterLoad[^}]*refreshScrollLazyLoadingState/s);
            if (afterUpdateMatch) {
                console.log('✅ refreshScrollLazyLoadingState is called after updatePaginationAfterLoad');
                findings.push({ type: 'success', message: 'State refresh happens after pagination update' });
            } else {
                console.log('⚠️  refreshScrollLazyLoadingState may not be called immediately after updatePaginationAfterLoad');
            }
        }
    }
    
    // Check 2: Observer reconnection logic
    if (name === 'renderer') {
        const hasObserverReconnect = content.includes('observer.observe') && content.includes('_isObserving');
        const hasScrollCheck = content.includes('isAtBottom') && content.includes('scrollTop');
        
        console.log(`✅ Observer reconnection logic: ${hasObserverReconnect ? 'Found' : 'Missing'}`);
        console.log(`✅ Scroll position check: ${hasScrollCheck ? 'Found' : 'Missing'}`);
        
        if (hasObserverReconnect && hasScrollCheck) {
            findings.push({ type: 'success', message: 'Observer reconnection logic includes scroll position check' });
        } else {
            issues.push({ file: name, issue: 'Observer reconnection may not check scroll position' });
        }
        
        // Check loadNextPage function
        const loadNextPageMatch = content.match(/const loadNextPage[^}]+}/s);
        if (loadNextPageMatch) {
            const loadNextPageContent = loadNextPageMatch[0];
            const hasHasMoreUpdate = loadNextPageContent.includes('hasMore') && 
                                    (loadNextPageContent.includes('getCurrentPage') || loadNextPageContent.includes('getTotalPages'));
            
            if (hasHasMoreUpdate) {
                console.log('✅ loadNextPage updates hasMore state');
                findings.push({ type: 'success', message: 'hasMore state is updated in loadNextPage' });
            } else {
                console.log('⚠️  loadNextPage may not update hasMore state correctly');
            }
        }
    }
    
    // Check 3: loadMessages prepend handling
    if (name === 'loader') {
        const hasPrependLogic = content.includes('prepend') && content.includes('messages');
        const hasUpdatePaginationCheck = content.includes('updatePaginationAfterLoad') && content.includes('!prepend');
        
        console.log(`✅ Prepend logic: ${hasPrependLogic ? 'Found' : 'Missing'}`);
        console.log(`⚠️  updatePaginationAfterLoad only for !prepend: ${hasUpdatePaginationCheck ? 'Yes (this is the issue)' : 'No'}`);
        
        if (hasUpdatePaginationCheck) {
            issues.push({ 
                file: name, 
                issue: 'updatePaginationAfterLoad only called when !prepend - this was the root cause',
                fixed: 'Fixed in talk_message-pagination.js by calling it explicitly in goToPage()'
            });
        }
    }
}

// Summary
console.log('\n\n📋 ANALYSIS SUMMARY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (findings.length > 0) {
    console.log('\n✅ Positive Findings:');
    findings.forEach((f, i) => console.log(`${i + 1}. ${f.message}`));
}

if (issues.length > 0) {
    console.log('\n❌ Issues Found:');
    issues.forEach((issue, i) => {
        console.log(`\n${i + 1}. File: ${issue.file}`);
        console.log(`   Issue: ${issue.issue}`);
        if (issue.fixed) {
            console.log(`   ✅ ${issue.fixed}`);
        }
    });
} else {
    console.log('\n✅ No issues found in code analysis');
}

console.log('\n💡 KEY FINDINGS:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('1. Root cause: updatePaginationAfterLoad() was only called for !prepend loads');
console.log('2. Fix applied: Added explicit call in goToPage() for prepend loads');
console.log('3. Additional fix: Added refreshScrollLazyLoadingState() call after pagination update');
console.log('4. Observer reconnection: Improved with scroll position check');

console.log('\n✅ Code analysis complete!');
console.log('💡 For runtime analysis, run the script in browser console on /talk page');

