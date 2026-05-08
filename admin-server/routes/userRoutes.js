const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const userController = require('../controllers/userController');

// All user routes require authentication
router.use(requireAuth);
router.use(auditLog);

// User list with filters
router.get('/', userController.getUsers.bind(userController));

// User summary breakdown
router.get('/summary', userController.getUserSummary.bind(userController));

// Create admin blacklist row (must be before /:id)
router.post(
    '/blacklist',
    requireRole('admin', 'super_admin'),
    userController.addBlacklistEntry.bind(userController)
);

// Blacklist archive row (must be before /:id)
router.put(
    '/blacklist/:entryId',
    requireRole('admin', 'super_admin'),
    userController.updateBlacklistEntry.bind(userController)
);

router.delete(
    '/blacklist/:entryId',
    requireRole('admin', 'super_admin'),
    userController.unblacklistByBlacklistEntryId.bind(userController)
);

// Get user by ID
router.get('/:id', userController.getUserById.bind(userController));

// Update user
router.put('/:id', userController.updateUser.bind(userController));

// Delete user
router.delete('/:id', requireRole('admin', 'super_admin'), userController.deleteUser.bind(userController));

// Blacklist user
router.post('/:id/blacklist', requireRole('admin', 'super_admin'), userController.blacklistUser.bind(userController));

// Suspend user
router.post('/:id/suspend', requireRole('admin', 'super_admin'), userController.suspendUser.bind(userController));

// Unsuspend user
router.delete('/:id/suspend', requireRole('admin', 'super_admin'), userController.unsuspendUser.bind(userController));

// Verify email
router.post('/:id/verify/email', userController.verifyEmail.bind(userController));

// Unverify email
router.delete('/:id/verify/email', userController.unverifyEmail.bind(userController));

// Verify profile
router.post('/:id/verify/profile', userController.verifyProfile.bind(userController));

// Unverify profile
router.delete('/:id/verify/profile', userController.unverifyProfile.bind(userController));

// Bulk operations
router.post('/bulk', requireRole('admin', 'super_admin'), userController.bulkOperation.bind(userController));

module.exports = router;




















































