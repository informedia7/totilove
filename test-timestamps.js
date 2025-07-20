// Test message timestamps format
const fetch = require('node-fetch');

async function testMessageTimestamps() {
    try {
        // Login first
        const loginResponse = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: '2@hotmail.co', 
                password: '123456A' 
            })
        });
        
        const loginData = await loginResponse.json();
        console.log('Login successful:', loginData.success);
        
        if (loginData.success && loginData.sessionToken) {
            // Get messages to see the timestamp format
            const messagesResponse = await fetch(`http://localhost:3000/api/messages/${loginData.user.id}/106`, {
                headers: { 
                    'Authorization': `Bearer ${loginData.sessionToken}` 
                }
            });
            
            const messagesData = await messagesResponse.json();
            console.log('\nMessages response:');
            console.log('Success:', messagesData.success);
            
            if (messagesData.success && messagesData.messages) {
                console.log('Number of messages:', messagesData.messages.length);
                console.log('\nFirst few messages with timestamps:');
                messagesData.messages.slice(0, 3).forEach((msg, index) => {
                    console.log(`Message ${index + 1}:`);
                    console.log('  Content:', msg.content);
                    console.log('  Timestamp (raw):', msg.timestamp);
                    console.log('  Timestamp type:', typeof msg.timestamp);
                    
                    // Try to parse the timestamp
                    try {
                        const date = new Date(msg.timestamp);
                        console.log('  Parsed date:', date.toString());
                        console.log('  Is valid:', !isNaN(date.getTime()));
                        console.log('  Locale time:', date.toLocaleTimeString());
                    } catch (error) {
                        console.log('  Parse error:', error.message);
                    }
                    console.log('');
                });
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

testMessageTimestamps();
