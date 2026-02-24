/**
 * Standalone Online Status Check Module for Totilove
 * Provides functions to check other users' online status without requiring full WebSocket/heartbeat setup
 * 
 * Usage:
 * - Include this file only on pages that need to check other users' status
 * - Use: OnlineCheck.isUserOnline(userId), OnlineCheck.updateUserStatus(element, userId)
 * 
 * Features:
 * - Request batching to prevent rate limiting (429 errors)
 * - Automatic retry with exponential backoff
 * - Bulk status checking for multiple users
 */

// Wrap in IIFE to prevent global variable conflicts
(function() {
    'use strict';

    // Prevent double initialization
    if (window.OnlineCheck) {
        return;
    }

    // --- WebSocket Setup ---
    // Assumes socket.io client is loaded globally as io
    const socket = window.io ? window.io() : null;
    const statusCache = new Map();
    const CACHE_DURATION = 30010; // 30 seconds

    // Listen for userOnline/userOffline events from server
    if (socket) {
        socket.on('userOnline', data => {
            if (data && data.userId) {
                statusCache.set(String(data.userId), {
                    isOnline: true,
                    lastSeen: null,
                    timestamp: Date.now()
                });
            }
        });
        socket.on('userOffline', data => {
            if (data && data.userId) {
                statusCache.set(String(data.userId), {
                    isOnline: false,
                    lastSeen: data.timestamp || Date.now(),
                    timestamp: Date.now()
                });
            }
        });
        socket.on('user_status_change', event => {
            if (event && event.userId) {
                statusCache.set(String(event.userId), {
                    isOnline: event.isOnline,
                    lastSeen: event.timestamp || Date.now(),
                    timestamp: Date.now()
                });
            }
        });
    }

    // --- Disable HTTP polling: Remove processRequestQueue and related batching logic ---

    // --- Disable queueUserStatusRequest: No longer needed with WebSockets ---

    // --- Disable retryRequest: No longer needed with WebSockets ---

    /**
     * Check if a user is online (WebSocket version).
     * @param {string|number} userId - User ID to check
     * @returns {Promise<boolean>} - True if user is online, false otherwise
     */
    async function isUserOnline(userId) {
        // Check cache first
        const cached = statusCache.get(String(userId));
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.isOnline;
        }
        // If not in cache, assume offline (or optionally, request from server via WebSocket)
        return false;
    }

    /**
     * Get last seen timestamp for a user (WebSocket version).
     * @param {string|number} userId - User ID to check
     * @returns {Promise<Date|null>} - Last seen timestamp or null if not available
     */
    async function getUserLastSeen(userId) {
        // Check cache first
        const cached = statusCache.get(String(userId));
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.lastSeen ? new Date(cached.lastSeen) : null;
        }
        return null;
    }

    /**
 * Format a Date as 'X ago' or date string.
 * @param {Date|null} date - Date to format
 * @returns {string} - Formatted time string
 */
    function formatLastSeen(date) {
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

    /**
 * Update a DOM element with online/offline/last seen status.
 * @param {string|HTMLElement} target - Element ID or DOM element to update
 * @param {string|number} userId - User ID to check
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.showLastSeen] - If true, show last seen if offline
 * @param {string} [options.onlineText] - Custom text for online status
 * @param {string} [options.offlineText] - Custom text for offline status
 */
    async function updateUserStatus(target, userId, options = {}) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el || !userId) {
        console.warn('Invalid target element or userId for updateUserStatus');
        return;
    }
    
    // Check if this is a dot-only indicator element (don't modify innerHTML for these)
    if (el.classList.contains('online-dot') || el.classList.contains('online-dot-results')) {
        // For dot elements, only update visibility
        try {
            const online = await isUserOnline(userId);
            el.style.display = online ? 'block' : 'none';
            // Ensure dot styling is preserved
            if (online && !el.style.width) {
                el.style.width = '12px';
                el.style.height = '12px';
                el.style.borderRadius = '50%';
                el.style.background = '#00b894';
            }
        } catch (error) {
            console.warn(`Failed to update dot status for user ${userId}:`, error);
        }
        return;
    }
    
    // Special handling for chat header status (should never show "●Online", only green dot on avatar)
    const isChatHeaderStatus = el.id === 'chatStatus';
    
    try {
        const online = await isUserOnline(userId);
        
        if (online) {
            // ALWAYS hide chatStatus when online - green dot on avatar shows status instead
            if (isChatHeaderStatus) {
                el.style.display = 'none';
                el.textContent = '';
                el.innerHTML = '';
                el.className = el.className.replace(/\b(online|offline|unknown)\b/g, '') + ' offline';
                return; // Exit early - never show "●Online" in chat header
            }
            
            const text = options.onlineText;
            // If onlineText is explicitly empty string, hide the element
            if (text === '') {
                el.style.display = 'none';
                el.textContent = '';
                el.innerHTML = '';
                el.className = el.className.replace(/\b(online|offline|unknown)\b/g, '') + ' offline';
            } else {
                const displayText = text || 'Online';
                el.innerHTML = `<span style="color: #27ae60; font-size:1.2em; vertical-align:middle;">●</span> ${displayText}`;
                el.className = el.className.replace(/\b(offline|unknown)\b/g, '') + ' online';
            }
        } else if (options.showLastSeen) {
            const lastSeen = await getUserLastSeen(userId);
            const formattedTime = formatLastSeen(lastSeen);
            // Remove bullet point and show clean "Last seen X time ago" format
            el.textContent = `Last seen ${formattedTime}`;
            el.className = el.className.replace(/\b(online|unknown)\b/g, '') + ' offline';
        } else {
            const text = options.offlineText || 'Offline';
            el.textContent = text;
            el.className = el.className.replace(/\b(online|unknown)\b/g, '') + ' offline';
        }
    } catch (error) {
        console.warn(`Failed to update status for user ${userId}:`, error);
        el.textContent = 'Unknown';
        el.className = el.className.replace(/\b(online|offline)\b/g, '') + ' unknown';
    }
}

    /**
 * Update a DOM element with status data (helper function for bulk updates)
 * @param {string|HTMLElement} target - Element ID or DOM element to update
 * @param {string|number} userId - User ID
 * @param {Object} statusData - Status data object
 * @param {Object} options - Optional settings
 */
    function updateUserStatusElement(target, userId, statusData, options = {}) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) {
        console.warn('Invalid target element for updateUserStatusElement');
        return;
    }
    
    // Special handling for chat header status (should never show "●Online", only green dot on avatar)
    const isChatHeaderStatus = el.id === 'chatStatus';
    
    const online = statusData.isOnline;
    
    if (online) {
        // ALWAYS hide chatStatus when online - green dot on avatar shows status instead
        if (isChatHeaderStatus) {
            el.style.display = 'none';
            el.textContent = '';
            el.innerHTML = '';
            el.className = el.className.replace(/\b(online|offline|unknown)\b/g, '') + ' offline';
            return; // Exit early - never show "●Online" in chat header
        }
        
        const text = options.onlineText;
        // If onlineText is explicitly empty string, hide the element
        if (text === '') {
            el.style.display = 'none';
            el.textContent = '';
            el.innerHTML = '';
            el.className = el.className.replace(/\b(online|offline|unknown)\b/g, '') + ' offline';
        } else {
            const displayText = text || 'Online';
            el.innerHTML = `<span style="color: #27ae60; font-size:1.2em; vertical-align:middle;">●</span> ${displayText}`;
            el.className = el.className.replace(/\b(offline|unknown)\b/g, '') + ' online';
        }
        } else if (options.showLastSeen) {
            const lastSeen = statusData.lastSeen ? new Date(statusData.lastSeen) : null;
            const formattedTime = formatLastSeen(lastSeen);
            // Remove bullet point and show clean "Last seen X time ago" format (consistent with updateUserStatus)
            el.textContent = `Last seen ${formattedTime}`;
            el.className = el.className.replace(/\b(online|unknown)\b/g, '') + ' offline';
        } else {
            const text = options.offlineText || 'Offline';
            el.textContent = text;
            el.className = el.className.replace(/\b(online|unknown)\b/g, '') + ' offline';
        }
}

    /**
 * Update multiple user status elements at once using bulk requests.
 * @param {Array} updates - Array of {target, userId, options} objects
 */
    async function updateMultipleUserStatuses(updates) {
    if (updates.length === 0) return;
    
    try {
        // Collect all unique user IDs
        const userIds = [...new Set(updates.map(update => String(update.userId)))];
        
        // Get all statuses in one bulk request
        const response = await fetch('/api/users-online-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userIds })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        if (!data.success || !data.statuses) {
            throw new Error(data.error || 'Failed to get user statuses');
        }
        
        // Update cache with all results
        Object.values(data.statuses).forEach(status => {
            statusCache.set(String(status.userId), {
                isOnline: status.isOnline,
                lastSeen: status.lastSeen,
                timestamp: Date.now()
            });
        });
        
        // Update all DOM elements
        updates.forEach(update => {
            const status = data.statuses[String(update.userId)] || {
                userId: update.userId,
                isOnline: false,
                lastSeen: null
            };
            
            updateUserStatusElement(update.target, update.userId, status, update.options);
        });
        
    } catch (error) {
        console.warn('Bulk status update failed, falling back to individual updates:', error);
        // Fallback to individual updates
        const promises = updates.map(update => 
            updateUserStatus(update.target, update.userId, update.options)
        );
        await Promise.all(promises);
    }
}

    /**
 * Get comprehensive user status information.
 * @param {string|number} userId - User ID to check
 * @returns {Promise<Object>} - Status object with isOnline, lastSeen, formattedLastSeen
 */
    async function getUserStatusInfo(userId) {
    try {
        // Check cache first
        const cached = statusCache.get(String(userId));
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return {
                userId: userId,
                isOnline: cached.isOnline,
                lastSeen: cached.lastSeen ? new Date(cached.lastSeen) : null,
                formattedLastSeen: formatLastSeen(cached.lastSeen ? new Date(cached.lastSeen) : null)
            };
        }
        
        // Use batching system to avoid rate limiting
        const statusData = await retryRequest(() => queueUserStatusRequest(userId));
        
        // Cache the result
        statusCache.set(String(userId), {
            isOnline: statusData.isOnline,
            lastSeen: statusData.lastSeen,
            timestamp: Date.now()
        });
        
        const lastSeen = statusData.lastSeen ? new Date(statusData.lastSeen) : null;
        
        return {
            userId: userId,
            isOnline: statusData.isOnline,
            lastSeen: lastSeen,
            formattedLastSeen: formatLastSeen(lastSeen)
        };
    } catch (error) {
        console.warn(`Failed to get status info for user ${userId}:`, error);
        return {
            userId: userId,
            isOnline: false,
            lastSeen: null,
            formattedLastSeen: 'unknown'
        };
    }
}

    /**
 * Clear the status cache (useful for testing or manual refresh)
 */
    function clearStatusCache() {
    statusCache.clear();
}

    /**
 * Get cache statistics for debugging
 * @returns {Object} - Cache statistics
 */
    function getCacheStats() {
    const now = Date.now();
    const entries = Array.from(statusCache.values());
    const validEntries = entries.filter(entry => now - entry.timestamp < CACHE_DURATION);
    
    return {
        totalEntries: statusCache.size,
        validEntries: validEntries.length,
        expiredEntries: entries.length - validEntries.length,
        cacheDuration: CACHE_DURATION
    };
}

    // Export as global object for use in any page
    window.OnlineCheck = {
        isUserOnline,
        getUserLastSeen,
        formatLastSeen,
        updateUserStatus,
        updateMultipleUserStatuses,
        getUserStatusInfo,
        clearStatusCache,
        getCacheStats
    };

})(); // End IIFE
