// Test login with demo credentials
async function testLogin() {
    try {
        console.log('🧪 Testing login with demo credentials...');
        
        const response = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: 'demo@totilove.com',
                password: 'Demo123'
            })
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.text();
        console.log('Raw response:', result);
        
        const jsonResult = JSON.parse(result);
        console.log('Parsed result:', jsonResult);
        
        if (jsonResult.success) {
            console.log('✅ Login successful!');
            console.log('Session token received:', !!jsonResult.sessionToken);
            console.log('User data:', jsonResult.user);
        } else {
            console.log('❌ Login failed:', jsonResult.error);
        }
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
    }
}

testLogin();
