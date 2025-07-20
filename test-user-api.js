async function testUserAPI() {
    try {
        const { default: fetch } = await import('node-fetch');
        
        console.log('🧪 Testing /api/user/3 endpoint...\n');
        
        const response = await fetch('http://localhost:3000/api/user/3');
        const data = await response.json();
        
        console.log('📡 Response Status:', response.status);
        console.log('📊 Response Data:', JSON.stringify(data, null, 2));
        
        if (data.success) {
            console.log('✅ User API working correctly');
            console.log('👤 User found:', data.user.username);
        } else {
            console.log('❌ User API returned error:', data.error);
        }
        
    } catch (error) {
        console.error('❌ Error testing user API:', error.message);
    }
}

testUserAPI();
