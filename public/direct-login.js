// Direct login script - paste this in browser console on the login page

async function directLogin() {
    console.log('🔄 Attempting direct login...');
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: 'demo@totilove.com',
                password: 'demo123'
            })
        });
        
        const data = await response.json();
        console.log('Login response:', data);
        
        if (data.success) {
            console.log('✅ Login successful!');
            
            // Store session data
            localStorage.setItem('sessionToken', data.sessionToken);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            
            console.log('✅ Session data stored');
            console.log('Token:', data.sessionToken.substring(0, 20) + '...');
            console.log('User:', data.user);
            
            // Redirect to profile
            console.log('🔄 Redirecting to profile...');
            window.location.href = '/users/profile.html';
            
        } else {
            console.error('❌ Login failed:', data.error);
            alert('Login failed: ' + data.error);
        }
        
    } catch (error) {
        console.error('❌ Login error:', error);
        alert('Login error: ' + error.message);
    }
}

// Run the login
directLogin();
