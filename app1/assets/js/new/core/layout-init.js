// Layout initialization handlers
document.addEventListener('DOMContentLoaded', function() {
    // Avatar error handler (CSP-safe)
    const avatar = document.getElementById('layoutUserAvatar');
    if (avatar) {
        avatar.addEventListener('error', function() {
            this.onerror = null;
            const defaultImg = window.currentUser && (window.currentUser.gender && window.currentUser.gender.toString().toLowerCase() === 'f') 
                ? '/assets/images/default_profile_female.svg' 
                : '/assets/images/default_profile_male.svg';
            this.src = defaultImg;
            this.style.display = 'block';
        });
    }
    
    // Account icon click handler
    document.getElementById('account-icon')?.addEventListener('click', toggleAccountDropdown);
    
    // Mobile menu toggle handler
    document.getElementById('mobile-menu-toggle')?.addEventListener('click', toggleMobileMenu);
    
    // Notification close handlers
    document.querySelectorAll('.notification-close').forEach(btn => {
        btn.addEventListener('click', function() {
            this.parentElement.parentElement.remove();
        });
    });

});






















































