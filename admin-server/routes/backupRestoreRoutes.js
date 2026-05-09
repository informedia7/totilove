const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const backupRestoreController = require('../controllers/backupRestoreController');

// Mounted at /api/backup in routes/index.js so requireAuth does not apply to GET /health etc.
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));
router.use(auditLog);

router.post('/create', backupRestoreController.createBackup.bind(backupRestoreController));
router.get('/list', backupRestoreController.listBackups.bind(backupRestoreController));
router.get('/check-tools', backupRestoreController.checkTools.bind(backupRestoreController));
router.post('/restore', backupRestoreController.restoreBackup.bind(backupRestoreController));
router.delete('/:name', backupRestoreController.deleteBackup.bind(backupRestoreController));

module.exports = router;


