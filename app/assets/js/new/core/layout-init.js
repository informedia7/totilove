// Layout initialization handlers
document.addEventListener('DOMContentLoaded', function () {
    // Avatar error handler (CSP-safe)
    const avatar = document.getElementById('layoutUserAvatar');
    const avatarFallback = document.getElementById('layoutUserAvatarFallback');
    if (avatar) {
        const hasUserImage = (avatar.dataset.hasProfileImage || '').toLowerCase() === 'true';
        const avatarCandidates = [
            avatar.dataset.avatarSmall || '',
            avatar.dataset.avatarMedium || '',
            avatar.dataset.avatarOriginal || ''
        ].filter(Boolean);

        const currentSrc = avatar.getAttribute('src') || '';
        const initialIndex = avatarCandidates.findIndex((candidate) => candidate === currentSrc);
        avatar.dataset.avatarAttemptIndex = initialIndex >= 0 ? String(initialIndex) : '0';

        const resolveDefaultAvatar = () => {
            const gender = window.currentUser && window.currentUser.gender
                ? window.currentUser.gender.toString().toLowerCase().trim()
                : '';
            return (gender === 'f' || gender === 'female')
                ? '/assets/images/default_profile_female.svg'
                : '/assets/images/default_profile_male.svg';
        };

        const showIconFallback = () => {
            avatar.classList.add('avatar-error');
            avatar.style.display = 'none';
            if (avatarFallback) {
                avatarFallback.style.display = 'flex';
            }
        };

        avatar.addEventListener('load', function () {
            this.classList.remove('avatar-error');
            this.style.display = 'block';
            if (avatarFallback) {
                avatarFallback.style.display = 'none';
            }
        });

        avatar.addEventListener('error', function () {
            if (hasUserImage) {
                const currentIndex = Number(this.dataset.avatarAttemptIndex || '0');
                const nextIndex = currentIndex + 1;
                if (nextIndex < avatarCandidates.length) {
                    this.dataset.avatarAttemptIndex = String(nextIndex);
                    this.src = avatarCandidates[nextIndex];
                    this.style.display = 'block';
                    return;
                }
                showIconFallback();
                return;
            }

            if (this.dataset.defaultApplied === '1') {
                showIconFallback();
                return;
            }

            this.dataset.defaultApplied = '1';
            this.src = resolveDefaultAvatar();
            this.style.display = 'block';
        });

        if (avatar.complete && avatar.naturalWidth === 0) {
            avatar.dispatchEvent(new Event('error'));
        }
    }

    // Account icon click handler
    document.getElementById('account-icon')?.addEventListener('click', toggleAccountDropdown);

    // Mobile menu toggle handler
    document.getElementById('mobile-menu-toggle')?.addEventListener('click', toggleMobileMenu);

    // Notification close handlers
    document.querySelectorAll('.notification-close').forEach(btn => {
        btn.addEventListener('click', function () {
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






















































