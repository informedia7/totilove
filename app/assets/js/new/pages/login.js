/**
 * Login Page JavaScript
 * Extracted from login.html - Phase 1 CSS/JS Extraction
 */

function togglePasswordVisibility(inputId, eyeId) {
    const passwordInput = document.getElementById(inputId);
    const passwordEye = document.getElementById(eyeId);

    if (!passwordInput || !passwordEye) return;

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        passwordEye.className = 'fas fa-eye-slash';
    } else {
        passwordInput.type = 'password';
        passwordEye.className = 'fas fa-eye';
    }
}

const passwordToggleBtn = document.getElementById('password-toggle-btn');
if (passwordToggleBtn) {
    passwordToggleBtn.addEventListener('click', function (event) {
        event.preventDefault();
        togglePasswordVisibility('password', 'password-eye');
    });
}

function resolvePostLoginRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source');
    const returnPath = urlParams.get('return');

    if (source === 'contact') {
        return '/help';
    }

    if (returnPath) {
        return decodeURIComponent(returnPath);
    }

    return '/activity';
}

// Handle form submission
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    const loading = document.getElementById('loading');
    
    // Reset error messages
    document.querySelectorAll('.error-message').forEach(el => el.style.display = 'none');
    document.querySelectorAll('input').forEach(el => el.classList.remove('error'));
    
    // Show loading state
    loginBtn.disabled = true;
    loading.style.display = 'block';
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });

        const raw = await response.text();
        let data = {};
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            data = { success: false, error: 'Login failed' };
        }

        if (data.success) {
            // Store user info only (cookie handles auth automatically)
            if (data.user) {
                window.currentUser = data.user;
                if (window.sessionManager?.setCurrentUser) {
                    window.sessionManager.setCurrentUser(data.user);
                }
                if (window.globalNavbar?.setAuthState) {
                    window.globalNavbar.setAuthState(data.user, true);
                }
            }
            
            // Honor the incoming redirect context after cookie-based login succeeds.
            window.location.href = resolvePostLoginRedirect();
        } else if (data.suspended) {
            window.location.href = '/suspended';
        } else {
            // Show error message
            if (data.error) {
                showNotification(data.error, 'error');
            } else {
                showNotification('Login failed. Please try again.', 'error');
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('An error occurred during login. Please try again.', 'error');
    } finally {
        // Hide loading state
        loginBtn.disabled = false;
        loading.style.display = 'none';
    }
});

// Real-time validation
document.getElementById('email').addEventListener('blur', function() {
    const email = this.value;
    const errorEl = document.getElementById('emailError');
    
    if (email && !isValidEmail(email)) {
        errorEl.textContent = 'Please enter a valid email address';
        errorEl.style.display = 'block';
        this.classList.add('error');
    } else {
        errorEl.style.display = 'none';
        this.classList.remove('error');
    }
});

document.getElementById('password').addEventListener('blur', function() {
    const password = this.value;
    const errorEl = document.getElementById('passwordError');
    
    if (password && password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters long';
        errorEl.style.display = 'block';
        this.classList.add('error');
    } else {
        errorEl.style.display = 'none';
        this.classList.remove('error');
    }
});

function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    if (trimmed.length === 0 || trimmed.length > 50) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
}

// Show notification function (common pattern used across app pages)
function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#00b894' : type === 'error' ? '#e74c3c' : '#667eea'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        max-width: 300px;
        animation: slideInRight 0.3s ease-out;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    `;
    
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

// Check for error in URL query string and show notification
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const message = urlParams.get('message');
    
    if (error) {
        showNotification(error, 'error');
    }

    if (message) {
        showNotification(message, 'info');
    }

    if (error || message) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('error');
        newUrl.searchParams.delete('message');
        window.history.replaceState({}, document.title, newUrl.pathname + newUrl.search);
    }
});








































