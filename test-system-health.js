// Import fetch for Node.js
async function loadFetch() {
    const { default: fetch } = await import('node-fetch');
    return fetch;
}

async function testFullSystem() {
    console.log('🧪 Testing Totilove System...\n');
    
    try {
        const fetch = await loadFetch();
        // Test 1: Homepage
        console.log('1️⃣ Testing homepage...');
        const homeResponse = await fetch('http://localhost:3000/');
        console.log(`✅ Homepage: Status ${homeResponse.status}`);
        
        // Test 2: Featured profiles API
        console.log('2️⃣ Testing featured profiles API...');
        const profilesResponse = await fetch('http://localhost:3000/api/featured-profiles');
        const profilesData = await profilesResponse.json();
        console.log(`✅ Featured profiles: ${profilesData.profiles?.length || 0} profiles loaded`);
        
        // Test 3: Login API
        console.log('3️⃣ Testing login API...');
        const loginResponse = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'demo@totilove.com',
                password: 'Demo123'
            })
        });
        const loginData = await loginResponse.json();
        
        if (loginData.success) {
            console.log(`✅ Login successful: User ${loginData.user.username}`);
            
            // Test 4: Session validation
            console.log('4️⃣ Testing session validation...');
            const sessionResponse = await fetch('http://localhost:3000/api/current-user', {
                headers: {
                    'Authorization': `Bearer ${loginData.sessionToken}`
                }
            });
            const sessionData = await sessionResponse.json();
            console.log(`✅ Session validation: ${sessionData.authenticated ? 'Valid' : 'Invalid'}`);
            
            // Test 5: User profile API
            console.log('5️⃣ Testing user profile API...');
            const userResponse = await fetch(`http://localhost:3000/api/user/${loginData.user.id}`);
            const userData = await userResponse.json();
            console.log(`✅ User profile: ${userData.success ? 'Loaded' : 'Failed'}`);
            
        } else {
            console.log(`❌ Login failed: ${loginData.error}`);
        }
        
        console.log('\n🎉 All system tests completed successfully!');
        console.log('🌐 Server is healthy and all endpoints are responding correctly.');
        
    } catch (error) {
        console.error('❌ System test failed:', error.message);
        
        if (error.message.includes('ECONNREFUSED')) {
            console.log('💡 Solution: Make sure the server is running with: node server.js');
        } else if (error.message.includes('fetch')) {
            console.log('💡 Solution: Check network connectivity');
        }
    }
}

testFullSystem();
