// Initialize user data from data attributes (CSP-safe)
// This script reads user data from body data attributes
// Must run synchronously since it's at the bottom of body
(function() {
    // Since this script is at the bottom of body, document.body should exist
    const body = document.body;
    
    if (!body) {
        // Fallback: wait for body (shouldn't happen but just in case)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                initializeUserData();
            });
        } else {
            // Body should exist, but if not, try immediately
            setTimeout(function() {
                initializeUserData();
            }, 0);
        }
        return;
    }
    
    // Initialize immediately since body exists
    initializeUserData();
    
    function initializeUserData() {
        const bodyEl = document.body;
        if (!bodyEl) return;
        
        // Read user data from body data attributes
        const userId = bodyEl.getAttribute('data-user-id');
        
        window.currentUser = {
            id: userId && userId !== 'null' && userId !== '' ? parseInt(userId) : null,
            real_name: bodyEl.getAttribute('data-user-real-name') || '',
            email: bodyEl.getAttribute('data-user-email') || '',
            age: (() => {
                const age = bodyEl.getAttribute('data-user-age');
                return age && age !== 'null' && age !== '' ? parseInt(age) : null;
            })(),
            gender: bodyEl.getAttribute('data-user-gender') || '',
            location: bodyEl.getAttribute('data-user-location') || '',
            memberSince: bodyEl.getAttribute('data-user-member-since') || '',
            lastActive: bodyEl.getAttribute('data-user-last-active') || ''
        };
        
        // Set authentication status
        window.isAuthenticated = window.currentUser && window.currentUser.id && window.currentUser.id !== 'null' && window.currentUser.id !== '';
        
        // Extract session token from URL or session manager
        function getSessionToken() {
            const urlParams = new URLSearchParams(window.location.search);
            const urlToken = urlParams.get('token');
            
            if (urlToken) {
                return urlToken;
            }
            
            // Try session manager first (preferred method)
            if (window.sessionManager && window.sessionManager.getToken) {
                return window.sessionManager.getToken() || '';
            }
            
            // No localStorage fallback
            return '';
        }
        
        // Store session token globally
        window.sessionToken = getSessionToken();
        
        // Expose getSessionToken globally for CSRF token management
        window.getSessionToken = getSessionToken;
    }
})();

