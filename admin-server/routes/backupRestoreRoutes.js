const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const backupRestoreController = require('../controllers/backupRestoreController');

// All backup/restore routes require authentication and admin role
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));
router.use(auditLog);

// Create backup
router.post('/api/backup/create', backupRestoreController.createBackup.bind(backupRestoreController));

// List backups
router.get('/api/backup/list', backupRestoreController.listBackups.bind(backupRestoreController));

// Check PostgreSQL tools
router.get('/api/backup/check-tools', backupRestoreController.checkTools.bind(backupRestoreController));

// Restore backup
router.post('/api/backup/restore', backupRestoreController.restoreBackup.bind(backupRestoreController));

// Delete backup
router.delete('/api/backup/:name', backupRestoreController.deleteBackup.bind(backupRestoreController));

module.exports = router;


