const fetch = require('node-fetch');

async function testLoginPageStability() {
    console.log('🧪 Testing Login Page Stability (No Infinite Redirects)');
    console.log('=' .repeat(60));
    
    try {
        // Test 1: Direct login page access
        console.log('\n📋 Test 1: Direct login page access');
        
        const loginPageResponse = await fetch('http://localhost:3000/login', {
            redirect: 'manual'
        });
        
        if (loginPageResponse.status === 200) {
            console.log('✅ Test 1 PASSED: Login page loads correctly');
        } else if (loginPageResponse.status >= 300 && loginPageResponse.status < 400) {
            console.log('❌ Test 1 FAILED: Login page redirects unexpectedly');
            console.log('   Redirect to:', loginPageResponse.headers.get('location'));
        } else {
            console.log('❌ Test 1 FAILED: Login page error');
            console.log('   Status:', loginPageResponse.status);
        }
        
        // Test 2: Multiple rapid login page requests
        console.log('\n📋 Test 2: Multiple rapid login page requests');
        
        const rapidLoginRequests = [];
        for (let i = 0; i < 5; i++) {
            rapidLoginRequests.push(
                fetch('http://localhost:3000/login', { redirect: 'manual' })
            );
        }
        
        const rapidLoginResults = await Promise.all(rapidLoginRequests);
        const allLoginPagesWork = rapidLoginResults.every(res => res.status === 200);
        
        if (allLoginPagesWork) {
            console.log('✅ Test 2 PASSED: Multiple login page requests work');
        } else {
            console.log('❌ Test 2 FAILED: Some login page requests failed');
            rapidLoginResults.forEach((res, i) => {
                console.log(`   Request ${i + 1}: Status ${res.status}`);
            });
        }
        
        // Test 3: Login form submission flow
        console.log('\n📋 Test 3: Complete login form submission');
        
        const loginFormData = {
            email: 'ezy4@hotmail.com',
            password: '123456A'
        };
        
        const loginSubmissionResponse = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loginFormData)
        });
        
        const loginSubmissionResult = await loginSubmissionResponse.json();
        
        if (loginSubmissionResult.success) {
            console.log('✅ Test 3 PASSED: Login form submission works');
            
            // Test 4: Immediate profile access after login
            console.log('\n📋 Test 4: Profile access after login');
            
            const profileAfterLoginResponse = await fetch('http://localhost:3000/profile', {
                headers: {
                    'Authorization': `Bearer ${loginSubmissionResult.sessionToken}`,
                    'Cookie': `sessionToken=${loginSubmissionResult.sessionToken}`
                },
                redirect: 'manual'
            });
            
            if (profileAfterLoginResponse.status === 200) {
                console.log('✅ Test 4 PASSED: Profile accessible after login');
            } else {
                console.log('❌ Test 4 FAILED: Profile not accessible after login');
                console.log('   Status:', profileAfterLoginResponse.status);
                console.log('   Redirect:', profileAfterLoginResponse.headers.get('location'));
            }
            
        } else {
            console.log('❌ Test 3 FAILED: Login form submission failed');
            console.log('   Error:', loginSubmissionResult.error);
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎯 LOGIN PAGE STABILITY TEST COMPLETED');
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
    }
}

// Run the test
testLoginPageStability();
