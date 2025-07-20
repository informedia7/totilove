// Test complete login flow
import fetch from 'node-fetch';

async function testCompleteFlow() {
    try {
        console.log('🧪 Testing complete login flow...');
        
        // Step 1: Login
        console.log('\n1️⃣ Testing login...');
        const loginResponse = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: 'test@example.com',
                password: 'Test123'
            })
        });

        const loginResult = await loginResponse.json();
        console.log('Login result:', loginResult);
        
        if (!loginResult.success) {
            console.log('❌ Login failed:', loginResult.error);
            return;
        }
        
        const sessionToken = loginResult.sessionToken;
        console.log('✅ Login successful! Session token:', sessionToken);
        
        // Step 2: Test session validation
        console.log('\n2️⃣ Testing session validation...');
        const sessionResponse = await fetch('http://localhost:3000/api/current-user', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Content-Type': 'application/json'
            }
        });

        const sessionResult = await sessionResponse.json();
        console.log('Session validation result:', sessionResult);
        
        if (sessionResult.success && sessionResult.authenticated) {
            console.log('✅ Session validation successful!');
            console.log('User:', sessionResult.user);
        } else {
            console.log('❌ Session validation failed:', sessionResult.message);
        }
        
    } catch (error) {
        console.error('❌ Test error:', error);
    }
}

testCompleteFlow();
