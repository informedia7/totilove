/**
 * Simple Email Verification Check Utility
 * Checks if current user's email is verified
 */

async function checkEmailVerificationStatus() {
    try {
        // Check from current user object first (fastest)
        const currentUser = window.currentUser || window.sessionManager?.getCurrentUser();
        if (currentUser && (currentUser.email_verified === true || currentUser.email_verified === 'true')) {
            return true;
        }
        
        // Always check via API to get fresh data (important after admin verification)
        if (currentUser && currentUser.id) {
            const response = await fetch(`/api/user/${currentUser.id}?t=${Date.now()}`, {
                headers: {
                    'X-User-ID': currentUser.id
                },
                cache: 'no-cache' // Prevent caching
            });
            if (response.ok) {
                const data = await response.json();
                if (data.user) {
                    // Update the currentUser object with fresh data
                    if (currentUser) {
                        currentUser.email_verified = data.user.email_verified;
                    }
                    // Check if verified (handle both boolean and string 'true')
                    const isVerified = data.user.email_verified === true || 
                                     data.user.email_verified === 'true' || 
                                     data.user.email_verified === 1;
                    if (isVerified) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    } catch (error) {
        console.error('Error checking email verification:', error);
        return false; // Assume not verified for security
    }
}

async function resendVerificationEmail() {
    try {
        // Get current user email
        const currentUser = window.currentUser || window.sessionManager?.getCurrentUser();
        if (!currentUser || !currentUser.email) {
            // Try to get email from API
            if (currentUser && currentUser.id) {
                const userResponse = await fetch(`/api/user/${currentUser.id}`, {
                    headers: { 'X-User-ID': currentUser.id }
                });
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    if (userData.user && userData.user.email) {
                        currentUser.email = userData.user.email;
                    }
                }
            }
        }
        
        if (!currentUser || !currentUser.email) {
            if (typeof showToast === 'function') {
                showToast('Unable to find your email address. Please contact support.', 'error');
            } else {
                alert('Unable to find your email address. Please contact support.');
            }
            return;
        }
        
        // Call resend verification API
        const response = await fetch('/api/resend-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: currentUser.email })
        });
        
        const result = await response.json();
        
        if (result.success) {
            if (typeof showToast === 'function') {
                showToast('✅ Verification email sent! Please check your inbox.', 'success');
            } else if (typeof showUniversalToast === 'function') {
                showUniversalToast('✅ Verification email sent! Please check your inbox.', 'success');
            } else if (typeof showNotification === 'function') {
                showNotification('✅ Verification email sent! Please check your inbox.', 'success');
            } else {
                alert('✅ Verification email sent! Please check your inbox.');
            }
        } else {
            if (typeof showToast === 'function') {
                showToast('Failed to send verification email: ' + (result.error || 'Unknown error'), 'error');
            } else if (typeof showUniversalToast === 'function') {
                showUniversalToast('Failed to send verification email: ' + (result.error || 'Unknown error'), 'error');
            } else if (typeof showNotification === 'function') {
                showNotification('Failed to send verification email: ' + (result.error || 'Unknown error'), 'error');
            } else {
                alert('Failed to send verification email: ' + (result.error || 'Unknown error'));
            }
        }
    } catch (error) {
        console.error('Error resending verification email:', error);
        if (typeof showToast === 'function') {
            showToast('Failed to send verification email. Please try again later.', 'error');
        } else if (typeof showUniversalToast === 'function') {
            showUniversalToast('Failed to send verification email. Please try again later.', 'error');
        } else if (typeof showNotification === 'function') {
            showNotification('Failed to send verification email. Please try again later.', 'error');
        } else {
            alert('Failed to send verification email. Please try again later.');
        }
    }
}

function getSessionToken() {
    // Try URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    
    if (urlToken) {
        return urlToken;
    }
    
    // Try session manager (preferred method)
    if (window.sessionManager && window.sessionManager.getToken) {
        return window.sessionManager.getToken() || '';
    }
    
    // Try cookies as fallback
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'sessionToken') {
            return value;
        }
    }
    
    return '';
}

function goToAccountPage() {
    const token = getSessionToken();
    if (token) {
        window.location.href = `/account?token=${encodeURIComponent(token)}`;
    } else {
        // If no token, try to go to account page anyway (server will handle auth)
        window.location.href = '/account';
    }
}

function showVerificationMessage() {
    const message = '📧 Please verify your email address to use this feature. Check your inbox for the verification email.';
    
    // Create a callback function for the button to go to account page
    const verifyButtonCallback = function() {
        goToAccountPage();
    };
    
    if (typeof showUniversalToast === 'function') {
        // Check if showUniversalToast supports action buttons (has 3+ parameters)
        if (showUniversalToast.length >= 3) {
            showUniversalToast(message, 'warning', 'Verify Email', verifyButtonCallback);
        } else {
            // Fallback: create custom toast with button
            createVerificationToast(message);
        }
    } else if (typeof showNotification === 'function') {
        // Check if showNotification supports action buttons (has 3+ parameters)
        if (showNotification.length >= 3) {
            showNotification(message, 'warning', 'Verify Email', verifyButtonCallback);
        } else {
            createVerificationToast(message);
        }
    } else if (typeof showToast === 'function') {
        // showToast typically supports actionText and actionCallback
        showToast(message, 'warning', 'Verify Email', verifyButtonCallback);
    } else {
        // Fallback: create custom toast with button
        createVerificationToast(message);
    }
}

function createVerificationToast(message) {
    const toast = document.createElement('div');
    toast.className = 'verification-toast';
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f59e0b;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        max-width: 350px;
        animation: slideInRight 0.3s ease-out;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    `;
    
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-envelope"></i>
            <span style="flex: 1;">${message}</span>
        </div>
        <button onclick="window.goToAccountPage && window.goToAccountPage(); this.closest('.verification-toast').remove();" 
                style="background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; width: 100%; transition: background 0.2s;"
                onmouseover="this.style.background='rgba(255,255,255,0.35)'"
                onmouseout="this.style.background='rgba(255,255,255,0.25)'">
            <i class="fas fa-envelope"></i> Verify Email
        </button>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 8 seconds (longer since there's a button)
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }
    }, 8000);
}

// Add CSS animation if not exists
if (!document.getElementById('verification-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'verification-toast-styles';
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// Make globally available
window.checkEmailVerificationStatus = checkEmailVerificationStatus;
window.showVerificationMessage = showVerificationMessage;
window.resendVerificationEmail = resendVerificationEmail;
window.goToAccountPage = goToAccountPage;
window.getSessionToken = getSessionToken;


