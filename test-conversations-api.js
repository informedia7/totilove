// Test conversations API endpoint for different users
const fetch = require('node-fetch');

async function testConversationsAPI() {
    try {
        // Test with user ID 20 (existing user with conversations)
        console.log('=== Testing User ID 20 (existing conversations) ===');
        await testUserConversations('2@hotmail.co', '123456A');
        
        // Test with user ID 106 (honey)
        console.log('\n=== Testing User ID 106 (honey) ===');
        await testUserConversations('ezzyboy66@hotmail.com', 'testpass'); // You may need to adjust password
        
    } catch (error) {
        console.error('Error:', error);
    }
}

async function testUserConversations(email, password) {
    try {
        // First, login to get a session token
        const loginResponse = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const loginData = await loginResponse.json();
        console.log('Login response:', loginData);
        
        if (loginData.success && loginData.sessionToken) {
            // Now test the conversations API
            const conversationsResponse = await fetch(`http://localhost:3000/api/conversations/${loginData.user.id}`, {
                headers: { 
                    'Authorization': `Bearer ${loginData.sessionToken}` 
                }
            });
            
            const conversationsData = await conversationsResponse.json();
            console.log('Conversations API response:');
            console.log(JSON.stringify(conversationsData, null, 2));
        } else {
            console.log('Login failed for', email);
        }
    } catch (error) {
        console.error('Error for', email, ':', error.message);
    }
}

testConversationsAPI();
