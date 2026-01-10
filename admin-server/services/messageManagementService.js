const { query } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class MessageManagementService {
    constructor() {
        this.cacheExpiry = 300; // 5 minutes
    }

    /**
     * Get all messages with advanced filtering
     */
    async getAllMessages(filters = {}) {
        try {
            const {
                page = 1,
                limit = 50,
                search = '',
                message_id,
                username_search = '',
                sender_id,
                receiver_id,
                status,
                sort = 'timestamp_desc'
            } = filters;

            const offset = (page - 1) * limit;

            // Build WHERE clause
            let whereConditions = [];
            let queryParams = [];
            let paramIndex = 1;

            // Always exclude likes from messages
            whereConditions.push(`COALESCE(m.message_type, 'text') != 'like'`);

            if (message_id) {
                whereConditions.push(`m.id = $${paramIndex}`);
                queryParams.push(parseInt(message_id));
                paramIndex++;
            }

            if (search) {
                whereConditions.push(`(m.message ILIKE $${paramIndex} OR u1.real_name ILIKE $${paramIndex} OR u2.real_name ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
                paramIndex++;
            }

            if (username_search) {
                whereConditions.push(`(u1.real_name ILIKE $${paramIndex} OR u2.real_name ILIKE $${paramIndex})`);
                queryParams.push(`%${username_search}%`);
                paramIndex++;
            }

            if (sender_id) {
                whereConditions.push(`m.sender_id = $${paramIndex}`);
                queryParams.push(parseInt(sender_id));
                paramIndex++;
            }

            if (receiver_id) {
                whereConditions.push(`m.receiver_id = $${paramIndex}`);
                queryParams.push(parseInt(receiver_id));
                paramIndex++;
            }

            if (status) {
                whereConditions.push(`m.status = $${paramIndex}`);
                queryParams.push(status);
                paramIndex++;
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

            // Build ORDER BY clause
            let orderBy = 'ORDER BY m.timestamp DESC';
            if (sort === 'timestamp_asc') orderBy = 'ORDER BY m.timestamp ASC';
            else if (sort === 'id_desc') orderBy = 'ORDER BY m.id DESC';
            else if (sort === 'id_asc') orderBy = 'ORDER BY m.id ASC';
            else if (sort === 'sender_asc') orderBy = 'ORDER BY u1.real_name ASC, m.timestamp DESC';
            else if (sort === 'receiver_asc') orderBy = 'ORDER BY u2.real_name ASC, m.timestamp DESC';

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total_count
                FROM user_messages m
                LEFT JOIN users u1 ON m.sender_id = u1.id
                LEFT JOIN users u2 ON m.receiver_id = u2.id
                ${whereClause}
            `;

            const countResult = await query(countQuery, queryParams);
            const totalCount = parseInt(countResult.rows[0]?.total_count || 0);

            // Get messages with user details
            const messagesQuery = `
                SELECT 
                    m.id,
                    m.sender_id,
                    m.receiver_id,
                    m.message,
                    m.timestamp,
                    m.status,
                    m.read_at,
                    m.recall_type,
                    m.recalled_at,
                    m.attachment_count,
                    m.saved,
                    m.saved_by_sender,
                    m.saved_by_receiver,
                    m.deleted_by_sender,
                    m.deleted_by_receiver,
                    m.deleted_at,
                    m.is_read,
                    m.message_type,
                    m.reply_to_id,
                    m.reply_to_text,
                    m.reply_to_sender,
                    u1.real_name as sender_username,
                    u2.real_name as receiver_username
                FROM user_messages m
                LEFT JOIN users u1 ON m.sender_id = u1.id
                LEFT JOIN users u2 ON m.receiver_id = u2.id
                ${whereClause}
                ${orderBy}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;

            queryParams.push(parseInt(limit), offset);
            const messagesResult = await query(messagesQuery, queryParams);

            const totalPages = Math.ceil(totalCount / limit);
            const currentPage = parseInt(page);

            return {
                messages: messagesResult.rows,
                pagination: {
                    total_count: totalCount,
                    current_page: currentPage,
                    total_pages: totalPages,
                    has_next: currentPage < totalPages,
                    has_prev: currentPage > 1,
                    limit: parseInt(limit)
                }
            };

        } catch (error) {
            logger.error('Error getting all messages:', error);
            throw error;
        }
    }

    /**
     * Get message by ID
     */
    async getMessageById(messageId) {
        try {
            const result = await query(`
                SELECT 
                    m.*,
                    u1.real_name as sender_username,
                    u2.real_name as receiver_username
                FROM user_messages m
                LEFT JOIN users u1 ON m.sender_id = u1.id
                LEFT JOIN users u2 ON m.receiver_id = u2.id
                WHERE m.id = $1
            `, [messageId]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Error getting message by ID:', error);
            throw error;
        }
    }

    /**
     * Update message
     */
    async updateMessage(messageId, updateData) {
        try {
            // Check if message exists
            const messageCheck = await query('SELECT id FROM user_messages WHERE id = $1', [messageId]);
            if (messageCheck.rows.length === 0) {
                return { success: false, message: 'Message not found' };
            }

            // Build update query dynamically
            const updateFields = [];
            const values = [];
            let paramIndex = 1;

            const allowedFields = [
                'sender_id', 'receiver_id', 'message', 'status', 'read_at',
                'recall_type', 'recalled_at', 'saved', 'saved_by_sender',
                'saved_by_receiver', 'deleted_by_sender', 'deleted_by_receiver',
                'deleted_at', 'is_read', 'message_type', 'attachment_count',
                'reply_to_id', 'reply_to_text', 'reply_to_sender'
            ];

            for (const field of allowedFields) {
                if (updateData.hasOwnProperty(field)) {
                    updateFields.push(`${field} = $${paramIndex}`);
                    values.push(updateData[field]);
                    paramIndex++;
                }
            }

            if (updateFields.length === 0) {
                return { success: false, message: 'No valid fields to update' };
            }

            // Add updated_at
            updateFields.push(`updated_at = NOW()`);
            values.push(messageId);

            const updateQuery = `
                UPDATE user_messages 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await query(updateQuery, values);

            if (redis.enabled) {
                await redis.del(`admin:message:${messageId}`);
                await redis.del('admin:messages:*');
            }

            return {
                success: true,
                message: 'Message updated successfully',
                message: result.rows[0]
            };

        } catch (error) {
            logger.error('Error updating message:', error);
            throw error;
        }
    }

    /**
     * Delete message
     */
    async deleteMessage(messageId) {
        try {
            // Check if message exists
            const messageCheck = await query('SELECT id FROM user_messages WHERE id = $1', [messageId]);
            if (messageCheck.rows.length === 0) {
                return { success: false, message: 'Message not found' };
            }

            // Delete message
            await query('DELETE FROM user_messages WHERE id = $1', [messageId]);

            if (redis.enabled) {
                await redis.del(`admin:message:${messageId}`);
                await redis.del('admin:messages:*');
            }

            return {
                success: true,
                message: 'Message deleted successfully'
            };

        } catch (error) {
            logger.error('Error deleting message:', error);
            throw error;
        }
    }

    /**
     * Add new message
     */
    async addMessage(messageData) {
        try {
            const { sender_id, receiver_id, message, status = 'sent', message_type = 'text', attachment_count = 0 } = messageData;

            // Validate required fields
            if (!sender_id || !receiver_id || !message) {
                return { success: false, message: 'Missing required fields' };
            }

            // Check if users exist
            const usersCheck = await query(
                'SELECT id FROM users WHERE id IN ($1, $2)',
                [parseInt(sender_id), parseInt(receiver_id)]
            );

            if (usersCheck.rows.length !== 2) {
                return { success: false, message: 'Invalid sender or receiver ID' };
            }

            // Insert new message
            const insertQuery = `
                INSERT INTO user_messages (sender_id, receiver_id, message, status, message_type, attachment_count, timestamp, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                RETURNING id
            `;

            const insertParams = [
                parseInt(sender_id),
                parseInt(receiver_id),
                message,
                status,
                message_type,
                parseInt(attachment_count) || 0
            ];

            const insertResult = await query(insertQuery, insertParams);
            const newMessageId = insertResult.rows[0].id;

            if (redis.enabled) {
                await redis.del('admin:messages:*');
            }

            return {
                success: true,
                message: 'Message added successfully',
                messageId: newMessageId
            };

        } catch (error) {
            logger.error('Error adding message:', error);
            throw error;
        }
    }

    /**
     * Toggle recall status
     */
    async toggleRecall(messageId) {
        try {
            // Check if message exists
            const messageCheck = await query(
                'SELECT id, recall_type FROM user_messages WHERE id = $1',
                [messageId]
            );

            if (messageCheck.rows.length === 0) {
                return { success: false, message: 'Message not found' };
            }

            const currentMessage = messageCheck.rows[0];
            const isCurrentlyRecalled = currentMessage.recall_type && currentMessage.recall_type !== 'none';
            const newRecallType = isCurrentlyRecalled ? 'none' : 'soft';

            // Update recall status
            await query(`
                UPDATE user_messages 
                SET 
                    recall_type = $1,
                    recalled_at = $2,
                    updated_at = NOW()
                WHERE id = $3
            `, [newRecallType, newRecallType !== 'none' ? new Date() : null, messageId]);

            if (redis.enabled) {
                await redis.del(`admin:message:${messageId}`);
                await redis.del('admin:messages:*');
            }

            return {
                success: true,
                message: `Message recall ${newRecallType !== 'none' ? 'enabled' : 'disabled'}`,
                recall_type: newRecallType
            };

        } catch (error) {
            logger.error('Error toggling recall:', error);
            throw error;
        }
    }

    /**
     * Get message statistics
     */
    async getMessageStats() {
        try {
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_messages,
                    COUNT(CASE WHEN recall_type IN ('soft', 'hard') THEN 1 END) as recalled_messages,
                    COUNT(CASE WHEN read_at IS NULL THEN 1 END) as unread_messages,
                    COUNT(CASE WHEN saved = true OR saved_by_sender = true OR saved_by_receiver = true THEN 1 END) as saved_messages,
                    COUNT(CASE WHEN attachment_count > 0 THEN 1 END) as messages_with_attachments
                FROM user_messages
                WHERE COALESCE(message_type, 'text') != 'like'
            `;

            const statsResult = await query(statsQuery);
            const stats = statsResult.rows[0];

            return {
                totalMessages: parseInt(stats.total_messages || 0),
                recalledMessages: parseInt(stats.recalled_messages || 0),
                unreadMessages: parseInt(stats.unread_messages || 0),
                savedMessages: parseInt(stats.saved_messages || 0),
                messagesWithAttachments: parseInt(stats.messages_with_attachments || 0)
            };

        } catch (error) {
            logger.error('Error getting message stats:', error);
            throw error;
        }
    }
}

module.exports = new MessageManagementService();



















































