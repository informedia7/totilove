const messageManagementService = require('../services/messageManagementService');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

class MessageController {
    /**
     * Get all messages with filters
     */
    async getAllMessages(req, res) {
        try {
            const filters = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 50,
                search: req.query.search || '',
                message_id: req.query.message_id,
                username_search: req.query.username_search || '',
                sender_id: req.query.sender_id,
                receiver_id: req.query.receiver_id,
                status: req.query.status,
                sort: req.query.sort || 'timestamp_desc'
            };

            const result = await messageManagementService.getAllMessages(filters);

            res.json({
                success: true,
                messages: result.messages,
                pagination: result.pagination
            });

        } catch (error) {
            logger.error('Error in getAllMessages:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get messages'
            });
        }
    }

    /**
     * Get message by ID
     */
    async getMessageById(req, res) {
        try {
            const { messageId } = req.params;
            const message = await messageManagementService.getMessageById(messageId);

            if (!message) {
                return res.status(404).json({
                    success: false,
                    error: 'Message not found'
                });
            }

            res.json({
                success: true,
                message
            });

        } catch (error) {
            logger.error('Error in getMessageById:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get message'
            });
        }
    }

    /**
     * Update message
     */
    async updateMessage(req, res) {
        try {
            const { messageId } = req.params;
            const updateData = req.body;

            // Validate required fields
            if (!updateData.sender_id || !updateData.receiver_id || !updateData.message) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields'
                });
            }

            const result = await messageManagementService.updateMessage(messageId, updateData);

            if (!result.success) {
                return res.status(404).json(result);
            }

            // Audit log
            auditLog(req.admin.id, 'update_message', messageId, {
                message_id: messageId,
                changes: updateData
            });

            res.json({
                success: true,
                message: 'Message updated successfully',
                data: result.message
            });

        } catch (error) {
            logger.error('Error in updateMessage:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update message'
            });
        }
    }

    /**
     * Delete message
     */
    async deleteMessage(req, res) {
        try {
            const { messageId } = req.params;

            const result = await messageManagementService.deleteMessage(messageId);

            if (!result.success) {
                return res.status(404).json(result);
            }

            // Audit log
            auditLog(req.admin.id, 'delete_message', messageId, {
                message_id: messageId
            });

            res.json({
                success: true,
                message: 'Message deleted successfully'
            });

        } catch (error) {
            logger.error('Error in deleteMessage:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete message'
            });
        }
    }

    /**
     * Add new message
     */
    async addMessage(req, res) {
        try {
            const messageData = req.body;

            const result = await messageManagementService.addMessage(messageData);

            if (!result.success) {
                return res.status(400).json(result);
            }

            // Audit log
            auditLog(req.admin.id, 'add_message', result.messageId, {
                sender_id: messageData.sender_id,
                receiver_id: messageData.receiver_id
            });

            res.json({
                success: true,
                message: 'Message added successfully',
                messageId: result.messageId
            });

        } catch (error) {
            logger.error('Error in addMessage:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add message'
            });
        }
    }

    /**
     * Toggle recall status
     */
    async toggleRecall(req, res) {
        try {
            const { messageId } = req.params;

            const result = await messageManagementService.toggleRecall(messageId);

            if (!result.success) {
                return res.status(404).json(result);
            }

            // Audit log
            auditLog(req.admin.id, 'toggle_recall', messageId, {
                message_id: messageId,
                recall_type: result.recall_type
            });

            res.json({
                success: true,
                message: result.message,
                recall_type: result.recall_type
            });

        } catch (error) {
            logger.error('Error in toggleRecall:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to toggle recall'
            });
        }
    }

    /**
     * Get message statistics
     */
    async getMessageStats(req, res) {
        try {
            const stats = await messageManagementService.getMessageStats();

            res.json({
                success: true,
                stats
            });

        } catch (error) {
            logger.error('Error in getMessageStats:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get message statistics'
            });
        }
    }
}

module.exports = new MessageController();



















































