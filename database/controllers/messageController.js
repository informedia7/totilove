const { requireEmailVerification } = require('../../utils/emailVerificationCheck');
const { hydratePresenceStatuses, normalizeLastSeen } = require('../../utils/presenceStatusHelper');

class MessageController {
    constructor(db, messageService, io, presenceService = null) {
        this.db = db;
        this.messageService = messageService;
        this.io = io;
        this.presenceService = presenceService;
        this.optionalColumns = {
            usersLastSeenAt: null
        };
        
        // Message validation constants
        this.MESSAGE_CONFIG = {
            MAX_LENGTH: 2000, // Maximum characters per message
            FORBIDDEN_CHARS: /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, // Control characters except newline, tab, carriage return
            FORBIDDEN_PATTERNS: [
                /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
                /javascript:/gi, // JavaScript protocol
                /on\w+\s*=/gi, // Event handlers (onclick, onerror, etc.)
                /<iframe/gi, // Iframe tags
                /<object/gi, // Object tags
                /<embed/gi, // Embed tags
                /<link/gi, // Link tags
                /<meta/gi, // Meta tags
                /<style/gi // Style tags
            ]
        };

        // Initialize bad words filter
        const BadWordsFilter = require('../../utils/badWordsFilter');
        this.badWordsFilter = new BadWordsFilter(db);
        // Initialize asynchronously (don't block constructor)
        this.badWordsFilter.initialize().catch(err => {
            console.error('Failed to initialize bad words filter:', err);
        });
    }

    // Sanitize message content to prevent XSS attacks
    sanitizeMessage(text) {
        if (!text) return '';
        
        // Remove HTML tags (but preserve text content)
        let sanitized = text.replace(/<[^>]*>/g, '');
        
        // Remove forbidden patterns
        this.MESSAGE_CONFIG.FORBIDDEN_PATTERNS.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '');
        });
        
        // Remove control characters (except newline, tab, carriage return)
        sanitized = sanitized.replace(this.MESSAGE_CONFIG.FORBIDDEN_CHARS, '');
        
        // Escape remaining HTML entities
        sanitized = sanitized
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
        
        // Unescape common safe entities that users might want
        sanitized = sanitized
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'");
        
        return sanitized.trim();
    }

    // Validate message content
    async validateMessageContent(content) {
        if (!content || typeof content !== 'string') {
            return { valid: false, error: 'Content is required' };
        }

        const trimmed = content.trim();
        
        // Check length
        if (trimmed.length > this.MESSAGE_CONFIG.MAX_LENGTH) {
            return { 
                valid: false, 
                error: `Message is too long. Maximum ${this.MESSAGE_CONFIG.MAX_LENGTH} characters allowed.` 
            };
        }

        // Check for forbidden patterns
        for (const pattern of this.MESSAGE_CONFIG.FORBIDDEN_PATTERNS) {
            if (pattern.test(trimmed)) {
                return { 
                    valid: false, 
                    error: 'Message contains forbidden content. Please remove any scripts or HTML tags.' 
                };
            }
        }

        // Check for control characters (except allowed ones: newline, tab, carriage return)
        if (this.MESSAGE_CONFIG.FORBIDDEN_CHARS.test(trimmed)) {
            return { 
                valid: false, 
                error: 'Message contains invalid characters.' 
            };
        }

        // Check for bad words
        try {
            // Ensure bad words filter is initialized
            if (!this.badWordsFilter.initialized || !this.badWordsFilter.isCacheValid()) {
                await this.badWordsFilter.initialize();
            }
            
            const badWordsCheck = await this.badWordsFilter.validateMessage(trimmed);
            if (!badWordsCheck.valid) {
                return {
                    valid: false,
                    error: badWordsCheck.error
                };
            }
            // Use filtered text if bad words were replaced
            const finalText = badWordsCheck.filtered || trimmed;
            return { valid: true, sanitized: this.sanitizeMessage(finalText) };
        } catch (error) {
            // If bad words filter fails, continue with normal sanitization
            console.error('Error checking bad words:', error);
            return { valid: true, sanitized: this.sanitizeMessage(trimmed) };
        }
    }

    async sendMessage(req, res) {
        try {
            const { receiverId, receiverUsername, receiverName, content } = req.body;
            // Note: receiverUsername is kept for backward compatibility, but we prefer receiverName
            const receiverIdentifier = receiverName || receiverUsername;
            
            // Get sender ID from session/auth
            const senderId = req.headers['x-user-id'] || req.body.senderId;
            
            if (!senderId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Sender ID required' 
                });
            }

            // Check email verification - unverified users cannot send messages
            const verificationError = await requireEmailVerification(this.db, senderId);
            if (verificationError) {
                return res.status(403).json(verificationError);
            }

            // Allow empty content if files are present (for image-only messages)
            if (!content && (!req.files || req.files.length === 0)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Content or attachments required' 
                });
            }

            // Validate and sanitize content if provided
            let sanitizedContent = content;
            if (content && typeof content === 'string' && content.trim()) {
                const contentValidation = await this.validateMessageContent(content);
                if (!contentValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        error: contentValidation.error
                    });
                }
                sanitizedContent = contentValidation.sanitized;
            }

            let finalReceiverId = receiverId;

            // If receiverName/receiverUsername is provided but not receiverId, look up the user
            // Try to find by email first, then by real_name (since receiverIdentifier might be a name)
            if (!finalReceiverId && receiverIdentifier) {
                try {
                    // First try to find by email
                    let userResult = await this.db.query(
                        'SELECT id, real_name, email FROM users WHERE email = $1',
                        [receiverIdentifier]
                    );
                    
                    // If not found by email, try to find by real_name
                    if (userResult.rows.length === 0) {
                        userResult = await this.db.query(
                            'SELECT id, real_name, email FROM users WHERE real_name = $1',
                            [receiverIdentifier]
                        );
                    }
                    
                    if (userResult.rows.length === 0) {
                        return res.status(404).json({ 
                            success: false, 
                            error: 'User not found' 
                        });
                    }
                    
                    finalReceiverId = userResult.rows[0].id;
                } catch (error) {
                    console.error('Error looking up receiver:', error);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Error finding receiver' 
                    });
                }
            }

            if (!finalReceiverId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Receiver ID or name required' 
                });
            }

            // Prevent users from sending messages to themselves
            if (parseInt(senderId) === parseInt(finalReceiverId)) {
                return res.status(400).json({
                    success: false,
                    error: 'You cannot send messages to yourself',
                    code: 'SELF_MESSAGE'
                });
            }

            // Check if either user has blocked the other using utility function
            const BlockCheck = require('../../utils/blockCheck');
            const blockCheckUtil = new BlockCheck(this.db);
            const isBlocked = await blockCheckUtil.isBlocked(senderId, finalReceiverId);
            
            if (isBlocked) {
                const blockDetails = await blockCheckUtil.getBlockDetails(senderId, finalReceiverId);
                const isSenderBlocked = blockDetails && blockDetails.blocker_id === parseInt(finalReceiverId) && blockDetails.blocked_id === parseInt(senderId);
                const isReceiverBlocked = blockDetails && blockDetails.blocker_id === parseInt(senderId) && blockDetails.blocked_id === parseInt(finalReceiverId);
                
                if (isSenderBlocked) {
                    // Receiver has blocked the sender
                    return res.status(403).json({
                        success: false,
                        error: 'This user has blocked you. You cannot send messages to them.',
                        blocked: true,
                        code: 'BLOCKED_BY_RECEIVER'
                    });
                } else if (isReceiverBlocked) {
                    // Sender has blocked the receiver
                    return res.status(403).json({
                        success: false,
                        error: 'You have blocked this user. You cannot send messages to them.',
                        blocked: true,
                        code: 'BLOCKED_BY_SENDER'
                    });
                } else {
                    // Fallback
                    return res.status(403).json({
                        success: false,
                        error: 'Cannot send message to this user',
                        blocked: true,
                        code: 'BLOCKED'
                    });
                }
            }

            // Check if receiver requires profile photos and sender has profile photos
            const receiverSettings = await this.db.query(
                'SELECT require_photos FROM user_profile_settings WHERE user_id = $1',
                [finalReceiverId]
            );

            if (receiverSettings.rows.length > 0 && receiverSettings.rows[0].require_photos === true) {
                // Check if sender has at least one profile photo
                const senderPhotos = await this.db.query(
                    'SELECT COUNT(*) as photo_count FROM user_images WHERE user_id = $1 AND is_profile = true',
                    [senderId]
                );

                const photoCount = parseInt(senderPhotos.rows[0]?.photo_count || 0);
                if (photoCount === 0) {
                    return res.status(403).json({
                        success: false,
                        error: 'This user only accepts messages from users with profile photos',
                        code: 'REQUIRES_PROFILE_PHOTOS'
                    });
                }
            }
            
            // Process uploaded files if any
            let attachments = [];
            if (req.files && req.files.length > 0) {
                try {
                    const ChatImageHandler = require('../../utils/chatImageHandler');
                    const imageHandler = new ChatImageHandler();
                    
                    // Process each uploaded file
                    for (const file of req.files) {
                        // Generate unique filename
                        const filename = imageHandler.generateFilename(senderId, finalReceiverId, file.originalname);
                        
                        // Process image (resize, create thumbnail)
                        const imageData = await imageHandler.processImage(file.path, filename, senderId, finalReceiverId);
                        
                        attachments.push({
                            filename: filename,
                            originalName: file.originalname,
                            imagePath: imageData.imagePath,
                            thumbnailPath: imageData.thumbnailPath,
                            width: imageData.width,
                            height: imageData.height,
                            fileSize: imageData.fileSize,
                            mimeType: file.mimetype
                        });
                    }
                } catch (error) {
                    console.error('Error processing uploaded files:', error);
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to process uploaded files: ' + error.message
                    });
                }
            }
            
            // Extract reply information from request body
            const replyData = req.body.replyTo ? {
                id: req.body.replyTo.messageId || req.body.replyTo.id,
                text: req.body.replyTo.text,
                senderId: req.body.replyTo.senderId,
                hasImage: req.body.replyTo.hasImage || false,
                attachments: req.body.replyTo.attachments || []
            } : null;

            const result = await this.messageService.sendMessage(senderId, finalReceiverId, sanitizedContent || content, replyData);
            
            // If we have attachments and a successful message, save them to database
            if (result.success && result.message && attachments.length > 0) {
                const messageId = result.message.id || result.messageId;
                
                try {
                    // Save each attachment to database
                    for (const attachment of attachments) {
                        await this.db.query(
                            `INSERT INTO user_message_attachments 
                             (message_id, attachment_type, original_filename, stored_filename, file_path, thumbnail_path, 
                              file_size, mime_type, width, height, uploaded_by) 
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                            [
                                messageId, 'image', attachment.originalName, attachment.filename,
                                attachment.imagePath, attachment.thumbnailPath,
                                attachment.fileSize, attachment.mimeType,
                                attachment.width, attachment.height, senderId
                            ]
                        );
                    }
                    
                    // Update message attachment count
                    await this.db.query(
                        'UPDATE user_messages SET attachment_count = $1 WHERE id = $2',
                        [attachments.length, messageId]
                    );
                    
                    console.log(`✅ Saved ${attachments.length} attachments for message ${messageId}`);
                    
                } catch (dbError) {
                    console.error('Error saving attachments to database:', dbError);
                    // Don't fail the entire request, just log the error
                }
            }
            
                            // Emit real-time notification to the receiver
                if (result.success && (result.message || result.messageId)) {
                    // For image-only messages (when files are present), avoid sending placeholder text to receiver
                    const isImageOnly = (req.files && req.files.length > 0);

                    const baseMessageId = result.message?.id || result.messageId;
                    const messageForSocket = {
                        id: baseMessageId,
                        senderId: parseInt(senderId),
                        receiverId: parseInt(finalReceiverId),
                        // If image-only, send a single-space content to avoid rendering a visible placeholder
                        content: isImageOnly ? ' ' : (sanitizedContent || content),
                        timestamp: Date.now(),
                        sender_real_name: result.message?.sender_real_name || 'Unknown',
                        is_read: false,
                        source: 'http_api',
                        attachments: attachments.length > 0 ? attachments : undefined,
                        // Include reply information for the receiver
                        replyTo: replyData ? {
                            id: replyData.id,
                            text: replyData.text,
                            senderId: replyData.senderId,
                            hasImage: replyData.hasImage || false,
                            attachments: replyData.attachments || []
                        } : null
                    };

                    // Notify the receiver via WebSocket (single path handles both structures)
                    this.io.to(`user_${finalReceiverId}`).emit('new_message', messageForSocket);

                    // CRITICAL: Also emit to sender so they can see their message immediately in real-time
                    // Frontend handles this via isFromMeToPartner check in talk_realtime-messaging.js
                    this.io.to(`user_${senderId}`).emit('new_message', messageForSocket);

                    // Notify the sender to update their sent folder count
                    this.io.to(`user_${senderId}`).emit('message_sent_update', {
                        messageId: baseMessageId,
                        senderId: parseInt(senderId),
                        receiverId: parseInt(finalReceiverId)
                    });
                }
            
            res.json({
                success: true,
                message: result,
                messageId: result.message?.id || result.messageId || result.id,
                attachments: attachments.length > 0 ? attachments : undefined
            });
            
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    async sendImageMessage(req, res) {
        try {
            const { receiverId, receiverUsername, receiverName, content } = req.body;
            // Note: receiverUsername is kept for backward compatibility, but we prefer receiverName
            const receiverIdentifier = receiverName || receiverUsername;
            
            // Get sender ID from session/auth
            const senderId = req.headers['x-user-id'] || req.body.senderId;
            
            if (!senderId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Sender ID required' 
                });
            }

            // Check email verification - unverified users cannot send messages
            const verificationError = await requireEmailVerification(this.db, senderId);
            if (verificationError) {
                return res.status(403).json(verificationError);
            }

            // For image messages, content is optional but files are required
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'At least one image is required' 
                });
            }

            let finalReceiverId = receiverId;

            // If receiverName/receiverUsername is provided but not receiverId, look up the user
            // Try to find by email first, then by real_name (since receiverIdentifier might be a name)
            if (!finalReceiverId && receiverIdentifier) {
                try {
                    // First try to find by email
                    let userResult = await this.db.query(
                        'SELECT id, real_name, email FROM users WHERE email = $1',
                        [receiverIdentifier]
                    );
                    
                    // If not found by email, try to find by real_name
                    if (userResult.rows.length === 0) {
                        userResult = await this.db.query(
                            'SELECT id, real_name, email FROM users WHERE real_name = $1',
                            [receiverIdentifier]
                        );
                    }
                    
                    if (userResult.rows.length === 0) {
                        return res.status(404).json({ 
                            success: false, 
                            error: 'User not found' 
                        });
                    }
                    
                    finalReceiverId = userResult.rows[0].id;
                } catch (error) {
                    console.error('Error looking up receiver:', error);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Error finding receiver' 
                    });
                }
            }

            if (!finalReceiverId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Receiver ID or name required' 
                });
            }

            // Prevent users from sending messages to themselves
            if (parseInt(senderId) === parseInt(finalReceiverId)) {
                return res.status(400).json({
                    success: false,
                    error: 'You cannot send messages to yourself',
                    code: 'SELF_MESSAGE'
                });
            }

            // Check if either user has blocked the other using utility function
            const BlockCheck = require('../../utils/blockCheck');
            const blockCheckUtil = new BlockCheck(this.db);
            const isBlocked = await blockCheckUtil.isBlocked(senderId, finalReceiverId);
            
            if (isBlocked) {
                const blockDetails = await blockCheckUtil.getBlockDetails(senderId, finalReceiverId);
                const isSenderBlocked = blockDetails && blockDetails.blocker_id === parseInt(finalReceiverId) && blockDetails.blocked_id === parseInt(senderId);
                const isReceiverBlocked = blockDetails && blockDetails.blocker_id === parseInt(senderId) && blockDetails.blocked_id === parseInt(finalReceiverId);
                
                if (isSenderBlocked) {
                    // Receiver has blocked the sender
                    return res.status(403).json({
                        success: false,
                        error: 'This user has blocked you. You cannot send messages to them.',
                        blocked: true,
                        code: 'BLOCKED_BY_RECEIVER'
                    });
                } else if (isReceiverBlocked) {
                    // Sender has blocked the receiver
                    return res.status(403).json({
                        success: false,
                        error: 'You have blocked this user. You cannot send messages to them.',
                        blocked: true,
                        code: 'BLOCKED_BY_SENDER'
                    });
                } else {
                    // Fallback
                    return res.status(403).json({
                        success: false,
                        error: 'Cannot send message to this user',
                        blocked: true,
                        code: 'BLOCKED'
                    });
                }
            }

            // Check if receiver requires profile photos and sender has profile photos
            const receiverSettings = await this.db.query(
                'SELECT require_photos FROM user_profile_settings WHERE user_id = $1',
                [finalReceiverId]
            );

            if (receiverSettings.rows.length > 0 && receiverSettings.rows[0].require_photos === true) {
                // Check if sender has at least one profile photo
                const senderPhotos = await this.db.query(
                    'SELECT COUNT(*) as photo_count FROM user_images WHERE user_id = $1 AND is_profile = true',
                    [senderId]
                );

                const photoCount = parseInt(senderPhotos.rows[0]?.photo_count || 0);
                if (photoCount === 0) {
                    return res.status(403).json({
                        success: false,
                        error: 'This user only accepts messages from users with profile photos',
                        code: 'REQUIRES_PROFILE_PHOTOS'
                    });
                }
            }
            
            // Validate and sanitize content (caption) if provided
            let sanitizedContent = content;
            if (content && typeof content === 'string' && content.trim()) {
                const contentValidation = await this.validateMessageContent(content);
                if (!contentValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        error: contentValidation.error
                    });
                }
                sanitizedContent = contentValidation.sanitized;
            }

            // Process uploaded files
            let attachments = [];
            try {
                const ChatImageHandler = require('../../utils/chatImageHandler');
                const imageHandler = new ChatImageHandler();
                
                console.log(`🖼️ Processing ${req.files.length} image(s) for user ${senderId} to ${finalReceiverId}`);
                
                // Process each uploaded file
                for (const file of req.files) {
                    console.log(`📸 Processing file: ${file.originalname} (${file.size} bytes)`);
                    
                    // Generate unique filename
                    const filename = imageHandler.generateFilename(senderId, finalReceiverId, file.originalname);
                    
                    // Process image (resize, create thumbnail)
                    const imageData = await imageHandler.processImage(file.path, filename, senderId, finalReceiverId);
                    
                    console.log(`✅ Processed image: ${filename}`);
                    console.log(`   Image path: ${imageData.imagePath}`);
                    console.log(`   Thumbnail path: ${imageData.thumbnailPath}`);
                    console.log(`   Dimensions: ${imageData.width}x${imageData.height}`);
                    
                    attachments.push({
                        filename: filename,
                        originalName: file.originalname,
                        imagePath: imageData.imagePath,
                        thumbnailPath: imageData.thumbnailPath,
                        width: imageData.width,
                        height: imageData.height,
                        fileSize: imageData.fileSize,
                        mimeType: file.mimetype
                    });
                }
            } catch (error) {
                console.error('❌ Error processing uploaded files:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to process uploaded files: ' + error.message
                });
            }
            
            // Extract reply information from request body
            const replyData = req.body.replyTo ? {
                id: req.body.replyTo.messageId || req.body.replyTo.id,
                text: req.body.replyTo.text,
                senderId: req.body.replyTo.senderId,
                hasImage: req.body.replyTo.hasImage || false,
                attachments: req.body.replyTo.attachments || []
            } : null;

            // Create message with image content
            const imageMessageContent = sanitizedContent || '📷 Image';
            const result = await this.messageService.sendMessage(senderId, finalReceiverId, imageMessageContent, replyData);
            
            // Save attachments to database
            if (result.success && result.message && attachments.length > 0) {
                const messageId = result.message.id || result.messageId;
                
                try {
                    console.log(`💾 Saving ${attachments.length} attachments to database for message ${messageId}`);
                    
                    // Save each attachment to database
                    for (const attachment of attachments) {
                        await this.db.query(
                            `INSERT INTO user_message_attachments 
                             (message_id, attachment_type, original_filename, stored_filename, file_path, thumbnail_path, 
                              file_size, mime_type, width, height, uploaded_by) 
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                            [
                                messageId, 'image', attachment.originalName, attachment.filename,
                                attachment.imagePath, attachment.thumbnailPath,
                                attachment.fileSize, attachment.mimeType,
                                attachment.width, attachment.height, senderId
                            ]
                        );
                        
                        console.log(`✅ Saved attachment: ${attachment.filename}`);
                    }
                    
                    // Update message attachment count
                    await this.db.query(
                        'UPDATE user_messages SET attachment_count = $1 WHERE id = $2',
                        [attachments.length, messageId]
                    );
                    
                    console.log(`✅ Updated message ${messageId} with attachment_count = ${attachments.length}`);
                    
                } catch (dbError) {
                    console.error('❌ Error saving attachments to database:', dbError);
                    // Don't fail the entire request, just log the error
                }
            }
            
            // Emit real-time notification to the receiver
            if (result.success && result.message) {
                const messageForSocket = {
                    id: result.message.id || result.messageId,
                    senderId: parseInt(senderId),
                    receiverId: parseInt(finalReceiverId),
                    content: imageMessageContent,
                    timestamp: Date.now(),
                    sender_real_name: result.message.sender_real_name || 'Unknown',
                    is_read: false,
                    source: 'http_api',
                    attachments: attachments.length > 0 ? attachments : undefined,
                    // Include reply information for the receiver
                    replyTo: replyData ? {
                        id: replyData.id,
                        text: replyData.text,
                        senderId: replyData.senderId,
                        hasImage: replyData.hasImage || false,
                        attachments: replyData.attachments || []
                    } : null
                };
                
                // Notify the receiver via WebSocket
                this.io.to(`user_${finalReceiverId}`).emit('new_message', messageForSocket);
                
                // CRITICAL: Also emit to sender so they can see their message immediately in real-time
                // Frontend handles this via isFromMeToPartner check in talk_realtime-messaging.js
                this.io.to(`user_${senderId}`).emit('new_message', messageForSocket);
                
                // Notify the sender to update their sent folder count
                this.io.to(`user_${senderId}`).emit('message_sent_update', {
                    messageId: result.message.id || result.messageId,
                    senderId: parseInt(senderId),
                    receiverId: parseInt(finalReceiverId)
                });
            }
            
            res.json({
                success: true,
                message: result,
                messageId: result.message?.id || result.messageId || result.id,
                attachments: attachments.length > 0 ? attachments : undefined
            });
            
        } catch (error) {
            console.error('❌ Error in sendImageMessage:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to send image message: ' + error.message
            });
        }
    }

    async getConversation(req, res) {
        try {
            const { userId1, userId2 } = req.params;
            const { limit = 10, offset = 0 } = req.query;
            
            console.log(`🎯 Controller getConversation called for users ${userId1} and ${userId2}, limit: ${limit}, offset: ${offset}`);
            
            const result = await this.messageService.getConversation(userId1, userId2, parseInt(limit), parseInt(offset));
            
            console.log(`📊 MessageService returned ${result.messages.length} messages`);
            
            res.json({
                success: true,
                messages: result.messages,
                source: result.source,
                performance: result.performance
            });
        } catch (error) {
            console.error('❌ Error in getConversation controller:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getInboxMessages(req, res) {
        try {
            const userId = req.query.userId || req.query.user_id || req.params.userId;
            const { page = 1, limit = 20, sort = 'date' } = req.query;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID required' 
                });
            }

            // Check email verification - unverified users cannot receive messages
            const verificationError = await requireEmailVerification(this.db, userId);
            if (verificationError) {
                // Return empty inbox instead of error for better UX
                return res.json({
                    success: true,
                    messages: [],
                    total_count: 0,
                    current_page: 1,
                    total_pages: 0,
                    requiresEmailVerification: true,
                    message: 'Please verify your email to view messages'
                });
            }
            
            const result = await this.messageService.getInboxMessages(userId, parseInt(page), parseInt(limit), sort);
            
            res.json({
                success: true,
                messages: result.messages,
                total_count: result.pagination.total_count,
                current_page: result.pagination.current_page,
                total_pages: result.pagination.total_pages,
                has_next: result.pagination.has_next,
                has_prev: result.pagination.has_prev,
                pagination: result.pagination,
                performance: result.performance
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getSentMessages(req, res) {
        try {
            const userId = req.query.userId || req.query.user_id || req.params.userId;
            const { page = 1, limit = 20, sort = 'date' } = req.query;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID required' 
                });
            }
            
            const result = await this.messageService.getSentMessages(userId, parseInt(page), parseInt(limit), sort);
            
            res.json({
                success: true,
                messages: result.messages,
                total_count: result.pagination.total_count,
                current_page: result.pagination.current_page,
                total_pages: result.pagination.total_pages,
                has_next: result.pagination.has_next,
                has_prev: result.pagination.has_prev,
                pagination: result.pagination,
                performance: result.performance
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getSavedMessages(req, res) {
        try {
            const userId = req.query.userId || req.query.user_id;
            const { page = 1, limit = 20, sort = 'date' } = req.query;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID required' 
                });
            }
            
            const result = await this.messageService.getSavedMessages(userId, parseInt(page), parseInt(limit), sort);
            
            res.json({
                success: true,
                messages: result.messages,
                total_count: result.pagination.total_count,
                current_page: result.pagination.current_page,
                total_pages: result.pagination.total_pages,
                has_next: result.pagination.has_next,
                has_prev: result.pagination.has_prev,
                pagination: result.pagination,
                performance: result.performance
            });
        } catch (error) {
            console.error('❌ Error in getSavedMessages controller:', error);
            console.error('❌ Error stack:', error.stack);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async saveMessage(req, res) {
        try {
            const { messageId, userId } = req.body;
            
            if (!messageId || !userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Message ID and User ID required' 
                });
            }
            
            // Convert to integers to ensure proper type matching
            const numericMessageId = parseInt(messageId);
            const numericUserId = parseInt(userId);
            
            if (isNaN(numericMessageId) || numericMessageId <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid message ID' 
                });
            }
            
            if (isNaN(numericUserId) || numericUserId <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid user ID' 
                });
            }
            
            // Check if user has access to this message and it's not recalled
            const checkQuery = `
                SELECT id, sender_id, receiver_id, saved_by_receiver, recall_type 
                FROM user_messages 
                WHERE id = $1 
                AND ((sender_id = $2 AND deleted_by_sender = false) 
                     OR (receiver_id = $2 AND deleted_by_receiver = false))
            `;
            
            const checkResult = await this.db.query(checkQuery, [numericMessageId, numericUserId]);
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Message not found or access denied' 
                });
            }
            
            const message = checkResult.rows[0];
            
            // Only receivers can save messages
            if (parseInt(message.sender_id) === numericUserId) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Senders cannot save their own messages' 
                });
            }
            
            // Cannot save hard-recalled messages (they're deleted anyway)
            // Allow saving soft-recalled messages since receiver can still see them
            const recallType = message.recall_type || 'none';
            if (recallType === 'hard') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Cannot save recalled messages' 
                });
            }
            
            // Update saved status - set saved_by_receiver field, read_at, and is_read (saved_by_sender doesn't exist in database)
            await this.db.query(`
                UPDATE user_messages 
                SET saved_by_receiver = true,
                    read_at = NOW(),
                    is_read = true
                WHERE id = $1
            `, [numericMessageId]);
            
            res.json({
                success: true,
                saved: true,
                message: 'Message saved successfully'
            });
            
        } catch (error) {
            console.error('❌ Error saving message:', error);
            console.error('❌ Error message:', error.message);
            console.error('❌ Error code:', error.code);
            console.error('❌ Error detail:', error.detail);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update save status',
                details: error.message 
            });
        }
    }

    async unsaveMessage(req, res) {
        try {
            const { messageId, userId } = req.body;
            
            if (!messageId || !userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Message ID and User ID required' 
                });
            }
            
            // Convert to integers to ensure proper type matching
            const numericMessageId = parseInt(messageId);
            const numericUserId = parseInt(userId);
            
            if (isNaN(numericMessageId) || numericMessageId <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid message ID' 
                });
            }
            
            if (isNaN(numericUserId) || numericUserId <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid user ID' 
                });
            }
            
            // Check if user has access to this message
            const checkQuery = `
                SELECT id, sender_id, receiver_id, saved_by_receiver 
                FROM user_messages 
                WHERE id = $1 
                AND ((sender_id = $2 AND deleted_by_sender = false) 
                     OR (receiver_id = $2 AND deleted_by_receiver = false))
            `;
            
            const checkResult = await this.db.query(checkQuery, [numericMessageId, numericUserId]);
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Message not found or access denied' 
                });
            }
            
            const message = checkResult.rows[0];
            
            // Only receivers can unsave messages
            if (parseInt(message.sender_id) === numericUserId) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Senders cannot unsave their own messages' 
                });
            }
            
            // Update saved status - remove saved_by_receiver
            await this.db.query(`
                UPDATE user_messages 
                SET saved_by_receiver = false
                WHERE id = $1
            `, [numericMessageId]);
            
            res.json({
                success: true,
                saved: false,
                message: 'Message removed from saved'
            });
            
        } catch (error) {
            console.error('❌ Error unsaving message:', error);
            console.error('❌ Error message:', error.message);
            console.error('❌ Error code:', error.code);
            console.error('❌ Error detail:', error.detail);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update save status',
                details: error.message 
            });
        }
    }

    async deleteMessage(req, res) {
        try {
            const { messageId } = req.params;
            // For DELETE requests, read from query params instead of body
            const userId = req.query.userId || req.headers['x-user-id'];
            const deleteType = req.query.deleteType || 'for_me';
            
            // DELETE request
            
            // Validate messageId
            const numericMessageId = parseInt(messageId);
            if (!numericMessageId || isNaN(numericMessageId) || numericMessageId <= 0) {
                console.log(`❌ Invalid messageId: "${messageId}" -> parsed: ${numericMessageId}`);
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid message ID' 
                });
            }
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID required' 
                });
            }
            
            // Proceeding with deletion
            const result = await this.messageService.deleteMessage(numericMessageId, userId, deleteType);
            
            // If this was a recall (complete deletion), notify other participants
            if (result.type === 'recall') {
                // Get the message details before it was deleted
                try {
                    // We need to emit to the other participant that a message was recalled
                    // Since the message is already deleted, we'll emit to all users in the conversation
                    this.io.emit('message_recalled', {
                        messageId: numericMessageId,
                        recalledBy: userId,
                        timestamp: Date.now()
                    });
                    console.log(`📡 Emitted message_recalled event for message ${numericMessageId}`);
                } catch (socketError) {
                    console.warn('⚠️ Could not emit message_recalled event:', socketError.message);
                }
            }
            
            res.json({
                success: true,
                message: result.message,
                type: result.type
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getMessageCount(req, res) {
        try {
            const { user_id: userId } = req.query;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID required' 
                });
            }
            
            // Count both total and unread messages for this user
            const countQuery = `
                SELECT 
                    COUNT(*) as total_count,
                    COUNT(CASE WHEN read_at IS NULL THEN 1 END) as unread_count
                FROM user_messages 
                WHERE receiver_id = $1 
                AND deleted_by_receiver = false
            `;
            
            const countResult = await this.db.query(countQuery, [userId]);
            const totalCount = parseInt(countResult.rows[0].total_count) || 0;
            const unreadCount = parseInt(countResult.rows[0].unread_count) || 0;
            
            res.json({ 
                success: true, 
                total_count: totalCount,
                unread_count: unreadCount
            });
            
        } catch (error) {
            console.error('Error loading message count:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to load message count' 
            });
        }
    }

    async bulkDeleteMessages(req, res) {
        try {
            const { messageIds, deleteType } = req.body;
            const userId = req.headers['x-user-id'] || req.body.userId;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID required' 
                });
            }

            if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Message IDs array required' 
                });
            }

            if (!deleteType || !['for_me', 'for_everyone'].includes(deleteType)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Delete type must be "for_me" or "for_everyone"' 
                });
            }

            // Bulk deleting messages

            let deletedCount = 0;

            if (deleteType === 'for_everyone') {
                // Hard delete - only allow for messages sent by the user
                // First, get all attachments to clean up physical files
                const attachmentsResult = await this.db.query(`
                    SELECT ma.id, ma.file_path, ma.thumbnail_path, ma.original_filename
                    FROM user_message_attachments ma
                    JOIN user_messages m ON ma.message_id = m.id
                    WHERE m.id = ANY($1) AND m.sender_id = $2
                `, [messageIds, userId]);
                
                const attachments = attachmentsResult.rows;
                // Found attachments to delete for bulk deletion
                
                // Delete physical files from filesystem
                const ChatImageHandler = require('../../utils/chatImageHandler');
                const imageHandler = new ChatImageHandler();
                
                for (const attachment of attachments) {
                    try {
                        const deleteResult = await imageHandler.deleteImageFilesByPaths(
                            attachment.file_path, 
                            attachment.thumbnail_path
                        );
                        
                        if (deleteResult.success) {
                            console.log(`🗑️ ${deleteResult.message}`);
                        } else {
                            console.warn(`⚠️ File deletion warning for attachment ${attachment.id}: ${deleteResult.error}`);
                        }
                    } catch (error) {
                        console.error(`❌ Error deleting files for attachment ${attachment.id}:`, error);
                    }
                }
                
                // Now delete the messages (this will CASCADE delete attachments from database)
                const result = await this.db.query(`
                    DELETE FROM user_messages 
                    WHERE id = ANY($1) AND sender_id = $2
                    RETURNING id
                `, [messageIds, userId]);
                
                deletedCount = result.rows.length;
                // Hard deleted messages with attachments
            } else {
                // Soft delete - mark as deleted for the user
                // For received messages, mark deleted_by_receiver = true
                // For sent messages, mark deleted_by_sender = true
                const receivedResult = await this.db.query(`
                    UPDATE user_messages 
                    SET deleted_by_receiver = true 
                    WHERE id = ANY($1) AND receiver_id = $2 AND deleted_by_receiver = false
                    RETURNING id
                `, [messageIds, userId]);

                const sentResult = await this.db.query(`
                    UPDATE user_messages 
                    SET deleted_by_sender = true 
                    WHERE id = ANY($1) AND sender_id = $2 AND deleted_by_sender = false
                    RETURNING id
                `, [messageIds, userId]);

                deletedCount = receivedResult.rows.length + sentResult.rows.length;
                // Soft deleted messages
            }

            // Emit WebSocket event to update message counts
            this.io.to(`user_${userId}`).emit('messages_deleted', {
                count: deletedCount,
                messageIds: messageIds,
                deleteType: deleteType
            });

            res.json({
                success: true,
                message: `Successfully deleted ${deletedCount} message(s)`,
                deletedCount: deletedCount
            });

        } catch (error) {
            console.error('Error bulk deleting messages:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to delete messages' 
            });
        }
    }

    async markMessageAsRead(req, res) {
        try {
            const { messageId } = req.params;
            const userId = req.headers['x-user-id'] || req.body.userId;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID required' 
                });
            }

            if (!messageId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Message ID required' 
                });
            }

            console.log(`📖 Marking message ${messageId} as read for user ${userId}`);

            // Update the message to mark it as read
            const result = await this.db.query(`
                UPDATE user_messages 
                SET read_at = NOW(), is_read = true 
                WHERE id = $1 AND receiver_id = $2 AND read_at IS NULL
                RETURNING id, sender_id, receiver_id
            `, [messageId, userId]);

            if (result.rows.length === 0) {
                // Check if message exists and belongs to user (might already be read)
                const checkResult = await this.db.query(`
                    SELECT id, sender_id, receiver_id, read_at 
                    FROM user_messages 
                    WHERE id = $1 AND receiver_id = $2
                `, [messageId, userId]);

                if (checkResult.rows.length === 0) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'Message not found' 
                    });
                } else {
                    // Message exists but already read - return success
                    return res.json({
                        success: true,
                        message: 'Message already marked as read',
                        messageId: parseInt(messageId),
                        alreadyRead: true
                    });
                }
            }

            const message = result.rows[0];

            // Emit WebSocket event to update message counts
            this.io.to(`user_${userId}`).emit('message_marked_read', {
                messageId: parseInt(messageId),
                senderId: message.sender_id,
                receiverId: message.receiver_id
            });

            res.json({
                success: true,
                message: 'Message marked as read successfully',
                messageId: parseInt(messageId)
            });

        } catch (error) {
            console.error('Error marking message as read:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to mark message as read' 
            });
        }
    }

    async markAllMessagesAsRead(req, res) {
        try {
            const userId = req.headers['x-user-id'] || req.body.userId;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID required' 
                });
            }

            console.log(`📖 Marking all messages as read for user ${userId}`);

            // Update all unread messages for the user to mark them as read
            const result = await this.db.query(`
                UPDATE user_messages 
                SET read_at = NOW(), is_read = true 
                WHERE receiver_id = $1 AND read_at IS NULL
                RETURNING id, sender_id, receiver_id
            `, [userId]);

            const updatedCount = result.rows.length;

            // Emit WebSocket event to update message counts
            this.io.to(`user_${userId}`).emit('all_messages_marked_read', {
                count: updatedCount,
                userId: parseInt(userId)
            });

            res.json({
                success: true,
                message: `Successfully marked ${updatedCount} message(s) as read`,
                updatedCount: updatedCount
            });

        } catch (error) {
            console.error('Error marking all messages as read:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to mark all messages as read' 
            });
        }
    }

    async markConversationAsRead(req, res) {
        try {
            const userId = req.headers['x-user-id'] || req.body.userId;
            const { conversationPartnerId } = req.body;
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID required' 
                });
            }

            if (!conversationPartnerId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Conversation partner ID required' 
                });
            }

            console.log(`📖 Marking conversation as read for user ${userId} with partner ${conversationPartnerId}`);

            // Update unread messages for this specific conversation
            const result = await this.db.query(`
                UPDATE user_messages 
                SET read_at = NOW(), is_read = true 
                WHERE receiver_id = $1 
                  AND sender_id = $2 
                  AND read_at IS NULL
                RETURNING id, sender_id, receiver_id
            `, [userId, conversationPartnerId]);

            const updatedCount = result.rows.length;

            // Emit WebSocket event to update message counts
            this.io.to(`user_${userId}`).emit('conversation_marked_read', {
                count: updatedCount,
                userId: parseInt(userId),
                partnerId: parseInt(conversationPartnerId)
            });

            res.json({
                success: true,
                message: `Successfully marked ${updatedCount} message(s) as read`,
                updatedCount: updatedCount
            });

        } catch (error) {
            console.error('Error marking conversation as read:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to mark conversation as read' 
            });
        }
    }

    async getConversationsList(req, res) {
        try {
            const userId = req.query.userId || req.headers['x-user-id'];
            
            if (!userId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID required' 
                });
            }

            const userIdInt = parseInt(userId);
            if (isNaN(userIdInt)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid user ID' 
                });
            }

            // Check email verification - unverified users cannot see conversations
            const verificationError = await requireEmailVerification(this.db, userIdInt);
            if (verificationError) {
                // Return empty conversations instead of error for better UX
                return res.json({
                    success: true,
                    conversations: [],
                    total_count: 0,
                    requiresEmailVerification: true,
                    message: 'Please verify your email to view conversations'
                });
            }

            if (this.optionalColumns.usersLastSeenAt === null) {
                try {
                    const columnCheck = await this.db.query(`
                        SELECT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'users'
                              AND column_name = 'last_seen_at'
                        ) as exists
                    `);
                    this.optionalColumns.usersLastSeenAt = Boolean(columnCheck.rows[0]?.exists);
                } catch (columnError) {
                    this.optionalColumns.usersLastSeenAt = false;
                }

                if (!this.optionalColumns.usersLastSeenAt && !this.optionalColumns._lastSeenWarned) {
                    console.warn('users.last_seen_at column missing - skipping last seen data in conversations list');
                    this.optionalColumns._lastSeenWarned = true;
                }
            }

            const hasUsersLastSeenAt = Boolean(this.optionalColumns.usersLastSeenAt);
            const otherLastSeenSelect = hasUsersLastSeenAt
                ? '                            MAX(u.last_seen_at) as other_last_seen_at,\n'
                : '                            NULL::timestamptz as other_last_seen_at,\n';

            // Get all conversations for the user (both sent and received) with profile images
            // Also include deleted users (where real_name = 'Deleted User' or 'Account Deactivated')
            let result;
            try {
                result = await this.db.query(`
                    WITH active_conversations AS (
                        SELECT DISTINCT 
                            CASE 
                                WHEN m.sender_id = $1 THEN m.receiver_id
                                ELSE m.sender_id
                            END as other_user_id,
                            u.real_name as other_real_name,
                            u.email as other_email,
                            COALESCE(ui.file_name, NULL) as profile_image,
                            MAX(m.timestamp) as last_message_time,
                            MAX(CASE WHEN m.sender_id = $1 THEN m.timestamp END) as last_sent_time,
                            MAX(CASE WHEN m.receiver_id = $1 THEN m.timestamp END) as last_received_time,
${otherLastSeenSelect}                            COUNT(CASE 
                                WHEN m.receiver_id = $1 
                                AND m.read_at IS NULL 
                                AND COALESCE(m.deleted_by_receiver, false) = false
                                AND COALESCE(m.recall_type, 'none') = 'none'
                                AND COALESCE(m.message_type, 'text') != 'like'
                                THEN 1 
                            END) as unread_count,
                            CASE 
                                WHEN ud.deleted_user_id IS NOT NULL THEN true
                                ELSE false
                            END as is_deleted_user
                        FROM user_messages m
                        JOIN users u ON (
                            CASE 
                                WHEN m.sender_id = $1 THEN m.receiver_id
                                ELSE m.sender_id
                            END = u.id
                        )
                        LEFT JOIN user_images ui ON ui.user_id = u.id AND ui.is_profile = 1
                        LEFT JOIN users_deleted ud ON ud.deleted_user_id = (
                            CASE 
                                WHEN m.sender_id = $1 THEN m.receiver_id
                                ELSE m.sender_id
                            END
                        )
                        WHERE (m.sender_id = $1 OR m.receiver_id = $1)
                        AND (
                            -- If current user is receiver, check deleted_by_receiver
                            (m.receiver_id = $1 AND COALESCE(m.deleted_by_receiver, false) = false)
                            OR
                            -- If current user is sender, check deleted_by_sender
                            (m.sender_id = $1 AND COALESCE(m.deleted_by_sender, false) = false)
                        )
                        AND COALESCE(m.recall_type, 'none') = 'none'
                        AND COALESCE(m.message_type, 'text') != 'like'
                        -- Exclude conversations where current user has removed the other user
                        AND NOT EXISTS (
                            SELECT 1 FROM user_conversation_removals ucr
                            WHERE ucr.remover_id = $1
                            AND (
                                (m.sender_id = $1 AND ucr.removed_user_id = m.receiver_id)
                                OR
                                (m.receiver_id = $1 AND ucr.removed_user_id = m.sender_id)
                            )
                        )
                        GROUP BY 
                            CASE 
                                WHEN m.sender_id = $1 THEN m.receiver_id
                                ELSE m.sender_id
                            END,
                            u.real_name, 
                            u.email, 
                            ui.file_name,
                            ud.deleted_user_id
                    ),
                    deleted_users_cte AS (
                        SELECT DISTINCT
                            ud.deleted_user_id as other_user_id,
                            ud.real_name as other_real_name,
                            ud.email as other_email,
                            '/assets/images/account_deactivated.svg' as profile_image,
                            ud.created_at as last_message_time,
                            NULL::timestamptz as last_sent_time,
                            NULL::timestamptz as last_received_time,
                            0 as unread_count,
                            true as is_deleted_user,
                            NULL::timestamptz as other_last_seen_at
                        FROM users_deleted ud
                        INNER JOIN users_deleted_receivers udr ON (
                            udr.deleted_user_id = ud.deleted_user_id
                            AND udr.receiver_id = $1
                        )
                    )
                    SELECT 
                        final.other_user_id,
                        final.other_real_name,
                        final.other_email,
                        final.profile_image,
                        final.last_message_time,
                        final.last_sent_time,
                        final.last_received_time,
                        final.unread_count,
                        final.is_deleted_user,
                        final.other_last_seen_at,
                        -- OPTIMIZATION: Get last message content in the same query using LATERAL
                        CASE 
                            WHEN final.is_deleted_user = true THEN 'Account Deactivated'
                            WHEN last_msg.message IS NULL THEN 'No messages yet'
                            WHEN last_msg.sender_id = $1 THEN 'You: ' || last_msg.message
                            ELSE last_msg.message
                        END as last_message_content,
                        last_msg.sender_id as last_message_sender_id
                    FROM (
                        SELECT 
                            ac.other_user_id,
                            ac.other_real_name,
                            ac.other_email,
                            CASE 
                                WHEN ac.is_deleted_user = true THEN '/assets/images/account_deactivated.svg'
                                ELSE ac.profile_image
                            END as profile_image,
                            ac.last_message_time,
                            ac.last_sent_time,
                            ac.last_received_time,
                            ac.unread_count,
                            ac.is_deleted_user,
                            ac.other_last_seen_at
                        FROM active_conversations ac
                        LEFT JOIN deleted_users_cte duc ON duc.other_user_id = ac.other_user_id
                        WHERE duc.other_user_id IS NULL
                        UNION ALL
                        SELECT 
                            duc.other_user_id,
                            duc.other_real_name,
                            duc.other_email,
                            duc.profile_image,
                            duc.last_message_time,
                            duc.last_sent_time,
                            duc.last_received_time,
                            duc.unread_count,
                            true as is_deleted_user,
                            duc.other_last_seen_at
                        FROM deleted_users_cte duc
                    ) final
                    -- KEY OPTIMIZATION: LEFT JOIN LATERAL gets the last message for each conversation
                    -- This eliminates N+1 queries - all data fetched in a single query
                    LEFT JOIN LATERAL (
                        SELECT message, sender_id
                        FROM user_messages 
                        WHERE (sender_id = $1 AND receiver_id = final.other_user_id) 
                           OR (sender_id = final.other_user_id AND receiver_id = $1)
                        AND (
                            -- If current user is receiver, check deleted_by_receiver
                            (receiver_id = $1 AND COALESCE(deleted_by_receiver, false) = false)
                            OR
                            -- If current user is sender, check deleted_by_sender
                            (sender_id = $1 AND COALESCE(deleted_by_sender, false) = false)
                        )
                        AND COALESCE(recall_type, 'none') = 'none'
                        AND COALESCE(message_type, 'text') != 'like'
                        -- Exclude if current user has removed this user
                        AND NOT EXISTS (
                            SELECT 1 FROM user_conversation_removals ucr
                            WHERE ucr.remover_id = $1
                            AND ucr.removed_user_id = final.other_user_id
                        )
                        ORDER BY timestamp DESC 
                        LIMIT 1
                    ) last_msg ON true
                    ORDER BY 
                        COALESCE(final.last_sent_time, 'epoch'::timestamptz) DESC,
                        COALESCE(final.last_received_time, 'epoch'::timestamptz) DESC,
                        final.last_message_time DESC NULLS LAST
                `, [userIdInt]);
            } catch (e) {
                // If table doesn't exist, fall back to active conversations only
                if (e.code === '42P01' || (e.message && e.message.includes('does not exist'))) {
                    result = await this.db.query(`
                        SELECT 
                            conv.other_user_id,
                            conv.other_real_name,
                            conv.other_email,
                            conv.profile_image,
                            conv.last_message_time,
                            conv.last_sent_time,
                            conv.last_received_time,
                            conv.unread_count,
                            false as is_deleted_user,
                            conv.other_last_seen_at,
                            -- OPTIMIZATION: Get last message content using LATERAL
                            CASE 
                                WHEN last_msg.message IS NULL THEN 'No messages yet'
                                WHEN last_msg.sender_id = $1 THEN 'You: ' || last_msg.message
                                ELSE last_msg.message
                            END as last_message_content,
                            last_msg.sender_id as last_message_sender_id
                        FROM (
                            SELECT DISTINCT 
                                CASE 
                                    WHEN m.sender_id = $1 THEN m.receiver_id
                                    ELSE m.sender_id
                                END as other_user_id,
                                u.real_name as other_real_name,
                                u.email as other_email,
                                COALESCE(ui.file_name, NULL) as profile_image,
                                MAX(m.timestamp) as last_message_time,
                                MAX(CASE WHEN m.sender_id = $1 THEN m.timestamp END) as last_sent_time,
                                MAX(CASE WHEN m.receiver_id = $1 THEN m.timestamp END) as last_received_time,
${otherLastSeenSelect}                                COUNT(CASE 
                                    WHEN m.receiver_id = $1 
                                    AND m.read_at IS NULL 
                                    AND COALESCE(m.deleted_by_receiver, false) = false
                                    AND COALESCE(m.recall_type, 'none') = 'none'
                                    AND COALESCE(m.message_type, 'text') != 'like'
                                    THEN 1 
                                END) as unread_count
                            FROM user_messages m
                            JOIN users u ON (
                                CASE 
                                    WHEN m.sender_id = $1 THEN m.receiver_id
                                    ELSE m.sender_id
                                END = u.id
                            )
                            LEFT JOIN user_images ui ON ui.user_id = u.id AND ui.is_profile = 1
                            WHERE (m.sender_id = $1 OR m.receiver_id = $1)
                            AND COALESCE(m.deleted_by_receiver, false) = false
                            AND COALESCE(m.recall_type, 'none') = 'none'
                            AND COALESCE(m.message_type, 'text') != 'like'
                            GROUP BY 
                                CASE 
                                    WHEN m.sender_id = $1 THEN m.receiver_id
                                    ELSE m.sender_id
                                END,
                                u.real_name, 
                                u.email, 
                                ui.file_name
                        ) conv
                        -- KEY OPTIMIZATION: LEFT JOIN LATERAL gets the last message for each conversation
                        LEFT JOIN LATERAL (
                            SELECT message, sender_id
                            FROM user_messages 
                            WHERE (sender_id = $1 AND receiver_id = conv.other_user_id) 
                               OR (sender_id = conv.other_user_id AND receiver_id = $1)
                            AND COALESCE(deleted_by_receiver, false) = false
                            AND COALESCE(recall_type, 'none') = 'none'
                            AND COALESCE(message_type, 'text') != 'like'
                            ORDER BY timestamp DESC 
                            LIMIT 1
                        ) last_msg ON true
                        ORDER BY 
                            COALESCE(conv.last_sent_time, 'epoch'::timestamptz) DESC,
                            COALESCE(conv.last_received_time, 'epoch'::timestamptz) DESC,
                            conv.last_message_time DESC NULLS LAST
                    `, [userIdInt]);
                } else {
                    throw e;
                }
            }

            // Process conversations - last message content is now included in the query result
            // (optimized with LEFT JOIN LATERAL to avoid N+1 queries)
            const conversations = [];
            for (const row of result.rows) {
                // Check if this is a deleted user from users_deleted table
                // PostgreSQL returns boolean, handle all possible formats
                const isDeletedUser = row.is_deleted_user === true 
                    || row.is_deleted_user === 'true'
                    || row.is_deleted_user === 1
                    || row.profile_image === '/assets/images/account_deactivated.svg'
                    || (row.profile_image && row.profile_image.includes('account_deactivated'));
                
                const lastMessageContent = row.last_message_content || 'No messages yet';
                const rawLastSeen = row.other_last_seen_at || row.last_seen_at || null;
                const normalizedLastSeen = rawLastSeen ? normalizeLastSeen(rawLastSeen) : null;
                const initialLastSeenTimestamp = normalizedLastSeen ? (new Date(normalizedLastSeen).getTime() || 0) : 0;
                
                // Get user avatar - use profile image if available, otherwise use first letter
                let avatar;
                if (isDeletedUser) {
                    // Deleted user - always use deactivated avatar
                    avatar = '/assets/images/account_deactivated.svg';
                } else if (row.profile_image && row.profile_image.trim() !== '') {
                    // Check if the profile_image already contains the full path
                    if (row.profile_image.startsWith('/uploads/') || row.profile_image.startsWith('uploads/')) {
                        avatar = row.profile_image.startsWith('/') ? row.profile_image : `/${row.profile_image}`;
                    } else if (row.profile_image.startsWith('/assets/')) {
                        // Already a full path to assets
                        avatar = row.profile_image;
                    } else {
                        avatar = `/uploads/profile_images/${row.profile_image}`;
                    }
                } else {
                    // Use first letter of real_name, or 'U' if no name
                    avatar = row.other_real_name ? row.other_real_name.charAt(0).toUpperCase() : 'U';
                }
                
                // Format last message time
                // Handle null/undefined last_message_time
                let lastMessageTime;
                let timestamp = 0;
                let timeDisplay = 'No messages yet';
                
                if (row.last_message_time) {
                    lastMessageTime = new Date(row.last_message_time);
                    // Check if date is valid
                    if (!isNaN(lastMessageTime.getTime())) {
                        timestamp = lastMessageTime.getTime();
                        const now = new Date();
                        const isToday = lastMessageTime.toDateString() === now.toDateString();
                        
                        if (isToday) {
                            // Show time for today's messages (e.g., "1:37 AM")
                            timeDisplay = lastMessageTime.toLocaleTimeString('en-US', { 
                                hour: 'numeric', 
                                minute: '2-digit',
                                hour12: true 
                            });
                        } else {
                            // Show date and time for older messages (e.g., "7/1/2025, 1:37 AM")
                            timeDisplay = lastMessageTime.toLocaleDateString('en-US', { 
                                month: 'numeric', 
                                day: 'numeric',
                                year: 'numeric'
                            }) + ', ' + lastMessageTime.toLocaleTimeString('en-US', { 
                                hour: 'numeric', 
                                minute: '2-digit',
                                hour12: true 
                            });
                        }
                    }
                }
                
                // Ensure timestamp is always a valid number (never NaN or undefined)
                const finalTimestamp = (typeof timestamp === 'number' && !isNaN(timestamp)) ? timestamp : 0;
                const lastSentTimestamp = row.last_sent_time ? (new Date(row.last_sent_time).getTime() || 0) : 0;
                const lastReceivedTimestamp = row.last_received_time ? (new Date(row.last_received_time).getTime() || 0) : 0;

                const conversation = {
                    id: row.other_user_id.toString(),
                    name: row.other_real_name || row.other_email || 'Unknown User', // Always return actual real_name, frontend will blur it
                    avatar: avatar,
                    status: 'Offline', // Will be updated with real status below
                    unread: parseInt(row.unread_count) || 0,
                    lastMessage: lastMessageContent,
                    lastMessageTime: timeDisplay,
                    lastMessageTimestamp: finalTimestamp, // MUST be a number, never undefined
                    partnerId: row.other_user_id,
                    isDeleted: isDeletedUser,
                    lastSeenAt: normalizedLastSeen,
                    lastSeenTimestamp: initialLastSeenTimestamp,
                    lastSentTimestamp,
                    lastReceivedTimestamp
                };
                
                // Verify timestamp is set and is a valid number
                if (conversation.lastMessageTimestamp === undefined || conversation.lastMessageTimestamp === null || isNaN(conversation.lastMessageTimestamp)) {
                    conversation.lastMessageTimestamp = 0;
                }
                
                // Double-check it's a number
                conversation.lastMessageTimestamp = Number(conversation.lastMessageTimestamp) || 0;
                if (conversation.lastSentTimestamp === undefined || conversation.lastSentTimestamp === null || isNaN(conversation.lastSentTimestamp)) {
                    conversation.lastSentTimestamp = 0;
                }
                conversation.lastSentTimestamp = Number(conversation.lastSentTimestamp) || 0;
                if (conversation.lastReceivedTimestamp === undefined || conversation.lastReceivedTimestamp === null || isNaN(conversation.lastReceivedTimestamp)) {
                    conversation.lastReceivedTimestamp = 0;
                }
                conversation.lastReceivedTimestamp = Number(conversation.lastReceivedTimestamp) || 0;
                
                conversations.push(conversation);
            }

            // Get real online status for all conversation partners (excluding deleted users)
            const presenceCandidates = conversations.filter(conv => !conv.isDeleted && conv.partnerId);
            const activeUserIds = [...new Set(presenceCandidates
                .map(conv => parseInt(conv.partnerId))
                .filter(id => Number.isInteger(id)))];

            let presenceHydrated = false;
            const canUsePresenceService = Boolean(
                this.presenceService &&
                typeof this.presenceService.getStatuses === 'function' &&
                (typeof this.presenceService.isEnabled !== 'function' || this.presenceService.isEnabled())
            );

            if (canUsePresenceService && presenceCandidates.length > 0) {
                try {
                    await hydratePresenceStatuses(this.presenceService, presenceCandidates, {
                        idSelector: (record) => record.partnerId,
                        assign: (record, status) => {
                            const isOnline = Boolean(status?.isOnline);
                            record.is_online = isOnline;
                            record.status = isOnline ? 'Online' : 'Offline';

                            if (status?.lastSeen) {
                                const normalized = normalizeLastSeen(status.lastSeen);
                                record.lastSeenAt = normalized;
                                record.lastSeenTimestamp = normalized ? new Date(normalized).getTime() : 0;
                            } else if (!isOnline) {
                                if (record.lastSeenAt) {
                                    const normalized = normalizeLastSeen(record.lastSeenAt);
                                    record.lastSeenAt = normalized;
                                    record.lastSeenTimestamp = normalized ? new Date(normalized).getTime() : 0;
                                } else {
                                    record.lastSeenAt = null;
                                    record.lastSeenTimestamp = 0;
                                }
                            } else {
                                record.lastSeenAt = null;
                                record.lastSeenTimestamp = 0;
                            }
                        }
                    });
                    presenceHydrated = true;
                } catch (presenceError) {
                    presenceHydrated = false;
                }
            }

            if (!presenceHydrated && activeUserIds.length > 0) {
                try {
                    // Cleanup old sessions first
                    await this.db.query(`
                        UPDATE user_sessions 
                        SET is_active = false 
                        WHERE last_activity < NOW() - INTERVAL '2 minutes'
                    `);

                    const statusQuery = `
                        SELECT 
                            u.id,
                            COALESCE(BOOL_OR(us.is_active = true AND us.last_activity > NOW() - INTERVAL '2 minutes'), false) as is_online,
                            MAX(us.last_activity) as last_activity
                        FROM users u
                        LEFT JOIN user_sessions us ON u.id = us.user_id
                        WHERE u.id = ANY($1)
                        GROUP BY u.id
                    `;

                    const statusResult = await this.db.query(statusQuery, [activeUserIds]);

                    const statusMap = {};
                    statusResult.rows.forEach(row => {
                        statusMap[row.id] = {
                            is_online: row.is_online === true || row.is_online === 'true' || row.is_online === 't' || row.is_online === 1,
                            last_activity: row.last_activity
                        };
                    });

                    conversations.forEach(conv => {
                        if (conv.isDeleted) {
                            conv.status = 'Offline';
                            conv.is_online = false;
                            if (!conv.lastSeenAt) {
                                conv.lastSeenAt = null;
                                conv.lastSeenTimestamp = 0;
                            }
                            return;
                        }

                        const statusInfo = statusMap[parseInt(conv.partnerId)];
                        const isOnline = statusInfo ? statusInfo.is_online === true : false;
                        conv.status = isOnline ? 'Online' : 'Offline';
                        conv.is_online = isOnline;

                        if (!isOnline && statusInfo && statusInfo.last_activity) {
                            const lastActivityDate = new Date(statusInfo.last_activity);
                            if (!isNaN(lastActivityDate)) {
                                conv.lastSeenAt = lastActivityDate.toISOString();
                                conv.lastSeenTimestamp = lastActivityDate.getTime();
                            } else if (!conv.lastSeenAt) {
                                conv.lastSeenAt = null;
                                conv.lastSeenTimestamp = 0;
                            }
                        } else if (!isOnline && !conv.lastSeenAt) {
                            conv.lastSeenAt = null;
                            conv.lastSeenTimestamp = 0;
                        } else if (isOnline) {
                            conv.lastSeenAt = null;
                            conv.lastSeenTimestamp = 0;
                        }
                    });
                } catch (statusError) {
                    conversations.forEach(conv => {
                        conv.status = conv.status || 'Offline';
                        if (conv.is_online === undefined) conv.is_online = false;
                        if (!conv.lastSeenAt) {
                            conv.lastSeenAt = null;
                            conv.lastSeenTimestamp = 0;
                        }
                    });
                }
            }

            if (activeUserIds.length === 0 && !presenceHydrated) {
                conversations.forEach(conv => {
                    conv.status = 'Offline';
                    conv.is_online = false;
                    if (!conv.lastSeenAt) {
                        conv.lastSeenAt = null;
                        conv.lastSeenTimestamp = 0;
                    }
                });
            }
            
            // Final validation: Ensure all conversations have lastMessageTimestamp
            conversations.forEach(conv => {
                if (conv.lastMessageTimestamp === undefined || conv.lastMessageTimestamp === null || isNaN(conv.lastMessageTimestamp)) {
                    conv.lastMessageTimestamp = 0;
                }
                // Double-check it's a number
                conv.lastMessageTimestamp = Number(conv.lastMessageTimestamp) || 0;
                
                if (conv.lastSeenAt) {
                    const normalized = normalizeLastSeen(conv.lastSeenAt);
                    conv.lastSeenAt = normalized;
                    conv.lastSeenTimestamp = normalized ? (new Date(normalized).getTime() || 0) : 0;
                } else if (conv.lastSeenTimestamp === undefined || conv.lastSeenTimestamp === null || isNaN(conv.lastSeenTimestamp)) {
                    conv.lastSeenTimestamp = 0;
                } else {
                    conv.lastSeenTimestamp = Number(conv.lastSeenTimestamp) || 0;
                }
                if (conv.lastSentTimestamp === undefined || conv.lastSentTimestamp === null || isNaN(conv.lastSentTimestamp)) {
                    conv.lastSentTimestamp = 0;
                } else {
                    conv.lastSentTimestamp = Number(conv.lastSentTimestamp) || 0;
                }
                if (conv.lastReceivedTimestamp === undefined || conv.lastReceivedTimestamp === null || isNaN(conv.lastReceivedTimestamp)) {
                    conv.lastReceivedTimestamp = 0;
                } else {
                    conv.lastReceivedTimestamp = Number(conv.lastReceivedTimestamp) || 0;
                }
            });
            
            res.json({
                success: true,
                conversations: conversations,
                total_count: conversations.length
            });

        } catch (error) {
            console.error('Error getting conversations list:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get conversations list' 
            });
        }
    }

    // Image upload methods for chat
    async uploadChatImage(req, res) {
        try {
            const ChatImageHandler = require('../../utils/chatImageHandler');
            const imageHandler = new ChatImageHandler();
            
            // Setup multer middleware
            const upload = imageHandler.getMulterConfig();
            
            // Apply multer middleware
            upload.single('image')(req, res, async (err) => {
                if (err) {
                    return res.status(400).json({
                        success: false,
                        error: err.message
                    });
                }
                
                const { partnerId, messageId } = req.body;
                const userId = req.headers['x-user-id'] || req.body.userId;
                
                if (!userId || !partnerId) {
                    return res.status(400).json({
                        success: false,
                        error: 'User ID and Partner ID are required'
                    });
                }
                
                // Validate image upload
                const validation = imageHandler.validateImageUpload(req.file, userId, partnerId);
                if (!validation.isValid) {
                    return res.status(400).json({
                        success: false,
                        error: validation.errors.join(', ')
                    });
                }
                
                try {
                    // Generate unique filename
                    const filename = imageHandler.generateFilename(userId, partnerId, req.file.originalname);
                    
                    // Process image (resize, create thumbnail)
                    const imageData = await imageHandler.processImage(req.file.path, filename, userId, partnerId);
                    
                    // If messageId is provided, save attachment to database
                    if (messageId) {
                        await this.db.query(
                            `INSERT INTO user_message_attachments 
                             (message_id, attachment_type, original_filename, stored_filename, file_path, thumbnail_path, 
                              file_size, mime_type, width, height, uploaded_by) 
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                            [
                                messageId, 'image', req.file.originalname, filename,
                                imageData.imagePath, imageData.thumbnailPath,
                                imageData.fileSize, req.file.mimetype,
                                imageData.width, imageData.height, userId
                            ]
                        );
                        
                        // Update message attachment count
                        await this.db.query(
                            'UPDATE user_messages SET attachment_count = attachment_count + 1 WHERE id = $1',
                            [messageId]
                        );
                    }
                    
                    res.json({
                        success: true,
                        data: {
                            filename: filename,
                            originalName: req.file.originalname,
                            imagePath: imageData.imagePath,
                            thumbnailPath: imageData.thumbnailPath,
                            width: imageData.width,
                            height: imageData.height,
                            fileSize: imageData.fileSize
                        }
                    });
                    
                } catch (processError) {
                    console.error('Error processing image:', processError);
                    res.status(500).json({
                        success: false,
                        error: 'Failed to process image'
                    });
                }
            });
            
        } catch (error) {
            console.error('Error in uploadChatImage:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to upload image'
            });
        }
    }

    async uploadChatImages(req, res) {
        try {
            const ChatImageHandler = require('../../utils/chatImageHandler');
            const imageHandler = new ChatImageHandler();
            
            // Setup multer middleware for multiple files
            const upload = imageHandler.getMulterConfig();
            
            // Apply multer middleware
            upload.array('images', 5)(req, res, async (err) => {
                if (err) {
                    console.error('Multer error:', err);
                    return res.status(400).json({
                        success: false,
                        error: 'File upload error',
                        details: {
                            message: err.message,
                            code: err.code,
                            field: err.field
                        }
                    });
                }
                
                const { partnerId, messageId } = req.body;
                const userId = req.headers['x-user-id'] || req.body.userId;
                
                if (!userId || !partnerId) {
                    return res.status(400).json({
                        success: false,
                        error: 'User ID and Partner ID are required'
                    });
                }
                
                if (!req.files || req.files.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'No images provided'
                    });
                }
                
                const results = [];
                const errors = [];
                
                // Process each image
                for (const file of req.files) {
                    try {
                        // Validate each image
                        const validation = imageHandler.validateImageUpload(file, userId, partnerId);
                        if (!validation.isValid) {
                            errors.push({
                                filename: file.originalname,
                                error: validation.errors.join(', ')
                            });
                            continue;
                        }
                        
                        // Generate unique filename
                        const filename = imageHandler.generateFilename(userId, partnerId, file.originalname);
                        
                        // Process image
                        const imageData = await imageHandler.processImage(file.path, filename, userId, partnerId);
                        
                        // Save to database if messageId provided
                        if (messageId) {
                            // Verify that the message belongs to the current conversation
                            const messageVerification = await this.db.query(
                                'SELECT sender_id, receiver_id FROM user_messages WHERE id = $1',
                                [messageId]
                            );
                            
                            if (messageVerification.rows.length === 0) {
                                errors.push({
                                    filename: file.originalname,
                                    error: 'Invalid message ID'
                                });
                                continue;
                            }
                            
                            const msg = messageVerification.rows[0];
                            const currentUserId = parseInt(userId);
                            const currentPartnerId = parseInt(partnerId);
                            
                            // Ensure the message belongs to this conversation
                            if (!((msg.sender_id === currentUserId && msg.receiver_id === currentPartnerId) ||
                                  (msg.sender_id === currentPartnerId && msg.receiver_id === currentUserId))) {
                                errors.push({
                                    filename: file.originalname,
                                    error: 'Message does not belong to this conversation'
                                });
                                continue;
                            }
                            
                            try {
                                await this.db.query(
                                    `INSERT INTO user_message_attachments 
                                     (message_id, attachment_type, original_filename, stored_filename, file_path, thumbnail_path, 
                                      file_size, mime_type, width, height, uploaded_by) 
                                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                                    [
                                        messageId, 'image', file.originalname, filename,
                                        imageData.imagePath, imageData.thumbnailPath,
                                        imageData.fileSize, file.mimetype,
                                        imageData.width, imageData.height, userId
                                    ]
                                );
                            } catch (dbError) {
                                console.error('Database insert error:', dbError);
                                errors.push({
                                    filename: file.originalname,
                                    error: `Database error: ${dbError.message}`
                                });
                                continue;
                            }
                        }
                        
                        results.push({
                            filename: filename,
                            originalName: file.originalname,
                            imagePath: imageData.imagePath,
                            thumbnailPath: imageData.thumbnailPath,
                            width: imageData.width,
                            height: imageData.height,
                            fileSize: imageData.fileSize
                        });
                        
                    } catch (processError) {
                        console.error(`Error processing image ${file.originalname}:`, processError);
                        errors.push({
                            filename: file.originalname,
                            error: 'Failed to process image'
                        });
                    }
                }
                
                // Update message attachment count if messageId provided
                if (messageId && results.length > 0) {
                    try {
                        await this.db.query(
                            'UPDATE user_messages SET attachment_count = attachment_count + $1 WHERE id = $2',
                            [results.length, messageId]
                        );
                    } catch (updateError) {
                        console.error('Error updating attachment count:', updateError);
                        // Don't fail the entire upload for this error
                    }
                    
                    // Emit WebSocket notification for image upload with attachment data
                    if (this.io && partnerId) {
                        // Prepare attachment data for WebSocket
                        const attachments = results.map(result => ({
                            attachment_type: 'image',
                            original_filename: result.originalName,
                            stored_filename: result.filename,
                            file_path: result.imagePath,
                            thumbnail_path: result.thumbnailPath,
                            file_size: result.fileSize,
                            width: result.width,
                            height: result.height
                        }));
                        
                        const imageMessageForSocket = {
                            id: messageId,
                            messageId: messageId,
                            senderId: parseInt(userId),
                            receiverId: parseInt(partnerId),
                            content: ' ',  // Space for image-only messages
                            type: 'image_upload',
                            hasAttachments: true,
                            attachment_count: results.length,
                            attachments: attachments,
                            imageCount: results.length,
                            timestamp: Date.now(),
                            source: 'image_upload'
                        };
                        
                        // Notify receiver about new image message with attachment data
                        this.io.to(`user_${partnerId}`).emit('new_message', imageMessageForSocket);
                        
                        // CRITICAL: Also emit to sender so they can see their image message immediately in real-time
                        // Frontend handles this via isFromMeToPartner check in talk_realtime-messaging.js
                        this.io.to(`user_${userId}`).emit('new_message', imageMessageForSocket);
                        
                        // Notify sender about successful upload with attachment data
                        this.io.to(`user_${userId}`).emit('image_upload_complete', {
                            messageId: messageId,
                            senderId: parseInt(userId),
                            receiverId: parseInt(partnerId),
                            attachments: attachments,
                            uploadCount: results.length,
                            status: 'success'
                        });
                    }
                }
                
                res.json({
                    success: true,
                    data: {
                        processed: results,
                        errors: errors,
                        totalProcessed: results.length,
                        totalFailed: errors.length
                    }
                });
                
            });
            
        } catch (error) {
            console.error('Error in uploadChatImages:', error);
            
            // Return detailed error information for debugging
            const errorDetails = {
                message: error.message,
                stack: error.stack,
                name: error.name,
                code: error.code
            };
            
            console.error('Detailed error info:', errorDetails);
            
            res.status(500).json({
                success: false,
                error: 'Failed to upload images',
                details: errorDetails,
                timestamp: new Date().toISOString()
            });
        }
    }

    async deleteAttachment(req, res) {
        try {
            const { attachmentId } = req.params;
            const userId = req.headers['x-user-id'] || req.body.userId;
            
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID required'
                });
            }
            
            // Get attachment info
            const attachmentResult = await this.db.query(
                'SELECT * FROM user_message_attachments WHERE id = $1 AND uploaded_by = $2',
                [attachmentId, userId]
            );
            
            if (attachmentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Attachment not found or unauthorized'
                });
            }
            
            const attachment = attachmentResult.rows[0];
            
            // Delete physical files from filesystem
            if (attachment.attachment_type === 'image') {
                const ChatImageHandler = require('../../utils/chatImageHandler');
                const imageHandler = new ChatImageHandler();
                
                try {
                    const deleteResult = await imageHandler.deleteImageFilesByPaths(
                        attachment.file_path, 
                        attachment.thumbnail_path
                    );
                    
                    if (deleteResult.success) {
                        console.log(`🗑️ ${deleteResult.message}`);
                    } else {
                        console.warn(`⚠️ File deletion warning: ${deleteResult.error}`);
                    }
                } catch (fileError) {
                    console.error(`❌ Error deleting physical files for attachment ${attachmentId}:`, fileError);
                }
            }
            
            // Delete the attachment record from database
            await this.db.query('DELETE FROM user_message_attachments WHERE id = $1', [attachmentId]);
            console.log(`🗑️ Deleted attachment record ${attachmentId} from database`);
            
            // Update message attachment count
            await this.db.query(
                'UPDATE user_messages SET attachment_count = attachment_count - 1 WHERE id = $1 AND attachment_count > 0',
                [attachment.message_id]
            );
            
            // Check if message has no more attachments and is empty
            const remainingAttachments = await this.db.query(
                'SELECT COUNT(*) FROM user_message_attachments WHERE message_id = $1',
                [attachment.message_id]
            );
            
            if (parseInt(remainingAttachments.rows[0].count) === 0) {
                // Check if message content is empty
                const messageQuery = 'SELECT message FROM user_messages WHERE id = $1';
                const messageResult = await this.db.query(messageQuery, [attachment.message_id]);
                
                if (messageResult.rows.length > 0) {
                    const messageContent = messageResult.rows[0].message || '';
                    if (!messageContent.trim() || messageContent.trim() === '') {
                        // Delete orphaned message
                        await this.db.query('DELETE FROM user_messages WHERE id = $1', [attachment.message_id]);
                        console.log(`🗑️ Deleted orphaned message ${attachment.message_id} (no content, no attachments)`);
                    }
                }
            }
            
            res.json({
                success: true,
                message: 'Attachment deleted successfully',
                filesDeleted: true
            });
            
        } catch (error) {
            console.error('Error deleting attachment:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete attachment'
            });
        }
    }

    // NEW METHOD: Get message with read status
    async getMessageWithReadStatus(messageId) {
        try {
            const result = await this.db.query(`
                SELECT m.*, 
                       COALESCE(m.is_read, false) as is_read
                FROM user_messages m 
                WHERE m.id = $1
            `, [messageId]);
            
            return result.rows[0];
        } catch (error) {
            console.error('Error getting message with read status:', error);
            throw error;
        }
    }

    // NEW METHOD: Soft recall (mark as recalled for sender only)
    async performSoftRecall(messageId, userId) {
        try {
            // For soft recall, we need to handle this differently
            // We'll create a separate record to track recall status without modifying the original message
            
            // Get the original message first
            const messageResult = await this.db.query(`
                SELECT * FROM user_messages WHERE id = $1
            `, [messageId]);
            
            if (messageResult.rows.length === 0) {
                throw new Error('Message not found');
            }
            
            const originalMessage = messageResult.rows[0];
            
            // For soft recall, we only mark the message as recalled
            // but keep the original content intact so recipients can still see it
            await this.db.query(`
                UPDATE user_messages 
                SET recalled_at = NOW(), 
                    recall_type = 'soft'
                WHERE id = $1
            `, [messageId]);
            
            console.log(`✅ Soft recall completed for message ${messageId} by user ${userId}`);
        } catch (error) {
            console.error('Error performing soft recall:', error);
            throw error;
        }
    }

    // NEW METHOD: Hard recall (complete deletion)
    async performHardRecall(messageId, userId) {
        try {
            // Delete attachments first
            await this.deleteMessageAttachments(messageId);
            
            // Delete message completely
            await this.db.query(`
                DELETE FROM user_messages WHERE id = $1
            `, [messageId]);
            
            console.log(`✅ Hard recall completed for message ${messageId} by user ${userId}`);
        } catch (error) {
            console.error('Error performing hard recall:', error);
            throw error;
        }
    }

    // NEW METHOD: Delete message attachments
    async deleteMessageAttachments(messageId) {
        try {
            // Get all attachments for this message
            const attachmentsResult = await this.db.query(
                'SELECT * FROM user_message_attachments WHERE message_id = $1',
                [messageId]
            );
            
            if (attachmentsResult.rows.length > 0) {
                const ChatImageHandler = require('../../utils/chatImageHandler');
                const imageHandler = new ChatImageHandler();
                
                // Delete each attachment
                for (const attachment of attachmentsResult.rows) {
                    if (attachment.attachment_type === 'image') {
                        try {
                            await imageHandler.deleteImageFilesByPaths(
                                attachment.file_path, 
                                attachment.thumbnail_path
                            );
                        } catch (fileError) {
                            console.warn(`⚠️ Warning deleting file for attachment ${attachment.id}:`, fileError.message);
                        }
                    }
                }
                
                // Delete attachment records from database
                await this.db.query('DELETE FROM user_message_attachments WHERE message_id = $1', [messageId]);
                console.log(`🗑️ Deleted ${attachmentsResult.rows.length} attachments for message ${messageId}`);
            }
        } catch (error) {
            console.error('Error deleting message attachments:', error);
            throw error;
        }
    }



    // NEW METHOD: Get message with read status for recall decisions
    async getMessageWithReadStatus(messageId) {
        try {
            const result = await this.db.query(`
                SELECT id, sender_id, receiver_id, message, timestamp, read_at, 
                       COALESCE(is_read, false) as is_read, 
                       recall_type, saved_by_receiver
                FROM user_messages 
                WHERE id = $1
            `, [messageId]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            // Ensure is_read is explicitly false if null/undefined (COALESCE should handle this, but double-check)
            const message = result.rows[0];
            if (message.is_read === null || message.is_read === undefined) {
                message.is_read = false;
            }
            
            return message;
        } catch (error) {
            console.error('Error getting message with read status:', error);
            throw error;
        }
    }

    // NEW METHOD: Enhanced recall with read status check
    async recallMessage(req, res) {
        try {
            const { messageId } = req.params;
            const userId = req.headers['x-user-id'] || req.body.userId;
            const recallType = req.body.recallType || 'auto';
            
            if (!userId) {
                return res.status(400).json({ success: false, error: 'User ID required' });
            }
            
            // Get message details including read status
            // CRITICAL: Do NOT check recall_type - only use is_read to determine behavior
            const message = await this.getMessageWithReadStatus(messageId);
            
            if (!message) {
                return res.status(404).json({ success: false, error: 'Message not found' });
            }
            
            if (message.sender_id != userId) {
                return res.status(403).json({ success: false, error: 'Not authorized' });
            }
            
            // CRITICAL: Determine recall type based ONLY on is_read status
            // recall_type column plays NO role in this decision - ignore it completely
            // is_read must be explicitly true or 1 to be considered read
            // Anything else (false, null, undefined, 0) means NOT read = MUST hard delete
            let finalRecallType;
            const isReadValue = message.is_read === true || message.is_read === 1;
            
            if (isReadValue) {
                // Message was read - only soft delete allowed
                finalRecallType = 'soft';
                console.log(`📖 [Recall] Message ${messageId} was read (is_read=${message.is_read}) - performing SOFT recall`);
            } else {
                // Message not read (is_read=false/null/undefined/0) - MUST hard delete
                // This is CRITICAL - no exceptions!
                finalRecallType = 'hard';
                console.log(`📖 [Recall] Message ${messageId} was NOT read (is_read=${message.is_read}) - performing HARD recall (MANDATORY)`);
            }
            
            // DEFENSIVE: Ensure finalRecallType is always valid (default to hard if invalid)
            if (!finalRecallType || (finalRecallType !== 'soft' && finalRecallType !== 'hard')) {
                console.error(`⚠️ [Recall] Invalid recall type: ${finalRecallType}. Defaulting to HARD delete for safety.`);
                finalRecallType = 'hard';
            }
            
            console.log(`🔄 [Recall] Executing ${finalRecallType} recall for message ${messageId} by user ${userId}`);
            
            // Perform recall based on type
            if (finalRecallType === 'hard') {
                await this.performHardRecall(messageId, userId);
                console.log(`✅ [Recall] HARD recall completed for message ${messageId}`);
            } else {
                await this.performSoftRecall(messageId, userId);
                console.log(`✅ [Recall] SOFT recall completed for message ${messageId}`);
            }
            
            // CRITICAL: Invalidate Redis cache after recall to ensure fresh data
            try {
                if (this.messageService && this.messageService.redis) {
                    // Get the conversation participants to clear their cache
                    const participants = [message.sender_id, message.receiver_id];
                    
                    for (const userId1 of participants) {
                        for (const userId2 of participants) {
                            if (userId1 !== userId2) {
                                const cacheKey = `${userId1}_${userId2}`;
                                await this.messageService.redis.del(`${cacheKey}:messages`);
                                console.log(`🗑️ Cleared Redis cache for conversation ${cacheKey} after recall`);
                            }
                        }
                    }
                }
            } catch (cacheError) {
                console.error('⚠️ Failed to clear Redis cache after recall:', cacheError);
                // Don't fail the recall operation if cache clearing fails
            }

            // Emit event based on recall type
            if (finalRecallType === 'hard') {
                // Hard recall: notify both users (message completely deleted)
                this.io.emit('message_recalled', {
                    messageId: parseInt(messageId),
                    recalledBy: userId,
                    recallType: finalRecallType,
                    wasRead: message.is_read === true || message.is_read === 1
                });
                console.log(`📡 Emitted message_recalled event for ${finalRecallType} recall of message ${messageId} (both users)`);
            } else {
                // Soft recall: notify both users but handle differently in frontend
                this.io.emit('message_recalled', {
                    messageId: parseInt(messageId),
                    recalledBy: userId,
                    recallType: finalRecallType,
                    wasRead: message.is_read === true || message.is_read === 1
                });
                console.log(`📡 Emitted message_recalled event for ${finalRecallType} recall of message ${messageId} (both users - different handling)`);
            }
            
            res.json({ 
                success: true, 
                recallType: finalRecallType,
                wasRead: message.is_read === true || message.is_read === 1,
                message: finalRecallType === 'hard' ? 'Message deleted completely' : 'Message recalled' });
            
        } catch (error) {
            console.error('Error recalling message:', error);
            res.status(500).json({ success: false, error: 'Failed to recall message' });
        }
    }

    // NEW METHOD: Get message status (read/unread)
    async getMessageStatus(req, res) {
        try {
            const { messageId } = req.params;
            const userId = req.headers['x-user-id'] || req.query.userId;
            
            if (!userId) {
                return res.status(400).json({ success: false, error: 'User ID required' });
            }
            
            const message = await this.getMessageWithReadStatus(messageId);
            if (!message) {
                return res.status(404).json({ success: false, error: 'Message not found' });
            }
            
            // Check if user is authorized to view this message
            if (message.sender_id != userId && message.receiver_id != userId) {
                return res.status(403).json({ success: false, error: 'Not authorized' });
            }
            
            res.json({
                success: true,
                isRead: message.is_read === true || message.is_read === 1,
                messageId: parseInt(messageId),
                readAt: message.read_at
            });
            
        } catch (error) {
            console.error('Error getting message status:', error);
            res.status(500).json({ success: false, error: 'Failed to get message status' });
        }
    }

    /**
     * Validate message content (for frontend pre-validation)
     * Checks for bad words, length, forbidden patterns
     */
    async validateMessage(req, res) {
        try {
            const { content } = req.body;

            if (!content || typeof content !== 'string') {
                return res.status(400).json({
                    success: false,
                    valid: false,
                    error: 'Content is required'
                });
            }

            // Use the same validation as sendMessage
            const validation = await this.validateMessageContent(content);
            
            return res.json({
                success: true,
                valid: validation.valid,
                error: validation.error || null
            });
        } catch (error) {
            console.error('Error validating message:', error);
            return res.status(500).json({
                success: false,
                valid: false,
                error: 'Error validating message'
            });
        }
    }

    async clearDeletedUserConversation(req, res) {
        try {
            // Check if database connection exists
            if (!this.db) {
                console.error('❌ Database connection not available in MessageController');
                return res.status(500).json({
                    success: false,
                    error: 'Database connection not available'
                });
            }
            
            let { deletedUserId, token, userId: bodyUserId } = req.body;
            
            // Get current user ID from multiple sources
            let userId = req.headers['x-user-id'] || bodyUserId || req.query.userId || req.session?.userId;
            
            // If token is provided, try to get userId from session
            if (!userId && token) {
                try {
                    // Try user_sessions table first
                    const sessionResult = await this.db.query(
                        'SELECT user_id FROM user_sessions WHERE session_token = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())',
                        [token]
                    );
                    if (sessionResult.rows.length > 0) {
                        userId = sessionResult.rows[0].user_id;
                    } else {
                        // Try sessions table as fallback
                        const legacySessionResult = await this.db.query(
                            'SELECT user_id FROM sessions WHERE session_token = $1 AND expires_at > NOW()',
                            [token]
                        );
                        if (legacySessionResult.rows.length > 0) {
                            userId = legacySessionResult.rows[0].user_id;
                        }
                    }
                } catch (error) {
                    console.error('Error getting user from session:', error);
                }
            }
            
            // Validate required fields
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }
            
            if (!deletedUserId) {
                return res.status(400).json({
                    success: false,
                    error: 'Deleted user ID required'
                });
            }
            
            // Convert to integers
            userId = parseInt(userId);
            deletedUserId = parseInt(deletedUserId);
            
            if (isNaN(userId) || isNaN(deletedUserId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }
            
            // Verify the deleted user exists in users_deleted table
            const deletedUserCheck = await this.db.query(
                'SELECT deleted_user_id, real_name FROM users_deleted WHERE deleted_user_id = $1',
                [deletedUserId]
            );
            
            if (deletedUserCheck.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Deleted user not found'
                });
            }
            
            // Check if the receiver mapping exists
            const receiverMappingCheck = await this.db.query(`
                SELECT id 
                FROM users_deleted_receivers 
                WHERE receiver_id = $1 AND deleted_user_id = $2
            `, [userId, deletedUserId]);
            
            // If no mapping exists, this is an idempotent operation - return success
            // This can happen if:
            // 1. User was deleted but had no conversations (no receiver mappings created)
            // 2. Mapping was already cleared previously
            if (receiverMappingCheck.rows.length === 0) {
                return res.json({
                    success: true,
                    message: 'Conversation already cleared or no conversation existed',
                    clearedCount: 0
                });
            }
            
            // DELETE the row from users_deleted_receivers (this removes it from conversation list)
            // Note: Messages are already hard deleted when the user was deleted, so no need to update them
            const deleteResult = await this.db.query(`
                DELETE FROM users_deleted_receivers 
                WHERE receiver_id = $1 
                  AND deleted_user_id = $2
            `, [userId, deletedUserId]);
            
            console.log(`[clearDeletedUserConversation] User ${userId} cleared deleted user ${deletedUserId}. Row deleted from users_deleted_receivers.`);
            
            // Emit WebSocket event to update UI (if WebSocket is available)
            if (this.io) {
                this.io.to(`user_${userId}`).emit('conversation_cleared', {
                    deletedUserId: deletedUserId,
                    clearedCount: 0
                });
            }
            
            res.json({
                success: true,
                message: 'Removed deactivated account from conversation list',
                clearedCount: 0
            });
            
        } catch (error) {
            console.error('Error clearing deleted user conversation:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to clear conversation',
                    details: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    }

    async removeUserFromConversation(req, res) {
        try {
            if (!this.db) {
                console.error('❌ Database connection not available in MessageController');
                return res.status(500).json({
                    success: false,
                    error: 'Database connection not available'
                });
            }
            
            let { partnerId, token, userId: bodyUserId } = req.body;
            
            // Get current user ID from multiple sources
            let userId = req.headers['x-user-id'] || bodyUserId || req.query.userId || req.session?.userId;
            
            // If token is provided, try to get userId from session
            if (!userId && token) {
                try {
                    const sessionResult = await this.db.query(
                        'SELECT user_id FROM user_sessions WHERE session_token = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())',
                        [token]
                    );
                    if (sessionResult.rows.length > 0) {
                        userId = sessionResult.rows[0].user_id;
                    } else {
                        const legacySessionResult = await this.db.query(
                            'SELECT user_id FROM sessions WHERE session_token = $1 AND expires_at > NOW()',
                            [token]
                        );
                        if (legacySessionResult.rows.length > 0) {
                            userId = legacySessionResult.rows[0].user_id;
                        }
                    }
                } catch (error) {
                    console.error('Error getting user from session:', error);
                }
            }
            
            // Validate required fields
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }
            
            if (!partnerId) {
                return res.status(400).json({
                    success: false,
                    error: 'Partner ID required'
                });
            }
            
            // Convert to integers
            userId = parseInt(userId);
            partnerId = parseInt(partnerId);
            
            if (isNaN(userId) || isNaN(partnerId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }
            
            // Track the removal explicitly in user_conversation_removals table
            // Note: We don't modify deleted_by_receiver in messages table as that's for normal message deletion
            const insertResult = await this.db.query(`
                INSERT INTO user_conversation_removals (remover_id, removed_user_id)
                VALUES ($1, $2)
                ON CONFLICT (remover_id, removed_user_id) DO NOTHING
                RETURNING id
            `, [userId, partnerId]);
            
            // Clear Redis cache for this conversation (only remover's cache)
            if (this.redis) {
                try {
                    const cacheKey = `messages:${userId}:${partnerId}`;
                    await this.redis.del(cacheKey);
                } catch (cacheError) {
                    // Cache error is not critical
                }
            }
            
            // Emit WebSocket event to update UI (only for remover)
            if (this.io) {
                this.io.to(`user_${userId}`).emit('user_removed_from_conversation', {
                    partnerId: partnerId,
                    removedAt: Date.now()
                });
            }
            
            const wasAlreadyRemoved = insertResult.rows.length === 0;
            
            res.json({
                success: true,
                message: wasAlreadyRemoved 
                    ? 'User was already removed from conversation' 
                    : 'User removed from conversation',
                removed: !wasAlreadyRemoved
            });
            
        } catch (error) {
            console.error('Error removing user from conversation:', error);
            if (!res.headersSent) {
                return res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        }
    }
}

module.exports = MessageController; 
