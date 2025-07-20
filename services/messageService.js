const redis = require('redis');
const crypto = require('crypto');

class MessageService {
    constructor(pool, redisClient) {
        this.db = pool;
        this.redis = redisClient;
    }

    // Generate consistent chat room ID for two users
    getChatRoomId(userId1, userId2) {
        const sortedIds = [userId1, userId2].sort((a, b) => a - b);
        return `chat:${sortedIds[0]}:${sortedIds[1]}`;
    }

    // Send a new message
    async sendMessage(senderId, receiverId, content) {
        try {
            const timestamp = Date.now();
            const chatRoomId = this.getChatRoomId(senderId, receiverId);

            // 1. Store in PostgreSQL for persistence first to get the real ID
            const result = await this.db.query(`
                INSERT INTO messages (sender_id, receiver_id, message, status)
                VALUES ($1, $2, $3, $4)
                RETURNING id, FLOOR(EXTRACT(EPOCH FROM timestamp) * 1000) as timestamp
            `, [senderId, receiverId, content, 'sent']);

            const dbMessage = result.rows[0];
            
            // Get sender username for Redis storage
            const senderInfo = await this.db.query('SELECT username FROM users WHERE id = $1', [senderId]);
            const senderUsername = senderInfo.rows[0]?.username || 'Unknown';
            
            const message = {
                id: dbMessage.id,
                senderId: parseInt(senderId),
                receiverId: parseInt(receiverId),
                content,
                timestamp: parseInt(dbMessage.timestamp),
                status: 'sent',
                sender_username: senderUsername
            };

            // 2. Store in Redis for fast access (last 100 messages) - only if Redis is available
            if (this.redis) {
                await this.redis.lPush(
                    `${chatRoomId}:messages`,
                    JSON.stringify(message)
                );
                
                // Keep only last 100 messages in Redis
                await this.redis.lTrim(`${chatRoomId}:messages`, 0, 99);

                // 3. Publish to receiver for real-time delivery
                await this.redis.publish(`user:${receiverId}:messages`, JSON.stringify({
                    type: 'new_message',
                    ...message
                }));

                // 4. Update conversation list
                await this.updateConversationList(senderId, receiverId, content, dbMessage.timestamp);
            } else {
                console.log('⚠️ Redis not available - message stored in database only');
            }

            return { success: true, message };

        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    // Get recent messages from Redis (fast) or database (fallback)
    async getRecentMessages(userId1, userId2, limit = 50) {
        try {
            const chatRoomId = this.getChatRoomId(userId1, userId2);
            
            // Try Redis first if available
            if (this.redis) {
                const messages = await this.redis.lRange(`${chatRoomId}:messages`, 0, limit - 1);
                
                if (messages.length > 0) {
                    const parsedMessages = messages.map(msg => JSON.parse(msg)).reverse(); // Most recent first
                    
                    // Enhance messages with usernames if missing
                    for (let message of parsedMessages) {
                        if (!message.sender_username) {
                            try {
                                const userInfo = await this.db.query('SELECT username FROM users WHERE id = $1', [message.senderId]);
                                message.sender_username = userInfo.rows[0]?.username || 'Unknown';
                            } catch (error) {
                                message.sender_username = 'Unknown';
                            }
                        }
                    }
                    
                    return parsedMessages;
                } else {
                    // Fallback to database if Redis is empty
                    return await this.getMessagesFromDatabase(userId1, userId2, limit);
                }
            } else {
                // Redis not available, use database
                console.log('⚠️ Redis not available - using database for messages');
                return await this.getMessagesFromDatabase(userId1, userId2, limit);
            }
        } catch (error) {
            console.error('Error getting recent messages from Redis:', error);
            // Fallback to database
            return await this.getMessagesFromDatabase(userId1, userId2, limit);
        }
    }

    // Get messages from database (fallback method)
    async getMessagesFromDatabase(userId1, userId2, limit = 50) {
        try {
            const result = await this.db.query(`
                SELECT m.id, m.sender_id, m.receiver_id, m.message as content, 
                       FLOOR(EXTRACT(EPOCH FROM timestamp) * 1000) as timestamp, m.status,
                       u1.username as sender_username,
                       u2.username as receiver_username
                FROM messages m
                LEFT JOIN users u1 ON m.sender_id = u1.id
                LEFT JOIN users u2 ON m.receiver_id = u2.id
                WHERE (m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $2 AND m.receiver_id = $1)
                AND (
                    (m.sender_id = $1 AND COALESCE(m.deleted_by_sender, false) = false) OR
                    (m.receiver_id = $1 AND COALESCE(m.deleted_by_receiver, false) = false)
                )
                ORDER BY m.timestamp ASC 
                LIMIT $3
            `, [userId1, userId2, limit]);

            // Convert timestamp strings to numbers
            return result.rows.map(row => ({
                ...row,
                timestamp: parseInt(row.timestamp)
            }));
        } catch (error) {
            console.error('Error getting messages from database:', error);
            return [];
        }
    }

    // Get older messages from database (when user scrolls up)
    async getOlderMessages(userId1, userId2, beforeTimestamp, limit = 20) {
        try {
            const result = await this.db.query(`
                SELECT id, sender_id, receiver_id, message as content, 
                       FLOOR(EXTRACT(EPOCH FROM timestamp) * 1000) as timestamp, status
                FROM messages 
                WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
                AND EXTRACT(EPOCH FROM timestamp) * 1000 < $3
                AND (
                    (sender_id = $1 AND COALESCE(deleted_by_sender, false) = false) OR
                    (receiver_id = $1 AND COALESCE(deleted_by_receiver, false) = false)
                )
                ORDER BY timestamp DESC 
                LIMIT $4
            `, [userId1, userId2, beforeTimestamp, limit]);

            // Convert timestamp strings to numbers and reverse for chronological order
            return result.rows.map(row => ({
                ...row,
                timestamp: parseInt(row.timestamp)
            })).reverse();
        } catch (error) {
            console.error('Error getting older messages:', error);
            return [];
        }
    }

    // Update conversation list in Redis
    async updateConversationList(userId1, userId2, lastMessage, timestamp) {
        try {
            // Skip Redis operations if not available
            if (!this.redis) {
                console.log('⚠️ Redis not available - skipping conversation list update');
                return;
            }

            const conversation = {
                userId: userId2,
                lastMessage,
                timestamp,
                unreadCount: 0 // Will be updated based on user activity
            };

            // Update for sender
            await this.redis.hSet(
                `user:${userId1}:conversations`,
                userId2,
                JSON.stringify(conversation)
            );

            // Update for receiver (with unread count)
            conversation.userId = userId1;
            conversation.unreadCount = await this.getUnreadCount(userId2, userId1) + 1;
            
            await this.redis.hSet(
                `user:${userId2}:conversations`,
                userId1,
                JSON.stringify(conversation)
            );

        } catch (error) {
            console.error('Error updating conversation list:', error);
        }
    }

    // Get user's conversation list
    async getConversations(userId) {
        try {
            if (!this.redis) {
                console.log('⚠️ Redis not available - conversations not available');
                return [];
            }

            const conversations = await this.redis.hGetAll(`user:${userId}:conversations`);
            const result = [];

            for (const [otherUserId, data] of Object.entries(conversations)) {
                const conversation = JSON.parse(data);
                
                // Get other user's info
                const userInfo = await this.db.query(
                    'SELECT id, username FROM users WHERE id = $1',
                    [otherUserId]
                );

                if (userInfo.rows.length > 0) {
                    // Ensure timestamp is a proper number for date formatting
                    let timestamp = conversation.timestamp;
                    
                    // Handle string timestamps
                    if (typeof timestamp === 'string') {
                        timestamp = parseInt(timestamp);
                    }
                    
                    // Ensure we have a valid timestamp, fallback to current time
                    if (!timestamp || isNaN(timestamp) || timestamp <= 0) {
                        timestamp = Date.now();
                    }
                    
                    // If timestamp is in the future, cap it to current time
                    if (timestamp > Date.now()) {
                        timestamp = Date.now();
                    }
                    
                    result.push({
                        partnerId: parseInt(otherUserId),
                        partnerName: userInfo.rows[0].username,
                        lastMessage: conversation.lastMessage || 'No messages yet',
                        timestamp: timestamp,
                        unreadCount: conversation.unreadCount || 0
                    });
                }
            }

            // Sort by timestamp (most recent first)
            return result.sort((a, b) => b.timestamp - a.timestamp);

        } catch (error) {
            console.error('Error getting conversations:', error);
            return [];
        }
    }

    // Mark messages as read
    async markAsRead(userId, otherUserId) {
        try {
            // Reset unread count in Redis
            const conversation = await this.redis.hGet(`user:${userId}:conversations`, otherUserId);
            if (conversation) {
                const data = JSON.parse(conversation);
                data.unreadCount = 0;
                await this.redis.hSet(`user:${userId}:conversations`, otherUserId, JSON.stringify(data));
            }

            // Update database - mark messages as read
            await this.db.query(`
                UPDATE messages 
                SET status = 'read' 
                WHERE receiver_id = $1 AND sender_id = $2 AND status != 'read'
            `, [userId, otherUserId]);

            // Notify sender that messages were read
            await this.redis.publish(`user:${otherUserId}:messages`, JSON.stringify({
                type: 'messages_read',
                readBy: userId
            }));

        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }

    // Get unread message count
    async getUnreadCount(userId, fromUserId) {
        try {
            const result = await this.db.query(`
                SELECT COUNT(*) FROM messages 
                WHERE receiver_id = $1 AND sender_id = $2 AND status != 'read'
            `, [userId, fromUserId]);

            return parseInt(result.rows[0].count);
        } catch (error) {
            console.error('Error getting unread count:', error);
            return 0;
        }
    }

    // Typing indicator
    async setTyping(userId, chatWithUserId, isTyping = true) {
        try {
            const key = `typing:${this.getChatRoomId(userId, chatWithUserId)}`;
            
            if (isTyping) {
                await this.redis.setEx(key, 5, userId); // Expires in 5 seconds
                
                // Notify other user
                await this.redis.publish(`user:${chatWithUserId}:messages`, JSON.stringify({
                    type: 'typing_start',
                    userId
                }));
            } else {
                await this.redis.del(key);
                
                // Notify other user
                await this.redis.publish(`user:${chatWithUserId}:messages`, JSON.stringify({
                    type: 'typing_stop',
                    userId
                }));
            }

        } catch (error) {
            console.error('Error setting typing indicator:', error);
        }
    }
}

module.exports = MessageService;
