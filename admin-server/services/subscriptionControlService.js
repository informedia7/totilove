const { query } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class SubscriptionControlService {
    constructor() {
        this.cacheExpiry = 600; // 10 minutes for config
    }

    /**
     * Get subscription control settings
     */
    async getSubscriptionSettings() {
        const cacheKey = 'admin:subscription_settings';

        try {
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // Get settings from admin_system_settings table
            // Note: If table doesn't exist or has no settings, return defaults
            let result;
            try {
                result = await query(
                    `SELECT setting_key, setting_value, setting_type 
                     FROM admin_system_settings 
                     WHERE setting_key LIKE 'subscription_%' OR setting_key LIKE 'free_join_%'`
                );
            } catch (error) {
                // Table might not exist, return defaults
                logger.warn('admin_system_settings table might not exist, using defaults');
                result = { rows: [] };
            }

            const settings = {};
            result.rows.forEach(row => {
                let value = row.setting_value;
                // Parse based on type
                if (row.setting_type === 'boolean') {
                    value = value === 'true' || value === true;
                } else if (row.setting_type === 'number') {
                    value = parseFloat(value);
                } else if (row.setting_type === 'json') {
                    try {
                        value = JSON.parse(value);
                    } catch (e) {
                        value = value;
                    }
                }
                settings[row.setting_key] = value;
            });

            // Default values if not set
            const defaultSettings = {
                subscription_master_mode: 'subscription', // 'free' or 'subscription'
                subscription_free_join_all: false,
                subscription_free_join_gender: null, // 'male', 'female', 'other', or null for all
                subscription_require_subscription_to_contact: true,
                subscription_require_subscription_to_message: true,
                subscription_require_subscription_to_like: true,
                subscription_require_subscription_to_view_profile: false,
                subscription_free_users_can_contact: true,
                subscription_free_users_can_message: true,
                subscription_free_users_can_like: true,
                subscription_new_users_free_period_days: 0, // 0 = no free period
                subscription_allowed_free_contacts_per_day: 0, // 0 = unlimited
                subscription_allowed_free_messages_per_day: 0, // 0 = unlimited
                subscription_allowed_free_likes_per_day: 0, // 0 = unlimited
                image_approval_enabled: false // Image approval disabled by default
            };

            // Merge defaults with database settings
            const finalSettings = { ...defaultSettings, ...settings };

            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(finalSettings), this.cacheExpiry);
            }

            return finalSettings;
        } catch (error) {
            logger.error('Error fetching subscription settings:', error);
            throw error;
        }
    }

    /**
     * Update subscription control settings
     */
    async updateSubscriptionSettings(settings) {
        try {
            const allowedKeys = [
                'subscription_master_mode',
                'subscription_free_join_all',
                'subscription_free_join_gender',
                'subscription_require_subscription_to_contact',
                'subscription_require_subscription_to_message',
                'subscription_require_subscription_to_like',
                'subscription_require_subscription_to_view_profile',
                'subscription_free_users_can_contact',
                'subscription_free_users_can_message',
                'subscription_free_users_can_like',
                'subscription_new_users_free_period_days',
                'subscription_allowed_free_contacts_per_day',
                'subscription_allowed_free_messages_per_day',
                'subscription_allowed_free_likes_per_day',
                'image_approval_enabled'
            ];

            // Update or insert each setting
            for (const [key, value] of Object.entries(settings)) {
                if (!allowedKeys.includes(key)) {
                    continue; // Skip invalid keys
                }

                let settingValue = value;
                let settingType = 'string';

                // Determine type
                if (typeof value === 'boolean') {
                    settingType = 'boolean';
                    settingValue = value.toString();
                } else if (typeof value === 'number') {
                    settingType = 'number';
                    settingValue = value.toString();
                } else if (typeof value === 'object') {
                    settingType = 'json';
                    settingValue = JSON.stringify(value);
                }

                // Check if table exists and has unique constraint on setting_key
                // If not, we'll need to handle it differently
                try {
                    // Try upsert with ON CONFLICT
                    await query(
                        `INSERT INTO admin_system_settings (setting_key, setting_value, setting_type, updated_at, updated_by)
                         VALUES ($1, $2, $3, NOW(), $4)
                         ON CONFLICT (setting_key) 
                         DO UPDATE SET 
                             setting_value = EXCLUDED.setting_value,
                             setting_type = EXCLUDED.setting_type,
                             updated_at = NOW(),
                             updated_by = EXCLUDED.updated_by`,
                        [key, settingValue, settingType, null]
                    );
                } catch (error) {
                    // If ON CONFLICT fails, try UPDATE then INSERT
                    const updateResult = await query(
                        `UPDATE admin_system_settings 
                         SET setting_value = $1, setting_type = $2, updated_at = NOW(), updated_by = $3
                         WHERE setting_key = $4`,
                        [settingValue, settingType, null, key]
                    );

                    if (updateResult.rowCount === 0) {
                        await query(
                            `INSERT INTO admin_system_settings (setting_key, setting_value, setting_type, updated_at, updated_by)
                             VALUES ($1, $2, $3, NOW(), $4)`,
                            [key, settingValue, settingType, null]
                        );
                    }
                }
            }

            // Clear cache
            if (redis.enabled) {
                await redis.del('admin:subscription_settings');
            }

            return {
                success: true,
                message: 'Subscription settings updated successfully'
            };
        } catch (error) {
            logger.error('Error updating subscription settings:', error);
            throw error;
        }
    }

    /**
     * Check if user can join for free
     */
    async canUserJoinFree(userGender = null) {
        try {
            const settings = await this.getSubscriptionSettings();

            // MASTER CONTROL: If mode is 'free', everyone can join free
            if (settings.subscription_master_mode === 'free') {
                return true;
            }

            // If all users can join free
            if (settings.subscription_free_join_all) {
                return true;
            }

            // If specific gender can join free
            if (settings.subscription_free_join_gender && userGender) {
                return settings.subscription_free_join_gender.toLowerCase() === userGender.toLowerCase();
            }

            return false;
        } catch (error) {
            logger.error('Error checking free join:', error);
            return false;
        }
    }

    /**
     * Check if user needs subscription to perform action
     */
    async requiresSubscription(userId, action) {
        try {
            const settings = await this.getSubscriptionSettings();
            
            // Check if user has active subscription
            const subscriptionResult = await query(
                `SELECT id FROM subscriptions 
                 WHERE user_id = $1 
                 AND (end_date IS NULL OR end_date > NOW())
                 AND payment_status = 'paid'`,
                [userId]
            );

            const hasActiveSubscription = subscriptionResult.rows.length > 0;

            // If user has active subscription, they can do everything
            if (hasActiveSubscription) {
                return false;
            }

            // Check if user is in free join category
            const userResult = await query('SELECT gender FROM users WHERE id = $1', [userId]);
            const userGender = userResult.rows[0]?.gender;
            const canJoinFree = await this.canUserJoinFree(userGender);

            // If user is in free category and free users can perform action
            if (canJoinFree) {
                switch (action) {
                    case 'contact':
                        return !settings.subscription_free_users_can_contact;
                    case 'message':
                        return !settings.subscription_free_users_can_message;
                    case 'like':
                        return !settings.subscription_free_users_can_like;
                    default:
                        return true;
                }
            }

            // Check if action requires subscription
            switch (action) {
                case 'contact':
                    return settings.subscription_require_subscription_to_contact;
                case 'message':
                    return settings.subscription_require_subscription_to_message;
                case 'like':
                    return settings.subscription_require_subscription_to_like;
                case 'view_profile':
                    return settings.subscription_require_subscription_to_view_profile;
                default:
                    return true;
            }
        } catch (error) {
            logger.error('Error checking subscription requirement:', error);
            return true; // Default to requiring subscription on error
        }
    }

    /**
     * Check if user is within free period (new users)
     */
    async isWithinFreePeriod(userId) {
        try {
            const settings = await this.getSubscriptionSettings();
            const freePeriodDays = settings.subscription_new_users_free_period_days || 0;

            if (freePeriodDays === 0) {
                return false;
            }

            const userResult = await query(
                'SELECT date_joined FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return false;
            }

            const dateJoined = new Date(userResult.rows[0].date_joined);
            const now = new Date();
            const daysSinceJoin = Math.floor((now - dateJoined) / (1000 * 60 * 60 * 24));

            return daysSinceJoin <= freePeriodDays;
        } catch (error) {
            logger.error('Error checking free period:', error);
            return false;
        }
    }

    /**
     * Check daily limits for free users
     */
    async checkDailyLimit(userId, action) {
        try {
            const settings = await this.getSubscriptionSettings();
            
            // MASTER CONTROL: If mode is 'free', no limits at all
            if (settings.subscription_master_mode === 'free') {
                return { allowed: true, remaining: -1, limit: -1, used: 0 }; // Unlimited in free mode
            }

            const today = new Date().toISOString().split('T')[0];

            // Check if user has active subscription
            const subscriptionResult = await query(
                `SELECT id FROM subscriptions 
                 WHERE user_id = $1 
                 AND (end_date IS NULL OR end_date > NOW())
                 AND payment_status = 'paid'`,
                [userId]
            );

            if (subscriptionResult.rows.length > 0) {
                return { allowed: true, remaining: -1, limit: -1, used: 0 }; // Unlimited for subscribers
            }

            let limitKey;
            let countQuery;

            switch (action) {
                case 'contact':
                    limitKey = 'subscription_allowed_free_contacts_per_day';
                    countQuery = `
                        SELECT COUNT(*) as count 
                        FROM user_activity 
                        WHERE user_id = $1 
                        AND activity_type = 'contact' 
                        AND created_at::date = $2
                    `;
                    break;
                case 'message':
                    limitKey = 'subscription_allowed_free_messages_per_day';
                    countQuery = `
                        SELECT COUNT(*) as count 
                        FROM user_messages 
                        WHERE sender_id = $1 
                        AND timestamp::date = $2
                    `;
                    break;
                case 'like':
                    limitKey = 'subscription_allowed_free_likes_per_day';
                    countQuery = `
                        SELECT COUNT(*) as count 
                        FROM users_likes 
                        WHERE liked_by = $1 
                        AND created_at::date = $2
                    `;
                    break;
                default:
                    return { allowed: true, remaining: -1 };
            }

            const limit = settings[limitKey] || 0;

            // If limit is 0, unlimited
            if (limit === 0) {
                return { allowed: true, remaining: -1 };
            }

            // Get today's count
            const countResult = await query(countQuery, [userId, today]);
            const count = parseInt(countResult.rows[0]?.count || 0);

            const remaining = limit - count;
            const allowed = remaining > 0;

            return { allowed, remaining, limit, used: count };
        } catch (error) {
            logger.error('Error checking daily limit:', error);
            return { allowed: false, remaining: 0 };
        }
    }
}

module.exports = new SubscriptionControlService();










