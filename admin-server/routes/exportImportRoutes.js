const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const exportImportController = require('../controllers/exportImportController');

// All routes require authentication and admin role
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));
router.use(auditLog);

// Export/Import routes
router.get('/users', exportImportController.exportUsers.bind(exportImportController));
router.post('/users', exportImportController.importUsers.bind(exportImportController));
router.get('/payments', exportImportController.exportPayments.bind(exportImportController));

module.exports = router;




















































