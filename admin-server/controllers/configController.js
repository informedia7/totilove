const configService = require('../services/configService');
const logger = require('../utils/logger');

class ConfigController {
    /**
     * Get all settings
     */
    async getAllSettings(req, res) {
        try {
            const settings = await configService.getAllSettings();
            res.json({
                success: true,
                settings
            });
        } catch (error) {
            logger.error('Error in getAllSettings controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch settings'
            });
        }
    }

    /**
     * Get specific setting
     */
    async getSetting(req, res) {
        try {
            const key = req.params.key;
            const setting = await configService.getSetting(key);
            
            if (!setting) {
                return res.status(404).json({
                    success: false,
                    error: 'Setting not found'
                });
            }

            res.json({
                success: true,
                setting: {
                    key,
                    ...setting
                }
            });
        } catch (error) {
            logger.error('Error in getSetting controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch setting'
            });
        }
    }

    /**
     * Update settings
     */
    async updateSettings(req, res) {
        try {
            const adminId = req.admin?.id;
            const result = await configService.updateSettings(req.body, adminId);
            res.json(result);
        } catch (error) {
            logger.error('Error in updateSettings controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to update settings'
            });
        }
    }

    /**
     * Update single setting
     */
    async updateSetting(req, res) {
        try {
            const key = req.params.key;
            const { value } = req.body;
            const adminId = req.admin?.id;

            if (value === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Value is required'
                });
            }

            const result = await configService.updateSetting(key, value, adminId);
            res.json(result);
        } catch (error) {
            logger.error('Error in updateSetting controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to update setting'
            });
        }
    }
}

module.exports = new ConfigController();




















































