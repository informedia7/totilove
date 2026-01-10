/**
 * Debug Auth Test - Temporary file to find all login/logout code
 * This file will be deleted later
 */

console.log('=== AUTH DEBUG TEST ===');

// Find all logout functions
console.log('1. Checking window.handleLogout:', typeof window.handleLogout);

// Find all login handlers
console.log('2. Checking window.handleLogin:', typeof window.handleLogin);

// Check global navbar
console.log('3. Checking window.globalNavbar:', typeof window.globalNavbar);
if (window.globalNavbar) {
    console.log('   - has logout method:', typeof window.globalNavbar.logout);
    console.log('   - isAuthenticated:', window.globalNavbar.isAuthenticated);
    console.log('   - currentUser:', window.globalNavbar.currentUser);
}

// Check session manager
console.log('4. Checking window.sessionManager:', typeof window.sessionManager);
if (window.sessionManager) {
    console.log('   - has clearSession:', typeof window.sessionManager.clearSession);
    console.log('   - has getToken:', typeof window.sessionManager.getToken);
}

// Check online tracker
console.log('5. Checking window.onlineTracker:', typeof window.onlineTracker);
if (window.onlineTracker) {
    console.log('   - has handleLogout:', typeof window.onlineTracker.handleLogout);
}

// Check current user
console.log('6. Checking window.currentUser:', window.currentUser);

// Find all logout buttons
console.log('7. Finding logout buttons:');
const logoutButtons = document.querySelectorAll('[id*="logout"], [href*="logout"], .logout, [class*="logout"]');
console.log('   - Found', logoutButtons.length, 'logout elements');
logoutButtons.forEach((btn, i) => {
    console.log(`   - Button ${i + 1}:`, btn.id || btn.className || btn.href);
});

// Test logout function
window.testLogoutDebug = function() {
    console.log('=== TESTING LOGOUT ===');
    if (window.handleLogout) {
        console.log('Calling window.handleLogout...');
        window.handleLogout({ preventDefault: () => {} });
    } else if (window.globalNavbar && window.globalNavbar.logout) {
        console.log('Calling window.globalNavbar.logout...');
        window.globalNavbar.logout();
    } else {
        console.log('ERROR: No logout function found!');
    }
};

// Run on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            console.log('=== AUTH DEBUG COMPLETE ===');
            console.log('Run testLogoutDebug() to test logout');
        }, 1000);
    });
} else {
    setTimeout(() => {
        console.log('=== AUTH DEBUG COMPLETE ===');
        console.log('Run testLogoutDebug() to test logout');
    }, 1000);
}


