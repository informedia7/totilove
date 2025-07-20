// Test sending a new message to check timestamp format
const fetch = require('node-fetch');

async function testNewMessage() {
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
            // Send a new message
            const sendResponse = await fetch('http://localhost:3000/api/messages/send', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${loginData.sessionToken}` 
                },
                body: JSON.stringify({
                    receiverId: 106,
                    content: 'Test message with fixed timestamp'
                })
            });
            
            const sendData = await sendResponse.json();
            console.log('Message sent:', sendData.success);
            
            // Wait a moment, then get messages to see the new timestamp format
            setTimeout(async () => {
                const messagesResponse = await fetch(`http://localhost:3000/api/messages/${loginData.user.id}/106`, {
                    headers: { 
                        'Authorization': `Bearer ${loginData.sessionToken}` 
                    }
                });
                
                const messagesData = await messagesResponse.json();
                console.log('\nMessages after sending new one:');
                
                if (messagesData.success && messagesData.messages) {
                    console.log('Number of messages:', messagesData.messages.length);
                    
                    // Show the last message (newest)
                    const lastMessage = messagesData.messages[messagesData.messages.length - 1];
                    if (lastMessage) {
                        console.log('\nLast message:');
                        console.log('  Content:', lastMessage.content);
                        console.log('  Timestamp (raw):', lastMessage.timestamp);
                        console.log('  Timestamp type:', typeof lastMessage.timestamp);
                        
                        try {
                            const date = new Date(lastMessage.timestamp);
                            console.log('  Parsed date:', date.toString());
                            console.log('  Is valid:', !isNaN(date.getTime()));
                            console.log('  Locale time:', date.toLocaleTimeString());
                        } catch (error) {
                            console.log('  Parse error:', error.message);
                        }
                    }
                }
            }, 1000);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

testNewMessage();
