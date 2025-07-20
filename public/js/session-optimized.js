// Optimized session management for Totilove - Fast UI updates and redirections
class OptimizedSession {
    constructor() {
        this.sessionToken = localStorage.getItem('sessionToken');
        this.currentUser = null;
        
        // Try to load user from localStorage
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try {
                this.currentUser = JSON.parse(storedUser);
            } catch (error) {
                console.error('Error parsing stored user:', error);
                this.clearSession();
            }
        }
    }

    // Set session after login
    setSession(token, user) {
        this.sessionToken = token;
        this.currentUser = user;
        localStorage.setItem('sessionToken', token);
        localStorage.setItem('currentUser', JSON.stringify(user));
        // Defer UI update to avoid blocking
        requestAnimationFrame(() => this.updateUI());
    }

    // Clear session (logout)
    clearSession() {
        this.sessionToken = null;
        this.currentUser = null;
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('currentUser');
        // No UI update needed - user is redirecting anyway
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Check if logged in
    isLoggedIn() {
        return this.sessionToken && this.currentUser;
    }

    // Get session token
    getToken() {
        return this.sessionToken;
    }

    // Update UI based on login status (optimized for speed)
    updateUI() {
        // Use requestAnimationFrame for smooth UI updates
        requestAnimationFrame(() => {
            const isUserLoggedIn = this.isLoggedIn();
            
            // Batch DOM queries for better performance
            const elements = {
                loginButtons: document.querySelectorAll('a[href="/login"], .login-btn'),
                logoutButtons: document.querySelectorAll('.logout-btn'),
                joinButtons: document.querySelectorAll('a[href="/register"], .register-btn'),
                contactButtons: document.querySelectorAll('a[href="/contact"]'),
                joinNowLinks: document.querySelectorAll('a')
            };
            
            if (isUserLoggedIn) {
                // User is logged in - optimize updates
                elements.loginButtons.forEach(btn => {
                    if (btn.textContent.includes('Login')) {
                        btn.textContent = `Hi, ${this.currentUser.username || 'User'}`;
                        btn.href = '/users/profile.html';
                    }
                    btn.style.display = 'block';
                });
                
                // Hide join/register buttons efficiently
                elements.joinButtons.forEach(btn => {
                    btn.style.display = 'none';
                    if (btn.parentElement?.tagName === 'LI') {
                        btn.parentElement.style.display = 'none';
                    }
                });
                
                // Hide contact buttons when logged in
                elements.contactButtons.forEach(btn => {
                    btn.style.display = 'none';
                    if (btn.parentElement?.tagName === 'LI') {
                        btn.parentElement.style.display = 'none';
                    }
                });
                
                // Hide "Join Now" links efficiently
                elements.joinNowLinks.forEach(link => {
                    const text = link.textContent.trim();
                    if (text === 'Join Now' || text.includes('Join Now')) {
                        link.style.display = 'none';
                        if (link.parentElement?.tagName === 'LI') {
                            link.parentElement.style.display = 'none';
                        }
                    }
                });
                
                // Show logout buttons or create them
                if (elements.logoutButtons.length === 0) {
                    this.addLogoutButton();
                } else {
                    elements.logoutButtons.forEach(btn => {
                        btn.style.display = 'block';
                        if (btn.parentElement) {
                            btn.parentElement.style.display = 'block';
                        }
                    });
                }
                
            } else {
                // User is not logged in - show appropriate buttons
                elements.loginButtons.forEach(btn => {
                    btn.style.display = 'block';
                    btn.textContent = 'Login';
                    btn.href = '/login';
                });
                
                // Show join/register buttons
                elements.joinButtons.forEach(btn => {
                    btn.style.display = 'block';
                    btn.style.visibility = 'visible';
                    if (btn.parentElement?.tagName === 'LI') {
                        btn.parentElement.style.display = 'block';
                    }
                });
                
                // Show contact buttons
                elements.contactButtons.forEach(btn => {
                    btn.style.display = 'block';
                    btn.style.visibility = 'visible';
                    if (btn.parentElement?.tagName === 'LI') {
                        btn.parentElement.style.display = 'block';
                    }
                });
                
                // Show "Join Now" links
                elements.joinNowLinks.forEach(link => {
                    const text = link.textContent.trim();
                    if (text === 'Join Now' || text.includes('Join Now')) {
                        link.style.display = 'block';
                        link.style.visibility = 'visible';
                        if (link.parentElement?.tagName === 'LI') {
                            link.parentElement.style.display = 'block';
                        }
                    }
                });
                
                // Hide logout buttons
                elements.logoutButtons.forEach(btn => {
                    btn.style.display = 'none';
                    if (btn.parentElement?.tagName === 'LI') {
                        btn.parentElement.style.display = 'none';
                    }
                });
            }
        });
    }

    // Add logout button to navbar
    addLogoutButton() {
        const existingLogoutBtn = document.querySelector('.logout-btn');
        const navbar = document.querySelector('.navbar-menu');
        
        if (existingLogoutBtn) {
            // If logout button exists but is hidden, show it
            existingLogoutBtn.style.display = 'block';
            if (existingLogoutBtn.parentElement) {
                existingLogoutBtn.parentElement.style.display = 'block';
            }
        } else if (navbar) {
            const logoutItem = document.createElement('li');
            logoutItem.innerHTML = '<a href="#" class="logout-btn" onclick="handleLogout(event)" style="background: #d63031; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none;">Logout</a>';
            navbar.appendChild(logoutItem);
        }
    }

    // Handle logout with immediate feedback and fast redirection
    logout() {
        // Show immediate feedback
        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
            logoutBtn.style.opacity = '0.6';
            logoutBtn.disabled = true;
        }
        
        // Clear session immediately
        this.clearSession();
        
        // Redirect immediately without UI update delay
        window.location.href = '/';
    }
}

// Create global instance
const session = new OptimizedSession();

// Legacy function support for existing code
function getCurrentUser() {
    return session.getCurrentUser();
}

function setCurrentUser(user) {
    // For simple compatibility, we'll generate a basic token
    const token = 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    session.setSession(token, user);
}

function clearCurrentUser() {
    session.clearSession();
}

function isLoggedIn() {
    return session.isLoggedIn();
}

// Global logout handler for onclick events with immediate redirection
function handleLogout(event) {
    event.preventDefault();
    
    // Show immediate feedback
    const target = event.target;
    const originalContent = target.innerHTML;
    target.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
    target.style.opacity = '0.6';
    
    // Clear session and redirect immediately
    session.clearSession();
    window.location.href = '/';
}

// Fast navigation helper for navbar links
function optimizeNavigation() {
    document.querySelectorAll('.navbar-menu a:not([href^="#"])').forEach(link => {
        link.addEventListener('click', function(e) {
            // Show immediate loading feedback
            const originalContent = this.innerHTML;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            this.style.opacity = '0.7';
            
            // Allow natural navigation - browser will handle it
            // Don't prevent default - let browser navigate normally
        });
    });
}

// Initialize optimized UI when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Optimize navigation for speed
    optimizeNavigation();
    
    // Update UI with minimal delay
    session.updateUI();
});
