// Simple console login script - paste this in browser console on login page

console.log('🔑 Starting login process...');

// Wait for SessionManager to be available
if (typeof window.sessionManager === 'undefined') {
    console.log('⏳ Waiting for SessionManager...');
    setTimeout(() => {
        location.reload();
    }, 1000);
} else {
    console.log('✅ SessionManager available');
    
    // Set up session for user 20 who has 67 messages
    const testToken = '84fd5a3e16bf75509a2be113f93a081e8beca19912cdfb54a20d26f95e0cbdf2';
    const testUser = {id: 20, username: '2@hotmail.co', email: '2@hotmail.com'};
    
    // Use SessionManager's methods
    window.sessionManager.setToken(testToken, 120); // 2 hours
    window.sessionManager.setCurrentUser(testUser);
    
    console.log('✅ Session data set via SessionManager');
    console.log('Token:', window.sessionManager.getToken().substring(0, 20) + '...');
    console.log('User:', window.sessionManager.getCurrentUser());
    console.log('Authenticated:', window.sessionManager.isAuthenticated());
    
    // Navigate to profile immediately
    console.log('🔄 Redirecting to profile page...');
    window.location.href = '/users/profile.html';
}
