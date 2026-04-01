// Admin Configuration JavaScript

// Load settings on page load
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupFormHandler();
});

// Load settings from API
async function loadSettings() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load settings');
        }

        const settings = data.settings;

        // Populate all form fields
        for (const [key, config] of Object.entries(settings)) {
            const element = document.getElementById(key);
            if (!element) continue;

            const value = config.value !== undefined ? config.value : config;

            if (element.type === 'checkbox') {
                element.checked = value === true || value === 'true';
            } else if (element.type === 'password') {
                // Don't populate password fields for security
                element.value = '';
            } else if (element.tagName === 'TEXTAREA' && typeof value === 'object') {
                element.value = JSON.stringify(value, null, 2);
            } else {
                element.value = value;
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatus('Error loading settings: ' + error.message, 'error');
    }
}

// Setup form submission handler
function setupFormHandler() {
    document.getElementById('configForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(e.target);
        const settings = {};

        // Collect all form values
        for (const [key, value] of formData.entries()) {
            const element = document.getElementById(key);
            if (!element) continue;

            let settingValue = value;
            let settingType = 'string';

            // Determine type and parse value
            if (element.type === 'checkbox') {
                settingValue = element.checked;
                settingType = 'boolean';
            } else if (element.type === 'number') {
                settingValue = value ? parseFloat(value) : 0;
                settingType = 'number';
            } else if (element.tagName === 'TEXTAREA' && element.classList.contains('json-input')) {
                // Parse JSON input
                try {
                    settingValue = JSON.parse(value || '[]');
                    settingType = 'json';
                } catch (e) {
                    showStatus(`Invalid JSON in ${key}: ${e.message}`, 'error');
                    return;
                }
            } else if (element.type === 'password' && value) {
                // Only include password if it was changed
                settingValue = value;
                settingType = 'string';
            } else if (element.type === 'password' && !value) {
                // Skip unchanged password fields
                continue;
            }

            settings[key] = {
                value: settingValue,
                type: settingType
            };
        }

        try {
            const response = await fetch('/api/config', {
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

    // Scroll to status message
    statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}




















































