/**
 * Account Routes
 * Handles account management and settings endpoints
 * 
 * Routes:
 * - GET /api/settings - Get user settings
 * - POST /api/settings - Update user settings
 * - POST /api/settings/bulk - Bulk update settings
 * - GET /api/account/info - Get account info
 * - GET /api/account/stats - Get account statistics
 * - GET /api/account/sessions - Get active sessions
 * - DELETE /api/account/sessions/:sessionId - Delete session
 * - GET /api/account/export - Export account data
 * - DELETE /api/account/delete - Delete account
 * - POST /api/account/resend-verification - Resend verification
 * - GET /api/account/subscription - Get subscription info
 * - GET /api/account/billing-history - Get billing history
 * - GET /api/billing/plans - Get billing plans
 */

const express = require('express');
const router = express.Router();
const { apiLimiter, strictLimiter, accountLimiter } = require('../middleware/rateLimiter');
const { requestLogger } = require('../middleware/requestLogger');
const { requireAuth } = require('../middleware/authMiddleware');

/**
 * Create account routes
 * @param {Object} authController - AuthController instance
 * @param {Object} authMiddleware - AuthMiddleware instance
 * @returns {express.Router} Express router
 */
function createAccountRoutes(authController, authMiddleware) {
    if (!authController) {
        throw new Error('AuthController is required for account routes');
    }

    // Apply rate limiting and logging to all routes
    router.use(accountLimiter || apiLimiter);
    router.use(requestLogger);

    // Require authentication for all account routes
    if (authMiddleware) {
        router.use(requireAuth(authMiddleware));
    }

    /**
     * GET /api/settings - Get user settings
     */
    router.get('/api/settings', async (req, res) => {
        try {
            await authController.getSettings(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in getSettings:', error);
            res.status(500).json({ success: false, error: 'Failed to get settings' });
        }
    });

    /**
     * POST /api/settings - Update user settings
     */
    router.post('/api/settings', async (req, res) => {
        try {
            await authController.updateSettings(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in updateSettings:', error);
            res.status(500).json({ success: false, error: 'Failed to update settings' });
        }
    });

    /**
     * POST /api/settings/bulk - Bulk update settings
     */
    router.post('/api/settings/bulk', async (req, res) => {
        try {
            await authController.updateSettingsBulk(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in updateSettingsBulk:', error);
            res.status(500).json({ success: false, error: 'Failed to update settings' });
        }
    });

    /**
     * GET /api/account/info - Get account info
     */
    router.get('/api/account/info', async (req, res) => {
        try {
            await authController.getAccountInfo(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in getAccountInfo:', error);
            res.status(500).json({ success: false, error: 'Failed to get account info' });
        }
    });

    /**
     * GET /api/account/stats - Get account statistics
     */
    router.get('/api/account/stats', async (req, res) => {
        try {
            await authController.getAccountStats(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in getAccountStats:', error);
            res.status(500).json({ success: false, error: 'Failed to get account stats' });
        }
    });

    /**
     * GET /api/account/sessions - Get active sessions
     */
    router.get('/api/account/sessions', async (req, res) => {
        try {
            await authController.getActiveSessions(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in getActiveSessions:', error);
            res.status(500).json({ success: false, error: 'Failed to get active sessions' });
        }
    });

    /**
     * DELETE /api/account/sessions/:sessionId - Delete session
     */
    router.delete('/api/account/sessions/:sessionId', async (req, res) => {
        try {
            await authController.revokeSession(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in revokeSession:', error);
            res.status(500).json({ success: false, error: 'Failed to revoke session' });
        }
    });

    /**
     * GET /api/account/export - Export account data
     */
    router.get('/api/account/export', async (req, res) => {
        try {
            await authController.exportAccountData(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in exportAccountData:', error);
            res.status(500).json({ success: false, error: 'Failed to export account data' });
        }
    });

    /**
     * DELETE /api/account/delete - Delete account
     * Uses strict rate limiting for security
     */
    router.delete('/api/account/delete', strictLimiter, async (req, res) => {
        try {
            await authController.deleteAccount(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in deleteAccount:', error);
            res.status(500).json({ success: false, error: 'Failed to delete account' });
        }
    });

    /**
     * POST /api/account/resend-verification - Resend verification
     */
    router.post('/api/account/resend-verification', async (req, res) => {
        try {
            await authController.resendVerificationEmail(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in resendVerificationEmail:', error);
            res.status(500).json({ success: false, error: 'Failed to resend verification email' });
        }
    });

    /**
     * GET /api/account/subscription - Get subscription info
     */
    router.get('/api/account/subscription', async (req, res) => {
        try {
            await authController.getSubscription(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in getSubscription:', error);
            res.status(500).json({ success: false, error: 'Failed to get subscription' });
        }
    });

    /**
     * GET /api/account/billing-history - Get billing history
     */
    router.get('/api/account/billing-history', async (req, res) => {
        try {
            await authController.getBillingHistory(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in getBillingHistory:', error);
            res.status(500).json({ success: false, error: 'Failed to get billing history' });
        }
    });

    /**
     * GET /api/billing/plans - Get billing plans
     */
    router.get('/api/billing/plans', async (req, res) => {
        try {
            await authController.getBillingPlans(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in getBillingPlans:', error);
            res.status(500).json({ success: false, error: 'Failed to get billing plans' });
        }
    });

    return router;
}

module.exports = createAccountRoutes;

