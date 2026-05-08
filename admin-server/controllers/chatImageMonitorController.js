const chatImageMonitorService = require('../services/chatImageMonitorService');
const logger = require('../utils/logger');

class ChatImageMonitorController {
    async list(req, res) {
        try {
            const result = await chatImageMonitorService.getChatImages({
                page: req.query.page,
                limit: req.query.limit,
                sender_id: req.query.sender_id,
                receiver_id: req.query.receiver_id,
                message_id: req.query.message_id,
                search: req.query.search || ''
            });
            res.json({ success: true, ...result });
        } catch (error) {
            logger.error('Error in chat image monitor list:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load chat images',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async stats(req, res) {
        try {
            const stats = await chatImageMonitorService.getSummaryStats();
            res.json({ success: true, stats });
        } catch (error) {
            logger.error('Error in chat image monitor stats:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load chat image statistics',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Remove a chat image attachment — DB row + files on disk (POST …/reject).
     */
    async reject(req, res) {
        try {
            const attachmentId = parseInt(req.params.id, 10);
            if (!attachmentId) {
                return res.status(400).json({ success: false, error: 'Invalid attachment id' });
            }

            const result = await chatImageMonitorService.rejectAttachment(attachmentId);
            res.json({
                success: true,
                message: 'Chat image removed successfully',
                ...result
            });
        } catch (error) {
            const msg = error.message || 'Failed to reject chat image';
            const notFound = /not found|already removed/i.test(msg);
            logger.error('Error in chat image remove:', error);
            res.status(notFound ? 404 : 500).json({
                success: false,
                error: msg
            });
        }
    }
}

module.exports = new ChatImageMonitorController();
