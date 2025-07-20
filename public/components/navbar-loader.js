// Navbar Dynamic Loader - Include this script in any page to add navbar
class NavbarLoader {
    constructor() {
        this.navbarLoaded = false;
    }

    // Load navbar HTML and CSS dynamically
    async loadNavbar(targetSelector = 'body', insertPosition = 'afterbegin') {
        try {
            // Load navbar CSS if not already loaded
            if (!document.querySelector('link[href*="navbar.css"]')) {
                const cssLink = document.createElement('link');
                cssLink.rel = 'stylesheet';
                cssLink.href = '/components/navbar.css';
                document.head.appendChild(cssLink);
            }

            // Load navbar HTML
            const response = await fetch('/components/navbar.html');
            if (!response.ok) {
                throw new Error(`Failed to load navbar: ${response.status}`);
            }
            
            const navbarHTML = await response.text();
            
            // Insert navbar into target element
            const targetElement = document.querySelector(targetSelector);
            if (targetElement) {
                targetElement.insertAdjacentHTML(insertPosition, navbarHTML);
                this.navbarLoaded = true;
                
                // Initialize navbar functionality
                this.initializeNavbar();
                
                // Set up authentication-specific navbar behavior
                this.setupAuthenticationNavbar();
                
                console.log('✅ Navbar loaded successfully');
            } else {
                throw new Error(`Target element "${targetSelector}" not found`);
            }
        } catch (error) {
            console.error('❌ Error loading navbar:', error);
        }
    }

    // Initialize navbar JavaScript functionality
    initializeNavbar() {
        // Load navbar.js functionality if available
        if (typeof window.initNavbar === 'function') {
            window.initNavbar();
        } else {
            // Fallback: basic navbar functionality
            this.setupBasicNavbar();
        }
    }

    // Setup basic navbar functionality (fallback)
    setupBasicNavbar() {
        // Mobile menu toggle
        window.toggleMobileMenu = function() {
            const menu = document.getElementById('navbarMenu');
            if (menu) {
                menu.classList.toggle('show');
            }
        };

        // Smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const href = this.getAttribute('href');
                
                if (!href || href === '#' || href.length <= 1) {
                    return;
                }
                
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                    
                    // Close mobile menu if open
                    const menu = document.getElementById('navbarMenu');
                    if (menu && menu.classList.contains('show')) {
                        menu.classList.remove('show');
                    }
                }
            });
        });

        // Set active link based on current page
        this.setActiveNavLink();
    }

    // Set active navigation link based on current page
    setActiveNavLink() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.navbar-menu a');
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            
            const linkPath = new URL(link.href).pathname;
            
            // Check if this is the current page
            if (linkPath === currentPath || 
                (currentPath === '/' && linkPath === '/') ||
                (currentPath.includes('/register') && linkPath.includes('/register')) ||
                (currentPath.includes('/login') && linkPath.includes('/login')) ||
                (currentPath.includes('/contact') && linkPath.includes('/contact')) ||
                (currentPath.includes('/chat') && linkPath.includes('/chat'))) {
                link.classList.add('active');
            }
        });
    }

    // Setup authentication-specific navbar behavior
    setupAuthenticationNavbar() {
        // Wait a bit to ensure navbar is fully rendered
        setTimeout(() => {
            // Check if user is authenticated using session manager
            if (window.sessionManager && window.sessionManager.isAuthenticated()) {
                this.showAuthenticatedNavbar();
            } else {
                this.showPublicNavbar();
            }
        }, 100);
    }

    // Show navbar for authenticated users
    showAuthenticatedNavbar() {
        console.log('🔧 Setting up navbar for authenticated user...');
        
        const logoutButton = document.querySelector('.navbar .logout-btn');
        const loginLinks = document.querySelectorAll('.navbar a[href="/login"], .navbar a[href="/register"], .navbar .register-btn');
        
        console.log('🔧 Found logout button:', logoutButton);
        console.log('🔧 Found login links:', loginLinks.length);
        
        // Show logout button for authenticated users
        if (logoutButton) {
            logoutButton.style.display = 'inline-block';
            // Also show parent li if it exists
            if (logoutButton.parentElement && logoutButton.parentElement.tagName === 'LI') {
                logoutButton.parentElement.style.display = 'list-item';
            }
            console.log('✅ Logout button shown');
        } else {
            // Create logout button if it doesn't exist
            this.createLogoutButton();
        }
        
        // Hide login/register links for authenticated users
        loginLinks.forEach(link => {
            link.style.display = 'none';
            // Also hide parent li to avoid empty space
            if (link.parentElement && link.parentElement.tagName === 'LI') {
                link.parentElement.style.display = 'none';
            }
            console.log('🔧 Hiding login link:', link.textContent);
        });
        
        console.log('✅ Navbar setup complete for authenticated user');
    }

    // Show navbar for public/non-authenticated users
    showPublicNavbar() {
        console.log('🔧 Setting up navbar for public user...');
        
        const logoutButton = document.querySelector('.navbar .logout-btn');
        const loginLinks = document.querySelectorAll('.navbar a[href="/login"], .navbar a[href="/register"], .navbar .register-btn');
        
        // Hide logout button for public users
        if (logoutButton) {
            logoutButton.style.display = 'none';
            // Also hide parent li
            if (logoutButton.parentElement && logoutButton.parentElement.tagName === 'LI') {
                logoutButton.parentElement.style.display = 'none';
            }
        }
        
        // Show login/register links for public users
        loginLinks.forEach(link => {
            link.style.display = 'inline-block';
            // Also show parent li
            if (link.parentElement && link.parentElement.tagName === 'LI') {
                link.parentElement.style.display = 'list-item';
            }
        });
        
        console.log('✅ Navbar setup complete for public user');
    }

    // Create logout button dynamically if it doesn't exist
    createLogoutButton() {
        const navbarMenu = document.querySelector('.navbar-menu');
        if (navbarMenu) {
            const logoutItem = document.createElement('li');
            logoutItem.innerHTML = '<a href="#" class="logout-btn" onclick="handleLogout(event)" style="background: #d63031; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none;">Logout</a>';
            navbarMenu.appendChild(logoutItem);
            console.log('✅ Logout button created dynamically');
        }
    }

    // Refresh navbar authentication state
    refreshAuthState() {
        if (this.navbarLoaded) {
            this.setupAuthenticationNavbar();
        }
    }
}

// Create global navbar loader instance
window.navbarLoader = new NavbarLoader();

// Auto-load navbar when DOM is ready (if not manually controlled)
document.addEventListener('DOMContentLoaded', function() {
    // Only auto-load if no navbar exists and auto-load is not disabled
    if (!document.querySelector('.navbar') && !window.disableAutoNavbar) {
        window.navbarLoader.loadNavbar();
    }
});

// Global function for logout handling (to be used by navbar)
window.handleLogout = function(event) {
    console.log('🔄 handleLogout called...');
    event.preventDefault();
    
    if (typeof logout === 'function') {
        logout();
    } else if (window.sessionManager && typeof window.sessionManager.logout === 'function') {
        // Use session manager logout if available
        window.sessionManager.logout();
        setTimeout(() => {
            window.location.href = '/pages/login.html';
        }, 1000);
    } else {
        // Fallback logout
        localStorage.removeItem('authToken');
        sessionStorage.removeItem('authToken');
        window.location.href = '/pages/login.html';
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavbarLoader;
}
