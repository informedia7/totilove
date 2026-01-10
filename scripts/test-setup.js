/**
 * Test Setup Script
 * 
 * Verifies that everything is ready for testing
 * Run: node scripts/test-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Migration Setup...\n');

let allTestsPassed = true;

// Test 1: Check if server.js exists
console.log('Test 1: Checking server.js...');
if (fs.existsSync('server.js')) {
    console.log('  ✅ server.js exists\n');
} else {
    console.log('  ❌ server.js NOT FOUND\n');
    allTestsPassed = false;
}

// Test 2: Check feature flags config
console.log('Test 2: Checking feature flags...');
try {
    const featureFlags = require('../config/featureFlags');
    console.log('  ✅ Feature flags config loaded');
    console.log('  Current status:');
    console.log(`    - useNewCSS: ${featureFlags.useNewCSS}`);
    console.log(`    - useNewJS: ${featureFlags.useNewJS}`);
    console.log(`    - useNewComponents: ${featureFlags.useNewComponents}`);
    console.log(`    - enableAll: ${featureFlags.enableAll}\n`);
} catch (error) {
    console.log(`  ❌ Error loading feature flags: ${error.message}\n`);
    allTestsPassed = false;
}

// Test 3: Check CSS files
console.log('Test 3: Checking CSS files...');
const cssFiles = [
    'app/assets/css/new/00-tokens.css',
    'app/assets/css/new/01-base.css',
    'app/assets/css/new/02-components/components.css',
    'app/assets/css/new/02-components/_user-card.css',
    'app/assets/css/new/02-components/_modals.css',
    'app/assets/css/new/02-components/_forms.css',
    'app/assets/css/new/02-components/_buttons.css'
];

let cssPassed = true;
cssFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - MISSING`);
        cssPassed = false;
    }
});
if (cssPassed) {
    console.log('  ✅ All CSS files exist\n');
} else {
    console.log('  ❌ Some CSS files missing\n');
    allTestsPassed = false;
}

// Test 4: Check JavaScript files
console.log('Test 4: Checking JavaScript files...');
const jsFiles = [
    'app/assets/js/new/core/utils.js',
    'app/assets/js/new/core/api-client.js',
    'app/assets/js/new/core/state.js',
    'app/assets/js/new/components/BaseComponent.js',
    'app/assets/js/new/components/UserCard.js',
    'app/assets/js/new/asset-loader.js',
    'app/assets/js/new/pwa-init.js',
    'app/assets/js/new/service-worker.js',
    'app/assets/js/new/main.js'
];

let jsPassed = true;
jsFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - MISSING`);
        jsPassed = false;
    }
});
if (jsPassed) {
    console.log('  ✅ All JavaScript files exist\n');
} else {
    console.log('  ❌ Some JavaScript files missing\n');
    allTestsPassed = false;
}

// Test 5: Check config files
console.log('Test 5: Checking config files...');
const configFiles = [
    'vite.config.js',
    'postcss.config.js',
    'app/manifest.json'
];

let configPassed = true;
configFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - MISSING`);
        configPassed = false;
    }
});
if (configPassed) {
    console.log('  ✅ All config files exist\n');
} else {
    console.log('  ❌ Some config files missing\n');
    allTestsPassed = false;
}

// Test 6: Check dependencies
console.log('Test 6: Checking dependencies...');
const dependencies = [
    'node_modules/vite',
    'node_modules/postcss',
    'node_modules/autoprefixer',
    'node_modules/cssnano',
    'node_modules/terser'
];

let depsPassed = true;
dependencies.forEach(dep => {
    if (fs.existsSync(dep)) {
        console.log(`  ✅ ${dep.split('/').pop()}`);
    } else {
        console.log(`  ❌ ${dep.split('/').pop()} - NOT INSTALLED`);
        depsPassed = false;
    }
});
if (depsPassed) {
    console.log('  ✅ All dependencies installed\n');
} else {
    console.log('  ❌ Some dependencies missing - Run: npm install\n');
    allTestsPassed = false;
}

// Test 7: Test environment variable reading
console.log('Test 7: Testing environment variable reading...');
process.env.USE_NEW_CSS = 'true';
delete require.cache[require.resolve('../config/featureFlags')];
const testFlags = require('../config/featureFlags');
if (testFlags.useNewCSS === true) {
    console.log('  ✅ Environment variables work correctly');
    console.log('  ✅ USE_NEW_CSS=true is read correctly\n');
} else {
    console.log('  ❌ Environment variables not working correctly\n');
    allTestsPassed = false;
}

// Test 8: Check layout.html includes asset loader
console.log('Test 8: Checking layout.html...');
try {
    const layoutPath = 'app/components/layouts/layout.html';
    if (fs.existsSync(layoutPath)) {
        const layoutContent = fs.readFileSync(layoutPath, 'utf8');
        if (layoutContent.includes('asset-loader.js')) {
            console.log('  ✅ asset-loader.js referenced in layout');
        } else {
            console.log('  ⚠️  asset-loader.js not found in layout');
        }
        if (layoutContent.includes('FEATURE_FLAGS_JSON')) {
            console.log('  ✅ Feature flags injection code found');
        } else {
            console.log('  ⚠️  Feature flags injection code not found');
        }
        console.log('');
    } else {
        console.log('  ❌ layout.html not found\n');
        allTestsPassed = false;
    }
} catch (error) {
    console.log(`  ❌ Error reading layout.html: ${error.message}\n`);
    allTestsPassed = false;
}

// Summary
console.log('========================================');
if (allTestsPassed) {
    console.log('✅ ALL TESTS PASSED!');
    console.log('🎉 Setup is ready for testing!');
    console.log('\nNext steps:');
    console.log('  1. Run: $env:USE_NEW_CSS="true"; node server.js');
    console.log('  2. Open browser: http://localhost:3000');
    console.log('  3. Check Network tab for new CSS files');
} else {
    console.log('❌ SOME TESTS FAILED');
    console.log('⚠️  Please fix the issues above before testing');
}
console.log('========================================\n');

process.exit(allTestsPassed ? 0 : 1);


