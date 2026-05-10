// Account Page JavaScript - Extracted from account.html - Phase 1 CSS/JS Extraction

let currentAccountStatus = 'active';

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

/**
 * After GET /api/verify-email we redirect here with ?emailVerification=&message=
 */
function handleEmailVerificationRedirectParams() {
    try {
        const params = new URLSearchParams(window.location.search);
        const state = params.get('emailVerification');
        if (!state) {
            return;
        }

        const messageParam = params.get('message');
        const defaults = {
            success: 'Your email is verified.',
            'already-verified': 'This email is already verified.',
            'invalid-or-expired':
                'This verification link is invalid or has expired. Request a new one from the login or register page.',
            'missing-token': 'Verification link is incomplete. Use the full link from your email.',
            error: 'Something went wrong while verifying your email. Please try again.'
        };

        const text =
            (messageParam && messageParam.trim()) ||
            defaults[state] ||
            defaults.error;

        if (state === 'success') {
            sessionStorage.setItem('totilove_account_email_verified_ok', '1');
        }

        const type =
            state === 'success'
                ? 'success'
                : state === 'already-verified'
                  ? 'info'
                  : 'error';

        showNotification(text, type);

        params.delete('emailVerification');
        params.delete('message');
        const qs = params.toString();
        const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, '', nextUrl);
    } catch (e) {
        console.warn('[account] handleEmailVerificationRedirectParams:', e);
    }
}

/** Rendered when /account loads without a session (e.g. after clicking verify-email link). */
function applyLoggedOutAccountExperience() {
    document.body.classList.add('account-page-needs-login');

    const created = document.getElementById('account-created-date');
    const loginRow = document.getElementById('last-login-date');
    if (created) created.textContent = '—';
    if (loginRow) loginRow.textContent = 'Sign in to view';

    const pwdChanged = document.getElementById('password-last-changed');
    if (pwdChanged) pwdChanged.textContent = 'Sign in to view';

    const loadingSection = document.getElementById('email-verification-loading');
    const verifiedSection = document.getElementById('email-verified-section');
    const notVerifiedSection = document.getElementById('email-not-verified-section');
    if (loadingSection) loadingSection.style.display = 'none';
    if (verifiedSection) verifiedSection.style.display = 'none';
    if (notVerifiedSection) notVerifiedSection.style.display = 'none';

    const planName = document.getElementById('current-plan-name-display');
    const planBadge = document.getElementById('current-plan-badge-display');
    const planDesc = document.getElementById('current-plan-description-display');
    const planExpiry = document.getElementById('current-plan-expiry-display');
    if (planName) planName.textContent = '—';
    if (planBadge) planBadge.textContent = '—';
    if (planDesc) planDesc.textContent = 'Sign in to see subscription details.';
    if (planExpiry) planExpiry.style.display = 'none';

    const justVerified = sessionStorage.getItem('totilove_account_email_verified_ok') === '1';
    if (justVerified) {
        sessionStorage.removeItem('totilove_account_email_verified_ok');
    }

    if (document.getElementById('account-login-required-banner')) {
        return;
    }

    const header = document.querySelector('.account-ui2 .ui2-header');
    if (!header || !header.parentElement) {
        return;
    }

    const banner = document.createElement('div');
    banner.id = 'account-login-required-banner';
    banner.style.cssText =
        'grid-column:1/-1;margin:0 0 1rem 0;padding:1rem 1.1rem;border-radius:14px;border:1px solid #cfe8f6;background:#f5fbff;color:#1a5a7a;font-size:0.92rem;line-height:1.45;';

    if (justVerified) {
        banner.innerHTML = `
            <strong style="display:block;margin-bottom:0.35rem;">Email verified</strong>
            <span>Your email is confirmed. <strong>Log in</strong> to unlock messaging, profile views, likes, and the rest of your account.</span>
            <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;">
                <a href="/login" style="display:inline-flex;align-items:center;padding:0.45rem 0.95rem;border-radius:10px;background:#1a5a7a;color:#fff;text-decoration:none;font-weight:600;">Log in</a>
                <a href="/register" style="display:inline-flex;align-items:center;padding:0.45rem 0.95rem;border-radius:10px;border:1px solid #9fbdcf;color:#1a5a7a;text-decoration:none;font-weight:600;">Create account</a>
            </div>`;
    } else {
        banner.innerHTML = `
            <strong style="display:block;margin-bottom:0.35rem;">Sign in required</strong>
            <span>To manage security, billing, and account actions we need an active session.</span>
            <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;">
                <a href="/login" style="display:inline-flex;align-items:center;padding:0.45rem 0.95rem;border-radius:10px;background:#1a5a7a;color:#fff;text-decoration:none;font-weight:600;">Log in</a>
                <a href="/register" style="display:inline-flex;align-items:center;padding:0.45rem 0.95rem;border-radius:10px;border:1px solid #9fbdcf;color:#1a5a7a;text-decoration:none;font-weight:600;">Register</a>
            </div>`;
    }

    header.parentElement.insertBefore(banner, header.nextSibling);
}

// Load account data on page load
document.addEventListener('DOMContentLoaded', async function() {
    handleEmailVerificationRedirectParams();
    const sessionOk = await loadAccountData();
    if (!sessionOk) {
        return;
    }
    await loadProfileCompletion();
    await checkEmailVerification();
    await loadCurrentPlan();
    
    // Initialize password validator
    PasswordValidator.init({
        passwordInputId: 'new-password-input',
        requirementsId: 'passwordRequirements'
    });
    
    // Change password modal is intentionally only closable via the top-right X button
    
    // Event listeners for buttons
    document.getElementById('verify-code-btn')?.addEventListener('click', verifyEmailByCode);
    document.getElementById('resend-verification-btn')?.addEventListener('click', resendVerificationEmail);
    document.getElementById('checkEmailVerificationBtn')?.addEventListener('click', checkEmailVerification);
    document.getElementById('changePasswordBtn')?.addEventListener('click', changePassword);
    document.getElementById('pauseAccountToggle')?.addEventListener('change', function() {
        const desiredPaused = this.checked;
        const isPaused = currentAccountStatus === 'paused';
        this.checked = isPaused;
        if (desiredPaused !== isPaused) {
            openPauseAccountModal();
        }
    });
    document.getElementById('cancelPauseAccountBtn')?.addEventListener('click', function(event) {
        event.preventDefault();
        closePauseAccountModal();
    });
    document.getElementById('confirmPauseAccountBtn')?.addEventListener('click', function(event) {
        event.preventDefault();
        pauseAccount();
    });
    document.getElementById('downloadAccountDataBtn')?.addEventListener('click', downloadAccountData);
    document.getElementById('closeChangePasswordModalBtn')?.addEventListener('click', closeChangePasswordModal);
    document.getElementById('toggle-new-password-btn')?.addEventListener('click', function() {
        togglePasswordVisibility('new-password-input', 'toggle-new-password-icon');
    });
    document.getElementById('toggle-confirm-password-btn')?.addEventListener('click', function() {
        togglePasswordVisibility('confirm-password-input', 'toggle-confirm-password-icon');
    });
    
    // Verification code input handler
    const verifyInput = document.getElementById('verification-code-input');
    if (verifyInput) {
        verifyInput.addEventListener('input', function() {
            this.value = this.value.replace(/[^0-9]/g, '').slice(0, 6);
            const btn = document.getElementById('verify-code-btn');
            if (this.value.length === 6) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            } else {
                btn.disabled = true;
                btn.style.opacity = '0.6';
                btn.style.cursor = 'not-allowed';
            }
        });
        verifyInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && this.value.length === 6) {
                verifyEmailByCode();
            }
        });
    }
    
    // Change password form handler
    const changePwdForm = document.getElementById('change-password-form');
    if (changePwdForm) {
        changePwdForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleChangePassword(e);
        });
    }
});

async function loadAccountData() {
    try {
        // Cookie-based auth - cookies sent automatically.
        // redirect:'manual' — some gateways redirect /api instead of returning JSON 401; following would yield HTML 200 and JSON.parse errors.
        const response = await fetch('/api/account/info', {
            method: 'GET',
            credentials: 'same-origin',
            redirect: 'manual'
        });

        if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
            applyLoggedOutAccountExperience();
            return false;
        }

        const ct = response.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
            applyLoggedOutAccountExperience();
            return false;
        }

        let data;
        try {
            data = await response.json();
        } catch (parseErr) {
            console.warn('[account] account/info response was not valid JSON', parseErr);
            applyLoggedOutAccountExperience();
            return false;
        }

        if (!response.ok || data.success !== true) {
            applyLoggedOutAccountExperience();
            return false;
        }

        currentAccountStatus = data.accountStatus === 'paused' ? 'paused' : 'active';
        updatePauseAccountButton(currentAccountStatus);

        const createdEl = document.getElementById('account-created-date');
        if (createdEl) {
            if (data.accountCreated) {
                const createdDate = new Date(data.accountCreated);
                createdEl.textContent = createdDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            } else {
                createdEl.textContent = '—';
            }
        }

        if (data.lastLogin) {
            const loginDate = new Date(data.lastLogin);
            const now = new Date();
            const diffMs = now - loginDate;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            let timeAgo = '';
            if (diffMins < 1) {
                timeAgo = loginDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } else if (diffMins < 60) {
                timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
            } else if (diffHours < 24) {
                timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            } else if (diffDays < 7) {
                timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            } else {
                timeAgo = loginDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }

            document.getElementById('last-login-date').textContent = timeAgo;
        } else {
            document.getElementById('last-login-date').textContent = 'Never';
        }

        return true;
    } catch (error) {
        console.error('Error loading account data:', error);
        applyLoggedOutAccountExperience();
        return false;
    }
}

function updatePauseAccountButton(status) {
    const toggle = document.getElementById('pauseAccountToggle');
    if (!toggle) {
        return;
    }
    toggle.checked = status === 'paused';
}

async function loadProfileCompletion() {
    try {
        // Use existing stats-count.js if available
        if (window.statsCount && window.statsCount.calculateAndUpdate) {
            await window.statsCount.calculateAndUpdate();
            
            // Update completion display
            setTimeout(() => {
                const percentage = document.getElementById('completion-percentage');
                const label = document.getElementById('completion-label');
                const profileCompletionPercentage = document.getElementById('profile-completion-percentage');
                const profileCompletionLabel = document.getElementById('profile-completion-label');
                const profileCompletionBar = document.getElementById('profile-completion-bar');
                
                if (percentage && label && profileCompletionPercentage && profileCompletionLabel && profileCompletionBar) {
                    profileCompletionPercentage.textContent = percentage.textContent;
                    profileCompletionLabel.textContent = label.textContent;
                    const percentageValue = parseInt(percentage.textContent) || 0;
                    profileCompletionBar.style.width = percentageValue + '%';
                }
            }, 500);
        }
    } catch (error) {
        console.error('Error loading profile completion:', error);
        // Silently fail - profile completion is not critical
        // The completion bar will just not update, which is acceptable
    }
}

async function checkEmailVerification() {
    const loadingSection = document.getElementById('email-verification-loading');
    const verifiedSection = document.getElementById('email-verified-section');
    const notVerifiedSection = document.getElementById('email-not-verified-section');
    const messageDiv = document.getElementById('verification-message');
    
    // Show loading
    loadingSection.style.display = 'block';
    verifiedSection.style.display = 'none';
    notVerifiedSection.style.display = 'none';
    if (messageDiv) messageDiv.style.display = 'none';
    
    try {
        // Cookie-based auth - cookies sent automatically
        const response = await fetch(`/api/account/info?t=${Date.now()}`, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Hide loading
            loadingSection.style.display = 'none';
            
            if (data.emailVerified) {
                // Show verified state
                verifiedSection.style.display = 'block';
                notVerifiedSection.style.display = 'none';
                
                // Update verified email display
                const verifiedEmailDisplay = document.getElementById('verified-email-display');
                if (verifiedEmailDisplay && data.email) {
                    verifiedEmailDisplay.textContent = data.email;
                }
            } else {
                // Show not verified state
                verifiedSection.style.display = 'none';
                notVerifiedSection.style.display = 'block';
                
                // Update user email display
                const userEmailDisplay = document.getElementById('user-email-display');
                if (userEmailDisplay && data.email) {
                    userEmailDisplay.textContent = data.email;
                }
            }
        } else {
            // Error state
            loadingSection.style.display = 'none';
            notVerifiedSection.style.display = 'block';
            verifiedSection.style.display = 'none';
            
            if (messageDiv) {
                messageDiv.style.display = 'block';
                messageDiv.style.background = '#fee';
                messageDiv.style.color = '#dc3545';
                messageDiv.style.border = '1px solid #dc3545';
                messageDiv.textContent = 'Error checking verification status. Please try again.';
            }
        }
    } catch (error) {
        console.error('Error checking email verification:', error);
        loadingSection.style.display = 'none';
        notVerifiedSection.style.display = 'block';
        verifiedSection.style.display = 'none';
        
        if (messageDiv) {
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#fee';
            messageDiv.style.color = '#dc3545';
            messageDiv.style.border = '1px solid #dc3545';
            const errorMessage = error.message && error.message.includes('HTTP error') 
                ? 'Network error. Please check your connection and try again.' 
                : 'Error checking verification status. Please try again.';
            messageDiv.textContent = errorMessage;
        }
    }
}

function changePassword() {
    document.getElementById('change-password-modal').style.display = 'flex';
    document.getElementById('change-password-form').reset();
    document.getElementById('password-change-message').style.display = 'none';
    document.getElementById('passwordRequirements').style.display = 'none';
    document.getElementById('current-password-input').focus();
}

// Wrapper function for inline onclick
function togglePasswordRequirements(event) {
    PasswordValidator.toggleRequirements(event, 'passwordRequirements');
}

function closeChangePasswordModal() {
    document.getElementById('change-password-modal').style.display = 'none';
    document.getElementById('change-password-form').reset();
    document.getElementById('password-change-message').style.display = 'none';
    document.getElementById('passwordRequirements').style.display = 'none';

    // Reset password visibility and icons when closing
    const newPasswordInput = document.getElementById('new-password-input');
    const confirmPasswordInput = document.getElementById('confirm-password-input');
    const newPasswordIcon = document.getElementById('toggle-new-password-icon');
    const confirmPasswordIcon = document.getElementById('toggle-confirm-password-icon');

    if (newPasswordInput) {
        newPasswordInput.type = 'password';
    }
    if (confirmPasswordInput) {
        confirmPasswordInput.type = 'password';
    }
    if (newPasswordIcon) {
        newPasswordIcon.className = 'fas fa-eye';
    }
    if (confirmPasswordIcon) {
        confirmPasswordIcon.className = 'fas fa-eye';
    }
}

function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);

    if (!input || !icon) {
        return;
    }

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
}

async function handleChangePassword(event) {
    event.preventDefault();
    
    const currentPassword = document.getElementById('current-password-input').value;
    const newPassword = document.getElementById('new-password-input').value;
    const confirmPassword = document.getElementById('confirm-password-input').value;
    const messageDiv = document.getElementById('password-change-message');
    const submitBtn = document.getElementById('change-password-submit-btn');
    
    // Clear previous messages
    messageDiv.style.display = 'none';
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        messageDiv.textContent = 'Please fill in all fields';
        messageDiv.style.background = '#ffe6e6';
        messageDiv.style.color = '#dc3545';
        messageDiv.style.display = 'block';
        return;
    }
    
    // Validate password requirements
    const passwordError = PasswordValidator.validateWithMessage(newPassword);
    if (passwordError) {
        messageDiv.textContent = passwordError;
        messageDiv.style.background = '#ffe6e6';
        messageDiv.style.color = '#dc3545';
        messageDiv.style.display = 'block';
        return;
    }
    
    if (newPassword !== confirmPassword) {
        messageDiv.textContent = 'New password and confirm password do not match';
        messageDiv.style.background = '#ffe6e6';
        messageDiv.style.color = '#dc3545';
        messageDiv.style.display = 'block';
        return;
    }
    
    // Disable button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Changing...';
    
    try {
        const response = await fetch('/api/account/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                currentPassword,
                newPassword,
                confirmPassword
            })
        });

        const data = await response.json();

        if (response.status === 401) {
            messageDiv.textContent = data.error || 'Your session has expired. Please log in again.';
            messageDiv.style.background = '#ffe6e6';
            messageDiv.style.color = '#dc3545';
            messageDiv.style.display = 'block';
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        
        if (data.success) {
            messageDiv.textContent = 'Password changed successfully!';
            messageDiv.style.background = '#e8f5e9';
            messageDiv.style.color = '#28a745';
            messageDiv.style.display = 'block';
            
            // Reset form
            document.getElementById('change-password-form').reset();
        } else {
            messageDiv.textContent = data.error || 'Failed to change password';
            messageDiv.style.background = '#ffe6e6';
            messageDiv.style.color = '#dc3545';
            messageDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error changing password:', error);
        const isNetworkError = error instanceof TypeError
            || /failed to fetch|network/i.test(error.message || '');
        const errorMessage = isNetworkError
            ? 'Network error. Please check your connection and try again.'
            : (error.message || 'An error occurred. Please try again.');
        messageDiv.textContent = errorMessage;
        messageDiv.style.background = '#ffe6e6';
        messageDiv.style.color = '#dc3545';
        messageDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Change Password';
    }
}

async function resendVerificationEmail() {
    const resendBtn = document.getElementById('resend-verification-btn');
    const messageDiv = document.getElementById('verification-message');
    
    // Disable button and show loading
    const originalBtnContent = resendBtn.innerHTML;
    resendBtn.disabled = true;
    resendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    resendBtn.style.opacity = '0.6';
    resendBtn.style.cursor = 'not-allowed';
    
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }
    
    try {
        // Get user email from account info (cookie-based auth)
        const accountResponse = await fetch('/api/account/info', {
            method: 'GET',
            credentials: 'same-origin'
        });
        const accountData = await accountResponse.json();
        
        if (!accountData.success || !accountData.email) {
            throw new Error('Unable to get email address');
        }
        
        // Send resend verification request
        const response = await fetch('/api/resend-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: accountData.email })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Show success message
            if (messageDiv) {
                messageDiv.style.display = 'block';
                messageDiv.style.background = '#d4edda';
                messageDiv.style.color = '#155724';
                messageDiv.style.border = '1px solid #c3e6cb';
                messageDiv.innerHTML = '<i class="fas fa-check-circle"></i> Verification email sent! Please check your inbox (and spam folder).';
            }
            
            // Re-enable button after 3 seconds
            setTimeout(() => {
                resendBtn.disabled = false;
                resendBtn.innerHTML = originalBtnContent;
                resendBtn.style.opacity = '1';
                resendBtn.style.cursor = 'pointer';
            }, 3001);
        } else {
            // Show error message
            if (messageDiv) {
                messageDiv.style.display = 'block';
                messageDiv.style.background = '#fee';
                messageDiv.style.color = '#dc3545';
                messageDiv.style.border = '1px solid #dc3545';
                messageDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + (data.error || 'Failed to send verification email. Please try again.');
            }
            
            // Re-enable button
            resendBtn.disabled = false;
            resendBtn.innerHTML = originalBtnContent;
            resendBtn.style.opacity = '1';
            resendBtn.style.cursor = 'pointer';
        }
    } catch (error) {
        console.error('Error resending verification email:', error);
        
        // Show user-friendly error message
        if (messageDiv) {
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#fee';
            messageDiv.style.color = '#dc3545';
            messageDiv.style.border = '1px solid #dc3545';
            const errorMessage = error.message && error.message.includes('HTTP error') 
                ? 'Network error. Please check your connection and try again.' 
                : 'Failed to send verification email. Please try again later.';
            messageDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${errorMessage}`;
        }
        
        // Re-enable button
        resendBtn.disabled = false;
        resendBtn.innerHTML = originalBtnContent;
        resendBtn.style.opacity = '1';
        resendBtn.style.cursor = 'pointer';
    }
}

async function downloadAccountData() {
    if (!confirm('This will download all your account data. Continue?')) return;
    
    try {
        // Cookie-based auth - cookies sent automatically
        const response = await fetch('/api/account/export', {
            method: 'GET',
            credentials: 'same-origin'
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `account-data-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            alert('Failed to download account data');
        }
    } catch (error) {
        console.error('Error downloading account data:', error);
        const errorMessage = error.message && error.message.includes('HTTP error')
            ? 'Network error. Please check your connection and try again.'
            : 'Failed to download account data. Please try again later.';
        alert(errorMessage);
    }
}

function openPauseAccountModal() {
    const modal = document.getElementById('pause-account-modal');
    const title = document.getElementById('pause-account-modal-title');
    const bodyText = document.getElementById('pause-account-modal-text');
    const confirmBtn = document.getElementById('confirmPauseAccountBtn');

    if (!modal || !title || !bodyText || !confirmBtn) {
        return;
    }

    const isPaused = currentAccountStatus === 'paused';
    title.textContent = isPaused ? 'Resume Account' : 'Pause Account';
    bodyText.textContent = isPaused
        ? 'Your profile will become visible in search and matches again, and messaging will be enabled.'
        : 'You will be hidden from search and matches and cannot send new messages until resumed.';
    confirmBtn.textContent = isPaused ? 'Resume Account' : 'Pause Account';

    modal.style.display = 'flex';
}

function closePauseAccountModal() {
    const modal = document.getElementById('pause-account-modal');
    const confirmBtn = document.getElementById('confirmPauseAccountBtn');

    if (modal) {
        modal.style.display = 'none';
    }

    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
    }
}

async function pauseAccount() {
    const isPaused = currentAccountStatus === 'paused';
    const confirmBtn = document.getElementById('confirmPauseAccountBtn');

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.7';
        confirmBtn.style.cursor = 'not-allowed';
    }

    const endpoint = isPaused ? '/api/account/resume' : '/api/account/pause';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        currentAccountStatus = data.accountStatus === 'paused' ? 'paused' : 'active';
        updatePauseAccountButton(currentAccountStatus);
        closePauseAccountModal();
        showNotification(
            currentAccountStatus === 'paused'
                ? 'Your account is now paused.'
                : 'Your account is now active again.',
            'success'
        );
    } catch (error) {
        console.error('Error updating account pause status:', error);
        alert(error.message || 'Failed to update account status. Please try again.');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
        }
    }
}

async function loadCurrentPlan() {
    try {
        const response = await fetch('/api/account/subscription', {
            method: 'GET',
            credentials: 'same-origin'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.subscription) {
            const subscription = data.subscription;
            const planName = document.getElementById('current-plan-name-display');
            const planBadge = document.getElementById('current-plan-badge-display');
            const planDesc = document.getElementById('current-plan-description-display');
            const planExpiry = document.getElementById('current-plan-expiry-display');
            const planExpiryDate = document.getElementById('current-plan-expiry-date');

            const planMap = {
                'free':    { name: 'Free Plan',      badge: 'FREE',    desc: 'Basic features included',      color: '#6c757d' },
                'basic':   { name: 'Premium Basic',  badge: 'BASIC',   desc: 'Enhanced dating experience',   color: '#007bff' },
                'premium': { name: 'Premium Plus',   badge: 'PREMIUM', desc: 'Maximum matching power',       color: '#28a745' },
                'vip':     { name: 'VIP Elite',      badge: 'VIP',     desc: 'Ultimate dating experience',   color: '#ffc107' }
            };

            const planType = subscription.plan || 'free';
            const planInfo = planMap[planType] || planMap.free;

            planName.textContent = planInfo.name;
            planBadge.textContent = planInfo.badge;
            planBadge.style.background = planType === 'free' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.3)';
            planDesc.textContent = planInfo.desc;

            if (subscription.expiresAt) {
                const expiryDate = new Date(subscription.expiresAt);
                planExpiryDate.textContent = expiryDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                planExpiry.style.display = 'block';
            } else {
                planExpiry.style.display = 'none';
            }
        } else {
            document.getElementById('current-plan-name-display').textContent = 'Free Plan';
            document.getElementById('current-plan-badge-display').textContent = 'FREE';
            document.getElementById('current-plan-description-display').textContent = 'Basic features included';
        }
    } catch (error) {
        console.error('Error loading current plan:', error);
        const planNameElement = document.getElementById('current-plan-name-display');
        const planBadgeElement = document.getElementById('current-plan-badge-display');
        const planDescElement = document.getElementById('current-plan-description-display');

        if (planNameElement) planNameElement.textContent = 'Free Plan';
        if (planBadgeElement) planBadgeElement.textContent = 'FREE';
        if (planDescElement) planDescElement.textContent = 'Basic features included';
    }
}

function getSessionToken() {
    // CSRF implementation moves token from URL to cookie, so check cookie first
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const trimmed = cookie.trim();
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex === -1) continue;
        
        const name = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim();
        
        if (name === 'sessionToken') {
            return decodeURIComponent(value);
        }
    }
    
    // Fallback to URL (in case CSRF hasn't run yet)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
        return urlToken;
    }
    
    // Try sessionManager if available
    if (window.sessionManager && typeof window.sessionManager.getToken === 'function') {
        const token = window.sessionManager.getToken();
        if (token) {
            return token;
        }
    }
    
    return null;
}

function toggleEmailVerificationDetails() {
    const detailsSection = document.getElementById('email-verification-details');
    const chevron = document.getElementById('email-verification-chevron');
    
    if (detailsSection && chevron) {
        if (detailsSection.style.display === 'none' || detailsSection.style.display === '') {
            detailsSection.style.display = 'block';
            chevron.style.transform = 'rotate(180deg)';
        } else {
            detailsSection.style.display = 'none';
            chevron.style.transform = 'rotate(0deg)';
        }
    }
}

async function verifyEmailByCode() {
    const codeInput = document.getElementById('verification-code-input');
    const verifyBtn = document.getElementById('verify-code-btn');
    const messageDiv = document.getElementById('code-verification-message');
    
    const code = codeInput.value.trim();
    
    if (!code || code.length !== 6) {
        if (messageDiv) {
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#fee';
            messageDiv.style.color = '#dc3545';
            messageDiv.style.border = '1px solid #dc3545';
            messageDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Please enter a valid 6-digit code.';
        }
        return;
    }
    
    // Disable button and show loading
    const originalBtnContent = verifyBtn.innerHTML;
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    verifyBtn.style.opacity = '0.6';
    verifyBtn.style.cursor = 'not-allowed';
    
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }
    
    try {
        // Get current user ID from account info (cookie-based auth)
        const accountResponse = await fetch('/api/account/info', {
            method: 'GET',
            credentials: 'same-origin'
        });
        const accountData = await accountResponse.json();
        
        const resolvedUserId =
            accountData.userId ??
            accountData.id ??
            accountData.user?.id ??
            accountData.user?.userId;
        if (!accountData.success || resolvedUserId == null || resolvedUserId === '') {
            throw new Error('Unable to get user ID');
        }
        
        // Verify by code
        const response = await fetch('/api/verify-email-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                code: code,
                userId: resolvedUserId
            })
        });
        
        const data = await response.json().catch(() => ({}));
        
        if (!response.ok) {
            const apiErr = data.error || data.message || `Request failed (${response.status})`;
            throw new Error(apiErr);
        }
        
        if (data.success) {
            // Show success message
            if (messageDiv) {
                messageDiv.style.display = 'block';
                messageDiv.style.background = '#d4edda';
                messageDiv.style.color = '#155724';
                messageDiv.style.border = '1px solid #c3e6cb';
                messageDiv.innerHTML = '<i class="fas fa-check-circle"></i> Email verified successfully! Refreshing...';
            }
            
            // Clear input
            codeInput.value = '';
            
            // Refresh verification status after 1 second
            setTimeout(() => {
                checkEmailVerification();
            }, 1000);
        } else {
            // Show error message
            if (messageDiv) {
                messageDiv.style.display = 'block';
                messageDiv.style.background = '#fee';
                messageDiv.style.color = '#dc3545';
                messageDiv.style.border = '1px solid #dc3545';
                messageDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + (data.error || 'Invalid or expired code. Please try again.');
            }
            
            // Re-enable button
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = originalBtnContent;
            verifyBtn.style.opacity = '1';
            verifyBtn.style.cursor = 'pointer';
            
            // Clear input for retry
            codeInput.value = '';
            codeInput.focus();
        }
    } catch (error) {
        console.error('Error verifying email by code:', error);
        
        // Show user-friendly error message
        if (messageDiv) {
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#fee';
            messageDiv.style.color = '#dc3545';
            messageDiv.style.border = '1px solid #dc3545';
            const msg = error?.message || '';
            const errorMessage =
                msg.includes('Unable to get user ID')
                    ? 'Please refresh the page and sign in again, then retry the code.'
                    : msg.includes('Failed to fetch') || msg.includes('NetworkError')
                      ? 'Network error. Please check your connection and try again.'
                      : msg || 'Failed to verify code. Please try again.';
            messageDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${errorMessage}`;
        }
        
        // Re-enable button
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = originalBtnContent;
        verifyBtn.style.opacity = '1';
        verifyBtn.style.cursor = 'pointer';
    }
}



