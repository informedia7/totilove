/**
 * Information Tooltip Handler
 * Shared functions for showing/hiding information tooltips
 * Used in register.html and profile-edit.html
 */

// Toggle gender information visibility
function toggleGenderInfo(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const info = document.getElementById('genderInfo');
    
    if (!info) {
        console.warn('Gender info element not found');
        return;
    }
    
    if (info.style.display === 'none' || info.style.display === '') {
        info.style.display = 'flex';
        
        // Close tooltip when clicking outside
        const closeTooltip = (e) => {
            if (!info.contains(e.target) && e.target.id !== 'gender-info-icon' && !e.target.closest('button[onclick*="toggleGenderInfo"]')) {
                info.style.display = 'none';
                document.removeEventListener('click', closeTooltip);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeTooltip);
        }, 0);
    } else {
        info.style.display = 'none';
    }
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
    
    if (info.style.display === 'none' || info.style.display === '') {
        info.style.display = 'flex';
        
        // Close tooltip when clicking outside
        const closeTooltip = (e) => {
            if (!info.contains(e.target) && e.target.id !== 'name-info-icon' && !e.target.closest('button[onclick*="toggleNameInfo"]')) {
                info.style.display = 'none';
                document.removeEventListener('click', closeTooltip);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeTooltip);
        }, 0);
    } else {
        info.style.display = 'none';
    }
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


