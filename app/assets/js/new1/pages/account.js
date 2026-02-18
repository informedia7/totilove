// Account Page JavaScript - Extracted from account.html - Phase 1 CSS/JS Extraction

// Load account data on page load
document.addEventListener('DOMContentLoaded', async function() {
    await loadAccountData();
    await loadProfileCompletion();
    await checkEmailVerification();
    await loadCurrentPlan();
    
    // Initialize password validator
    PasswordValidator.init({
        passwordInputId: 'new-password-input',
        requirementsId: 'passwordRequirements'
    });
    
    // Close modals when clicking outside
    const passwordModal = document.getElementById('change-password-modal');
    if (passwordModal) {
        passwordModal.addEventListener('click', function(event) {
            if (event.target === passwordModal) {
                closeChangePasswordModal();
            }
        });
    }
    
    // Event listeners for buttons
    document.getElementById('verify-code-btn')?.addEventListener('click', verifyEmailByCode);
    document.getElementById('resend-verification-btn')?.addEventListener('click', resendVerificationEmail);
    document.getElementById('checkEmailVerificationBtn')?.addEventListener('click', checkEmailVerification);
    document.getElementById('changePasswordBtn')?.addEventListener('click', changePassword);
    document.getElementById('pauseAccountBtn')?.addEventListener('click', pauseAccount);
    document.getElementById('downloadAccountDataBtn')?.addEventListener('click', downloadAccountData);
    document.getElementById('closeChangePasswordModalBtn')?.addEventListener('click', closeChangePasswordModal);
    
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
        // Cookie-based auth - cookies sent automatically
        const response = await fetch('/api/account/info', {
            method: 'GET',
            credentials: 'same-origin'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update account dates
            if (data.accountCreated) {
                const createdDate = new Date(data.accountCreated);
                document.getElementById('account-created-date').textContent = createdDate.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
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
                    // Show actual time instead of "Just now"
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
                // No last login available (first time user or no sessions)
                document.getElementById('last-login-date').textContent = 'Never';
            }
        }
    } catch (error) {
        console.error('Error loading account data:', error);
        const lastLoginElement = document.getElementById('last-login-date');
        if (lastLoginElement) {
            const errorMessage = error.message && error.message.includes('HTTP error') 
                ? 'Unable to load (network error)' 
                : 'Unable to load';
            lastLoginElement.textContent = errorMessage;
        }
    }
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
                
                if (percentage && label) {
                    document.getElementById('profile-completion-percentage').textContent = percentage.textContent;
                    document.getElementById('profile-completion-label').textContent = label.textContent;
                    const percentageValue = parseInt(percentage.textContent) || 0;
                    document.getElementById('profile-completion-bar').style.width = percentageValue + '%';
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
        const token = getSessionToken();
        if (!token) {
            alert('Session token not found. Please log in again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Change Password';
            return;
        }
        
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
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            messageDiv.textContent = 'Password changed successfully!';
            messageDiv.style.background = '#e8f5e9';
            messageDiv.style.color = '#28a745';
            messageDiv.style.display = 'block';
            
            // Reset form
            document.getElementById('change-password-form').reset();
            
            // Close modal after 2 seconds
            setTimeout(() => {
                closeChangePasswordModal();
            }, 2000);
        } else {
            messageDiv.textContent = data.error || 'Failed to change password';
            messageDiv.style.background = '#ffe6e6';
            messageDiv.style.color = '#dc3545';
            messageDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error changing password:', error);
        const errorMessage = error.message && error.message.includes('HTTP error') 
            ? 'Network error. Please check your connection and try again.' 
            : 'An error occurred. Please try again.';
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

function pauseAccount() {
    if (!confirm('Are you sure you want to pause your account? You will be hidden from search results and matches.')) {
        return;
    }
    
    // TODO: Implement pause account API
    alert('Account pause functionality will be implemented soon');
}

async function loadCurrentPlan() {
    try {
        // Cookie-based auth - cookies sent automatically
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
            
            // Map plan types to display names
            const planMap = {
                'free': { name: 'Free Plan', badge: 'FREE', desc: 'Basic features included', color: '#6c757d' },
                'basic': { name: 'Premium Basic', badge: 'BASIC', desc: 'Enhanced dating experience', color: '#007bff' },
                'premium': { name: 'Premium Plus', badge: 'PREMIUM', desc: 'Maximum matching power', color: '#28a745' },
                'vip': { name: 'VIP Elite', badge: 'VIP', desc: 'Ultimate dating experience', color: '#ffc107' }
            };
            
            const planType = subscription.plan || 'free';
            const planInfo = planMap[planType] || planMap.free;
            
            planName.textContent = planInfo.name;
            planBadge.textContent = planInfo.badge;
            planBadge.style.background = planType === 'free' ? 'rgba(255, 255, 255, 0.2)' : `rgba(255, 255, 255, 0.3)`;
            planDesc.textContent = planInfo.desc;
            
            // Show expiry if subscription has an end date
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
            // Default to free plan if no subscription found
            document.getElementById('current-plan-name-display').textContent = 'Free Plan';
            document.getElementById('current-plan-badge-display').textContent = 'FREE';
            document.getElementById('current-plan-description-display').textContent = 'Basic features included';
        }
    } catch (error) {
        console.error('Error loading current plan:', error);
        // Default to free plan on error
        const planNameElement = document.getElementById('current-plan-name-display');
        const planBadgeElement = document.getElementById('current-plan-badge-display');
        const planDescElement = document.getElementById('current-plan-description-display');
        
        if (planNameElement) planNameElement.textContent = 'Free Plan';
        if (planBadgeElement) planBadgeElement.textContent = 'FREE';
        if (planDescElement) planDescElement.textContent = 'Basic features included';
        
        // Log error but don't show to user - defaulting to free plan is acceptable
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
        
        if (!accountData.success || !accountData.userId) {
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
                userId: accountData.userId
            })
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
            const errorMessage = error.message && error.message.includes('HTTP error') 
                ? 'Network error. Please check your connection and try again.' 
                : 'Failed to verify code. Please try again.';
            messageDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${errorMessage}`;
        }
        
        // Re-enable button
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = originalBtnContent;
        verifyBtn.style.opacity = '1';
        verifyBtn.style.cursor = 'pointer';
    }
}



