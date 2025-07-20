const fetch = require('node-fetch');

async function testLoginIssue() {
    console.log('🧪 Testing Login Issue Diagnosis');
    console.log('=' .repeat(60));
    
    try {
        // Test 1: Login and check response
        console.log('\n📋 Test 1: Login API call');
        
        const loginData = {
            email: 'ezy4@hotmail.com',
            password: '123456A'
        };
        
        const loginResponse = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loginData)
        });
        
        const loginResult = await loginResponse.json();
        console.log('Login API response:', {
            success: loginResult.success,
            hasSessionToken: !!loginResult.sessionToken,
            message: loginResult.message,
            error: loginResult.error
        });
        
        if (loginResult.success && loginResult.sessionToken) {
            console.log('✅ Test 1 PASSED: Login API works correctly');
            
            // Test 2: Check if session is valid immediately after login
            console.log('\n📋 Test 2: Session validation after login');
            
            const sessionResponse = await fetch('http://localhost:3000/api/current-user', {
                headers: {
                    'Authorization': `Bearer ${loginResult.sessionToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const sessionResult = await sessionResponse.json();
            console.log('Session validation:', {
                success: sessionResult.success,
                authenticated: sessionResult.authenticated,
                hasUser: !!sessionResult.user
            });
            
            if (sessionResult.success && sessionResult.authenticated) {
                console.log('✅ Test 2 PASSED: Session validation works');
                
                // Test 3: Access profile page with session token
                console.log('\n📋 Test 3: Profile page access with session token');
                
                const profileResponse = await fetch('http://localhost:3000/profile', {
                    headers: {
                        'Authorization': `Bearer ${loginResult.sessionToken}`,
                        'Cookie': `sessionToken=${loginResult.sessionToken}`
                    },
                    redirect: 'manual'
                });
                
                console.log('Profile page response:', {
                    status: profileResponse.status,
                    statusText: profileResponse.statusText,
                    redirectLocation: profileResponse.headers.get('location')
                });
                
                if (profileResponse.status === 200) {
                    console.log('✅ Test 3 PASSED: Profile page accessible');
                } else if (profileResponse.status >= 300 && profileResponse.status < 400) {
                    console.log('❌ Test 3 FAILED: Profile page redirects unexpectedly');
                } else {
                    console.log('❌ Test 3 FAILED: Profile page returns error');
                }
                
            } else {
                console.log('❌ Test 2 FAILED: Session validation failed');
            }
            
        } else {
            console.log('❌ Test 1 FAILED: Login API failed');
        }
        
        // Test 4: Check login page behavior
        console.log('\n📋 Test 4: Login page behavior');
        
        const loginPageResponse = await fetch('http://localhost:3000/login', {
            redirect: 'manual'
        });
        
        if (loginPageResponse.status === 200) {
            console.log('✅ Test 4 PASSED: Login page loads correctly');
        } else {
            console.log('❌ Test 4 FAILED: Login page has issues');
            console.log('   Status:', loginPageResponse.status);
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎯 LOGIN ISSUE DIAGNOSIS COMPLETED');
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
    }
}

// Run the test
testLoginIssue();
