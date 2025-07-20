const { Pool } = require('pg');

async function testMessageAPI() {
    try {
        console.log('🧪 Testing message API...');
        
        // Test the API endpoint
        const response = await fetch('http://localhost:3000/api/messages/106/109');
        const data = await response.json();
        
        console.log('API Response:');
        console.log('Success:', data.success);
        console.log('Messages count:', data.messages ? data.messages.length : 0);
        
        if (data.messages && data.messages.length > 0) {
            console.log('\nMessages from API:');
            data.messages.forEach((msg, index) => {
                console.log(`${index + 1}. [${msg.sender_id}]: ${msg.content || msg.message}`);
                console.log(`   Time: ${new Date(msg.timestamp).toLocaleString()}`);
            });
        } else {
            console.log('❌ No messages returned from API');
        }
        
    } catch (error) {
        console.error('❌ Error testing API:', error.message);
    }
}

testMessageAPI();
