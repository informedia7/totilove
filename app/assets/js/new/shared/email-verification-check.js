(function(window, document) {
    'use strict';

    if (window.__EMAIL_VERIFICATION_CHECK_INIT__) {
        return;
    }
    window.__EMAIL_VERIFICATION_CHECK_INIT__ = true;

    /**
     * Simple Email Verification Check Utility
     * Checks if current user's email is verified
     */

    let cachedVerifiedUserIds = new Set();

function isEmailVerifiedFlag(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

async function fetchVerificationFromDatabase(userId) {
    if (!userId) {
        return { isVerified: false, user: null };
    }

    const endpoint = `/api/user/${userId}?t=${Date.now()}`;
    const sessionToken = typeof getSessionToken === 'function' ? getSessionToken() : '';

    const headers = {
        'X-User-ID': userId
    };
    if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
        headers.Authorization = `Bearer ${sessionToken}`;
    }

    const response = await fetch(endpoint, {
        headers,
        cache: 'no-cache',
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error(`Verification lookup failed (${response.status})`);
    }

    const data = await response.json();
    const user = data?.user || null;
    const isVerified = isEmailVerifiedFlag(user?.email_verified);

    return { isVerified, user };
}

async function checkEmailVerificationStatus(forceRefresh = false) {
    try {
        const currentUser = window.currentUser || window.sessionManager?.getCurrentUser();
        const userId = currentUser?.id || null;

        if (!userId) {
            return false;
        }

        if (!forceRefresh && cachedVerifiedUserIds.has(userId)) {
            return true;
        }

        const { isVerified, user } = await fetchVerificationFromDatabase(userId);

        if (user && currentUser) {
            currentUser.email_verified = user.email_verified;
        }

        if (isVerified) {
            cachedVerifiedUserIds.add(userId);
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error checking email verification:', error);
        return false;
    }
}

async function resendVerificationEmail() {
    try {
        // Get current user email
        const currentUser = window.currentUser || window.sessionManager?.getCurrentUser();
        const sessionToken = typeof getSessionToken === 'function' ? getSessionToken() : '';

        if (!currentUser || !currentUser.email) {
            // Try to get email from API
            if (currentUser && currentUser.id && sessionToken) {
                const userResponse = await fetch(`/api/user/${currentUser.id}`, {
                    headers: {
                        'X-User-ID': currentUser.id,
                        'X-Session-Token': sessionToken,
                        'Authorization': `Bearer ${sessionToken}`
                    },
                    credentials: 'include'
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

        if (!sessionToken) {
            if (typeof showToast === 'function') {
                showToast('Unable to verify your session. Please refresh and try again.', 'error');
            } else if (typeof showUniversalToast === 'function') {
                showUniversalToast('Unable to verify your session. Please refresh and try again.', 'error');
            } else if (typeof showNotification === 'function') {
                showNotification('Unable to verify your session. Please refresh and try again.', 'error');
            } else {
                alert('Unable to verify your session. Please refresh and try again.');
            }
            return;
        }
        
        // Call resend verification API
        const response = await fetch('/api/resend-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken,
                'Authorization': `Bearer ${sessionToken}`
            },
            credentials: 'include',
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
    window.__markEmailVerified = function markEmailVerified(userId) {
        if (userId) {
            cachedVerifiedUserIds.add(Number(userId));
        }
    };

})(window, document);


