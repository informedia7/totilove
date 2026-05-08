const { query } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class ConfigService {
    constructor() {
        this.cacheExpiry = 600; // 10 minutes
    }

    /**
     * Get all configuration settings
     */
    async getAllSettings() {
        const cacheKey = 'admin:config:all';

        try {
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // Get all settings from admin_system_settings table
            let result;
            try {
                result = await query(
                    `SELECT setting_key, setting_value, setting_type, description 
                     FROM admin_system_settings 
                     ORDER BY setting_key`
                );
            } catch (error) {
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
                settings[row.setting_key] = {
                    value: value,
                    type: row.setting_type,
                    description: row.description
                };
            });

            // Merge with defaults
            const finalSettings = { ...this.getDefaultSettings(), ...settings };

            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(finalSettings), this.cacheExpiry);
            }

            return finalSettings;
        } catch (error) {
            logger.error('Error fetching all settings:', error);
            throw error;
        }
    }

    /**
     * Get default settings
     */
    getDefaultSettings() {
        return {
            // Registration Settings
            'registration_enabled': { value: true, type: 'boolean', description: 'Enable/disable new user registration' },
            'registration_require_email_verification': { value: false, type: 'boolean', description: 'Require email verification for new users' },
            'registration_require_profile_verification': { value: false, type: 'boolean', description: 'Require profile verification for new users' },
            'registration_minimum_age': { value: 18, type: 'number', description: 'Minimum age requirement for registration' },
            'registration_allowed_countries': { value: [], type: 'json', description: 'List of allowed country IDs (empty = all countries)' },
            'registration_blocked_email_domains': { value: [], type: 'json', description: 'List of blocked email domains' },

            // Profile Settings
            'profile_required_fields': { value: ['username', 'email', 'gender', 'birthdate'], type: 'json', description: 'Required profile fields' },
            'profile_minimum_photos': { value: 0, type: 'number', description: 'Minimum number of photos required' },
            'profile_completeness_threshold': { value: 50, type: 'number', description: 'Profile completeness percentage threshold' },
            'profile_auto_verify_criteria': { value: { photos: 3, completeness: 80 }, type: 'json', description: 'Auto-verify criteria' },

            // Messaging Settings
            'messaging_messages_per_day_limit': { value: 0, type: 'number', description: 'Maximum messages per day per user (0 = unlimited)' },
            'messaging_message_length_limit': { value: 5000, type: 'number', description: 'Maximum message length in characters' },
            'messaging_attachment_limit': { value: 10, type: 'number', description: 'Maximum attachments per message' },
            'messaging_attachment_size_limit_mb': { value: 10, type: 'number', description: 'Maximum attachment size in MB' },
            'messaging_spam_detection_enabled': { value: true, type: 'boolean', description: 'Enable spam detection' },

            // Matching Settings
            'matching_distance_radius_default': { value: 50, type: 'number', description: 'Default distance radius in km' },
            'matching_age_range_default_min': { value: 18, type: 'number', description: 'Default minimum age for matching' },
            'matching_age_range_default_max': { value: 80, type: 'number', description: 'Default maximum age for matching' },
            'matching_gender_preferences_enabled': { value: true, type: 'boolean', description: 'Enable gender preferences in matching' },

            // General Settings
            'site_name': { value: 'Totilove', type: 'string', description: 'Site name' },
            'site_description': { value: 'Dating Application', type: 'string', description: 'Site description' },
            'maintenance_mode': { value: false, type: 'boolean', description: 'Enable maintenance mode' },
            'maintenance_message': { value: 'Site is under maintenance', type: 'string', description: 'Maintenance mode message' },

            // Email Settings
            'email_smtp_host': { value: '', type: 'string', description: 'SMTP host' },
            'email_smtp_port': { value: 587, type: 'number', description: 'SMTP port' },
            'email_smtp_user': { value: '', type: 'string', description: 'SMTP username' },
            'email_smtp_password': { value: '', type: 'string', description: 'SMTP password (encrypted)' },
            'email_from_address': { value: 'noreply@totilove.com', type: 'string', description: 'Default from email address' },
            'email_notifications_enabled': { value: true, type: 'boolean', description: 'Enable email notifications' },

            // Security Settings
            'security_password_min_length': { value: 8, type: 'number', description: 'Minimum password length' },
            'security_password_require_uppercase': { value: false, type: 'boolean', description: 'Require uppercase letter in password' },
            'security_password_require_lowercase': { value: true, type: 'boolean', description: 'Require lowercase letter in password' },
            'security_password_require_number': { value: false, type: 'boolean', description: 'Require number in password' },
            'security_password_require_special': { value: false, type: 'boolean', description: 'Require special character in password' },
            'security_session_timeout_minutes': { value: 1440, type: 'number', description: 'Session timeout in minutes (1440 = 24 hours)' },
            'security_rate_limit_enabled': { value: true, type: 'boolean', description: 'Enable rate limiting' },
            'security_rate_limit_requests_per_minute': { value: 60, type: 'number', description: 'Maximum requests per minute per IP' },
            'security_ip_blocking_enabled': { value: false, type: 'boolean', description: 'Enable IP blocking' },

            // Performance Settings
            'performance_cache_enabled': { value: true, type: 'boolean', description: 'Enable caching' },
            'performance_cache_ttl_seconds': { value: 300, type: 'number', description: 'Cache TTL in seconds' },
            'performance_db_pool_max': { value: 20, type: 'number', description: 'Maximum database connections in pool' },
            'performance_db_pool_min': { value: 5, type: 'number', description: 'Minimum database connections in pool' },
            'performance_api_rate_limit': { value: 100, type: 'number', description: 'API rate limit per minute' }
        };
    }

    /**
     * Get specific setting
     */
    async getSetting(key) {
        try {
            const allSettings = await this.getAllSettings();
            return allSettings[key] || null;
        } catch (error) {
            logger.error('Error fetching setting:', error);
            throw error;
        }
    }

    /**
     * Update settings
     */
    async updateSettings(settings, adminId = null) {
        try {
            const defaultSettings = this.getDefaultSettings();
            const allowedKeys = Object.keys(defaultSettings);

            for (const [key, config] of Object.entries(settings)) {
                if (!allowedKeys.includes(key)) {
                    continue; // Skip invalid keys
                }

                const defaultConfig = defaultSettings[key];
                let settingValue = config.value !== undefined ? config.value : config;
                let settingType = config.type || defaultConfig.type || 'string';
                const description = config.description || defaultConfig.description || '';

                // Determine type if not provided
                if (typeof settingValue === 'boolean') {
                    settingType = 'boolean';
                    settingValue = settingValue.toString();
                } else if (typeof settingValue === 'number') {
                    settingType = 'number';
                    settingValue = settingValue.toString();
                } else if (typeof settingValue === 'object') {
                    settingType = 'json';
                    settingValue = JSON.stringify(settingValue);
                } else {
                    settingValue = settingValue.toString();
                }

                // Upsert setting
                try {
                    await query(
                        `INSERT INTO admin_system_settings (setting_key, setting_value, setting_type, description, updated_at, updated_by)
                         VALUES ($1, $2, $3, $4, NOW(), $5)
                         ON CONFLICT (setting_key) 
                         DO UPDATE SET 
                             setting_value = EXCLUDED.setting_value,
                             setting_type = EXCLUDED.setting_type,
                             description = EXCLUDED.description,
                             updated_at = NOW(),
                             updated_by = EXCLUDED.updated_by`,
                        [key, settingValue, settingType, description, adminId]
                    );
                } catch (error) {
                    // If ON CONFLICT fails, try UPDATE then INSERT
                    const updateResult = await query(
                        `UPDATE admin_system_settings 
                         SET setting_value = $1, setting_type = $2, description = $3, updated_at = NOW(), updated_by = $4
                         WHERE setting_key = $5`,
                        [settingValue, settingType, description, adminId, key]
                    );

                    if (updateResult.rowCount === 0) {
                        await query(
                            `INSERT INTO admin_system_settings (setting_key, setting_value, setting_type, description, updated_at, updated_by)
                             VALUES ($1, $2, $3, $4, NOW(), $5)`,
                            [key, settingValue, settingType, description, adminId]
                        );
                    }
                }
            }

            // Clear cache
            if (redis.enabled) {
                await redis.del('admin:config:all');
            }

            return {
                success: true,
                message: 'Settings updated successfully'
            };
        } catch (error) {
            logger.error('Error updating settings:', error);
            throw error;
        }
    }

    /**
     * Update single setting
     */
    async updateSetting(key, value, adminId = null) {
        try {
            const defaultSettings = this.getDefaultSettings();
            if (!defaultSettings[key]) {
                throw new Error(`Setting key '${key}' is not allowed`);
            }

            const defaultConfig = defaultSettings[key];
            let settingValue = value;
            let settingType = defaultConfig.type;

            if (typeof settingValue === 'boolean') {
                settingType = 'boolean';
                settingValue = settingValue.toString();
            } else if (typeof settingValue === 'number') {
                settingType = 'number';
                settingValue = settingValue.toString();
            } else if (typeof settingValue === 'object') {
                settingType = 'json';
                settingValue = JSON.stringify(settingValue);
            } else {
                settingValue = settingValue.toString();
            }

            // Upsert setting
            try {
                await query(
                    `INSERT INTO admin_system_settings (setting_key, setting_value, setting_type, description, updated_at, updated_by)
                     VALUES ($1, $2, $3, $4, NOW(), $5)
                     ON CONFLICT (setting_key) 
                     DO UPDATE SET 
                         setting_value = EXCLUDED.setting_value,
                         setting_type = EXCLUDED.setting_type,
                         updated_at = NOW(),
                         updated_by = EXCLUDED.updated_by`,
                    [key, settingValue, settingType, defaultConfig.description, adminId]
                );
            } catch (error) {
                const updateResult = await query(
                    `UPDATE admin_system_settings 
                     SET setting_value = $1, setting_type = $2, updated_at = NOW(), updated_by = $3
                     WHERE setting_key = $4`,
                    [settingValue, settingType, adminId, key]
                );

                if (updateResult.rowCount === 0) {
                    await query(
                        `INSERT INTO admin_system_settings (setting_key, setting_value, setting_type, description, updated_at, updated_by)
                         VALUES ($1, $2, $3, $4, NOW(), $5)`,
                        [key, settingValue, settingType, defaultConfig.description, adminId]
                    );
                }
            }

            // Clear cache
            if (redis.enabled) {
                await redis.del('admin:config:all');
            }

            return {
                success: true,
                message: 'Setting updated successfully'
            };
        } catch (error) {
            logger.error('Error updating setting:', error);
            throw error;
        }
    }
}

module.exports = new ConfigService();




















































