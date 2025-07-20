// Profile Page Validation Test
const fetch = require('node-fetch');

async function validateProfilePage() {
    try {
        console.log('🔍 Profile Page Validation Test');
        console.log('=' .repeat(50));
        
        // Test 1: Check if the profile page loads
        console.log('\n📄 Test 1: Profile Page Loading');
        const response = await fetch('http://localhost:3000/profile');
        
        if (response.status === 200) {
            const html = await response.text();
            console.log('✅ Profile page loads successfully');
            
            // Check for critical JavaScript functions
            const criticalFunctions = [
                'function loadUserProfile',
                'function displayUserProfile',
                'function showLoading',
                'function hideLoading',
                'function showError',
                'function addCountry',
                'function removeCountry',
                'function loadCountriesFromDatabase',
                'function saveAccountSettings'
            ];
            
            console.log('\n🔍 JavaScript Function Validation:');
            let allFunctionsFound = true;
            
            criticalFunctions.forEach(func => {
                if (html.includes(func)) {
                    console.log(`  ✅ ${func} - Found`);
                } else {
                    console.log(`  ❌ ${func} - Missing`);
                    allFunctionsFound = false;
                }
            });
            
            // Check for syntax errors patterns
            console.log('\n⚠️  Syntax Error Checks:');
            const errorPatterns = [
                { pattern: /function\s+\w*\s*\(\s*\)\s*{\s*$/, name: 'Incomplete function definitions' },
                { pattern: /}\s*function/, name: 'Missing semicolons or proper closure' },
                { pattern: /\w+\.forEach\([^}]*$/, name: 'Incomplete forEach loops' },
                { pattern: /async\s+function\s*$/, name: 'Incomplete async functions' }
            ];
            
            let syntaxIssuesFound = false;
            errorPatterns.forEach(check => {
                const matches = html.match(check.pattern);
                if (matches) {
                    console.log(`  ⚠️  Potential issue: ${check.name}`);
                    syntaxIssuesFound = true;
                } else {
                    console.log(`  ✅ ${check.name} - OK`);
                }
            });
            
            // Check for required HTML elements
            console.log('\n🎯 HTML Element Validation:');
            const requiredElements = [
                'id="loading"',
                'id="profile-content"', 
                'id="error-container"',
                'id="selected-countries"',
                'id="allowed-countries"',
                'id="profile-visibility"'
            ];
            
            let allElementsFound = true;
            requiredElements.forEach(element => {
                if (html.includes(element)) {
                    console.log(`  ✅ ${element} - Found`);
                } else {
                    console.log(`  ❌ ${element} - Missing`);
                    allElementsFound = false;
                }
            });
            
            // Overall assessment
            console.log('\n📊 Overall Assessment:');
            if (allFunctionsFound && !syntaxIssuesFound && allElementsFound) {
                console.log('🎉 ✅ Profile page appears to be working correctly!');
                console.log('All critical functions, HTML elements, and syntax checks passed.');
            } else {
                console.log('⚠️  Some issues detected:');
                if (!allFunctionsFound) console.log('- Missing critical JavaScript functions');
                if (syntaxIssuesFound) console.log('- Potential syntax errors found');
                if (!allElementsFound) console.log('- Missing required HTML elements');
            }
            
        } else {
            console.log('❌ Profile page failed to load:', response.status);
        }
        
        // Test 2: Check supporting resources
        console.log('\n📦 Test 2: Supporting Resources');
        const resources = [
            '/js/session.js',
            '/components/navbar.js', 
            '/components/navbar.css'
        ];
        
        for (const resource of resources) {
            try {
                const resourceResponse = await fetch(`http://localhost:3000${resource}`);
                if (resourceResponse.status === 200) {
                    console.log(`  ✅ ${resource} - Available`);
                } else {
                    console.log(`  ❌ ${resource} - Failed (${resourceResponse.status})`);
                }
            } catch (error) {
                console.log(`  ❌ ${resource} - Error: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Validation test failed:', error);
    }
}

validateProfilePage();
