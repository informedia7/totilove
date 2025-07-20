const fetch = require('node-fetch');

async function testRegistrationAndLoginFlow() {
    console.log('🧪 Testing Registration → Profile Page Flow');
    console.log('=' .repeat(60));
    
    try {
        // Test 1: Register a new user
        console.log('\n📋 Test 1: User Registration');
        
        const testUser = {
            username: `testuser_${Date.now()}`,
            email: `test_${Date.now()}@example.com`,
            password: 'Test123456',
            birthdate: '1995-01-01',
            gender: 'male',
            country: '1', // Assuming country ID 1 exists
            preferred_gender: 'female'
        };
        
        console.log('Registering user:', testUser.username);
        
        const registerResponse = await fetch('http://localhost:3000/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testUser)
        });
        
        const registerResult = await registerResponse.json();
        console.log('Registration response:', {
            success: registerResult.success,
            hasSessionToken: !!registerResult.sessionToken,
            hasUser: !!registerResult.user,
            message: registerResult.message
        });
        
        if (registerResult.success && registerResult.sessionToken) {
            console.log('✅ Test 1 PASSED: Registration successful with session token');
            
            // Test 2: Access profile page with the new session token
            console.log('\n📋 Test 2: Profile page access after registration');
            
            const profileResponse = await fetch('http://localhost:3000/profile', {
                headers: {
                    'Authorization': `Bearer ${registerResult.sessionToken}`
                },
                redirect: 'manual' // Don't follow redirects
            });
            
            if (profileResponse.status === 200) {
                console.log('✅ Test 2 PASSED: Profile page accessible after registration');
            } else if (profileResponse.status >= 300 && profileResponse.status < 400) {
                console.log('❌ Test 2 FAILED: Profile page redirects (should be accessible)');
                console.log('   Redirect location:', profileResponse.headers.get('location'));
            } else {
                console.log('❌ Test 2 FAILED: Profile page not accessible');
                console.log('   Status:', profileResponse.status);
            }
            
            // Test 3: Verify session validation
            console.log('\n📋 Test 3: Session validation after registration');
            
            const sessionResponse = await fetch('http://localhost:3000/api/current-user', {
                headers: {
                    'Authorization': `Bearer ${registerResult.sessionToken}`
                }
            });
            
            const sessionResult = await sessionResponse.json();
            
            if (sessionResult.success && sessionResult.authenticated) {
                console.log('✅ Test 3 PASSED: Session is valid after registration');
                console.log('   User:', sessionResult.user.username);
            } else {
                console.log('❌ Test 3 FAILED: Session not valid after registration');
                console.log('   Response:', sessionResult);
            }
            
        } else {
            console.log('❌ Test 1 FAILED: Registration failed or no session token');
            console.log('   Error:', registerResult.error);
        }
        
        // Test 4: Login flow
        console.log('\n📋 Test 4: Login and redirect flow');
        
        const loginUser = {
            email: 'ezy4@hotmail.com', // Using existing user
            password: '123456A'
        };
        
        const loginResponse = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loginUser)
        });
        
        const loginResult = await loginResponse.json();
        
        if (loginResult.success && loginResult.sessionToken) {
            console.log('✅ Test 4a PASSED: Login successful with session token');
            
            // Test profile access after login
            const profileAfterLoginResponse = await fetch('http://localhost:3000/profile', {
                headers: {
                    'Authorization': `Bearer ${loginResult.sessionToken}`
                },
                redirect: 'manual'
            });
            
            if (profileAfterLoginResponse.status === 200) {
                console.log('✅ Test 4b PASSED: Profile accessible after login');
            } else {
                console.log('❌ Test 4b FAILED: Profile not accessible after login');
                console.log('   Status:', profileAfterLoginResponse.status);
            }
        } else {
            console.log('❌ Test 4 FAILED: Login failed');
            console.log('   Error:', loginResult.error);
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎯 REGISTRATION → PROFILE FLOW TEST COMPLETED');
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
    }
}

// Run the test
testRegistrationAndLoginFlow();
