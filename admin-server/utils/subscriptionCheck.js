/**
 * Utility functions to check subscription requirements
 * Can be used by the main app server via API calls
 */

/**
 * Check if user requires subscription for an action
 * This can be called from the main app server
 */
async function checkSubscriptionRequirement(userId, action) {
    try {
        // This would typically call the admin server API
        // For now, it's a placeholder that the main app can use
        const response = await fetch(`http://localhost:3003/api/subscription-control/check/${userId}?action=${action}`, {
            headers: {
                'X-Admin-API-Key': process.env.ADMIN_API_KEY || '' // Optional API key for inter-server communication
            }
        });

        if (!response.ok) {
            return { requiresSubscription: true, dailyLimit: { allowed: false } };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error checking subscription requirement:', error);
        // Default to requiring subscription on error
        return { requiresSubscription: true, dailyLimit: { allowed: false } };
    }
}

module.exports = {
    checkSubscriptionRequirement
};




















































