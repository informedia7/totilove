const fetch = require('node-fetch');

async function testCompleteLoginFlow() {
    console.log('🧪 Testing Complete Login Flow - Frontend + Backend');
    console.log('=' .repeat(70));
    
    try {
        // Test 1: Clear any existing session
        console.log('\n📋 Test 1: Starting with clean state');
        
        // Test 2: Login and get session
        console.log('\n📋 Test 2: User login');
        
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
        console.log('Login response:', {
            success: loginResult.success,
            hasSessionToken: !!loginResult.sessionToken,
            hasUser: !!loginResult.user,
            message: loginResult.message
        });
        
        if (!loginResult.success) {
            console.log('❌ Test 2 FAILED: Login failed');
            console.log('   Error:', loginResult.error);
            return;
        }
        
        console.log('✅ Test 2 PASSED: Login successful');
        const sessionToken = loginResult.sessionToken;
        
        // Test 3: Immediate session validation
        console.log('\n📋 Test 3: Immediate session validation');
        
        const sessionResponse = await fetch('http://localhost:3000/api/current-user', {
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const sessionResult = await sessionResponse.json();
        
        if (sessionResult.success && sessionResult.authenticated) {
            console.log('✅ Test 3 PASSED: Session valid immediately after login');
            console.log('   User:', sessionResult.user.username);
        } else {
            console.log('❌ Test 3 FAILED: Session not valid after login');
            console.log('   Response:', sessionResult);
        }
        
        // Test 4: Profile page access with Authorization header
        console.log('\n📋 Test 4: Profile page access (Authorization header)');
        
        const profileAuthResponse = await fetch('http://localhost:3000/profile', {
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            },
            redirect: 'manual'
        });
        
        console.log('Profile page (auth header):', {
            status: profileAuthResponse.status,
            location: profileAuthResponse.headers.get('location')
        });
        
        if (profileAuthResponse.status === 200) {
            console.log('✅ Test 4 PASSED: Profile accessible with auth header');
        } else {
            console.log('❌ Test 4 FAILED: Profile not accessible with auth header');
        }
        
        // Test 5: Profile page access with Cookie
        console.log('\n📋 Test 5: Profile page access (Cookie)');
        
        const profileCookieResponse = await fetch('http://localhost:3000/profile', {
            headers: {
                'Cookie': `sessionToken=${sessionToken}`
            },
            redirect: 'manual'
        });
        
        console.log('Profile page (cookie):', {
            status: profileCookieResponse.status,
            location: profileCookieResponse.headers.get('location')
        });
        
        if (profileCookieResponse.status === 200) {
            console.log('✅ Test 5 PASSED: Profile accessible with cookie');
        } else {
            console.log('❌ Test 5 FAILED: Profile not accessible with cookie');
        }
        
        // Test 6: Multiple rapid profile accesses (simulate page reload)
        console.log('\n📋 Test 6: Multiple rapid profile accesses');
        
        const rapidRequests = [];
        for (let i = 0; i < 3; i++) {
            rapidRequests.push(
                fetch('http://localhost:3000/profile', {
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    redirect: 'manual'
                })
            );
        }
        
        const rapidResults = await Promise.all(rapidRequests);
        const allSuccessful = rapidResults.every(res => res.status === 200);
        
        if (allSuccessful) {
            console.log('✅ Test 6 PASSED: Multiple rapid requests successful');
        } else {
            console.log('❌ Test 6 FAILED: Some rapid requests failed');
            rapidResults.forEach((res, i) => {
                console.log(`   Request ${i + 1}: Status ${res.status}`);
            });
        }
        
        // Test 7: Session persistence check
        console.log('\n📋 Test 7: Session persistence');
        
        // Wait a moment and check again
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const persistenceResponse = await fetch('http://localhost:3000/api/current-user', {
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        });
        
        const persistenceResult = await persistenceResponse.json();
        
        if (persistenceResult.success && persistenceResult.authenticated) {
            console.log('✅ Test 7 PASSED: Session persists after delay');
        } else {
            console.log('❌ Test 7 FAILED: Session lost after delay');
        }
        
        console.log('\n' + '=' .repeat(70));
        console.log('🎯 COMPLETE LOGIN FLOW TEST COMPLETED');
        console.log('=' .repeat(70));
        
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
    }
}

// Run the test
testCompleteLoginFlow();
