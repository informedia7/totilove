const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const blockedReportedController = require('../controllers/blockedReportedController');

// All routes require authentication
router.use(requireAuth);
router.use(auditLog);

// Blocked users routes
router.get('/blocked', blockedReportedController.getBlockedUsers.bind(blockedReportedController));
router.delete('/blocked/:id', blockedReportedController.deleteBlock.bind(blockedReportedController));

// Reported users routes
router.get('/reported', blockedReportedController.getReportedUsers.bind(blockedReportedController));
router.put('/reported/:id/status', blockedReportedController.updateReportStatus.bind(blockedReportedController));

// Messages route
router.get('/messages', blockedReportedController.getMessagesBetweenUsers.bind(blockedReportedController));

// Statistics route
router.get('/statistics', blockedReportedController.getStatistics.bind(blockedReportedController));

module.exports = router;




















































