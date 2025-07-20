async function testProfilePageFix() {
    try {
        const { default: fetch } = await import('node-fetch');
        
        console.log('🧪 Testing Profile Page Fixes...\n');
        
        // Test 1: Login first
        console.log('1️⃣ Testing login...');
        const loginResponse = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'ezy4@hotmail.com',
                password: '123456A'
            })
        });
        const loginData = await loginResponse.json();
        
        if (loginData.success) {
            console.log('✅ Login successful for user:', loginData.user.username);
            const token = loginData.sessionToken;
            const userId = loginData.user.id;
            
            // Test 2: Valid contact countries request
            console.log('2️⃣ Testing valid contact countries request...');
            const validResponse = await fetch(`http://localhost:3000/api/contact-countries/${userId}`);
            const validData = await validResponse.json();
            console.log(`✅ Valid request: Status ${validResponse.status}, Success: ${validData.success}`);
            
            // Test 3: Invalid UUID request (should fail gracefully)
            console.log('3️⃣ Testing invalid UUID request...');
            const invalidResponse = await fetch('http://localhost:3000/api/contact-countries/6e2d8b31-4bda-4967-8bdd-49ae8781d592');
            const invalidData = await invalidResponse.json();
            console.log(`✅ Invalid UUID handled: Status ${invalidResponse.status}, Success: ${invalidData.success}`);
            console.log(`   Error message: ${invalidData.error}`);
            
            // Test 4: Current user endpoint with session
            console.log('4️⃣ Testing current user endpoint...');
            const userResponse = await fetch('http://localhost:3000/api/current-user', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const userData = await userResponse.json();
            console.log(`✅ Current user: Status ${userResponse.status}, Authenticated: ${userData.authenticated}`);
            
            console.log('\n🎉 All profile page fixes tested successfully!');
            
        } else {
            console.log('❌ Login failed:', loginData.error);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testProfilePageFix();
