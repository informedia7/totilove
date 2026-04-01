/**
 * Information Tooltip Handler
 * Shared functions for showing/hiding information tooltips
 * Used in register.html and profile-edit.html
 */

function showTooltip(info, shouldCloseFn) {
    // Reset animation if already visible
    info.classList.remove('show');
    void info.offsetWidth; // force reflow
    info.classList.add('show');

    if (!info.classList.contains('info-tooltip')) {
        info.style.display = 'flex';
    }

    const closeTooltip = (event) => {
        if (typeof shouldCloseFn === 'function' && shouldCloseFn(event.target)) {
            info.classList.remove('show');
            if (!info.classList.contains('info-tooltip')) {
                info.style.display = 'none';
            }
            document.removeEventListener('click', closeTooltip);
            info._closeTooltipHandler = null;
        }
    };

    if (info._closeTooltipHandler) {
        document.removeEventListener('click', info._closeTooltipHandler);
    }

    info._closeTooltipHandler = closeTooltip;
    setTimeout(() => document.addEventListener('click', closeTooltip), 0);
}

// Toggle gender information visibility
function toggleGenderInfo(event) {
    event.preventDefault();
    event.stopPropagation();

    const info = document.getElementById('genderInfo');

    if (!info) {
        console.warn('Gender info element not found');
        return;
    }

    showTooltip(info, (target) => !info.contains(target) && target.id !== 'gender-info-icon' && !target.closest('button[onclick*="toggleGenderInfo"]') && !target.closest('#gender-info-btn'));
}

// Toggle password requirements visibility
function togglePasswordRequirements(event) {
    event.preventDefault();
    event.stopPropagation();

    const requirements = document.getElementById('passwordRequirements');

    if (!requirements) {
        console.warn('Password requirements element not found');
        return;
    }

    if (requirements.style.display === 'none' || requirements.style.display === '') {
        requirements.style.display = 'block';

        // Update validation indicators
        updatePasswordRequirements();

        // Close tooltip when clicking outside
        const closeTooltip = (e) => {
            if (!requirements.contains(e.target) && e.target.id !== 'password-info-icon' && !e.target.closest('button[onclick*="togglePasswordRequirements"]')) {
                requirements.style.display = 'none';
                document.removeEventListener('click', closeTooltip);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeTooltip);
        }, 0);
    } else {
        requirements.style.display = 'none';
    }
}

// Toggle name information visibility
function toggleNameInfo(event) {
    event.preventDefault();
    event.stopPropagation();

    const info = document.getElementById('nameInfo');

    if (!info) {
        console.warn('Name info element not found');
        return;
    }

    showTooltip(info, (target) => !info.contains(target) && target.id !== 'name-info-icon' && !target.closest('button[onclick*="toggleNameInfo"]') && !target.closest('#name-info-btn'));
}

// Update password requirements indicators
function updatePasswordRequirements() {
    const password = document.getElementById('password')?.value || '';
    const lengthEl = document.getElementById('length');
    const uppercaseEl = document.getElementById('uppercase');
    const numberEl = document.getElementById('number');

    if (lengthEl) {
        const isValid = password.length >= 5 && password.length <= 12;
        const indicator = lengthEl.querySelector('span:first-child');
        if (indicator) {
            indicator.style.background = isValid ? '#28a745' : '#dc3545';
        }
    }

    if (uppercaseEl) {
        const isValid = /[A-Z]/.test(password);
        const indicator = uppercaseEl.querySelector('span:first-child');
        if (indicator) {
            indicator.style.background = isValid ? '#28a745' : '#dc3545';
        }
    }

    if (numberEl) {
        const isValid = /\d/.test(password);
        const indicator = numberEl.querySelector('span:first-child');
        if (indicator) {
            indicator.style.background = isValid ? '#28a745' : '#dc3545';
        }
    }
}


