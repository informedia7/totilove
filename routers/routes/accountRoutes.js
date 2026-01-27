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
const { asyncHandler } = require('../middleware/errorHandler');
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

    // Apply rate limiting only to account-related API paths
    const accountRateLimitedPaths = ['/api/settings', '/api/account', '/api/billing'];
    router.use(accountRateLimitedPaths, accountLimiter || apiLimiter);
    router.use(requestLogger);

    // Require authentication for all account routes
    if (authMiddleware) {
        router.use(requireAuth(authMiddleware));
    }

    /**
     * GET /api/settings - Get user settings
     */
    router.get('/api/settings', asyncHandler(async (req, res) => {
        await authController.getSettings(req, res);
    }));

    /**
     * POST /api/settings - Update user settings
     */
    router.post('/api/settings', asyncHandler(async (req, res) => {
        await authController.updateSettings(req, res);
    }));

    /**
     * POST /api/settings/bulk - Bulk update settings
     */
    router.post('/api/settings/bulk', asyncHandler(async (req, res) => {
        await authController.updateSettingsBulk(req, res);
    }));

    /**
     * GET /api/account/info - Get account info
     */
    router.get('/api/account/info', asyncHandler(async (req, res) => {
        await authController.getAccountInfo(req, res);
    }));

    /**
     * GET /api/account/stats - Get account statistics
     */
    router.get('/api/account/stats', asyncHandler(async (req, res) => {
        await authController.getAccountStats(req, res);
    }));

    /**
     * GET /api/account/sessions - Get active sessions
     */
    router.get('/api/account/sessions', asyncHandler(async (req, res) => {
        await authController.getActiveSessions(req, res);
    }));

    /**
     * DELETE /api/account/sessions/:sessionId - Delete session
     */
    router.delete('/api/account/sessions/:sessionId', asyncHandler(async (req, res) => {
        await authController.revokeSession(req, res);
    }));

    /**
     * GET /api/account/export - Export account data
     */
    router.get('/api/account/export', asyncHandler(async (req, res) => {
        await authController.exportAccountData(req, res);
    }));

    /**
     * DELETE /api/account/delete - Delete account
     * Uses strict rate limiting for security
     */
    router.delete('/api/account/delete', strictLimiter, asyncHandler(async (req, res) => {
        await authController.deleteAccount(req, res);
    }));

    /**
     * POST /api/account/resend-verification - Resend verification
     */
    router.post('/api/account/resend-verification', asyncHandler(async (req, res) => {
        await authController.resendVerificationEmail(req, res);
    }));

    /**
     * GET /api/account/subscription - Get subscription info
     */
    router.get('/api/account/subscription', asyncHandler(async (req, res) => {
        await authController.getSubscription(req, res);
    }));

    /**
     * GET /api/account/billing-history - Get billing history
     */
    router.get('/api/account/billing-history', asyncHandler(async (req, res) => {
        await authController.getBillingHistory(req, res);
    }));

    /**
     * GET /api/billing/plans - Get billing plans
     */
    router.get('/api/billing/plans', asyncHandler(async (req, res) => {
        await authController.getBillingPlans(req, res);
    }));

    return router;
}

module.exports = createAccountRoutes;

