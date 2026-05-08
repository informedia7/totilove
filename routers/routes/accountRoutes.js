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
 * - POST /api/account/change-password - Change account password
 * - GET /api/account/sessions - Get active sessions
 * - DELETE /api/account/sessions/:sessionId - Delete session
 * - GET /api/account/export - Export account data
 * - DELETE /api/account/delete - Delete account
 * - POST /api/account/pause - Pause account visibility and outgoing activity
 * - POST /api/account/resume - Resume account visibility and outgoing activity
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

const SUPPORT_EMAIL_COOLDOWN_SECONDS = 120;
const SUPPORT_DUPLICATE_WINDOW_MINUTES = 30;
const HELP_ISSUE_TYPES = new Map([
    ['technical_problem', 'Technical Problem'],
    ['billing_question', 'Billing Question'],
    ['account_access', 'Account Access'],
    ['report_user', 'Report a User'],
    ['feature_request', 'Feature Request'],
    ['follow_up', 'Follow-up'],
    ['other', 'Other']
]);

async function ensureAdminNotificationsSchema(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS admin_notifications (
            id SERIAL PRIMARY KEY,
            notification_type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            payload JSONB DEFAULT '{}'::jsonb,
            priority VARCHAR(20) DEFAULT 'normal',
            is_read BOOLEAN DEFAULT false,
            read_at TIMESTAMP WITH TIME ZONE,
            created_by_user_id INTEGER,
            created_by_admin_id INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50)`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255)`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS message TEXT`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS admin_reply TEXT`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMP WITH TIME ZONE`);
    await db.query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS replied_by_admin_id INTEGER`);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_type ON admin_notifications(notification_type)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read ON admin_notifications(is_read)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications(created_at DESC)`);
}

function normalizeSupportReply(payload = {}) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const replyMessage = [
        payload.adminReply,
        payload.adminResponse,
        payload.responseMessage,
        payload.replyMessage,
        payload.reply
    ].find((value) => typeof value === 'string' && value.trim().length > 0);

    if (!replyMessage) {
        return null;
    }

    const replyAuthor = [
        payload.adminName,
        payload.adminResponder,
        payload.responderName,
        payload.repliedBy,
        payload.respondedBy
    ].find((value) => typeof value === 'string' && value.trim().length > 0) || 'Support Team';

    const repliedAt = [
        payload.adminReplyAt,
        payload.respondedAt,
        payload.repliedAt,
        payload.responseAt
    ].find((value) => typeof value === 'string' && value.trim().length > 0) || null;

    return {
        message: replyMessage.trim(),
        author: replyAuthor.trim(),
        repliedAt
    };
}

function normalizeSupportTitle(title) {
    if (typeof title !== 'string') {
        return '';
    }

    return title.replace(/^Help Request:\s*/i, '').trim();
}

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
     * POST /api/account/change-password - Change account password
     */
    router.post('/api/account/change-password', (req, res) => authController.changePassword(req, res));

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
     * POST /api/account/pause - Pause account
     */
    router.post('/api/account/pause', strictLimiter, async (req, res) => {
        try {
            await authController.pauseAccount(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in pauseAccount:', error);
            res.status(500).json({ success: false, error: 'Failed to pause account' });
        }
    });

    /**
     * POST /api/account/resume - Resume account
     */
    router.post('/api/account/resume', strictLimiter, async (req, res) => {
        try {
            await authController.resumeAccount(req, res);
        } catch (error) {
            console.error('[AccountRoutes] Error in resumeAccount:', error);
            res.status(500).json({ success: false, error: 'Failed to resume account' });
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
     * POST /api/help/support - Submit help/support request
     */
    router.post('/api/help/support', async (req, res) => {
        try {
            const db = authController.db;
            if (!db || typeof db.query !== 'function') {
                return res.status(500).json({ success: false, error: 'Database unavailable' });
            }

            const { issueType, subject, message, pageUrl, priority } = req.body || {};
            const cleanIssueType = typeof issueType === 'string' ? issueType.trim() : '';
            const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
            const cleanMessage = typeof message === 'string' ? message.trim() : '';
            const cleanPageUrl = typeof pageUrl === 'string' ? pageUrl.trim() : '';
            const normalizedPriority = typeof priority === 'string' ? priority.trim().toLowerCase() : 'normal';

            if (!HELP_ISSUE_TYPES.has(cleanIssueType)) {
                return res.status(400).json({ success: false, error: 'A valid issue type is required' });
            }

            if (!cleanMessage || cleanMessage.length > 5000) {
                return res.status(400).json({ success: false, error: 'Message must be between 1 and 5000 characters' });
            }

            if (cleanSubject.length > 160) {
                return res.status(400).json({ success: false, error: 'Subject is too long' });
            }

            if (cleanPageUrl.length > 500) {
                return res.status(400).json({ success: false, error: 'Page URL is too long' });
            }

            const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent']);
            if (!allowedPriorities.has(normalizedPriority)) {
                return res.status(400).json({ success: false, error: 'Priority value is invalid' });
            }

            const userId = req.user?.id || req.userId;
            if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) {
                return res.status(401).json({ success: false, error: 'Authenticated user is required' });
            }

            const userName = typeof req.user?.real_name === 'string' ? req.user.real_name.trim() : '';
            const userEmail = typeof req.user?.email === 'string' ? req.user.email.trim().toLowerCase() : '';
            if (!userEmail) {
                return res.status(400).json({ success: false, error: 'Authenticated user email is required' });
            }

            await ensureAdminNotificationsSchema(db);

            const cooldownResult = await db.query(
                `SELECT id
                 FROM admin_notifications
                 WHERE notification_type = 'support_message'
                   AND created_by_user_id = $1
                   AND created_at > NOW() - ($2 * interval '1 second')
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [Number(userId), SUPPORT_EMAIL_COOLDOWN_SECONDS]
            );

            if (cooldownResult.rows.length > 0) {
                return res.status(429).json({
                    success: false,
                    error: `Please wait ${SUPPORT_EMAIL_COOLDOWN_SECONDS} seconds before sending another help request.`
                });
            }

            const duplicateResult = await db.query(
                `SELECT id
                 FROM admin_notifications
                 WHERE notification_type = 'support_message'
                   AND created_by_user_id = $1
                   AND message = $2
                   AND created_at > NOW() - ($3 * interval '1 minute')
                 LIMIT 1`,
                [Number(userId), cleanMessage, SUPPORT_DUPLICATE_WINDOW_MINUTES]
            );

            if (duplicateResult.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: 'Duplicate help request detected. Please update the message before sending again.'
                });
            }

            const issueTypeLabel = HELP_ISSUE_TYPES.get(cleanIssueType);
            const title = cleanSubject || issueTypeLabel;

            await db.query(
                `INSERT INTO admin_notifications (notification_type, title, message, payload, priority, is_read, created_by_user_id)
                 VALUES ($1, $2, $3, $4::jsonb, $5, false, $6)`,
                [
                    'support_message',
                    title,
                    cleanMessage,
                    JSON.stringify({
                        source: 'main_app_help_page',
                        issueType: cleanIssueType,
                        issueTypeLabel,
                        subject: cleanSubject || null,
                        pageUrl: cleanPageUrl || null,
                        name: userName || null,
                        email: userEmail,
                        userId: Number(userId)
                    }),
                    normalizedPriority,
                    Number(userId)
                ]
            );

            res.status(201).json({ success: true, message: 'Help request submitted successfully' });
        } catch (error) {
            console.error('[AccountRoutes] Error in support help request:', error);
            res.status(500).json({ success: false, error: 'Failed to submit help request' });
        }
    });

    /**
     * GET /api/help/support-history - Get current user's support requests and admin replies
     */
    router.get('/api/help/support-history', async (req, res) => {
        try {
            const db = authController.db;
            if (!db || typeof db.query !== 'function') {
                return res.status(500).json({ success: false, error: 'Database unavailable' });
            }

            const userId = Number(req.user?.id || req.userId);
            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(401).json({ success: false, error: 'Authenticated user is required' });
            }

            await ensureAdminNotificationsSchema(db);

            const result = await db.query(
                `SELECT
                    n.id,
                    n.title,
                    n.message,
                    n.priority,
                    n.created_at,
                    n.is_read,
                    n.payload,
                    n.admin_reply,
                    n.admin_replied_at,
                    n.replied_by_admin_id,
                    au.username AS replied_by_admin_username
                 FROM admin_notifications n
                 LEFT JOIN admin_users au ON au.id = n.replied_by_admin_id
                 WHERE n.notification_type = 'support_message'
                   AND n.created_by_user_id = $1
                 ORDER BY n.created_at DESC
                 LIMIT 25`,
                [userId]
            );

            const items = (result.rows || []).map((row) => {
                const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
                const hasDbReply = typeof row.admin_reply === 'string' && row.admin_reply.trim().length > 0;
                const supportReply = hasDbReply
                    ? {
                        message: row.admin_reply.trim(),
                        author: (typeof row.replied_by_admin_username === 'string' && row.replied_by_admin_username.trim())
                            ? row.replied_by_admin_username.trim()
                            : 'Support Team',
                        repliedAt: row.admin_replied_at || null
                    }
                    : null;
                const issueTypeKey = typeof payload.issueType === 'string' && HELP_ISSUE_TYPES.has(payload.issueType)
                    ? payload.issueType
                    : null;
                const issueType = typeof payload.issueTypeLabel === 'string' && payload.issueTypeLabel.trim()
                    ? payload.issueTypeLabel.trim()
                    : HELP_ISSUE_TYPES.get(payload.issueType) || 'General';
                const normalizedTitle = normalizeSupportTitle(row.title);

                return {
                    id: row.id,
                    title: normalizedTitle,
                    subject: normalizeSupportTitle(payload.subject || row.title),
                    message: row.message,
                    priority: row.priority || 'normal',
                    issueTypeKey,
                    issueType,
                    createdAt: row.created_at,
                    isRead: Boolean(row.is_read),
                    status: supportReply ? 'responded' : (row.is_read ? 'in_review' : 'new'),
                    supportReply,
                    pageUrl: payload.pageUrl || null
                };
            });

            res.json({ success: true, items });
        } catch (error) {
            console.error('[AccountRoutes] Error getting support history:', error);
            res.status(500).json({ success: false, error: 'Failed to load support history' });
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

