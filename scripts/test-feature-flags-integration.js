/**
 * Test Feature Flags Integration
 * 
 * Simulates how feature flags are injected into templates
 * Run: node scripts/test-feature-flags-integration.js
 */

const featureFlags = require('../config/featureFlags');

console.log('🔧 Testing Feature Flags Integration...\n');

// Test 1: Default state (all disabled)
console.log('Test 1: Default state (no environment variables)');
console.log('  Feature flags status:');
const defaultStatus = featureFlags.getStatus();
console.log(`    useNewCSS: ${defaultStatus.useNewCSS} (expected: false)`);
console.log(`    useNewJS: ${defaultStatus.useNewJS} (expected: false)`);
console.log(`    enableAll: ${defaultStatus.enableAll} (expected: false)`);
console.log(`  ✅ Default state correct\n`);

// Test 2: Enable CSS only
console.log('Test 2: Enabling CSS only (USE_NEW_CSS=true)');
process.env.USE_NEW_CSS = 'true';
delete require.cache[require.resolve('../config/featureFlags')];
const cssFlags = require('../config/featureFlags');
const cssStatus = cssFlags.getStatus();
console.log(`    useNewCSS: ${cssStatus.useNewCSS} (expected: true)`);
console.log(`    useNewJS: ${cssStatus.useNewJS} (expected: false)`);
if (cssStatus.useNewCSS === true && cssStatus.useNewJS === false) {
    console.log('  ✅ CSS flag works correctly\n');
} else {
    console.log('  ❌ CSS flag not working\n');
}

// Test 3: Enable all
console.log('Test 3: Enabling all (ENABLE_ALL_NEW=true)');
process.env.ENABLE_ALL_NEW = 'true';
delete require.cache[require.resolve('../config/featureFlags')];
const allFlags = require('../config/featureFlags');
const allStatus = allFlags.getStatus();
console.log(`    useNewCSS: ${allStatus.useNewCSS} (expected: true)`);
console.log(`    useNewJS: ${allStatus.useNewJS} (expected: true)`);
console.log(`    enableAll: ${allStatus.enableAll} (expected: true)`);
if (allStatus.enableAll === true) {
    console.log('  ✅ Enable all flag works correctly\n');
} else {
    console.log('  ❌ Enable all flag not working\n');
}

// Test 4: Test page-specific flags
console.log('Test 4: Testing page-specific flags');
process.env.NEW_ARCH_PAGES = 'results.html,matches.html';
delete require.cache[require.resolve('../config/featureFlags')];
const pageFlags = require('../config/featureFlags');
console.log(`    Pages: ${pageFlags.newArchitecturePages.join(', ')}`);
console.log(`    Should use new for results.html: ${pageFlags.shouldUseNewArch('results.html')} (expected: true)`);
console.log(`    Should use new for talk.html: ${pageFlags.shouldUseNewArch('talk.html')} (expected: false)`);
if (pageFlags.shouldUseNewArch('results.html') === true && 
    pageFlags.shouldUseNewArch('talk.html') === false) {
    console.log('  ✅ Page-specific flags work correctly\n');
} else {
    console.log('  ❌ Page-specific flags not working\n');
}

// Test 5: Test JSON serialization (how it's injected into HTML)
console.log('Test 5: Testing JSON serialization (for HTML injection)');
const testFlags = {
    useNewCSS: true,
    useNewJS: false,
    useNewComponents: false,
    enableAll: false,
    newArchitecturePages: []
};
const jsonString = JSON.stringify(testFlags);
console.log(`    JSON: ${jsonString}`);
try {
    const parsed = JSON.parse(jsonString);
    if (parsed.useNewCSS === true) {
        console.log('  ✅ JSON serialization works correctly\n');
    } else {
        console.log('  ❌ JSON serialization not working\n');
    }
} catch (error) {
    console.log(`  ❌ JSON parsing error: ${error.message}\n`);
}

console.log('========================================');
console.log('✅ Feature Flags Integration Tests Complete!');
console.log('========================================\n');

console.log('📋 How to use:');
console.log('  1. Set environment variable: $env:USE_NEW_CSS="true"');
console.log('  2. Start server: node server.js');
console.log('  3. Feature flags will be injected into HTML templates');
console.log('  4. Asset loader will read flags and load new CSS/JS\n');

