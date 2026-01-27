const express = require('express');
const multer = require('multer');
const { messageCountLimiter } = require('./middleware/rateLimiter');

class MessageRoutes {
    constructor(messageController, authMiddleware) {
        this.messageController = messageController;
        this.authMiddleware = authMiddleware;
        this.router = express.Router();
        this.setupRoutes();
    }

    setupRoutes() {
        const router = this.router;
        
        // Configure multer for file uploads
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, 'app/uploads/chat_images/temp');
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
            }
        });
        
        const upload = multer({ 
            storage: storage,
            limits: {
                fileSize: 5 * 1024 * 1024, // 5MB limit
                files: 5 // Max 5 files
            },
            fileFilter: (req, file, cb) => {
                // Allow only images
                if (file.mimetype.startsWith('image/')) {
                    cb(null, true);
                } else {
                    cb(new Error('Only image files are allowed'));
                }
            }
        });
        
        // Message API routes - SPECIFIC ROUTES FIRST (before wildcards)
        router.post('/validate', (req, res) => this.messageController.validateMessage(req, res)); // Validate message content (bad words, etc.)
        router.post('/send', (req, res) => this.messageController.sendMessage(req, res)); // Text messages only
        router.post('/send-image', upload.array('images', 5), (req, res) => this.messageController.sendImageMessage(req, res)); // Image messages only
        router.get('/conversation/:userId1/:userId2', (req, res) => this.messageController.getConversation(req, res));
        router.get('/inbox', (req, res) => this.messageController.getInboxMessages(req, res));
        router.get('/sent', (req, res) => this.messageController.getSentMessages(req, res));
        router.get('/saved', (req, res) => this.messageController.getSavedMessages(req, res));
        router.post('/save', (req, res) => this.messageController.saveMessage(req, res));
        router.post('/unsave', (req, res) => this.messageController.unsaveMessage(req, res));
        router.post('/bulk-delete', (req, res) => this.messageController.bulkDeleteMessages(req, res));
        router.get('/count', messageCountLimiter, (req, res) => this.messageController.getMessageCount(req, res));
        
        // Mark message as read endpoint
        router.post('/:messageId/mark-read', (req, res) => this.messageController.markMessageAsRead(req, res));
        
        // Mark all messages as read endpoint
        router.post('/mark-all-read', (req, res) => this.messageController.markAllMessagesAsRead(req, res));
        
        // Mark conversation as read endpoint
        router.post('/mark-conversation-read', (req, res) => this.messageController.markConversationAsRead(req, res));
        
        // Clear conversation with deleted user endpoint
        router.post('/clear-deleted-user-conversation', async (req, res) => {
            try {
                await this.messageController.clearDeletedUserConversation(req, res);
            } catch (error) {
                console.error('Route error in clear-deleted-user-conversation:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: 'Internal server error'
                    });
                }
            }
        });
        
        // Remove user from conversation endpoint
        router.post('/remove-user-from-conversation', async (req, res) => {
            try {
                await this.messageController.removeUserFromConversation(req, res);
            } catch (error) {
                console.error('Route error in remove-user-from-conversation:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: 'Internal server error'
                    });
                }
            }
        });
        
        // Get conversations list endpoint
        router.get('/conversations', (req, res) => this.messageController.getConversationsList(req, res));
        
        // Image upload routes for chat
        router.post('/upload-image', (req, res) => this.messageController.uploadChatImage(req, res));
        router.post('/upload-images', (req, res) => this.messageController.uploadChatImages(req, res));
        router.delete('/attachment/:attachmentId', (req, res) => this.messageController.deleteAttachment(req, res));
        
        // NEW ROUTE: Enhanced recall with read status check
        router.post('/:messageId/recall', (req, res) => this.messageController.recallMessage(req, res));
        
        // NEW ROUTE: Check message read status
        router.get('/:messageId/status', (req, res) => this.messageController.getMessageStatus(req, res));
        
        // NEW ROUTE: Get message attachments (for recalled messages)
        router.get('/:messageId/attachments', (req, res) => this.messageController.getMessageAttachments(req, res));
        
        // WILDCARD ROUTES LAST (to avoid conflicts)
        router.delete('/:messageId', (req, res) => this.messageController.deleteMessage(req, res));
    }

    getRouter() {
        return this.router;
    }
}

module.exports = MessageRoutes; 