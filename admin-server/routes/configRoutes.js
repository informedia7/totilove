const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const configController = require('../controllers/configController');

// All config routes require authentication and admin role
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));
router.use(auditLog);

// Configuration routes
router.get('/', configController.getAllSettings.bind(configController));
router.put('/', configController.updateSettings.bind(configController));
router.get('/:key', configController.getSetting.bind(configController));
router.put('/:key', configController.updateSetting.bind(configController));

module.exports = router;




















































