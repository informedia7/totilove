// Simple session management for Totilove
class SimpleSession {
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
        this.updateUI(); // Update UI after setting session
    }

    // Clear session (logout)
    clearSession() {
        this.sessionToken = null;
        this.currentUser = null;
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('currentUser');
        this.updateUI(); // Update UI after clearing session
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

    // Update UI based on login status
    updateUI() {
        console.log('🔄 Starting UI update, logged in:', this.isLoggedIn());
        console.log('🔄 Current user:', this.currentUser);
        
        const loginButtons = document.querySelectorAll('a[href="/login"], .login-btn');
        const logoutButtons = document.querySelectorAll('.logout-btn');
        const joinButtons = document.querySelectorAll('a[href="/register"], .register-btn');
        const contactButtons = document.querySelectorAll('a[href="/contact"]');
        
        console.log('📊 Found login buttons:', loginButtons.length);
        console.log('📊 Found logout buttons:', logoutButtons.length);
        console.log('📊 Found join buttons:', joinButtons.length);
        console.log('📊 Found contact buttons:', contactButtons.length);
        
        // Debug: Log all buttons found
        joinButtons.forEach((btn, index) => {
            console.log(`📝 Join button ${index}:`, btn.textContent.trim(), btn.href, btn.className);
        });
        
        if (this.isLoggedIn()) {
            console.log('✅ User is logged in - hiding join buttons and updating UI');
            
            // User is logged in - show logout, hide login/register
            loginButtons.forEach((btn, index) => {
                console.log(`🔄 Processing login button ${index}:`, btn.textContent);
                if (btn.textContent.includes('Login')) {
                    btn.textContent = `Hi, ${this.currentUser.username || 'User'}`;
                    btn.href = '/users/profile.html';
                    btn.style.display = 'block';
                    console.log('✅ Updated login button to show username');
                } else {
                    btn.style.display = 'none';
                    console.log('❌ Hid non-login button');
                }
            });
            
            // Hide all join/register buttons including "Join Now"
            joinButtons.forEach((btn, index) => {
                console.log(`❌ Hiding join button ${index}:`, btn.textContent.trim());
                btn.style.display = 'none';
                btn.style.visibility = 'hidden';
                // Also try hiding the parent li element
                if (btn.parentElement && btn.parentElement.tagName === 'LI') {
                    btn.parentElement.style.display = 'none';
                    console.log('❌ Also hid parent li element');
                }
            });
            
            // Hide contact buttons when logged in (for profile page)
            contactButtons.forEach((btn, index) => {
                console.log(`❌ Hiding contact button ${index}:`, btn.textContent.trim());
                btn.style.display = 'none';
                btn.style.visibility = 'hidden';
                // Also try hiding the parent li element
                if (btn.parentElement && btn.parentElement.tagName === 'LI') {
                    btn.parentElement.style.display = 'none';
                    console.log('❌ Also hid parent li element for contact');
                }
            });
            
            // Also hide any element that contains "Join Now" text - be more aggressive
            document.querySelectorAll('a').forEach((link, index) => {
                if (link.textContent.trim() === 'Join Now' || link.textContent.includes('Join Now')) {
                    console.log(`❌ Hiding "Join Now" link ${index}:`, link.textContent.trim(), link.href);
                    link.style.display = 'none';
                    link.style.visibility = 'hidden';
                    // Also try hiding the parent li element
                    if (link.parentElement && link.parentElement.tagName === 'LI') {
                        link.parentElement.style.display = 'none';
                        console.log('❌ Also hid parent li element for Join Now');
                    }
                }
            });
            
            // Show logout buttons or create them if they don't exist
            if (logoutButtons.length === 0) {
                console.log('➕ Adding logout button');
                this.addLogoutButton();
            } else {
                logoutButtons.forEach((btn, index) => {
                    console.log(`✅ Showing existing logout button ${index}`);
                    btn.style.display = 'block';
                    if (btn.parentElement) {
                        btn.parentElement.style.display = 'block';
                    }
                });
            }
            
        } else {
            console.log('❌ User is not logged in - showing join buttons');
            // User is not logged in - show login/register, hide logout
            loginButtons.forEach(btn => {
                btn.style.display = 'block';
                btn.textContent = 'Login';
                btn.href = '/login';
                console.log('✅ Restored login button');
            });
            
            joinButtons.forEach(btn => {
                btn.style.display = 'block';
                console.log('✅ Showed join button:', btn.textContent);
            });
            
            // Show contact buttons when not logged in
            contactButtons.forEach(btn => {
                btn.style.display = 'block';
                btn.style.visibility = 'visible';
                if (btn.parentElement && btn.parentElement.tagName === 'LI') {
                    btn.parentElement.style.display = 'block';
                }
                console.log('✅ Showed contact button');
            });
            
            // Show any hidden "Join Now" links
            document.querySelectorAll('a').forEach(link => {
                if (link.textContent.trim() === 'Join Now' || link.textContent.includes('Join Now')) {
                    link.style.display = 'block';
                    link.style.visibility = 'visible';
                    if (link.parentElement && link.parentElement.tagName === 'LI') {
                        link.parentElement.style.display = 'block';
                    }
                    console.log('✅ Showed Join Now link');
                }
            });
            
            logoutButtons.forEach((btn, index) => {
                console.log(`❌ Hiding logout button ${index}`);
                btn.style.display = 'none';
                if (btn.parentElement) {
                    btn.parentElement.style.display = 'none';
                }
            });
        }
    }

    // Add logout button to navbar
    addLogoutButton() {
        const existingLogoutBtn = document.querySelector('.logout-btn');
        const navbar = document.querySelector('.navbar-menu');
        
        if (existingLogoutBtn) {
            // If logout button exists but is hidden, show it
            console.log('✅ Found existing logout button, making it visible');
            existingLogoutBtn.style.display = 'block';
            if (existingLogoutBtn.parentElement) {
                existingLogoutBtn.parentElement.style.display = 'block';
            }
        } else if (navbar) {
            console.log('➕ Adding new logout button to navbar');
            const logoutItem = document.createElement('li');
            logoutItem.innerHTML = '<a href="#" class="logout-btn" onclick="handleLogout(event)" style="background: #d63031; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none;">Logout</a>';
            navbar.appendChild(logoutItem);
            console.log('✅ Logout button added successfully');
        } else {
            console.log('❌ Could not find navbar menu to add logout button');
        }
    }

    // Handle logout
    logout() {
        // Show immediate feedback
        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.textContent = 'Logging out...';
            logoutBtn.style.opacity = '0.6';
        }
        
        // Clear session immediately
        this.clearSession();
        
        // Redirect immediately without UI update delay
        window.location.href = '/';
    }
}

// Create global instance
const session = new SimpleSession();

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

// Global logout handler for onclick events
function handleLogout(event) {
    event.preventDefault();
    session.logout();
}

// Initialize UI when page loads
document.addEventListener('DOMContentLoaded', function() {
    session.updateUI();
});
