// Test script to diagnose profile loading issues
const fetch = require('node-fetch');

async function testProfileLoading() {
    try {
        console.log('🧪 Testing Profile Loading Diagnosis');
        console.log('=' .repeat(50));
        
        // Test 1: Direct API call to user endpoint
        console.log('\n📡 Test 1: Direct API call to /api/user/3');
        const userResponse = await fetch('http://localhost:3000/api/user/3');
        const userData = await userResponse.json();
        console.log('Status:', userResponse.status);
        console.log('Response:', JSON.stringify(userData, null, 2));
        
        // Test 2: Check if session validation works
        console.log('\n🔐 Test 2: Session validation endpoint');
        const sessionResponse = await fetch('http://localhost:3000/api/current-user', {
            headers: {
                'Authorization': 'Bearer dummy-token'
            }
        });
        const sessionData = await sessionResponse.json();
        console.log('Status:', sessionResponse.status);
        console.log('Response:', JSON.stringify(sessionData, null, 2));
        
        // Test 3: Check profile page access
        console.log('\n🌐 Test 3: Profile page access');
        const profileResponse = await fetch('http://localhost:3000/profile');
        console.log('Status:', profileResponse.status);
        console.log('Headers:', Object.fromEntries(profileResponse.headers));
        
        // Test 4: Check contact countries endpoint
        console.log('\n🌍 Test 4: Contact countries endpoint');
        const countriesResponse = await fetch('http://localhost:3000/api/contact-countries/3');
        const countriesData = await countriesResponse.json();
        console.log('Status:', countriesResponse.status);
        console.log('Response:', JSON.stringify(countriesData, null, 2));
        
        console.log('\n✅ All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testProfileLoading();
