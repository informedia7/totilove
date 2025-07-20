// Navbar Component JavaScript

// Mobile menu toggle function
function toggleMobileMenu() {
    const menu = document.getElementById('navbarMenu');
    menu.classList.toggle('show');
}

// Optimized navigation handler for better UX
function handleNavigation(event) {
    const link = event.target.closest('a');
    if (!link) return;
    
    const href = link.getAttribute('href');
    
    // Skip handling for anchor links (handled separately)
    if (href && href.startsWith('#')) return;
    
    // Add visual feedback for navigation
    link.style.opacity = '0.7';
    link.style.transform = 'scale(0.95)';
    
    // Show loading indicator if navigation takes time
    const loadingTimeout = setTimeout(() => {
        showNavigationLoading();
    }, 100);
    
    // Clean up when page unloads
    window.addEventListener('beforeunload', () => {
        clearTimeout(loadingTimeout);
        hideNavigationLoading();
    }, { once: true });
}

// Show loading indicator for slow navigation
function showNavigationLoading() {
    // Only show if not already shown
    if (document.querySelector('.nav-loading')) return;
    
    const loading = document.createElement('div');
    loading.className = 'nav-loading';
    loading.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background: linear-gradient(90deg, #667eea, #764ba2);
        z-index: 9999;
        animation: navProgress 1s ease-in-out infinite;
    `;
    
    // Add animation keyframes
    if (!document.querySelector('#nav-loading-styles')) {
        const style = document.createElement('style');
        style.id = 'nav-loading-styles';
        style.textContent = `
            @keyframes navProgress {
                0% { transform: translateX(-100%); }
                50% { transform: translateX(0%); }
                100% { transform: translateX(100%); }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(loading);
}

// Hide loading indicator
function hideNavigationLoading() {
    const loading = document.querySelector('.nav-loading');
    if (loading) {
        loading.remove();
    }
}

// Initialize navbar functionality
function initNavbar() {
    // Add navigation event listeners to all navbar links
    document.querySelectorAll('.navbar-menu a').forEach(link => {
        link.addEventListener('click', handleNavigation);
    });

    // Smooth scrolling for anchor navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const href = this.getAttribute('href');
            
            // Skip if href is just '#' or invalid
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

    // Add scroll effect to navbar (optimized)
    let ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(function() {
                const navbar = document.querySelector('.navbar');
                if (navbar) {
                    if (window.scrollY > 100) {
                        navbar.style.background = 'linear-gradient(135deg, rgba(108, 92, 231, 0.95), rgba(0, 184, 148, 0.95))';
                        navbar.style.boxShadow = '0 4px 25px rgba(0,0,0,0.2)';
                    } else {
                        navbar.style.background = 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))';
                        navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
                    }
                }
                ticking = false;
            });
            ticking = true;
        }
    });

    // Set active link based on current page
    setActiveNavLink();
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
        const navbar = document.querySelector('.navbar');
        const menu = document.getElementById('navbarMenu');
        const toggle = document.querySelector('.navbar-toggle');
        
        if (menu && menu.classList.contains('show')) {
            if (!navbar.contains(event.target)) {
                menu.classList.remove('show');
            }
        }
    });
}

// Set active navigation link based on current page
function setActiveNavLink() {
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
            (currentPath.includes('/contact') && linkPath.includes('/contact'))) {
            link.classList.add('active');
        }
    });
}

// Update active section on scroll (for single page navigation)
function updateActiveSection() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.navbar-menu a[href^="#"]');
    
    let current = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        
        if (window.scrollY >= (sectionTop - 200)) {
            current = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
}

// Initialize when DOM is loaded (only if navbar exists)
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if navbar exists (for backward compatibility)
    if (document.querySelector('.navbar')) {
        initNavbar();
        
        // Add scroll listener for section highlighting (only on pages with sections)
        if (document.querySelectorAll('section[id]').length > 0) {
            window.addEventListener('scroll', updateActiveSection);
        }
        
        // Clean up any existing loading indicators
        hideNavigationLoading();
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    hideNavigationLoading();
});

// Export functions for external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        toggleMobileMenu,
        initNavbar,
        setActiveNavLink,
        updateActiveSection,
        handleNavigation,
        showNavigationLoading,
        hideNavigationLoading
    };
}