const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const subscriptionControlController = require('../controllers/subscriptionControlController');

// All routes require authentication and admin role
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));
router.use(auditLog);

// Get subscription control settings
router.get('/settings', subscriptionControlController.getSettings.bind(subscriptionControlController));

// Update subscription control settings
router.put('/settings', subscriptionControlController.updateSettings.bind(subscriptionControlController));

// Check if user requires subscription (for API use)
router.get('/check/:userId', subscriptionControlController.checkRequirement.bind(subscriptionControlController));

module.exports = router;




















































