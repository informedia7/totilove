const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const corruptionController = require('../controllers/corruptionController');

// All corruption routes require authentication and admin role
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));
router.use(auditLog);

// Table statistics route - must be before other routes to avoid conflicts
router.get('/tables', corruptionController.getTableStatistics.bind(corruptionController));

// Corruption check route
router.get('/check', corruptionController.checkCorruption.bind(corruptionController));

// Corruption fix route
router.post('/fix', corruptionController.fixCorruption.bind(corruptionController));

module.exports = router;






















