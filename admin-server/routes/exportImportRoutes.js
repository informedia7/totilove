const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const exportImportController = require('../controllers/exportImportController');
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs');

const uploadsTmpDir = path.join(os.tmpdir(), 'totilove-admin-uploads');
if (!fs.existsSync(uploadsTmpDir)) {
    fs.mkdirSync(uploadsTmpDir, { recursive: true });
}

const zipUpload = multer({
    dest: uploadsTmpDir,
    limits: {
        fileSize: 1024 * 1024 * 1024, // 1GB
        files: 1
    },
    fileFilter: (_req, file, cb) => {
        const name = String(file?.originalname || '').toLowerCase();
        if (name.endsWith('.zip') || file?.mimetype === 'application/zip' || file?.mimetype === 'application/x-zip-compressed') {
            return cb(null, true);
        }
        return cb(new Error('Only .zip files are allowed'));
    }
});

// All routes require authentication and admin role
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));
router.use(auditLog);

// Export/Import routes
router.get('/users', exportImportController.exportUsers.bind(exportImportController));
router.post('/users', exportImportController.importUsers.bind(exportImportController));
router.get('/payments', exportImportController.exportPayments.bind(exportImportController));
router.get('/images/info', exportImportController.getUploadsInfo.bind(exportImportController));
router.get('/images', exportImportController.exportUploadsFolder.bind(exportImportController));
router.get('/images/list', exportImportController.listUploadsFiles.bind(exportImportController));
router.post('/images', zipUpload.single('zip'), exportImportController.importUploadsFolder.bind(exportImportController));

module.exports = router;




















































