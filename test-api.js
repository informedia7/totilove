// Test script to verify APIs work correctly
const fetch = require('node-fetch');

async function testAPIs() {
    const baseUrl = 'http://localhost:3000';
    let sessionToken = null;
    
    try {
        // 1. Login first
        console.log('🔑 Testing login...');
        const loginResponse = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: '2@hotmail.co',
                password: '123456A'
            })
        });
        
        const loginData = await loginResponse.json();
        console.log('Login response:', loginData);
        
        if (loginData.success && loginData.sessionToken) {
            sessionToken = loginData.sessionToken;
            console.log('✅ Login successful');
        } else {
            console.log('❌ Login failed');
            return;
        }
        
        // 2. Test message count API
        console.log('\n💬 Testing message count API...');
        const countResponse = await fetch(`${baseUrl}/api/messages/count/20`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Cookie': `totilove_session_token=${sessionToken}`
            }
        });
        
        const countData = await countResponse.json();
        console.log('Message count response:', countData);
        
        // 3. Test conversations API
        console.log('\n🗣️ Testing conversations API...');
        const conversationsResponse = await fetch(`${baseUrl}/api/conversations`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Cookie': `totilove_session_token=${sessionToken}`
            }
        });
        
        const conversationsData = await conversationsResponse.json();
        console.log('Conversations response:', conversationsData);
        console.log('Number of conversations:', conversationsData.conversations?.length || 0);
        
        // 4. Summary
        console.log('\n📊 SUMMARY:');
        console.log(`- Message count: ${countData.count || 'Error'}`);
        console.log(`- Conversations: ${conversationsData.conversations?.length || 'Error'}`);
        
        if (countData.success && conversationsData.success) {
            console.log('✅ All APIs working correctly!');
            console.log('\n🔍 EXPLANATION:');
            console.log(`- Profile badge shows ${countData.count} messages (total individual messages)`);
            console.log(`- Chat shows ${conversationsData.conversations?.length} conversations (unique people)`);
            console.log('- This is correct behavior - messages vs conversation partners');
        } else {
            console.log('❌ Some APIs failed');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testAPIs();
