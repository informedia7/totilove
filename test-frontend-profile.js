// Simple frontend error test to check if profile page loads properly
async function testFrontendProfileLoading() {
    try {
        console.log('🧪 Testing Frontend Profile Loading');
        console.log('=' .repeat(50));
        
        // Test 1: Check if the profile page HTML loads
        console.log('\n📄 Test 1: Check profile page HTML');
        const response = await fetch('http://localhost:3000/profile');
        
        if (response.status === 200) {
            console.log('✅ Profile page loads (Status 200)');
            
            // Check if the response contains the expected elements
            const html = await response.text();
            
            const requiredElements = [
                'sessionManager',
                'loadUserProfile',
                'showLoading',
                'hideLoading',
                'showError',
                'session.js'
            ];
            
            console.log('\n🔍 Checking for required elements:');
            requiredElements.forEach(element => {
                if (html.includes(element)) {
                    console.log(`  ✅ ${element} found`);
                } else {
                    console.log(`  ❌ ${element} missing`);
                }
            });
            
        } else {
            console.log('❌ Profile page failed to load:', response.status);
        }
        
        // Test 2: Check session.js accessibility
        console.log('\n📦 Test 2: Check session.js file');
        const sessionResponse = await fetch('http://localhost:3000/js/session.js');
        
        if (sessionResponse.status === 200) {
            console.log('✅ session.js loads correctly');
        } else {
            console.log('❌ session.js failed to load:', sessionResponse.status);
        }
        
        // Test 3: Check components
        console.log('\n🧩 Test 3: Check navbar components');
        const navbarResponse = await fetch('http://localhost:3000/components/navbar.js');
        
        if (navbarResponse.status === 200) {
            console.log('✅ navbar.js loads correctly');
        } else {
            console.log('❌ navbar.js failed to load:', navbarResponse.status);
        }
        
        console.log('\n✅ Frontend loading test completed!');
        
    } catch (error) {
        console.error('❌ Frontend test failed:', error);
    }
}

// Use fetch polyfill for Node.js
const fetch = require('node-fetch');
testFrontendProfileLoading();
