const subscriptionControlService = require('../services/subscriptionControlService');
const logger = require('../utils/logger');

class SubscriptionControlController {
    /**
     * Get subscription control settings
     */
    async getSettings(req, res) {
        try {
            const settings = await subscriptionControlService.getSubscriptionSettings();
            res.json({
                success: true,
                settings
            });
        } catch (error) {
            logger.error('Error in getSettings controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch subscription settings'
            });
        }
    }

    /**
     * Update subscription control settings
     */
    async updateSettings(req, res) {
        try {
            const adminId = req.admin?.id;
            
            // Update settings with admin ID for audit
            const result = await subscriptionControlService.updateSubscriptionSettings(req.body);
            
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in updateSettings controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update subscription settings'
            });
        }
    }

    /**
     * Check if user requires subscription for action (for API use)
     */
    async checkRequirement(req, res) {
        try {
            const userId = parseInt(req.params.userId);
            const action = req.query.action || req.body.action; // 'contact', 'message', 'like', 'view_profile'

            if (!userId || !action) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID and action are required'
                });
            }

            const requires = await subscriptionControlService.requiresSubscription(userId, action);
            const dailyLimit = await subscriptionControlService.checkDailyLimit(userId, action);
            const inFreePeriod = await subscriptionControlService.isWithinFreePeriod(userId);

            res.json({
                success: true,
                requiresSubscription: requires,
                dailyLimit,
                inFreePeriod
            });
        } catch (error) {
            logger.error('Error in checkRequirement controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to check subscription requirement'
            });
        }
    }
}

module.exports = new SubscriptionControlController();




















































