// Admin Subscription Control JavaScript

// Load settings on page load
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupFormHandler();
    setupMasterModeToggle();
});

// Setup master mode toggle to show/hide subscription settings
function setupMasterModeToggle() {
    const freeModeRadio = document.getElementById('masterModeFree');
    const subscriptionModeRadio = document.getElementById('masterModeSubscription');
    const subscriptionSection = document.getElementById('subscriptionSettingsSection');

    function toggleSubscriptionSettings() {
        if (subscriptionModeRadio.checked) {
            subscriptionSection.style.display = 'block';
        } else {
            subscriptionSection.style.display = 'none';
        }
    }

    if (freeModeRadio && subscriptionModeRadio && subscriptionSection) {
        freeModeRadio.addEventListener('change', toggleSubscriptionSettings);
        subscriptionModeRadio.addEventListener('change', toggleSubscriptionSettings);
        // Initial state
        toggleSubscriptionSettings();
    }
}

// Load settings from API
async function loadSettings() {
    try {
        const response = await fetch('/api/subscription-control/settings');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load settings');
        }

        const settings = data.settings;

        // Master Control
        const masterMode = settings.subscription_master_mode || 'subscription';
        if (masterMode === 'free') {
            document.getElementById('masterModeFree').checked = true;
        } else {
            document.getElementById('masterModeSubscription').checked = true;
        }
        // Trigger toggle to show/hide subscription settings
        setupMasterModeToggle();

        // Free Join Settings
        document.getElementById('freeJoinAll').checked = settings.subscription_free_join_all || false;
        document.getElementById('freeJoinGender').value = settings.subscription_free_join_gender || '';
        document.getElementById('newUsersFreePeriod').value = settings.subscription_new_users_free_period_days || 0;

        // Contact Restrictions
        document.getElementById('requireSubToContact').checked = settings.subscription_require_subscription_to_contact !== false;
        document.getElementById('freeUsersCanContact').checked = settings.subscription_free_users_can_contact !== false;
        document.getElementById('freeContactsPerDay').value = settings.subscription_allowed_free_contacts_per_day || 0;

        // Message Restrictions
        document.getElementById('requireSubToMessage').checked = settings.subscription_require_subscription_to_message !== false;
        document.getElementById('freeUsersCanMessage').checked = settings.subscription_free_users_can_message !== false;
        document.getElementById('freeMessagesPerDay').value = settings.subscription_allowed_free_messages_per_day || 0;

        // Like Restrictions
        document.getElementById('requireSubToLike').checked = settings.subscription_require_subscription_to_like !== false;
        document.getElementById('freeUsersCanLike').checked = settings.subscription_free_users_can_like !== false;
        document.getElementById('freeLikesPerDay').value = settings.subscription_allowed_free_likes_per_day || 0;

        // Other Restrictions
        document.getElementById('requireSubToViewProfile').checked = settings.subscription_require_subscription_to_view_profile || false;

    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus('Error loading settings: ' + error.message, 'error');
    }
}

// Setup form submission handler
function setupFormHandler() {
    document.getElementById('subscriptionSettingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(e.target);
        const settings = {};

        // Collect all form values
        for (const [key, value] of formData.entries()) {
            if (key.startsWith('subscription_')) {
                // Handle checkboxes
                if (value === 'on') {
                    settings[key] = true;
                } else if (value === '') {
                    settings[key] = null;
                } else if (!isNaN(value) && value !== '') {
                    settings[key] = parseInt(value);
                } else {
                    settings[key] = value;
                }
            }
        }

        // Handle master mode radio button
        const masterModeRadios = document.querySelectorAll('input[name="subscription_master_mode"]');
        let masterMode = 'subscription';
        masterModeRadios.forEach(radio => {
            if (radio.checked) {
                masterMode = radio.value;
            }
        });
        settings.subscription_master_mode = masterMode;

        // Handle checkboxes that might not be in formData if unchecked
        const checkboxes = [
            'subscription_free_join_all',
            'subscription_require_subscription_to_contact',
            'subscription_free_users_can_contact',
            'subscription_require_subscription_to_message',
            'subscription_free_users_can_message',
            'subscription_require_subscription_to_like',
            'subscription_free_users_can_like',
            'subscription_require_subscription_to_view_profile'
        ];

        checkboxes.forEach(key => {
            const checkbox = document.querySelector(`[name="${key}"]`);
            if (checkbox && !settings.hasOwnProperty(key)) {
                settings[key] = checkbox.checked;
            }
        });

        // Handle number inputs
        const numberInputs = [
            'subscription_new_users_free_period_days',
            'subscription_allowed_free_contacts_per_day',
            'subscription_allowed_free_messages_per_day',
            'subscription_allowed_free_likes_per_day'
        ];

        numberInputs.forEach(key => {
            const input = document.querySelector(`[name="${key}"]`);
            if (input) {
                settings[key] = parseInt(input.value) || 0;
            }
        });

        // Handle select
        const select = document.getElementById('freeJoinGender');
        if (select) {
            settings.subscription_free_join_gender = select.value || null;
        }

        try {
            const response = await fetch('/api/subscription-control/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });

            const data = await response.json();

            if (data.success) {
                showStatus('Settings saved successfully!', 'success');
            } else {
                showStatus('Error: ' + (data.error || 'Failed to save settings'), 'error');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showStatus('Error saving settings: ' + error.message, 'error');
        }
    });
}

// Show status message
function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    
    if (type === 'success') {
        statusDiv.style.background = '#d4edda';
        statusDiv.style.color = '#155724';
        statusDiv.style.border = '1px solid #c3e6cb';
    } else {
        statusDiv.style.background = '#f8d7da';
        statusDiv.style.color = '#721c24';
        statusDiv.style.border = '1px solid #f5c6cb';
    }

    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}










