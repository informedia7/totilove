const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

// Import route modules
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const statsRoutes = require('./statsRoutes');
const configRoutes = require('./configRoutes');
const paymentRoutes = require('./paymentRoutes');
const subscriptionControlRoutes = require('./subscriptionControlRoutes');
const blockedReportedRoutes = require('./blockedReportedRoutes');
const imageApprovalRoutes = require('./imageApprovalRoutes');
const exportImportRoutes = require('./exportImportRoutes');
const messageRoutes = require('./messageRoutes');
const backupRestoreRoutes = require('./backupRestoreRoutes');
const corruptionRoutes = require('./corruptionRoutes');
const pageAnalysisRoutes = require('./pageAnalysisRoutes');

// Mount routes
router.use('/', authRoutes);
router.use('/api/users', userRoutes);
router.use('/api/stats', statsRoutes);
router.use('/api/config', configRoutes);
router.use('/api/payments', paymentRoutes);
router.use('/api/subscription-control', subscriptionControlRoutes);
router.use('/api/blocked-reported', blockedReportedRoutes);
router.use('/api/image-approval', imageApprovalRoutes);
router.use('/api/export-import', exportImportRoutes);
router.use('/api/messages', messageRoutes);
router.use('/', backupRestoreRoutes);
router.use('/api/corruption', corruptionRoutes);
router.use('/api/page-analysis', pageAnalysisRoutes);

// User management page (HTML)
router.get('/users', requireAuth, (req, res) => {
    res.render('users.html', { admin: req.admin });
});

// Payment management page (HTML)
router.get('/payments', requireAuth, (req, res) => {
    res.render('payments.html', { admin: req.admin });
});

// Subscription control page (HTML)
router.get('/subscription-control', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    res.render('subscription-control.html', { admin: req.admin });
});

// Blocked & Reported users page (HTML)
router.get('/blocked-reported', requireAuth, (req, res) => {
    res.render('blocked-reported.html', { admin: req.admin });
});

// Image Approval page (HTML)
router.get('/image-approval', requireAuth, (req, res) => {
    res.render('image-approval.html', { admin: req.admin });
});

// Statistics page (HTML)
router.get('/statistics', requireAuth, (req, res) => {
    res.render('statistics.html', { admin: req.admin });
});

// Configuration page (HTML)
router.get('/configuration', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    res.render('configuration.html', { admin: req.admin });
});

// Export/Import page (HTML)
router.get('/export-import', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    res.render('export-import.html', { admin: req.admin });
});

// Messages management page (HTML)
router.get('/messages', requireAuth, (req, res) => {
    res.render('messages.html', { admin: req.admin });
});

// Backup & Restore page (HTML)
router.get('/backup-restore', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    res.render('backup-restore.html', { admin: req.admin });
});

// Database Management page (HTML)
router.get('/database-management', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    res.render('database-management.html', { admin: req.admin });
});

// Root route
router.get('/', (req, res) => {
    if (req.session && req.session.adminId) {
        return res.redirect('/dashboard');
    }
    res.redirect('/login');
});

module.exports = router;




















































