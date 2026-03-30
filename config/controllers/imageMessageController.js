// Clean Image Messaging System
// Simple, reliable image message handling

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

// Simple storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'app/uploads/chat_images/');
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 15);
        const extension = path.extname(file.originalname);
        cb(null, `image_${timestamp}_${randomId}${extension}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 5 // Max 5 files
    },
    fileFilter: (req, file, cb) => {
        // Only allow images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

class ImageMessageController {
    // Send message with optional images
    static async sendMessage(req, res) {
        try {
            const { senderId, receiverId, content } = req.body;
            const files = req.files || [];
            
            console.log(`📤 Sending message: ${senderId} → ${receiverId}`);
            console.log(`📝 Content: "${content || 'NO_TEXT'}"`);
            console.log(`📎 Files: ${files.length}`);
            
            // Validate required fields
            if (!senderId || !receiverId) {
                return res.status(400).json({
                    success: false,
                    error: 'Sender ID and Receiver ID are required'
                });
            }
            
            // Must have either text content or files
            if (!content && files.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Message must contain either text or images'
                });
            }
            
            // Process uploaded images
            const imageAttachments = [];
            for (const file of files) {
                try {
                    // Create thumbnail
                    const thumbnailPath = file.path.replace('.jpg', '_thumb.jpg').replace('.png', '_thumb.jpg');
                    await sharp(file.path)
                        .resize(300, 300, { fit: 'inside', withoutEnlargement: true }) // Increased by 50% from 200px
                        .jpeg({ quality: 80 })
                        .toFile(thumbnailPath);
                    
                    imageAttachments.push({
                        filename: file.originalname,
                        path: file.path,
                        thumbnailPath: thumbnailPath,
                        size: file.size,
                        mimetype: file.mimetype
                    });
                    
                    console.log(`✅ Processed image: ${file.originalname}`);
                } catch (imageError) {
                    console.error(`❌ Image processing failed: ${imageError.message}`);
                }
            }
            
            // Save message to database
            const messageQuery = `
                INSERT INTO user_messages (sender_id, receiver_id, content, timestamp, status, attachment_count)
                VALUES (?, ?, ?, ?, 'sent', ?)
            `;
            
            const finalContent = content || 'IMAGE_MESSAGE';
            const timestamp = Date.now();
            
            const result = await new Promise((resolve, reject) => {
                req.db.run(messageQuery, [senderId, receiverId, finalContent, timestamp, imageAttachments.length], function(err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });
            
            const messageId = result.lastID;
            console.log(`💾 Message saved: ID ${messageId}`);
            
            // Save image attachments
            for (const attachment of imageAttachments) {
                const attachmentQuery = `
                    INSERT INTO user_message_attachments 
                    (message_id, filename, file_path, thumbnail_path, attachment_type, file_size, mime_type)
                    VALUES (?, ?, ?, ?, 'image', ?, ?)
                `;
                
                await new Promise((resolve, reject) => {
                    req.db.run(attachmentQuery, [
                        messageId,
                        attachment.filename,
                        attachment.path,
                        attachment.thumbnailPath,
                        attachment.size,
                        attachment.mimetype
                    ], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                
                console.log(`📎 Attachment saved: ${attachment.filename}`);
            }
            
            // Create message object for response
            const messageData = {
                id: messageId,
                senderId: parseInt(senderId),
                receiverId: parseInt(receiverId),
                content: finalContent,
                timestamp: timestamp,
                status: 'sent',
                attachments: imageAttachments.map(att => ({
                    filename: att.filename,
                    path: att.path.replace('app/', '/'),
                    thumbnailPath: att.thumbnailPath.replace('app/', '/'),
                    size: att.size,
                    type: 'image'
                }))
            };
            
            // Send via WebSocket if available
            if (req.io) {
                req.io.emit('new_message', messageData);
                console.log(`📡 Message broadcasted via WebSocket`);
            }
            
            console.log(`✅ Message sent successfully: ${messageId}`);
            
            res.json({
                success: true,
                message: messageData
            });
            
        } catch (error) {
            console.error('❌ Send message error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to send message'
            });
        }
    }
    
    // Get messages for conversation
    static async getMessages(req, res) {
        try {
            const { userId, partnerId } = req.params;
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            
            console.log(`📋 Getting messages: ${userId} ↔ ${partnerId}`);
            
            // Get messages
            const messagesQuery = `
                SELECT 
                    m.id,
                    m.sender_id as senderId,
                    m.receiver_id as receiverId,
                    m.content,
                    m.timestamp,
                    m.status,
                    m.attachment_count,
                    u.real_name as senderUsername
                FROM user_messages m
                LEFT JOIN users u ON m.sender_id = u.id
                WHERE (m.sender_id = ? AND m.receiver_id = ?) 
                   OR (m.sender_id = ? AND m.receiver_id = ?)
                AND COALESCE(m.message_type, 'text') != 'like'
                ORDER BY m.timestamp DESC
                LIMIT ? OFFSET ?
            `;
            
            const messages = await new Promise((resolve, reject) => {
                req.db.all(messagesQuery, [userId, partnerId, partnerId, userId, limit, offset], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            
            // Get attachments for messages that have them
            for (const message of messages) {
                if (message.attachment_count > 0) {
                    const attachmentsQuery = `
                        SELECT filename, file_path, thumbnail_path, attachment_type, file_size, mime_type
                        FROM user_message_attachments
                        WHERE message_id = ?
                    `;
                    
                    const attachments = await new Promise((resolve, reject) => {
                        req.db.all(attachmentsQuery, [message.id], (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows || []);
                        });
                    });
                    
                    message.attachments = attachments.map(att => ({
                        filename: att.filename,
                        path: att.file_path.replace('app/', '/'),
                        thumbnailPath: att.thumbnail_path.replace('app/', '/'),
                        size: att.file_size,
                        type: att.attachment_type
                    }));
                } else {
                    message.attachments = [];
                }
            }
            
            console.log(`✅ Retrieved ${messages.length} messages`);
            
            res.json({
                success: true,
                messages: messages.reverse() // Reverse to get chronological order
            });
            
        } catch (error) {
            console.error('❌ Get messages error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get messages'
            });
        }
    }
    
    // Serve image files
    static async serveImage(req, res) {
        try {
            const { filename } = req.params;
            const filePath = path.join(__dirname, '../app/uploads/chat_images/', filename);
            
            // Check if file exists
            try {
                await fs.access(filePath);
                res.sendFile(path.resolve(filePath));
            } catch {
                res.status(404).json({ error: 'Image not found' });
            }
            
        } catch (error) {
            console.error('❌ Serve image error:', error);
            res.status(500).json({ error: 'Failed to serve image' });
        }
    }
}

module.exports = {
    ImageMessageController,
    uploadImages: upload.array('images', 5)
};
