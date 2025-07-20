// Fast Navigation Helper for Totilove Chat
// This script optimizes all navigation for instant feedback and fast transitions

// Global navigation optimizer
function optimizeFastNavigation() {
    // Add loading states to all navigation buttons
    document.querySelectorAll('button, a').forEach(element => {
        if (element.onclick || element.href) {
            element.addEventListener('click', function(e) {
                // Show immediate feedback for any navigation
                if (this.textContent && !this.textContent.includes('spinner')) {
                    const originalContent = this.innerHTML;
                    
                    // Store original content for restoration if needed
                    this.setAttribute('data-original-content', originalContent);
                    
                    // Show loading state
                    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
                    this.style.opacity = '0.7';
                    this.disabled = true;
                    
                    // Auto-restore after 5 seconds if navigation failed
                    setTimeout(() => {
                        if (this.innerHTML.includes('Loading...')) {
                            this.innerHTML = originalContent;
                            this.style.opacity = '1';
                            this.disabled = false;
                        }
                    }, 5000);
                }
            });
        }
    });
}

// Fast redirect function with immediate feedback
function fastRedirect(url, buttonSelector = null) {
    // Show immediate feedback if button specified
    if (buttonSelector) {
        const button = document.querySelector(buttonSelector);
        if (button) {
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redirecting...';
            button.disabled = true;
            button.style.opacity = '0.6';
        }
    }
    
    // Immediate redirect
    window.location.href = url;
}

// Initialize fast navigation when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    optimizeFastNavigation();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fastRedirect, optimizeFastNavigation };
}
