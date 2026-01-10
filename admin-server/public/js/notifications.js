/**
 * Notification/Toast System for Admin Panel
 * Replaces alert() calls with in-page notifications
 */

// Create notification container if it doesn't exist
function ensureNotificationContainer() {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Show a notification/toast message
 * @param {string} message - The message to display
 * @param {string} type - Type of notification: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds (default: 5000, 0 = no auto-close)
 */
function showNotification(message, type = 'info', duration = 5000) {
    const container = ensureNotificationContainer();
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Set icon based on type
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    
    // Create icon
    const icon = document.createElement('div');
    icon.className = 'notification-icon';
    icon.textContent = icons[type] || icons.info;
    
    // Create content
    const content = document.createElement('div');
    content.className = 'notification-content';
    
    // Split message into title and body if it contains newlines
    const parts = message.split('\n');
    const title = parts[0];
    const body = parts.slice(1).join('\n');
    
    if (body) {
        const titleEl = document.createElement('div');
        titleEl.className = 'notification-title';
        titleEl.textContent = title;
        content.appendChild(titleEl);
        
        const messageEl = document.createElement('div');
        messageEl.className = 'notification-message';
        messageEl.textContent = body;
        content.appendChild(messageEl);
    } else {
        const messageEl = document.createElement('div');
        messageEl.className = 'notification-message';
        messageEl.textContent = message;
        content.appendChild(messageEl);
    }
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.onclick = () => removeNotification(notification);
    
    // Assemble notification
    notification.appendChild(icon);
    notification.appendChild(content);
    notification.appendChild(closeBtn);
    
    // Add to container
    container.appendChild(notification);
    
    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeNotification(notification);
        }, duration);
    }
    
    return notification;
}

/**
 * Remove a notification
 */
function removeNotification(notification) {
    if (notification && notification.parentNode) {
        notification.classList.add('hiding');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
}

/**
 * Convenience functions for different notification types
 */
function showSuccess(message, duration = 5000) {
    return showNotification(message, 'success', duration);
}

function showError(message, duration = 7000) {
    return showNotification(message, 'error', duration);
}

function showWarning(message, duration = 6000) {
    return showNotification(message, 'warning', duration);
}

function showInfo(message, duration = 5000) {
    return showNotification(message, 'info', duration);
}

/**
 * In-Page Confirmation Modal System
 * Replaces confirm() calls with in-page modals
 */

/**
 * Show a confirmation modal
 * @param {string} message - The confirmation message
 * @param {string} title - Optional title (default: 'Confirm Action')
 * @param {string} confirmText - Text for confirm button (default: 'Confirm')
 * @param {string} cancelText - Text for cancel button (default: 'Cancel')
 * @param {string} type - Type: 'danger', 'warning', 'info' (default: 'warning')
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
function showConfirm(message, title = 'Confirm Action', confirmText = 'Confirm', cancelText = 'Cancel', type = 'warning') {
    return new Promise((resolve) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.2s ease-out;
        `;

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.style.cssText = `
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            animation: slideUp 0.3s ease-out;
        `;

        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 20px 24px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.cssText = `
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #333;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 24px;
            color: #999;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.background = '#f0f0f0';
        closeBtn.onmouseout = () => closeBtn.style.background = 'none';
        closeBtn.onclick = () => {
            removeConfirmModal(overlay);
            resolve(false);
        };

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        // Create body
        const body = document.createElement('div');
        body.style.cssText = `
            padding: 24px;
        `;

        const messageEl = document.createElement('div');
        messageEl.textContent = message;
        messageEl.style.cssText = `
            color: #666;
            line-height: 1.6;
            white-space: pre-line;
            font-size: 14px;
        `;

        body.appendChild(messageEl);

        // Create footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 16px 24px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = cancelText;
        cancelBtn.style.cssText = `
            padding: 10px 20px;
            border: 1px solid #ddd;
            background: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            color: #333;
            transition: all 0.2s;
        `;
        cancelBtn.onmouseover = () => {
            cancelBtn.style.background = '#f5f5f5';
            cancelBtn.style.borderColor = '#ccc';
        };
        cancelBtn.onmouseout = () => {
            cancelBtn.style.background = 'white';
            cancelBtn.style.borderColor = '#ddd';
        };
        cancelBtn.onclick = () => {
            removeConfirmModal(overlay);
            resolve(false);
        };

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = confirmText;
        const typeColors = {
            danger: { bg: '#dc3545', hover: '#c82333' },
            warning: { bg: '#ffc107', hover: '#e0a800' },
            info: { bg: '#17a2b8', hover: '#138496' }
        };
        const colors = typeColors[type] || typeColors.warning;
        confirmBtn.style.cssText = `
            padding: 10px 20px;
            border: none;
            background: ${colors.bg};
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
        `;
        confirmBtn.onmouseover = () => confirmBtn.style.background = colors.hover;
        confirmBtn.onmouseout = () => confirmBtn.style.background = colors.bg;
        confirmBtn.onclick = () => {
            removeConfirmModal(overlay);
            resolve(true);
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);

        // Assemble modal
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        // Add to page
        document.body.appendChild(overlay);

        // Close on overlay click (but not modal click)
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                removeConfirmModal(overlay);
                resolve(false);
            }
        };

        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                removeConfirmModal(overlay);
                document.removeEventListener('keydown', escapeHandler);
                resolve(false);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    });
}

/**
 * Remove confirmation modal
 */
function removeConfirmModal(overlay) {
    if (overlay && overlay.parentNode) {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 200);
    }
}

// Add CSS animations if not already in stylesheet
if (!document.getElementById('confirm-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'confirm-modal-styles';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
        @keyframes slideUp {
            from {
                transform: translateY(20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

