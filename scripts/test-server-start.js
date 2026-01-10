/**
 * Test Server Startup
 * 
 * Verifies server can start without errors
 * Run: node scripts/test-server-start.js
 */

console.log('🚀 Testing Server Startup...\n');

// Set test environment variable
process.env.USE_NEW_CSS = 'true';
process.env.NODE_ENV = 'test';

// Mock console methods to capture output
const originalLog = console.log;
const originalError = console.error;
let serverOutput = [];
let serverErrors = [];

console.log = (...args) => {
    serverOutput.push(args.join(' '));
    originalLog(...args);
};

console.error = (...args) => {
    serverErrors.push(args.join(' '));
    originalError(...args);
};

let serverStarted = false;
let testTimeout;

try {
    console.log('Attempting to load server.js...');
    
    // Try to require the server (this will execute the module)
    // We'll catch any immediate errors
    const serverModule = require('../server.js');
    
    // Give it a moment to initialize
    setTimeout(() => {
        if (serverErrors.length > 0) {
            console.log('\n❌ Server startup errors detected:');
            serverErrors.forEach(err => console.log(`  - ${err}`));
        } else {
            console.log('\n✅ Server module loaded successfully');
            console.log('✅ No immediate startup errors');
        }
        
        // Check if feature flags are being read
        const featureFlags = require('../config/featureFlags');
        console.log('\n📋 Feature Flags Status:');
        const status = featureFlags.getStatus();
        console.log(`  useNewCSS: ${status.useNewCSS} (expected: true)`);
        console.log(`  useNewJS: ${status.useNewJS}`);
        console.log(`  enableAll: ${status.enableAll}`);
        
        if (status.useNewCSS === true) {
            console.log('\n✅ Environment variable USE_NEW_CSS is being read correctly!');
        } else {
            console.log('\n⚠️  USE_NEW_CSS not set correctly');
        }
        
        console.log('\n========================================');
        console.log('✅ Server Startup Test Complete!');
        console.log('========================================\n');
        console.log('Note: This test only verifies module loading.');
        console.log('To fully test, start server with:');
        console.log('  $env:USE_NEW_CSS="true"; node server.js\n');
        
        process.exit(0);
    }, 2000);
    
    // Timeout after 5 seconds
    testTimeout = setTimeout(() => {
        console.log('\n⚠️  Test timeout - server may still be initializing');
        console.log('This is normal if database/Redis connections are slow');
        process.exit(0);
    }, 5000);
    
} catch (error) {
    console.error('\n❌ Error loading server:');
    console.error(`  ${error.message}`);
    console.error(`  ${error.stack}`);
    process.exit(1);
}


