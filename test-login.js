// Simple test to check login functionality
async function testLogin() {
    try {
        console.log('Testing login endpoint...');
        
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

        const result = await response.json();
        console.log('Login response:', result);
        
        if (result.success) {
            console.log('✅ Login successful!');
            console.log('Session token:', result.sessionToken);
            console.log('User:', result.user);
        } else {
            console.log('❌ Login failed:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Login error:', error);
    }
}

testLogin();
