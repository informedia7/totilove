const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const messageController = require('../controllers/messageController');

// All routes require authentication
router.use(requireAuth);

// Message management routes
router.get('/', messageController.getAllMessages.bind(messageController));
router.get('/stats', messageController.getMessageStats.bind(messageController));
router.get('/:messageId', messageController.getMessageById.bind(messageController));
router.post('/', messageController.addMessage.bind(messageController));
router.put('/:messageId', messageController.updateMessage.bind(messageController));
router.delete('/:messageId', messageController.deleteMessage.bind(messageController));
router.post('/:messageId/toggle-recall', messageController.toggleRecall.bind(messageController));

module.exports = router;



















































