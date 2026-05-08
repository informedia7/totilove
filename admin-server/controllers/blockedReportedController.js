const blockedReportedService = require('../services/blockedReportedService');
const logger = require('../utils/logger');

class BlockedReportedController {
    /**
     * Get blocked users
     */
    async getBlockedUsers(req, res) {
        try {
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                search: req.query.search || '',
                blockedUserId: req.query.blocked_user_id || null,
                blockerUserId: req.query.blocker_user_id || null,
                sortBy: req.query.sort_by || 'created_at',
                sortOrder: req.query.sort_order || 'DESC'
            };

            const result = await blockedReportedService.getBlockedUsers(options);
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error('Error in getBlockedUsers controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch blocked users'
            });
        }
    }

    /**
     * Get reported users
     */
    async getReportedUsers(req, res) {
        try {
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                search: req.query.search || '',
                reportedUserId: req.query.reported_user_id || null,
                reporterUserId: req.query.reporter_user_id || null,
                status: req.query.status || '',
                sortBy: req.query.sort_by || 'report_date',
                sortOrder: req.query.sort_order || 'DESC'
            };

            const result = await blockedReportedService.getReportedUsers(options);
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error('Error in getReportedUsers controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch reported users'
            });
        }
    }

    /**
     * Get messages between users
     */
    async getMessagesBetweenUsers(req, res) {
        try {
            const userId1 = parseInt(req.query.user_id_1);
            const userId2 = parseInt(req.query.user_id_2);
            const limit = parseInt(req.query.limit) || 10;

            if (!userId1 || !userId2) {
                return res.status(400).json({
                    success: false,
                    error: 'Both user_id_1 and user_id_2 are required'
                });
            }

            const messages = await blockedReportedService.getMessagesBetweenUsers(userId1, userId2, limit);
            res.json({
                success: true,
                messages
            });
        } catch (error) {
            logger.error('Error in getMessagesBetweenUsers controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch messages'
            });
        }
    }

    /**
     * Get statistics
     */
    async getStatistics(req, res) {
        try {
            const stats = await blockedReportedService.getStatistics();
            res.json({
                success: true,
                statistics: stats
            });
        } catch (error) {
            logger.error('Error in getStatistics controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch statistics'
            });
        }
    }

    /**
     * Update report status
     */
    async updateReportStatus(req, res) {
        try {
            const reportId = parseInt(req.params.id);
            const { status } = req.body;

            if (!status) {
                return res.status(400).json({
                    success: false,
                    error: 'Status is required'
                });
            }

            const report = await blockedReportedService.updateReportStatus(reportId, status);
            res.json({
                success: true,
                report
            });
        } catch (error) {
            logger.error('Error in updateReportStatus controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to update report status'
            });
        }
    }

    /**
     * Delete block (unblock)
     */
    async deleteBlock(req, res) {
        try {
            const blockId = parseInt(req.params.id);
            const block = await blockedReportedService.deleteBlock(blockId);
            res.json({
                success: true,
                message: 'Block removed successfully',
                block
            });
        } catch (error) {
            logger.error('Error in deleteBlock controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to delete block'
            });
        }
    }
}

module.exports = new BlockedReportedController();




















































