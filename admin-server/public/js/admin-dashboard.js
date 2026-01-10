// Admin Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const togglePasswordChange = document.getElementById('toggle-password-change');
    const passwordChangeSection = document.getElementById('password-change-section');
    const cancelPasswordChange = document.getElementById('cancel-password-change');
    const passwordChangeForm = document.getElementById('password-change-form');
    const passwordMessage = document.getElementById('password-message');

    // Toggle password change section
    if (togglePasswordChange) {
        togglePasswordChange.addEventListener('click', function() {
            passwordChangeSection.style.display = passwordChangeSection.style.display === 'none' ? 'block' : 'none';
            if (passwordChangeSection.style.display === 'block') {
                passwordChangeSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    // Cancel password change
    if (cancelPasswordChange) {
        cancelPasswordChange.addEventListener('click', function() {
            passwordChangeSection.style.display = 'none';
            passwordChangeForm.reset();
            passwordMessage.style.display = 'none';
        });
    }

    // Handle password change form submission
    if (passwordChangeForm) {
        passwordChangeForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            // Clear previous messages
            passwordMessage.style.display = 'none';
            passwordMessage.className = '';

            // Validation
            if (!currentPassword || !newPassword || !confirmPassword) {
                showMessage('Please fill in all fields', 'error');
                return;
            }

            if (newPassword.length < 8) {
                showMessage('New password must be at least 8 characters long', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                showMessage('New passwords do not match', 'error');
                return;
            }

            if (currentPassword === newPassword) {
                showMessage('New password must be different from current password', 'error');
                return;
            }

            // Disable submit button
            const submitBtn = document.getElementById('change-password-btn');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Changing...';

            try {
                const response = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        currentPassword,
                        newPassword
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    showMessage('Password changed successfully!', 'success');
                    passwordChangeForm.reset();
                    setTimeout(() => {
                        passwordChangeSection.style.display = 'none';
                        passwordMessage.style.display = 'none';
                    }, 2000);
                } else {
                    showMessage(data.error || 'Failed to change password', 'error');
                }
            } catch (error) {
                showMessage('An error occurred. Please try again.', 'error');
                console.error('Password change error:', error);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    function showMessage(message, type) {
        passwordMessage.textContent = message;
        passwordMessage.className = type === 'success' ? 'message-success' : 'message-error';
        passwordMessage.style.display = 'block';
    }
});



























