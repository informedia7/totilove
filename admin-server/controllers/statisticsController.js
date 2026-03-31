const statisticsService = require('../services/statisticsService');
const logger = require('../utils/logger');

class StatisticsController {
    /**
     * Get dashboard statistics
     */
    async getDashboardStats(req, res) {
        try {
            const dateRange = req.query.range || '30d';
            const stats = await statisticsService.getDashboardStats(dateRange);
            res.json({
                success: true,
                statistics: stats
            });
        } catch (error) {
            logger.error('Error in getDashboardStats controller:', error);
            logger.error('Error stack:', error.stack);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch dashboard statistics',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get user statistics
     */
    async getUserStats(req, res) {
        try {
            const stats = await statisticsService.getUserStats();
            res.json({
                success: true,
                statistics: stats
            });
        } catch (error) {
            logger.error('Error in getUserStats controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch user statistics'
            });
        }
    }

    /**
     * Get activity statistics
     */
    async getActivityStats(req, res) {
        try {
            const dateRange = req.query.range || '30d';
            const stats = await statisticsService.getActivityStats(dateRange);
            res.json({
                success: true,
                statistics: stats
            });
        } catch (error) {
            logger.error('Error in getActivityStats controller:', error);
            logger.error('Error stack:', error.stack);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch activity statistics',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get growth metrics
     */
    async getGrowthMetrics(req, res) {
        try {
            const stats = await statisticsService.getGrowthMetrics();
            res.json({
                success: true,
                statistics: stats
            });
        } catch (error) {
            logger.error('Error in getGrowthMetrics controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch growth metrics'
            });
        }
    }

    /**
     * Get quality metrics
     */
    async getQualityMetrics(req, res) {
        try {
            const stats = await statisticsService.getQualityMetrics();
            res.json({
                success: true,
                statistics: stats
            });
        } catch (error) {
            logger.error('Error in getQualityMetrics controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch quality metrics'
            });
        }
    }
}

module.exports = new StatisticsController();










