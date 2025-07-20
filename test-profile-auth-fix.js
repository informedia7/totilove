// Test script to verify the profile page authentication fix
const fetch = require('node-fetch');

async function testProfilePageFix() {
    console.log('🧪 Testing Profile Page Authentication Fix...\n');
    
    try {
        // Test 1: Access profile page without authentication
        console.log('Test 1: Accessing /profile without authentication...');
        const unauthResponse = await fetch('http://localhost:3000/profile', {
            redirect: 'manual' // Don't follow redirects
        });
        
        if (unauthResponse.status === 302) {
            const location = unauthResponse.headers.get('location');
            console.log(`✅ Correctly redirected to: ${location}`);
        } else {
            console.log(`❌ Expected redirect (302), got status: ${unauthResponse.status}`);
        }
        
        // Test 2: Login and get session token
        console.log('\nTest 2: Logging in to get session token...');
        const loginResponse = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'ezy4@hotmail.com',
                password: '123456A'
            })
        });
        
        const loginData = await loginResponse.json();
        if (loginData.success) {
            console.log(`✅ Login successful for user: ${loginData.user.username}`);
            const sessionToken = loginData.sessionToken;
            
            // Extract cookies from login response
            const cookies = loginResponse.headers.raw()['set-cookie'];
            console.log('🍪 Cookies received:', cookies);
            
            // Test 3: Access profile page with valid session using Authorization header
            console.log('\nTest 3: Accessing /profile with Authorization header...');
            const authResponse = await fetch('http://localhost:3000/profile', {
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                },
                redirect: 'manual'
            });
            
            if (authResponse.status === 200) {
                console.log('✅ Successfully accessed profile page with Authorization header');
            } else {
                console.log(`❌ Expected success (200), got status: ${authResponse.status}`);
            }
            
            // Test 4: Access profile page with valid session using cookies
            if (cookies) {
                console.log('\nTest 4: Accessing /profile with session cookies...');
                const cookieString = cookies.map(cookie => cookie.split(';')[0]).join('; ');
                
                const cookieResponse = await fetch('http://localhost:3000/profile', {
                    headers: {
                        'Cookie': cookieString
                    },
                    redirect: 'manual'
                });
                
                if (cookieResponse.status === 200) {
                    console.log('✅ Successfully accessed profile page with session cookies');
                    const contentType = cookieResponse.headers.get('content-type');
                    if (contentType && contentType.includes('text/html')) {
                        console.log('✅ Response contains HTML content as expected');
                    }
                } else {
                    console.log(`❌ Expected success (200), got status: ${cookieResponse.status}`);
                }
            }
            
        } else {
            console.log(`❌ Login failed: ${loginData.message}`);
        }
        
        // Test 5: Test /profile?id=X pattern (should be handled by server now)
        console.log('\nTest 5: Testing old /profile?id=3 pattern...');
        const oldPatternResponse = await fetch('http://localhost:3000/profile?id=3', {
            redirect: 'manual'
        });
        
        if (oldPatternResponse.status === 302) {
            const location = oldPatternResponse.headers.get('location');
            console.log(`✅ Old pattern correctly redirected to: ${location}`);
        } else {
            console.log(`❌ Expected redirect for old pattern, got status: ${oldPatternResponse.status}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
    }
    
    console.log('\n🎉 Profile page authentication fix test completed!');
}

testProfilePageFix();
