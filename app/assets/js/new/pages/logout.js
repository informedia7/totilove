/**
 * Logout Page Controller
 * Extracted from logout.html so CSS/JS stay modular like other pages.
 */
(function initLogoutPage() {
    const selectors = {
        container: document.getElementById('logoutContainer'),
        progressBar: document.getElementById('progressBar'),
        status: document.getElementById('status'),
        loginLink: document.getElementById('loginLink')
    };

    if (!selectors.container || !selectors.progressBar || !selectors.status || !selectors.loginLink) {
        return;
    }

    const steps = [
        { progress: 20, message: 'Clearing session data...' },
        { progress: 40, message: 'Removing authentication tokens...' },
        { progress: 60, message: 'Cleaning browser storage...' },
        { progress: 80, message: 'Finalizing logout...' },
        { progress: 100, message: 'Logout complete!' }
    ];

    let currentStep = 0;

    const updateProgress = () => {
        if (currentStep >= steps.length) {
            finalizeLogout();
            return;
        }

        const step = steps[currentStep];
        selectors.progressBar.style.width = `${step.progress}%`;
        selectors.status.textContent = step.message;
        currentStep += 1;

        window.setTimeout(updateProgress, 800);
    };

    const finalizeLogout = () => {
        if (typeof window.handleLogout === 'function') {
            try {
                window.handleLogout({ preventDefault: () => {} });
            } catch (error) {
                console.warn('handleLogout failed, falling back to manual redirect.', error);
                triggerFallbackRedirect();
                return;
            }
        } else {
            triggerFallbackRedirect();
            return;
        }

        // Add subtle fade and redirect regardless, ensuring UX consistency
        window.setTimeout(() => {
            selectors.container.classList.add('fade-out');
            window.setTimeout(() => {
                window.location.href = '/login';
            }, 500);
        }, 1500);
    };

    const triggerFallbackRedirect = () => {
        selectors.status.textContent = 'Redirecting to login page...';
        selectors.loginLink.style.display = 'inline-flex';

        window.setTimeout(() => {
            window.location.href = '/login';
        }, 1500);
    };

    selectors.loginLink.addEventListener('click', (event) => {
        event.preventDefault();
        window.location.href = '/login';
    });

    window.setTimeout(updateProgress, 500);
})();
