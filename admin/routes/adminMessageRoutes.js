const express = require('express');
const router = express.Router();
const AdminMessageController = require('../controllers/adminMessageController');

const adminMessageController = new AdminMessageController();

// Admin message management routes
router.get('/', adminMessageController.getAllMessages.bind(adminMessageController));
router.post('/', adminMessageController.addMessage.bind(adminMessageController));
router.put('/:messageId', adminMessageController.updateMessage.bind(adminMessageController));
router.delete('/:messageId', adminMessageController.deleteMessage.bind(adminMessageController));
router.post('/:messageId/toggle-recall', adminMessageController.toggleRecall.bind(adminMessageController));
router.get('/stats', adminMessageController.getMessageStats.bind(adminMessageController));

module.exports = router;
