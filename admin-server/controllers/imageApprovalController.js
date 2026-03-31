const imageApprovalService = require('../services/imageApprovalService');
const logger = require('../utils/logger');

class ImageApprovalController {
    /**
     * Get image approval settings
     */
    async getSettings(req, res) {
        try {
            const settings = await imageApprovalService.getImageApprovalSettings();
            res.json({
                success: true,
                settings
            });
        } catch (error) {
            logger.error('Error in getSettings controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch image approval settings'
            });
        }
    }

    /**
     * Update image approval settings
     */
    async updateSettings(req, res) {
        try {
            const result = await imageApprovalService.updateImageApprovalSettings(req.body);
            res.json(result);
        } catch (error) {
            logger.error('Error in updateSettings controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update image approval settings'
            });
        }
    }

    /**
     * Get pending images
     */
    async getPendingImages(req, res) {
        try {
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                search: req.query.search || '',
                userId: req.query.user_id || null,
                sortBy: req.query.sort_by || 'uploaded_at',
                sortOrder: req.query.sort_order || 'DESC'
            };

            const result = await imageApprovalService.getPendingImages(options);
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error('Error in getPendingImages controller:', error);
            logger.error('Error details:', {
                message: error.message,
                stack: error.stack,
                code: error.code,
                detail: error.detail,
                hint: error.hint
            });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch pending images',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get all images
     */
    async getImages(req, res) {
        try {
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                search: req.query.search || '',
                userId: req.query.user_id || null,
                status: req.query.status || '',
                sortBy: req.query.sort_by || 'uploaded_at',
                sortOrder: req.query.sort_order || 'DESC'
            };

            const result = await imageApprovalService.getImages(options);
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error('Error in getImages controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch images'
            });
        }
    }

    /**
     * Approve image
     */
    async approveImage(req, res) {
        try {
            const imageId = parseInt(req.params.id);
            const adminId = req.admin?.id;

            if (!adminId) {
                return res.status(401).json({
                    success: false,
                    error: 'Admin authentication required'
                });
            }

            const image = await imageApprovalService.approveImage(imageId, adminId);
            res.json({
                success: true,
                message: 'Image approved successfully',
                image
            });
        } catch (error) {
            logger.error('Error in approveImage controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to approve image'
            });
        }
    }

    /**
     * Reject image
     */
    async rejectImage(req, res) {
        try {
            const imageId = parseInt(req.params.id);
            const adminId = req.admin?.id;
            const { reason } = req.body;

            if (!adminId) {
                return res.status(401).json({
                    success: false,
                    error: 'Admin authentication required'
                });
            }

            const image = await imageApprovalService.rejectImage(imageId, adminId, reason || '');
            res.json({
                success: true,
                message: 'Image rejected successfully',
                image
            });
        } catch (error) {
            logger.error('Error in rejectImage controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to reject image'
            });
        }
    }

    /**
     * Get statistics
     */
    async getStatistics(req, res) {
        try {
            const stats = await imageApprovalService.getStatistics();
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
}

module.exports = new ImageApprovalController();




















































