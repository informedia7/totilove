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

    attachActivityLinkNavigation();

});

function attachActivityLinkNavigation() {
    const activityTargets = document.querySelectorAll('[data-activity-link="true"]');
    if (!activityTargets.length) {
        return;
    }

    const activityUrl = window.ACTIVITY_PAGE_URL || '/activity';

    const navigateToActivity = () => {
        window.location.assign(activityUrl);
    };

    const handleClick = (event) => {
        event.preventDefault();
        navigateToActivity();
    };

    const handleKeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        navigateToActivity();
    };

    activityTargets.forEach((target) => {
        if (target.dataset.activityNavAttached === 'true') {
            return;
        }

        target.dataset.activityNavAttached = 'true';
        if (!target.hasAttribute('role')) {
            target.setAttribute('role', 'link');
        }
        if (!target.hasAttribute('tabindex')) {
            target.setAttribute('tabindex', '0');
        }
        if (!target.hasAttribute('aria-label')) {
            target.setAttribute('aria-label', 'View your activity feed');
        }
        target.style.cursor = 'pointer';
        target.addEventListener('click', handleClick);
        target.addEventListener('keydown', handleKeydown);
    });
}






















































