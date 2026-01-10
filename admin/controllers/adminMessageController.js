const { Pool } = require('pg');
const config = require('../../config/config.js');

class AdminMessageController {
    constructor() {
        this.db = new Pool(config.database);
    }

    // Get all messages with advanced filtering
    async getAllMessages(req, res) {
        try {
                    const { 
            page = 1, 
            limit = 50, 
            search = '', 
            sender_id, 
            receiver_id, 
            status, 
            sort = 'timestamp_desc'
        } = req.query;

            const offset = (page - 1) * limit;
            
            // Build WHERE clause
            let whereConditions = [];
            let queryParams = [];
            let paramIndex = 1;

            if (search) {
                whereConditions.push(`(m.message ILIKE $${paramIndex} OR u1.real_name ILIKE $${paramIndex} OR u2.real_name ILIKE $${paramIndex})`);
                queryParams.push(`%${search}%`);
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

                    // Note: recall filtering now uses recall_type instead of recalled_by_sender

            // Always exclude likes from messages (they should not be treated as messages)
            whereConditions.push(`COALESCE(m.message_type, 'text') != 'like'`);
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
                JOIN users u1 ON m.sender_id = u1.id
                JOIN users u2 ON m.receiver_id = u2.id
                ${whereClause}
            `;
            
            const countResult = await this.db.query(countQuery, queryParams);
            const totalCount = parseInt(countResult.rows[0].total_count);

            // Get messages with user details
            const messagesQuery = `
                SELECT 
                    m.id, m.sender_id, m.receiver_id, m.message, m.timestamp, m.status,
                    m.read_at, m.recall_type, m.attachment_count, m.saved,
                    u1.real_name as sender_real_name,
                    u2.real_name as receiver_real_name
                FROM user_messages m
                JOIN users u1 ON m.sender_id = u1.id
                JOIN users u2 ON m.receiver_id = u2.id
                ${whereClause}
                ${orderBy}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;

            queryParams.push(parseInt(limit), offset);
            const messagesResult = await this.db.query(messagesQuery, queryParams);

            const totalPages = Math.ceil(totalCount / limit);
            const currentPage = parseInt(page);

            res.json({
                success: true,
                messages: messagesResult.rows,
                pagination: {
                    total_count: totalCount,
                    current_page: currentPage,
                    total_pages: totalPages,
                    has_next: currentPage < totalPages,
                    has_prev: currentPage > 1,
                    limit: parseInt(limit)
                }
            });

        } catch (error) {
            console.error('Error getting all messages:', error);
            res.status(500).json({ success: false, error: 'Failed to get messages' });
        }
    }

    // Update message (admin)
    async updateMessage(req, res) {
        try {
            const { messageId } = req.params;
            const updateData = req.body;

            // Validate required fields
            if (!updateData.sender_id || !updateData.receiver_id || !updateData.message) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            // Check if message exists
            const messageCheck = await this.db.query('SELECT id FROM user_messages WHERE id = $1', [messageId]);
            if (messageCheck.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Message not found' });
            }

            // Update message
            const updateQuery = `
                UPDATE user_messages 
                SET 
                    sender_id = $1,
                    receiver_id = $2,
                    message = $3,
                    status = $4,
                    read_at = $5,
                    recall_type = $6,
                    saved = $7
                WHERE id = $8
            `;

            const updateParams = [
                parseInt(updateData.sender_id),
                parseInt(updateData.receiver_id),
                updateData.message,
                updateData.status || 'sent',
                updateData.read_at ? new Date(updateData.read_at) : null,
                updateData.recall_type || 'none',
                updateData.saved || false,
                parseInt(messageId)
            ];

            await this.db.query(updateQuery, updateParams);

            res.json({ success: true, message: 'Message updated successfully' });

        } catch (error) {
            console.error('Error updating message:', error);
            res.status(500).json({ success: false, error: 'Failed to update message' });
        }
    }

    // Delete message (admin)
    async deleteMessage(req, res) {
        try {
            const { messageId } = req.params;

            // Check if message exists
            const messageCheck = await this.db.query('SELECT id FROM user_messages WHERE id = $1', [messageId]);
            if (messageCheck.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Message not found' });
            }

            // Delete message (this will cascade to attachments if foreign key constraints are set up)
            await this.db.query('DELETE FROM user_messages WHERE id = $1', [messageId]);

            res.json({ success: true, message: 'Message deleted successfully' });

        } catch (error) {
            console.error('Error deleting message:', error);
            res.status(500).json({ success: false, error: 'Failed to delete message' });
        }
    }

    // Add new message (admin)
    async addMessage(req, res) {
        try {
            const { sender_id, receiver_id, message, status = 'sent' } = req.body;

            // Validate required fields
            if (!sender_id || !receiver_id || !message) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            // Check if users exist
            const usersCheck = await this.db.query(
                'SELECT id FROM users WHERE id IN ($1, $2)',
                [parseInt(sender_id), parseInt(receiver_id)]
            );
            
            if (usersCheck.rows.length !== 2) {
                return res.status(400).json({ success: false, error: 'Invalid sender or receiver ID' });
            }

            // Insert new message
            const insertQuery = `
                INSERT INTO user_messages (sender_id, receiver_id, message, status, timestamp)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING id
            `;

            const insertParams = [
                parseInt(sender_id),
                parseInt(receiver_id),
                message,
                status
            ];

            const insertResult = await this.db.query(insertQuery, insertParams);
            const newMessageId = insertResult.rows[0].id;

            res.json({ 
                success: true, 
                message: 'Message added successfully',
                messageId: newMessageId
            });

        } catch (error) {
            console.error('Error adding message:', error);
            res.status(500).json({ success: false, error: 'Failed to add message' });
        }
    }

    // Toggle recall status (admin)
    async toggleRecall(req, res) {
        try {
            const { messageId } = req.params;

            // Check if message exists
            const messageCheck = await this.db.query(
                'SELECT id, recall_type FROM user_messages WHERE id = $1', 
                [messageId]
            );
            
            if (messageCheck.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Message not found' });
            }

            const currentMessage = messageCheck.rows[0];
            const isCurrentlyRecalled = currentMessage.recall_type && currentMessage.recall_type !== 'none';
            const newRecallType = isCurrentlyRecalled ? 'none' : 'soft';

            // Update recall status
            await this.db.query(`
                UPDATE user_messages 
                SET 
                    recall_type = $1,
                    recalled_at = $2
                WHERE id = $3
            `, [newRecallType, newRecallType !== 'none' ? new Date() : null, messageId]);

            res.json({ 
                success: true, 
                message: `Message recall ${newRecallType !== 'none' ? 'enabled' : 'disabled'}`,
                recall_type: newRecallType
            });

        } catch (error) {
            console.error('Error toggling recall:', error);
            res.status(500).json({ success: false, error: 'Failed to toggle recall' });
        }
    }

    // Get message statistics
    async getMessageStats(req, res) {
        try {
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_messages,
                    COUNT(CASE WHEN recall_type IN ('soft', 'hard') THEN 1 END) as recalled_messages,
                    COUNT(CASE WHEN read_at IS NULL THEN 1 END) as unread_messages,
                    COUNT(CASE WHEN saved = true THEN 1 END) as saved_messages,
                    COUNT(CASE WHEN attachment_count > 0 THEN 1 END) as messages_with_attachments
                FROM user_messages
            `;

            const statsResult = await this.db.query(statsQuery);
            const stats = statsResult.rows[0];

            res.json({
                success: true,
                stats: {
                    totalMessages: parseInt(stats.total_messages),
                    recalledMessages: parseInt(stats.recalled_messages),
                    unreadMessages: parseInt(stats.unread_messages),
                    savedMessages: parseInt(stats.saved_messages),
                    messagesWithAttachments: parseInt(stats.messages_with_attachments)
                }
            });

        } catch (error) {
            console.error('Error getting message stats:', error);
            res.status(500).json({ success: false, error: 'Failed to get message statistics' });
        }
    }

    // Clean up method
    async cleanup() {
        if (this.db) {
            await this.db.end();
        }
    }
}

module.exports = AdminMessageController;
