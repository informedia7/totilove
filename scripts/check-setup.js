/**
 * Setup Checker
 * 
 * Verifies all migration files are in place
 * Usage: node scripts/check-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Migration Setup...\n');

const checks = [
    // CSS Files
    { name: 'Design Tokens', path: 'app/assets/css/new/00-tokens.css' },
    { name: 'Base Styles', path: 'app/assets/css/new/01-base.css' },
    { name: 'Components CSS', path: 'app/assets/css/new/02-components/components.css' },
    { name: 'UserCard CSS', path: 'app/assets/css/new/02-components/_user-card.css' },
    { name: 'Modals CSS', path: 'app/assets/css/new/02-components/_modals.css' },
    { name: 'Forms CSS', path: 'app/assets/css/new/02-components/_forms.css' },
    { name: 'Buttons CSS', path: 'app/assets/css/new/02-components/_buttons.css' },
    
    // JavaScript Files
    { name: 'Core Utils', path: 'app/assets/js/new/core/utils.js' },
    { name: 'API Client', path: 'app/assets/js/new/core/api-client.js' },
    { name: 'State Manager', path: 'app/assets/js/new/core/state.js' },
    { name: 'BaseComponent', path: 'app/assets/js/new/components/BaseComponent.js' },
    { name: 'UserCard JS', path: 'app/assets/js/new/components/UserCard.js' },
    { name: 'Asset Loader', path: 'app/assets/js/new/asset-loader.js' },
    { name: 'PWA Init', path: 'app/assets/js/new/pwa-init.js' },
    { name: 'Service Worker', path: 'app/assets/js/new/service-worker.js' },
    { name: 'Main Entry', path: 'app/assets/js/new/main.js' },
    
    // Config Files
    { name: 'Feature Flags', path: 'config/featureFlags.js' },
    { name: 'Vite Config', path: 'vite.config.js' },
    { name: 'PostCSS Config', path: 'postcss.config.js' },
    { name: 'Manifest', path: 'app/manifest.json' },
    
    // Documentation
    { name: 'Testing Checklist', path: 'TESTING_CHECKLIST.md' },
    { name: 'PWA Guide', path: 'PWA_TESTING_GUIDE.md' },
];

let passed = 0;
let failed = 0;

checks.forEach(check => {
    const fullPath = path.join(__dirname, '..', check.path);
    const exists = fs.existsSync(fullPath);
    
    if (exists) {
        console.log(`✅ ${check.name}: ${check.path}`);
        passed++;
    } else {
        console.log(`❌ ${check.name}: ${check.path} - MISSING`);
        failed++;
    }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
    console.log('\n🎉 All files are in place! Ready for testing.');
} else {
    console.log('\n⚠️  Some files are missing. Please check the migration.');
}

// Check node_modules
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
    console.log('\n✅ Dependencies installed (node_modules exists)');
} else {
    console.log('\n⚠️  Dependencies not installed. Run: npm install');
}


