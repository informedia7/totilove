const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class MessageService {
    constructor(pool, redisClient) {
        this.db = pool;
        this.redis = redisClient;
        
        // Performance settings
        this.BATCH_SIZE = 50;
        this.CACHE_TTL = 300; // 5 minutes
        this.MAX_MESSAGE_LENGTH = 1000;
        this.appRoot = path.resolve(__dirname, '..', 'app');
    }

    buildAttachmentPathCandidates(relativePath) {
        if (!relativePath) {
            return [];
        }
        const sanitized = relativePath.replace(/^\//, '');
        const candidates = [
            path.join(this.appRoot, sanitized),
            path.join(process.cwd(), 'app', sanitized),
            path.join(process.cwd(), sanitized)
        ];
        return [...new Set(candidates)];
    }

    // Validate that attachment files exist on the filesystem
    validateAttachment(attachment) {
        if (!attachment || !attachment.file_path) {
            return false;
        }

        try {
            const fileExists = this.buildAttachmentPathCandidates(attachment.file_path)
                .some(candidate => fs.existsSync(candidate));

            if (!fileExists) {
                console.warn(`[MessageService] Missing chat image file: ${attachment.file_path}`);
                return false;
            }

            if (attachment.thumbnail_path) {
                const thumbExists = this.buildAttachmentPathCandidates(attachment.thumbnail_path)
                    .some(candidate => fs.existsSync(candidate));

                if (!thumbExists) {
                    console.warn(`[MessageService] Missing chat image thumbnail: ${attachment.thumbnail_path}`);
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('Error validating attachment:', error);
            return false;
        }
    }

    // Filter out invalid attachments (missing files)
    filterValidAttachments(attachments) {
        if (!attachments || !Array.isArray(attachments)) {
            return [];
        }

        return attachments.filter(att => {
            const isValid = this.validateAttachment(att);
            return isValid;
        });
    }

    // Helper function to get profile image path for a user
    getProfileImagePath(userId, imageFileName = null) {
        if (imageFileName && imageFileName.trim() !== '') {
            // If we have a valid image filename, use it
            if (imageFileName.startsWith('/uploads/') || imageFileName.startsWith('uploads/')) {
                return imageFileName.startsWith('/') ? imageFileName : `/${imageFileName}`;
            } else {
                return `/uploads/profile_images/${imageFileName}`;
            }
        }
        
        // If no profile image is found, return default avatar
        return '/assets/default-avatar.svg';
    }

    /**
     * Set Redis client for high-performance caching
     */
    set redisClient(client) {
        this.redis = client;
    }

    /**
     * Get current Redis client
     */
    get redisClient() {
        return this.redis;
    }

    // Generate consistent chat room ID for two users
    getChatRoomId(userId1, userId2) {
        const sortedIds = [userId1, userId2].sort((a, b) => a - b);
        return `chat:${sortedIds[0]}:${sortedIds[1]}`;
    }

    // ULTRA-FAST message sending optimized for instant delivery
    async sendMessage(senderId, receiverId, content, replyData = null) {
        const startTime = Date.now();
        
        try {
            // Quick validation (allow single-space placeholder for image-only messages)
            if (typeof content !== 'string' || content.length === 0 || content.length > this.MAX_MESSAGE_LENGTH) {
                throw new Error('Invalid message content');
            }

            // 1. INSTANT: Parallel operations for maximum speed
            const [dbResult, senderUsername] = await Promise.all([
                // Database insert (fastest possible) - let database handle timestamp
                this.db.query(`
                    INSERT INTO user_messages (sender_id, receiver_id, message, status, reply_to_id, reply_to_text, reply_to_sender) 
                    VALUES ($1, $2, $3, 'sent', $4, $5, $6) 
                    RETURNING id, timestamp
                `, [
                    senderId,
                    receiverId,
                    content,
                    // Ensure reply_to_id is a valid integer or null
                    (replyData?.id && !isNaN(parseInt(replyData.id)) && !replyData.id.toString().startsWith('temp_')) ? parseInt(replyData.id) : null,
                    replyData?.text || null,
                    replyData?.senderId || null
                ]),
                
                // Get sender real_name (cached or quick lookup)
                this.getFastUsername(senderId)
            ]);

            const dbMessage = dbResult.rows[0];
            
            // 2. Create message object INSTANTLY
            const message = {
                id: dbMessage.id,
                senderId: parseInt(senderId),
                receiverId: parseInt(receiverId),
                content,
                timestamp: new Date(dbMessage.timestamp).getTime(),
                status: 'sent',
                sender_real_name: senderUsername
            };
            
            // 3. NON-BLOCKING Redis operations (fire and forget)
            if (this.redis) {
                setImmediate(() => this.asyncCacheUpdate(senderId, receiverId, message));
            }

            const duration = Date.now() - startTime;
            
            return {
                success: true,
                messageId: dbMessage.id,
                message,
                performance: { duration, source: 'instant' }
            };

        } catch (error) {
            console.error('❌ Error sending message:', error);
            throw error;
        }
    }

    // SUPER-FAST real_name lookup with aggressive caching
    async getFastUsername(userId) {
        if (this.redis) {
            try {
                const cacheKey = `user:${userId}:real_name`;
                let real_name = await this.redis.get(cacheKey);
                
                if (real_name) {
                    return real_name;
                }
                
                // Quick DB lookup and cache for 24 hours
                const result = await this.db.query('SELECT real_name FROM users WHERE id = $1', [userId]);
                real_name = result.rows[0]?.real_name || 'Unknown';
                
                // Long cache (real_names rarely change)
                this.redis.setEx(cacheKey, 86400, real_name).catch(() => {});
                return real_name;

        } catch (error) {
                // Cache lookup failed, using database
            }
        }
        
        // Fallback to direct database
        const result = await this.db.query('SELECT real_name FROM users WHERE id = $1', [userId]);
        return result.rows[0]?.real_name || 'Unknown';
    }

    // NON-BLOCKING cache update (runs in background)
    async asyncCacheUpdate(senderId, receiverId, message) {
        try {
            const chatRoomId = this.getChatRoomId(senderId, receiverId);
            
            const pipeline = this.redis.multi();
            
            // Conversation cache (keep last 50 messages)
            pipeline.lPush(`${chatRoomId}:messages`, JSON.stringify(message));
            pipeline.lTrim(`${chatRoomId}:messages`, 0, 49);
            pipeline.expire(`${chatRoomId}:messages`, this.CACHE_TTL);
            
            // Unread counter
            pipeline.incr(`unread:${receiverId}`);
            pipeline.expire(`unread:${receiverId}`, 86400);
            
            // Execute all at once
            await pipeline.exec();
            
                            } catch (error) {
            // Background cache update failed (non-critical)
        }
    }

    // Optimized conversation retrieval with Redis caching and attachment support
    async getConversation(userId1, userId2, limit = 10, offset = 0) {
        const startTime = Date.now();
        const chatRoomId = this.getChatRoomId(userId1, userId2);
        
        // Ensure limit is a valid number and cap at reasonable maximum
        const safeLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
        const safeOffset = Math.max(parseInt(offset) || 0, 0);
        
        try {
            // 🔍 CRITICAL: Check if conversation has attachments OR recalled messages
            const criticalCheckQuery = `
                SELECT 
                    COUNT(*) FILTER (WHERE attachment_count > 0) as attachment_count,
                    COUNT(*) FILTER (WHERE recall_type IN ('soft', 'hard')) as recalled_count
                FROM user_messages 
                WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
                AND deleted_by_sender = false 
                AND deleted_by_receiver = false
                AND COALESCE(message_type, 'text') != 'like'
            `;
            
            const criticalCheck = await this.db.query(criticalCheckQuery, [userId1, userId2]);
            const hasAttachments = parseInt(criticalCheck.rows[0].attachment_count) > 0;
            const hasRecalledMessages = parseInt(criticalCheck.rows[0].recalled_count) > 0;
            
            // 1. Try Redis cache first (ONLY if no attachments AND no recalled messages AND offset=0 - never use cache for pagination)
            // IMPORTANT: Skip Redis cache for pagination (offset > 0) to always fetch fresh from database
            if (!hasAttachments && !hasRecalledMessages && this.redis && safeOffset === 0 && safeLimit <= 100) {
                const cachedMessages = await this.redis.lRange(`${chatRoomId}:messages`, 0, safeLimit - 1);
                
                if (cachedMessages.length > 0) {
                    const messages = cachedMessages.map(msg => {
                        const parsed = JSON.parse(msg);
                        // Ensure is_read field exists for backward compatibility
                        if (parsed.is_read === undefined) {
                            parsed.is_read = false;
                        }
                        // Ensure recall fields exist for backward compatibility
                        if (parsed.recall_type === undefined) {
                            parsed.recall_type = 'none';
                        }
                        if (parsed.recalled_at === undefined) {
                            parsed.recalled_at = null;
                        }
                        // Ensure reply data exists for backward compatibility
                        if (parsed.replyTo === undefined) {
                            parsed.replyTo = null;
                        }
                        
                        return parsed;
                    }).reverse();
                    
                    const duration = Date.now() - startTime;
                    
                    return {
                        messages,
                        source: 'redis',
                        performance: { duration, cached: true }
                    };
                }
            }

            // 2. Enhanced database query with attachment support, recall fields, and reply information
            // Include soft-deleted messages (deleted_by_sender = true) if they are saved by receiver
            // But exclude hard-deleted messages (recall_type = 'hard')
            // Logic: Receiver can save soft-deleted messages, but not hard-deleted messages
            // FIX: Use subquery to ensure consistent pagination - ORDER BY must be applied before LIMIT/OFFSET
            const result = await this.db.query(`
                SELECT * FROM (
                    SELECT m.id, m.sender_id, m.receiver_id, m.message, m.timestamp, m.status,
                           m.attachment_count, m.is_read, m.recall_type, m.recalled_at,
                           m.reply_to_id, m.reply_to_text, m.reply_to_sender,
                           u1.real_name as sender_real_name
                    FROM user_messages m
                    LEFT JOIN users u1 ON m.sender_id = u1.id
                    WHERE ((m.sender_id = $1 AND m.receiver_id = $2) 
                       OR (m.sender_id = $2 AND m.receiver_id = $1))
                       AND (
                           -- Normal case: not deleted by sender
                           m.deleted_by_sender = false
                           OR
                           -- Exception: soft-deleted by sender BUT saved by receiver (receiver can save soft-deleted messages)
                           -- Only include if current user (userId1) is the receiver who saved it
                           (m.deleted_by_sender = true 
                            AND m.saved_by_receiver = true 
                            AND m.receiver_id = $1)
                       )
                       AND m.deleted_by_receiver = false
                       AND COALESCE(m.message_type, 'text') != 'like'
                       -- Exclude hard-deleted messages (receiver cannot save hard-deleted messages)
                       AND (COALESCE(m.recall_type, 'none') = 'none' OR COALESCE(m.recall_type, 'none') = 'soft')
                    ORDER BY m.timestamp DESC 
                ) AS ordered_messages
                    LIMIT $3 OFFSET $4
                `, [userId1, userId2, safeLimit, safeOffset]);

            // 3. Process messages and get attachments for messages that have them
            const messages = [];
            
            for (const row of result.rows) {
                const message = {
                    id: row.id,
                    senderId: row.sender_id,
                    receiverId: row.receiver_id,
                    content: row.message,
                    timestamp: new Date(row.timestamp).getTime(),
                    status: row.status,
                    senderUsername: row.sender_real_name || 'Unknown',
                    attachment_count: row.attachment_count || 0,
                    attachments: [],
                    // CRITICAL: Include read status from database for proper unread filtering
                    is_read: row.is_read || false,
                    // CRITICAL: Include recall fields from database
                    recall_type: row.recall_type || 'none',
                    recalled_at: row.recalled_at || null,
                    // Include reply information from database
                    replyTo: row.reply_to_id ? {
                        id: row.reply_to_id,
                        text: row.reply_to_text,
                        senderId: row.reply_to_sender
                    } : null
                };

                // Get attachments for messages that have them
                if (row.attachment_count > 0) {
                    const attachmentResult = await this.db.query(`
                        SELECT ma.id, ma.attachment_type, ma.original_filename, ma.stored_filename, 
                               ma.file_path, ma.thumbnail_path, ma.file_size, ma.mime_type, ma.width, ma.height
                        FROM user_message_attachments ma
                        INNER JOIN user_messages m ON ma.message_id = m.id
                        WHERE ma.message_id = $1 AND ma.is_deleted = false
                        AND ((m.sender_id = $2 AND m.receiver_id = $3) OR (m.sender_id = $3 AND m.receiver_id = $2))
                        ORDER BY ma.uploaded_at ASC
                    `, [row.id, userId1, userId2]);
                    
                    // Filter out attachments with missing files
                    message.attachments = this.filterValidAttachments(attachmentResult.rows);
                }
                
                // ⚠️ CRITICAL: Fetch attachments for replied-to messages
                if (message.replyTo && message.replyTo.id) {
                    const replyAttachmentResult = await this.db.query(`
                        SELECT ma.attachment_type, ma.original_filename, ma.stored_filename,
                               ma.file_path, ma.thumbnail_path, ma.file_size
                        FROM user_message_attachments ma
                        WHERE ma.message_id = $1 AND ma.is_deleted = false
                        ORDER BY ma.uploaded_at ASC
                    `, [message.replyTo.id]);
                    
                    // Filter out attachments with missing files
                    const validReplyAttachments = this.filterValidAttachments(replyAttachmentResult.rows);
                    
                    if (validReplyAttachments.length > 0) {
                        message.replyTo.hasImage = validReplyAttachments.some(att => att.attachment_type === 'image');
                        message.replyTo.attachments = validReplyAttachments.map(att => ({
                            attachment_type: att.attachment_type,
                            original_filename: att.original_filename,
                            stored_filename: att.stored_filename,
                            file_path: att.file_path,
                            thumbnail_path: att.thumbnail_path,
                            file_size: att.file_size
                        }));
                    } else {
                        message.replyTo.hasImage = false;
                        message.replyTo.attachments = [];
                    }
                }
                
                messages.push(message);
            }
            
            messages.reverse(); // Most recent first

            // 4. Cache recent messages in Redis for next time (ONLY if no attachments)
            if (!hasAttachments && this.redis && offset === 0 && messages.length > 0) {
                const pipeline = this.redis.multi();
                
                // Cache messages without attachment data (newest first)
                const messagesToCache = messages.slice(0, 100).reverse();
                for (const message of messagesToCache) {
                    // Don't cache attachment data in Redis - it's too complex and varies
                    const cacheMessage = {
                        id: message.id,
                        senderId: message.senderId,
                        receiverId: message.receiverId,
                        content: message.content,
                        timestamp: message.timestamp,
                        status: message.status,
                        senderUsername: message.senderUsername,
                        is_read: message.is_read || false,
                        recall_type: message.recall_type || 'none',
                        recalled_at: message.recalled_at || null,
                        // Include reply data in Redis cache
                        replyTo: message.replyTo || null
                    };
                    
                    pipeline.lPush(`${chatRoomId}:messages`, JSON.stringify(cacheMessage));
                }
                pipeline.lTrim(`${chatRoomId}:messages`, 0, 99);
                pipeline.expire(`${chatRoomId}:messages`, this.CACHE_TTL);
                
                await pipeline.exec();
            }

            const duration = Date.now() - startTime;
            
            return {
                messages,
                source: 'database',
                performance: { duration, cached: false }
            };

        } catch (error) {
            console.error('❌ Error retrieving conversation:', error);
            throw error;
        }
    }

    // Batch real_name lookup with Redis caching
    async getUsernamesBatch(userIds) {
        if (!userIds || userIds.length === 0) return {};
        
        const real_names = {};
        const uncachedIds = [];

        // 1. Try to get from Redis cache
        if (this.redis) {
            const pipeline = this.redis.multi();
            for (const userId of userIds) {
                pipeline.get(`user:${userId}:real_name`);
            }
            
            try {
                const cachedResults = await pipeline.exec();
                
                for (let i = 0; i < userIds.length; i++) {
                    const userId = userIds[i];
                    const cachedResult = cachedResults && cachedResults[i];
                    
                    // Check if the result exists and has no error
                    if (cachedResult && cachedResult[0] === null && cachedResult[1]) {
                        real_names[userId] = cachedResult[1];
                    } else {
                        uncachedIds.push(userId);
                    }
                }
            } catch (redisError) {
                uncachedIds.push(...userIds);
            }
        } else {
            uncachedIds.push(...userIds);
        }

        // 2. Get uncached real_names from database
        if (uncachedIds.length > 0) {
            const result = await this.db.query(`
                SELECT id, real_name FROM users WHERE id = ANY($1)
            `, [uncachedIds]);

            // 3. Cache results in Redis
            if (this.redis) {
                const pipeline = this.redis.multi();
                for (const row of result.rows) {
                    real_names[row.id] = row.real_name;
                    pipeline.setEx(`user:${row.id}:real_name`, 3600, row.real_name); // 1 hour cache
                }
                await pipeline.exec();
            } else {
                for (const row of result.rows) {
                    real_names[row.id] = row.real_name;
                }
            }
        }

        return real_names;
    }

    // Get unread message count with Redis optimization
    async getUnreadCount(userId) {
        try {
            // Try Redis first
            if (this.redis) {
                const cached = await this.redis.get(`unread:${userId}`);
                if (cached !== null) {
                    return parseInt(cached);
                }
            }

            // Fallback to optimized database query
            const result = await this.db.query(`
                SELECT COUNT(*) as count 
                FROM user_messages 
                WHERE receiver_id = $1 
                  AND read_at IS NULL
                  AND deleted_by_receiver = FALSE
                  AND timestamp > NOW() - INTERVAL '30 days'
                  AND COALESCE(message_type, 'text') != 'like'
            `, [userId]);

            const count = parseInt(result.rows[0].count);

            // Cache result
            if (this.redis) {
                await this.redis.setEx(`unread:${userId}`, 300, count); // 5 minutes
            }

            return count;

        } catch (error) {
            console.error('❌ Error getting unread count:', error);
            return 0;
        }
    }

    // Mark messages as read with batch optimization
    async markMessagesAsRead(userId, senderId) {
        const startTime = Date.now();
        
        try {
            // Update database
            const result = await this.db.query(`
                UPDATE user_messages 
                SET status = 'read'
                WHERE receiver_id = $1 
                  AND sender_id = $2 
                  AND status IN ('sent', 'delivered')
                  AND deleted_by_receiver = FALSE
                  AND COALESCE(message_type, 'text') != 'like'
            `, [userId, senderId]);

            const updatedCount = result.rowCount;

            // Update Redis cache
            if (this.redis && updatedCount > 0) {
                const pipeline = this.redis.multi();
                
                // Decrease unread counter
                pipeline.decrby(`unread:${userId}`, updatedCount);
                
                // Update cached conversation messages
                const chatRoomId = this.getChatRoomId(userId, senderId);
                const cachedMessages = await this.redis.lRange(`${chatRoomId}:messages`, 0, -1);
                
                if (cachedMessages.length > 0) {
                    // Update status in cached messages
                    const updatedMessages = cachedMessages.map(msgStr => {
                        const msg = JSON.parse(msgStr);
                        if (msg.senderId === senderId && msg.receiverId === userId && 
                            (msg.status === 'sent' || msg.status === 'delivered')) {
                            msg.status = 'read';
                        }
                        return JSON.stringify(msg);
                    });
                    
                    // Replace cached messages
                    pipeline.del(`${chatRoomId}:messages`);
                    for (const msgStr of updatedMessages.reverse()) {
                        pipeline.rPush(`${chatRoomId}:messages`, msgStr);
                    }
                    pipeline.expire(`${chatRoomId}:messages`, this.CACHE_TTL);
                }
                
                await pipeline.exec();
            }

            const duration = Date.now() - startTime;

            return { success: true, updatedCount, performance: { duration } };

        } catch (error) {
            console.error('❌ Error marking messages as read:', error);
            throw error;
        }
    }

    // Search messages with full-text search
    async searchMessages(userId, query, limit = 20) {
        const startTime = Date.now();
        
        try {
            const searchQuery = `
                SELECT m.id, m.sender_id, m.receiver_id, m.message, m.timestamp, m.status,
                       u.real_name as sender_real_name
                FROM user_messages m
                JOIN users u ON m.sender_id = u.id
                WHERE (m.sender_id = $1 OR m.receiver_id = $1)
                AND m.message ILIKE $2
                AND m.deleted_by_receiver = false
                AND COALESCE(m.message_type, 'text') != 'like'
                ORDER BY m.timestamp DESC
                LIMIT $3
            `;
            
            const result = await this.db.query(searchQuery, [userId, `%${query}%`, limit]);
            
            const messages = result.rows.map(row => ({
                id: row.id,
                senderId: row.sender_id,
                receiverId: row.receiver_id,
                content: row.message,
                timestamp: new Date(row.timestamp).getTime(),
                status: row.status,
                sender_real_name: row.sender_real_name
            }));
            
            const duration = Date.now() - startTime;
            return {
                success: true,
                messages,
                performance: { duration, source: 'search' }
            };
            
        } catch (error) {
            console.error('Error searching messages:', error);
            throw error;
        }
    }

    async getInboxMessages(userId, page = 1, limit = 20, sort = 'date') {
        const startTime = Date.now();
        
        try {
            const offset = (page - 1) * limit;
            
            // Enhanced sorting logic
            let orderBy = 'ORDER BY m.timestamp DESC'; // default: newest first
            if (sort === 'name_asc') {
                orderBy = 'ORDER BY LOWER(u.real_name) ASC, m.timestamp DESC';
            } else if (sort === 'name_desc') {
                orderBy = 'ORDER BY LOWER(u.real_name) DESC, m.timestamp DESC';
            } else if (sort === 'name') {
                orderBy = 'ORDER BY LOWER(u.real_name) ASC, m.timestamp DESC';
            } else if (sort === 'date') {
                orderBy = 'ORDER BY m.timestamp DESC';
            } else if (sort === 'date_asc') {
                orderBy = 'ORDER BY m.timestamp ASC';
            }

            // Build WHERE clause for status filtering
            let whereClause = 'WHERE m.receiver_id = $1 AND m.deleted_by_receiver = false AND COALESCE(m.message_type, \'text\') != \'like\'';
            let queryParams = [userId];
            
            if (sort === 'status') {
                whereClause += ' AND m.read_at IS NULL';
            } else if (sort === 'status_asc') {
                whereClause += ' AND m.read_at IS NOT NULL';
            }

            // Get total count first
            const countResult = await this.db.query(`
                SELECT COUNT(*) as total_count 
                FROM user_messages m
                ${whereClause}
            `, queryParams);
            
            const totalCount = parseInt(countResult.rows[0].total_count) || 0;
            const totalPages = Math.ceil(totalCount / limit);

            // Get received messages (inbox) with sender profile images
            let result;
            try {
                result = await this.db.query(`
                    SELECT m.id, m.sender_id, m.receiver_id, m.message, m.timestamp, m.status,
                           m.read_at, m.is_read, m.saved, 
                           CASE 
                               WHEN u.real_name = 'Deleted User' THEN 'Deleted User'
                               ELSE u.real_name
                           END as sender_real_name,
                           CASE 
                               WHEN u.real_name = 'Deleted User' THEN '/assets/images/account_deactivated.svg'
                               ELSE COALESCE(ui.file_name, NULL)
                           END as sender_image,
                           CASE 
                               WHEN u.real_name = 'Deleted User' THEN true
                               ELSE false
                           END as is_sender_deleted
                    FROM user_messages m
                    JOIN users u ON m.sender_id = u.id
                    LEFT JOIN user_images ui ON ui.user_id = u.id AND (ui.is_profile = 1 OR ui.is_profile IS NULL)
                    WHERE m.deleted_by_receiver = false
                    ${whereClause}
                    ${orderBy}
                    LIMIT $2 OFFSET $3
                `, [...queryParams, limit, offset]);
            } catch (error) {
                // If user_images table doesn't exist, fall back to basic query
                result = await this.db.query(`
                    SELECT m.id, m.sender_id, m.receiver_id, m.message, m.timestamp, m.status,
                           m.read_at, m.is_read, m.saved,
                           CASE 
                               WHEN u.real_name = 'Deleted User' THEN 'Deleted User'
                               ELSE u.real_name
                           END as sender_real_name,
                           CASE 
                               WHEN u.real_name = 'Deleted User' THEN '/assets/images/account_deactivated.svg'
                               ELSE NULL
                           END as sender_image,
                           CASE 
                               WHEN u.real_name = 'Deleted User' THEN true
                               ELSE false
                           END as is_sender_deleted
                    FROM user_messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.deleted_by_receiver = false
                    ${whereClause}
                    ${orderBy}
                    LIMIT $2 OFFSET $3
                `, [...queryParams, limit, offset]);
            }

            const messages = result.rows.map(row => {
                return {
                    id: row.id,
                    senderId: row.sender_id,
                    receiverId: row.receiver_id,
                    content: row.message,
                    timestamp: new Date(row.timestamp).getTime(),
                    status: row.status,
                    sender_real_name: row.sender_real_name,
                    sender_avatar: row.is_sender_deleted 
                        ? '/assets/images/account_deactivated.svg'
                        : this.getProfileImagePath(row.sender_id, row.sender_image),
                    is_sender_deleted: row.is_sender_deleted || false,
                    read_at: row.read_at,
                    is_read: row.is_read || false,
                    saved: row.saved || false
                };
            });

            const duration = Date.now() - startTime;
            return {
                success: true,
                messages: messages,
                pagination: {
                    total_count: totalCount,
                    current_page: page,
                    total_pages: totalPages,
                    has_next: page < totalPages,
                    has_prev: page > 1,
                    limit: limit
                },
                performance: { duration, source: 'inbox' }
            };

        } catch (error) {
            console.error('Error loading inbox messages:', error);
            throw error;
        }
    }

    async getSentMessages(userId, page = 1, limit = 20, sort = 'date') {
        const startTime = Date.now();
        
        try {
            const offset = (page - 1) * limit;
            
            // Enhanced sorting logic
            let orderBy = 'ORDER BY m.timestamp DESC'; // default: newest first
            if (sort === 'name_asc') {
                orderBy = 'ORDER BY LOWER(u.real_name) ASC, m.timestamp DESC';
            } else if (sort === 'name_desc') {
                orderBy = 'ORDER BY LOWER(u.real_name) DESC, m.timestamp DESC';
            } else if (sort === 'name') {
                orderBy = 'ORDER BY LOWER(u.real_name) ASC, m.timestamp DESC';
            } else if (sort === 'date') {
                orderBy = 'ORDER BY m.timestamp DESC';
            } else if (sort === 'date_asc') {
                orderBy = 'ORDER BY m.timestamp ASC';
            }

            // Build WHERE clause for status filtering
            let whereClause = 'WHERE m.sender_id = $1 AND m.deleted_by_sender = false AND COALESCE(m.message_type, \'text\') != \'like\'';
            let queryParams = [userId];
            
            if (sort === 'status') {
                whereClause += ' AND m.read_at IS NULL';
            } else if (sort === 'status_asc') {
                whereClause += ' AND m.read_at IS NOT NULL';
            }

            // Get total count first
            const countResult = await this.db.query(`
                SELECT COUNT(*) as total_count 
                FROM user_messages m
                ${whereClause}
            `, queryParams);
            
            const totalCount = parseInt(countResult.rows[0].total_count) || 0;
            const totalPages = Math.ceil(totalCount / limit);

            // Get sent messages with receiver profile images
            let result;
            try {
                result = await this.db.query(`
                    SELECT m.id, m.sender_id, m.receiver_id, m.message, m.timestamp, m.status,
                           m.read_at, m.is_read, m.saved, u.real_name as receiver_real_name,
                           COALESCE(ui.file_name, NULL) as receiver_image
                    FROM user_messages m
                    JOIN users u ON m.receiver_id = u.id
                    LEFT JOIN user_images ui ON ui.user_id = u.id AND (ui.is_profile = 1 OR ui.is_profile IS NULL)
                    ${whereClause}
                    ${orderBy}
                    LIMIT $2 OFFSET $3
                `, [...queryParams, limit, offset]);
            } catch (error) {
                // If user_images table doesn't exist, fall back to basic query
                result = await this.db.query(`
                    SELECT m.id, m.sender_id, m.receiver_id, m.message, m.timestamp, m.status,
                           m.read_at, m.is_read, m.saved, u.real_name as receiver_real_name,
                           NULL as receiver_image
                    FROM user_messages m
                    JOIN users u ON m.receiver_id = u.id
                    ${whereClause}
                    ${orderBy}
                    LIMIT $2 OFFSET $3
                `, [...queryParams, limit, offset]);
            }

            const messages = result.rows.map(row => {
                return {
                    id: row.id,
                    senderId: row.sender_id,
                    receiverId: row.receiver_id,
                    content: row.message,
                    timestamp: new Date(row.timestamp).getTime(),
                    status: row.status,
                    receiver_real_name: row.receiver_real_name,
                    receiver_avatar: this.getProfileImagePath(row.receiver_id, row.receiver_image),
                    read_at: row.read_at,
                    is_read: row.is_read || false,
                    saved: row.saved || false
                };
            });

            const duration = Date.now() - startTime;
            return {
                success: true,
                messages: messages,
                pagination: {
                    total_count: totalCount,
                    current_page: page,
                    total_pages: totalPages,
                    has_next: page < totalPages,
                    has_prev: page > 1,
                    limit: limit
                },
                performance: { duration, source: 'sent' }
            };

        } catch (error) {
            console.error('Error loading sent messages:', error);
            throw error;
        }
    }

    async getSavedMessages(userId, page = 1, limit = 20, sort = 'date') {
        const startTime = Date.now();
        
        try {
            const offset = (page - 1) * limit;
            
            // Enhanced sorting logic
            // For saved messages, we only need to sort by sender real_name (u1) since receiver is always the current user
            let orderBy = 'ORDER BY m.timestamp DESC'; // default: newest first
            if (sort === 'name_asc') {
                orderBy = 'ORDER BY LOWER(u1.real_name) ASC, m.timestamp DESC';
            } else if (sort === 'name_desc') {
                orderBy = 'ORDER BY LOWER(u1.real_name) DESC, m.timestamp DESC';
            } else if (sort === 'name') {
                orderBy = 'ORDER BY LOWER(u1.real_name) ASC, m.timestamp DESC';
            } else if (sort === 'date') {
                orderBy = 'ORDER BY m.timestamp DESC';
            } else if (sort === 'date_asc') {
                orderBy = 'ORDER BY m.timestamp ASC';
            }

            let usePerUserFlags = true;
            let totalCount = 0;
            
            // First try per-user saved flags. If columns don't exist, fall back to legacy m.saved
            try {
                                    const countResult = await this.db.query(`
                        SELECT COUNT(*) as total_count 
                        FROM user_messages m
                        WHERE m.receiver_id = $1
                        AND COALESCE(m.saved_by_receiver, false) = true
                        AND COALESCE(m.deleted_by_receiver, false) = false
                        AND (COALESCE(m.recall_type, 'none') = 'none' OR COALESCE(m.recall_type, 'none') = 'soft')
                        AND COALESCE(m.message_type, 'text') != 'like'
                    `, [userId]);
                totalCount = parseInt(countResult.rows[0].total_count) || 0;
            } catch (err) {
                // 42703 = undefined_column in Postgres
                if (err && (err.code === '42703' || /column .* does not exist/i.test(err.message))) {
                    usePerUserFlags = false;
                    const countFallback = await this.db.query(`
                        SELECT COUNT(*) as total_count 
                        FROM user_messages m
                        WHERE (m.sender_id = $1 OR m.receiver_id = $1)
                        AND COALESCE(m.saved, false) = true
                        AND (
                            (m.sender_id = $1 AND COALESCE(m.deleted_by_sender, false) = false)
                            OR (m.receiver_id = $1 AND COALESCE(m.deleted_by_receiver, false) = false)
                        )
                        AND (COALESCE(m.recall_type, 'none') = 'none' OR COALESCE(m.recall_type, 'none') = 'soft')
                        AND COALESCE(m.message_type, 'text') != 'like'
                    `, [userId]);
                    totalCount = parseInt(countFallback.rows[0].total_count) || 0;
                } else {
                    throw err;
                }
            }

            const totalPages = Math.ceil(totalCount / limit);

            let result;
            try {
                if (usePerUserFlags) {
                    result = await this.db.query(`
                        SELECT m.id, m.sender_id, m.receiver_id, m.message, m.timestamp, m.status,
                               m.read_at, m.is_read, m.recall_type,
                               true AS saved,
                               u1.real_name as other_real_name,
                               ui1.file_name as other_image
                        FROM user_messages m
                        JOIN users u1 ON m.sender_id = u1.id
                        LEFT JOIN user_images ui1 ON ui1.user_id = u1.id AND ui1.is_profile = 1
                        WHERE m.receiver_id = $1
                        AND COALESCE(m.saved_by_receiver, false) = true
                        AND COALESCE(m.deleted_by_receiver, false) = false
                        AND (COALESCE(m.recall_type, 'none') = 'none' OR COALESCE(m.recall_type, 'none') = 'soft')
                        AND COALESCE(m.message_type, 'text') != 'like'
                        ${orderBy}
                        LIMIT $2 OFFSET $3
                    `, [userId, limit, offset]);
                } else {
                    result = await this.db.query(`
                        SELECT m.id, m.sender_id, m.receiver_id, m.message, m.timestamp, m.status,
                               m.read_at, m.is_read, m.recall_type,
                               true AS saved,
                               u1.real_name as other_real_name,
                               ui1.file_name as other_image
                        FROM user_messages m
                        JOIN users u1 ON m.sender_id = u1.id
                        LEFT JOIN user_images ui1 ON ui1.user_id = u1.id AND ui1.is_profile = 1
                        WHERE m.receiver_id = $1
                        AND COALESCE(m.saved, false) = true
                        AND COALESCE(m.deleted_by_receiver, false) = false
                        AND (COALESCE(m.recall_type, 'none') = 'none' OR COALESCE(m.recall_type, 'none') = 'soft')
                        AND COALESCE(m.message_type, 'text') != 'like'
                        ${orderBy}
                        LIMIT $2 OFFSET $3
                    `, [userId, limit, offset]);
                }
            } catch (err) {
                // If per-user path failed for undefined columns, switch to fallback once
                if (usePerUserFlags && err && (err.code === '42703' || /column .* does not exist/i.test(err.message))) {
                    usePerUserFlags = false;
                    result = await this.db.query(`
                        SELECT m.id, m.sender_id, m.receiver_id, m.message, m.timestamp, m.status,
                               m.read_at, m.is_read, m.recall_type,
                               COALESCE(m.saved, false) AS saved,
                               CASE 
                                   WHEN m.sender_id = $1 THEN u2.real_name
                                   ELSE u1.real_name
                               END as other_real_name,
                               CASE 
                                   WHEN m.sender_id = $1 THEN ui2.file_name
                                   ELSE ui1.file_name
                               END as other_image
                        FROM user_messages m
                        JOIN users u1 ON m.sender_id = u1.id
                        JOIN users u2 ON m.receiver_id = u2.id
                        LEFT JOIN user_images ui1 ON ui1.user_id = u1.id AND ui1.is_profile = 1
                        LEFT JOIN user_images ui2 ON ui2.user_id = u2.id AND ui2.is_profile = 1
                        WHERE (m.sender_id = $1 OR m.receiver_id = $1)
                        AND COALESCE(m.saved, false) = true
                        AND (
                            (m.sender_id = $1 AND COALESCE(m.deleted_by_sender, false) = false)
                            OR (m.receiver_id = $1 AND COALESCE(m.deleted_by_receiver, false) = false)
                        )
                        AND (COALESCE(m.recall_type, 'none') = 'none' OR COALESCE(m.recall_type, 'none') = 'soft')
                        AND COALESCE(m.message_type, 'text') != 'like'
                        ${orderBy}
                        LIMIT $2 OFFSET $3
                    `, [userId, limit, offset]);
                } else {
                    throw err;
                }
            }

            const messages = result.rows.map(row => ({
                id: row.id,
                senderId: row.sender_id,
                receiverId: row.receiver_id,
                content: row.message,
                timestamp: new Date(row.timestamp).getTime(),
                status: row.status,
                other_real_name: row.other_real_name,
                other_avatar: row.other_image ? `/uploads/profile_images/${row.other_image}` : '/assets/images/default_profile_male.svg',
                read_at: row.read_at,
                is_read: row.is_read || false,
                saved: !!row.saved,
                is_sent_by_me: row.sender_id === parseInt(userId),
                recall_type: row.recall_type || 'none'
            }));

            const duration = Date.now() - startTime;
            return {
                success: true,
                messages: messages,
                pagination: {
                    total_count: totalCount,
                    current_page: page,
                    total_pages: totalPages,
                    has_next: page < totalPages,
                    has_prev: page > 1,
                    limit: limit
                },
                performance: { duration, source: 'saved' }
            };

        } catch (error) {
            console.error('Error loading saved messages:', error);
            throw error;
        }
    }

    async deleteMessage(messageId, userId, deleteType = 'for_me') {
        const startTime = Date.now();
        
        try {
            // Check if user has access to this message
            // CRITICAL: Do NOT check recall_type - only use is_read to determine behavior
            // IMPORTANT: Include is_read in SELECT to use it as sole source of truth
            const checkQuery = `
                SELECT id, sender_id, receiver_id, attachment_count, 
                       COALESCE(is_read, false) as is_read
                FROM user_messages 
                WHERE id = $1 
                AND ((sender_id = $2 AND deleted_by_sender = false) 
                     OR (receiver_id = $2 AND deleted_by_receiver = false))
            `;
            
            const checkResult = await this.db.query(checkQuery, [messageId, userId]);
            
            if (checkResult.rows.length === 0) {
                throw new Error('Message not found or access denied');
            }
            
            const message = checkResult.rows[0];
            const isSender = message.sender_id === parseInt(userId);
            const isReceiver = message.receiver_id === parseInt(userId);
            
            // For message recall (complete deletion), only the sender can do it
            if (deleteType === 'recall' && !isSender) {
                throw new Error('Only the sender can recall a message');
            }
            
            if (deleteType === 'recall') {
                // CRITICAL: Determine recall type based ONLY on is_read status
                // recall_type column plays NO role in this decision - ignore it completely
                // Use is_read as sole source of truth (not read_at, not recall_type)
                // is_read must be explicitly true or 1 to be considered read
                // Anything else (false, null, undefined, 0) means NOT read = hard delete
                const wasRead = message.is_read === true || message.is_read === 1;
                
                if (wasRead) {
                    // SOFT RECALL: Message was read, only mark as recalled
            await this.db.query(`
                UPDATE user_messages 
                        SET recalled_at = NOW(), 
                            recall_type = 'soft'
                        WHERE id = $1
                    `, [messageId]);
                    
                    const duration = Date.now() - startTime;
                    
                    return {
                        success: true,
                        message: 'Message recalled successfully',
                        type: 'soft_recall',
                        wasRead: true,
                        performance: { duration, source: 'soft_recall' }
                    };
                } else {
                    // HARD RECALL: Message not read, complete deletion
                    await this.completelyDeleteMessage(messageId, message.sender_id, message.receiver_id);
                    
                    const duration = Date.now() - startTime;
                    
                    return {
                        success: true,
                        message: 'Message recalled successfully',
                        type: 'hard_recall',
                        wasRead: false,
                        performance: { duration, source: 'hard_recall' }
                    };
                }
            } else {
                // SOFT DELETE: Mark as deleted for this user only
                let updateQuery = '';
                let updateParams = [];
                
                if (isSender) {
                    updateQuery = 'UPDATE user_messages SET deleted_by_sender = true WHERE id = $1';
                    updateParams = [messageId];
                } else if (isReceiver) {
                    updateQuery = 'UPDATE user_messages SET deleted_by_receiver = true WHERE id = $1';
                    updateParams = [messageId];
                } else {
                    throw new Error('User is neither sender nor receiver');
                }
                
                await this.db.query(updateQuery, updateParams);
                
                const duration = Date.now() - startTime;
                
                return {
                    success: true,
                    message: 'Message deleted successfully',
                    type: 'soft_delete',
                    performance: { duration, source: 'delete' }
                };
            }

        } catch (error) {
            console.error('Error deleting message:', error);
            throw error;
        }
    }

    async completelyDeleteMessage(messageId, senderId, receiverId) {
        try {
            // 1. Get all attachments for this message
            const attachmentsQuery = `
                SELECT id, file_path, thumbnail_path, original_filename
                FROM user_message_attachments 
                WHERE message_id = $1
            `;
            const attachmentsResult = await this.db.query(attachmentsQuery, [messageId]);
            const attachments = attachmentsResult.rows;
            
            // 2. Delete physical files
            let imageHandler;
            try {
                const ChatImageHandler = require('../utils/chatImageHandler');
                imageHandler = new ChatImageHandler();
            } catch (importError) {
                console.error('❌ Error importing ChatImageHandler:', importError);
                throw importError;
            }
            
            for (const attachment of attachments) {
                try {
                    await imageHandler.deleteImageFilesByPaths(
                        attachment.file_path, 
                        attachment.thumbnail_path
                    );
        } catch (error) {
                    console.error(`❌ Error deleting files for attachment ${attachment.id}:`, error);
                }
            }
            
            // 3. Delete the message from database (this will CASCADE delete attachments)
            await this.db.query('DELETE FROM user_messages WHERE id = $1', [messageId]);
            
            // 4. Clear Redis cache for both participants' conversations
            if (this.redis) {
                try {
                    const senderKey = `conversation:${Math.min(senderId, receiverId)}-${Math.max(senderId, receiverId)}`;
                    const conversationListSender = `conversations:${senderId}`;
                    const conversationListReceiver = `conversations:${receiverId}`;
                    
                    await this.redis.del(senderKey);
                    await this.redis.del(conversationListSender);
                    await this.redis.del(conversationListReceiver);
                } catch (redisError) {
                    // Could not clear Redis cache
                }
            }
            
        } catch (error) {
            console.error(`❌ Error in completelyDeleteMessage for message ${messageId}:`, error);
            throw error;
        }
    }

    // Performance monitoring method
    async getPerformanceStats() {
        try {
            const stats = {
                redis: {
                    connected: !!this.redis,
                    status: this.redis ? 'healthy' : 'disabled'
                },
                database: {
                    pool: {
                        total: this.db.totalCount,
                        idle: this.db.idleCount,
                        waiting: this.db.waitingCount
                    }
                }
            };

            if (this.redis) {
                const info = await this.redis.info('memory');
                stats.redis.memory = info.match(/used_memory_human:(.+)/)?.[1]?.trim();
            }

            return stats;

        } catch (error) {
            console.error('❌ Error getting performance stats:', error);
            return { error: error.message };
        }
    }
}

module.exports = MessageService;
