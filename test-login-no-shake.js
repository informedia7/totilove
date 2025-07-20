const fetch = require('node-fetch');

async function testLoginPageNoShake() {
    console.log('🧪 Testing Login Page - No Shaking/Infinite Redirects');
    console.log('=' .repeat(60));
    
    try {
        // Test 1: Access login page directly (should work without redirects)
        console.log('\n📋 Test 1: Direct access to login page');
        const loginResponse = await fetch('http://localhost:3000/login', {
            redirect: 'manual' // Don't follow redirects automatically
        });
        
        console.log('Status:', loginResponse.status);
        console.log('Headers:', Object.fromEntries(loginResponse.headers.entries()));
        
        if (loginResponse.status === 200) {
            console.log('✅ Test 1 PASSED: Login page loads without redirect');
        } else if (loginResponse.status >= 300 && loginResponse.status < 400) {
            console.log('❌ Test 1 FAILED: Login page redirects immediately');
            console.log('Redirect location:', loginResponse.headers.get('location'));
        }
        
        // Test 2: Check if the login page HTML loads properly
        console.log('\n📋 Test 2: Login page HTML content');
        const htmlResponse = await fetch('http://localhost:3000/login');
        const htmlContent = await htmlResponse.text();
        
        if (htmlContent.includes('<title>Login - Totilove</title>')) {
            console.log('✅ Test 2 PASSED: Login page HTML loads correctly');
        } else {
            console.log('❌ Test 2 FAILED: Login page HTML not found');
        }
        
        // Test 3: Multiple rapid requests (simulate page shaking)
        console.log('\n📋 Test 3: Multiple rapid requests (anti-shake test)');
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(fetch('http://localhost:3000/login', { redirect: 'manual' }));
        }
        
        const results = await Promise.all(promises);
        const allSuccess = results.every(res => res.status === 200);
        
        if (allSuccess) {
            console.log('✅ Test 3 PASSED: Multiple requests successful, no redirect loops');
        } else {
            console.log('❌ Test 3 FAILED: Some requests failed or redirected');
            results.forEach((res, i) => {
                console.log(`   Request ${i + 1}: Status ${res.status}`);
            });
        }
        
        // Test 4: Home page access (should work for unauthenticated users)
        console.log('\n📋 Test 4: Home page access (unauthenticated)');
        const homeResponse = await fetch('http://localhost:3000/', { redirect: 'manual' });
        
        if (homeResponse.status === 200) {
            console.log('✅ Test 4 PASSED: Home page accessible without authentication');
        } else {
            console.log('❌ Test 4 FAILED: Home page not accessible');
            console.log('Status:', homeResponse.status);
        }
        
        // Test 5: Profile page should redirect to login (but only once)
        console.log('\n📋 Test 5: Profile page redirect behavior');
        const profileResponse = await fetch('http://localhost:3000/profile', { redirect: 'manual' });
        
        if (profileResponse.status >= 300 && profileResponse.status < 400) {
            const location = profileResponse.headers.get('location');
            if (location && location.includes('/login')) {
                console.log('✅ Test 5 PASSED: Profile page redirects to login (as expected)');
                console.log('   Redirect location:', location);
            } else {
                console.log('❌ Test 5 FAILED: Profile page redirects to unexpected location');
                console.log('   Redirect location:', location);
            }
        } else {
            console.log('❌ Test 5 FAILED: Profile page should redirect but status is:', profileResponse.status);
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎯 LOGIN PAGE SHAKE TEST COMPLETED');
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
    }
}

// Run the test
testLoginPageNoShake();
