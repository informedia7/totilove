#!/usr/bin/env node

/**
 * Presence Diagnostics Test Runner
 * Tests the diagnostic suite locally without requiring the full server
 */

const presenceTestService = require('./services/presenceTestService');

async function runDiagnostics() {
    console.log('🧪 Running Presence Diagnostics...\n');
    
    try {
        const diagnostics = await presenceTestService.runPresenceDiagnostics();
        
        // Print summary
        console.log('📊 Diagnostics Summary:');
        console.log(`   Total Tests: ${diagnostics.summary.total}`);
        console.log(`   ✅ Passing: ${diagnostics.summary.passed}`);
        console.log(`   ❌ Failing: ${diagnostics.summary.failed}\n`);
        
        // Print detailed results
        console.log('📋 Test Results:\n');
        
        for (const test of diagnostics.tests) {
            const icon = test.status === 'pass' ? '✅' : '❌';
            console.log(`${icon} ${test.label}`);
            console.log(`   ID: ${test.id}`);
            console.log(`   Description: ${test.description}`);
            console.log(`   Duration: ${test.durationMs}ms`);
            
            if (test.status === 'pass') {
                console.log(`   Details:`, JSON.stringify(test.details, null, 2));
            } else {
                console.log(`   Error: ${test.error}`);
                if (test.details) {
                    console.log(`   Metadata:`, JSON.stringify(test.details, null, 2));
                }
            }
            console.log('');
        }
        
        // Exit with appropriate code
        const exitCode = diagnostics.summary.failed > 0 ? 1 : 0;
        console.log(`\n${exitCode === 0 ? '✨ All diagnostics passed!' : '⚠️ Some diagnostics failed!'}`);
        process.exit(exitCode);
        
    } catch (error) {
        console.error('❌ Diagnostics failed:', error.message);
        process.exit(1);
    }
}

runDiagnostics();
