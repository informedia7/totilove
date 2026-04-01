/**
 * Index/Homepage JavaScript
 * Extracted from index.html - Phase 1 CSS/JS Extraction
 */

function adjustMainContentPadding(event) {
    const navbar = document.querySelector('.global-navbar');
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) {
        return;
    }

    const computedHeight = event?.detail?.height;
    const navbarHeight = typeof computedHeight === 'number' ? computedHeight : (navbar?.offsetHeight || 0);

    if (navbarHeight > 0) {
        mainContent.style.paddingTop = `${navbarHeight}px`;
    }
}

window.addEventListener('load', adjustMainContentPadding);
window.addEventListener('resize', adjustMainContentPadding);
document.addEventListener('navbarLoaded', adjustMainContentPadding);

// Initialize everything on page load
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Initialize i18n system
        if (window.simpleI18n) {
            await window.simpleI18n.init();
        }
        
        // Initialize navbar
        if (typeof GlobalNavbar !== 'undefined') {
            window.globalNavbar = new GlobalNavbar();
            // Hide buttons after navbar checks auth
            setTimeout(() => {
                if (window.globalNavbar?.isAuthenticated || window.currentUser?.id) {
                    document.querySelectorAll('a.btn-primary[href*="register"]').forEach(btn => btn.style.display = 'none');
                }
            }, 500);
        }
        
        // Initialize scroll animations
        initScrollAnimations();

        adjustMainContentPadding();
    } catch (error) {
        // Silent fallback
    }
});

// Tab switching functionality
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
    });

    // Remove active class from all buttons
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    event.target.closest('.tab-btn').classList.add('active');
}

// Scroll animations
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe feature cards
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });

    // Observe showcase items
    const showcaseItems = document.querySelectorAll('.showcase-item');
    showcaseItems.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(30px)';
        item.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
        observer.observe(item);
    });
}

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Listen for language change events
document.addEventListener('languageChanged', function(event) {
    console.log('Language switched to:', event.detail.language);
    // Refresh page content when language changes
    window.simpleI18n.translatePage();
});

// Make showTab available globally for onclick handlers
window.showTab = showTab;








































