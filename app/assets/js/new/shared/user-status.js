// Universal User Status Utility for Totilove
// Provides instant online/offline status for any user on any page
// 
// NOTE: This file now uses the standalone OnlineCheck module for core functionality
// The OnlineCheck module should be included before this file for full functionality

/**
 * Fetches online status for a user and updates the given DOM element.
 * @param {string|HTMLElement} target - Element ID or DOM element to update
 * @param {string|number} userId - User ID to check
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.showLastSeen] - If true, show last seen if offline
 */
async function updateUserStatus(target, userId, options = {}) {
    // Use the standalone OnlineCheck module if available
    if (window.OnlineCheck && window.OnlineCheck.updateUserStatus) {
        return window.OnlineCheck.updateUserStatus(target, userId, options);
    }
    
    // Fallback implementation if OnlineCheck is not loaded
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el || !userId) return;
    
    try {
        const res = await fetch(`/api/user-status/${userId}`);
        const data = await res.json();
        if (data.isOnline) {
            el.textContent = 'Online';
        } else if (options.showLastSeen) {
            const lastSeen = await getUserLastSeen(userId);
            el.textContent = 'Last seen ' + formatLastSeen(lastSeen);
        } else {
            el.textContent = 'Offline';
        }
    } catch (e) {
        el.textContent = 'Unknown';
    }
}

/**
 * Fetches last seen timestamp for a user.
 * @param {string|number} userId
 * @returns {Promise<Date|null>}
 */
async function getUserLastSeen(userId) {
    // Use the standalone OnlineCheck module if available
    if (window.OnlineCheck && window.OnlineCheck.getUserLastSeen) {
        return window.OnlineCheck.getUserLastSeen(userId);
    }
    
    // Fallback implementation
    try {
        const res = await fetch(`/api/user-lastseen/${userId}`);
        const data = await res.json();
        return data.lastSeen ? new Date(data.lastSeen) : null;
    } catch {
        return null;
    }
}

/**
 * Formats a Date as 'X ago' or date string.
 * @param {Date|null} date
 * @returns {string}
 */
function formatLastSeen(date) {
    // Use the standalone OnlineCheck module if available
    if (window.OnlineCheck && window.OnlineCheck.formatLastSeen) {
        return window.OnlineCheck.formatLastSeen(date);
    }
    
    // Fallback implementation
    if (!date) return 'unknown';
    const now = Date.now();
    const diff = now - date.getTime();
    if (diff < 10000) return 'just now';
    if (diff < 60000) return Math.floor(diff/1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
    if (diff < 2592000000) {
        const weeks = Math.floor(diff/604800000);
        return weeks + ' week' + (weeks > 1 ? 's' : '') + ' ago';
    }
    if (diff < 31536000000) {
        const months = Math.max(1, Math.floor(diff/2592000000));
        return months + ' month' + (months > 1 ? 's' : '') + ' ago';
    }
    const years = Math.floor(diff/31536000000);
    return years + ' year' + (years > 1 ? 's' : '') + ' ago';
}

// Global access - provides backward compatibility
window.UserStatus = {
    updateUserStatus,
    getUserLastSeen,
    formatLastSeen
};

/**
 * Example usage:
 *   UserStatus.updateUserStatus('status-text', 67, {showLastSeen:true});
 *   // or
 *   UserStatus.updateUserStatus(document.getElementById('status-text'), 67);
 * 
 * For new implementations, consider using the standalone OnlineCheck module:
 *   <script src="/js/online-check.js"></script>
 *   <script>
 *     OnlineCheck.updateUserStatus('status-text', 67, {showLastSeen:true});
 *   </script>
 */ 