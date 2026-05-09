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
const chatImageMonitorRoutes = require('./chatImageMonitorRoutes');
const backupRestoreRoutes = require('./backupRestoreRoutes');
const corruptionRoutes = require('./corruptionRoutes');
const pageAnalysisRoutes = require('./pageAnalysisRoutes');
const presenceTestRoutes = require('./presenceTestRoutes');
const analysisTestingRoutes = require('./analysisTestingRoutes');

const SUPPORT_EMAIL_COOLDOWN_SECONDS = Number.parseInt(process.env.SUPPORT_EMAIL_COOLDOWN_SECONDS || '120', 10);
const SUPPORT_DUPLICATE_WINDOW_MINUTES = Number.parseInt(process.env.SUPPORT_DUPLICATE_WINDOW_MINUTES || '30', 10);

async function ensureAdminNotificationsSchema(query) {
    await query(`
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
            admin_reply TEXT,
            admin_replied_at TIMESTAMP WITH TIME ZONE,
            replied_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Backfill legacy admin_notifications schemas created before support inbox integration.
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50)`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255)`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS message TEXT`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS admin_reply TEXT`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMP WITH TIME ZONE`);
    await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS replied_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL`);

    await query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'admin_notifications'
                  AND column_name = 'admin_replied_by_admin_id'
            ) THEN
                UPDATE admin_notifications
                SET replied_by_admin_id = admin_replied_by_admin_id
                WHERE replied_by_admin_id IS NULL
                  AND admin_replied_by_admin_id IS NOT NULL;

                ALTER TABLE admin_notifications DROP COLUMN admin_replied_by_admin_id;
            END IF;
        END $$;
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_type ON admin_notifications(notification_type)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read ON admin_notifications(is_read)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications(created_at DESC)`);
}

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
router.use('/api/chat-images', chatImageMonitorRoutes);
router.use('/api/backup', backupRestoreRoutes);
router.use('/api/corruption', corruptionRoutes);
router.use('/api/page-analysis', pageAnalysisRoutes);
router.use('/api/presence-tests', presenceTestRoutes);

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

// Chat images monitor (HTML)
router.get('/chat-images', requireAuth, (req, res) => {
    res.render('chat-images.html', { admin: req.admin });
});

// Public support submit endpoint (used by app footer contact page)
router.post('/api/public/support', async (req, res) => {
    try {
        const { query } = require('../config/database');
        const { name, email, subject, message, userId } = req.body || {};

        if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string') {
            return res.status(400).json({ success: false, error: 'name, email and message are required' });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();
        const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
        const cleanMessage = message.trim();

        if (!cleanName || !cleanEmail || !cleanMessage) {
            return res.status(400).json({ success: false, error: 'name, email and message cannot be empty' });
        }

        if (cleanName.length > 120) {
            return res.status(400).json({ success: false, error: 'name is too long' });
        }

        if (cleanEmail.length > 254) {
            return res.status(400).json({ success: false, error: 'email is too long' });
        }

        if (cleanSubject.length > 160) {
            return res.status(400).json({ success: false, error: 'subject is too long' });
        }

        if (cleanMessage.length < 10 || cleanMessage.length > 5000) {
            return res.status(400).json({ success: false, error: 'message must be between 10 and 5000 characters' });
        }

        let cleanUserId = null;
        if (typeof userId !== 'undefined' && userId !== null) {
            cleanUserId = Number(userId);
            if (!Number.isInteger(cleanUserId) || cleanUserId <= 0) {
                return res.status(400).json({ success: false, error: 'userId must be a positive integer' });
            }
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(cleanEmail)) {
            return res.status(400).json({ success: false, error: 'email is invalid' });
        }

        await ensureAdminNotificationsSchema(query);

        const cooldownResult = await query(
            `SELECT id
             FROM admin_notifications
             WHERE notification_type = 'support_message'
               AND payload->>'email' = $1
               AND created_at > NOW() - ($2 * interval '1 second')
             ORDER BY created_at DESC
             LIMIT 1`,
            [cleanEmail, SUPPORT_EMAIL_COOLDOWN_SECONDS]
        );

        if (cooldownResult.rows.length > 0) {
            return res.status(429).json({
                success: false,
                error: `Please wait ${SUPPORT_EMAIL_COOLDOWN_SECONDS} seconds before sending another message.`
            });
        }

        const duplicateResult = await query(
            `SELECT id
             FROM admin_notifications
             WHERE notification_type = 'support_message'
               AND payload->>'email' = $1
               AND message = $2
               AND created_at > NOW() - ($3 * interval '1 minute')
             LIMIT 1`,
            [cleanEmail, cleanMessage, SUPPORT_DUPLICATE_WINDOW_MINUTES]
        );

        if (duplicateResult.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Duplicate support message detected. Please update your message before sending again.'
            });
        }

        const title = cleanSubject || 'Support Request';
        await query(
            `INSERT INTO admin_notifications (notification_type, title, message, payload, priority, is_read, created_by_user_id)
             VALUES ($1, $2, $3, $4::jsonb, $5, false, $6)`,
            [
                'support_message',
                title,
                cleanMessage,
                JSON.stringify({
                    name: cleanName,
                    email: cleanEmail,
                    subject: cleanSubject || null,
                    userId: cleanUserId,
                    source: 'footer_contact_page'
                }),
                'normal',
                cleanUserId
            ]
        );

        return res.status(201).json({ success: true, message: 'Support message submitted successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to submit support message' });
    }
});

// Public support replies endpoint (used by app to read admin responses)
router.post('/api/public/support/replies', async (req, res) => {
    try {
        const { query } = require('../config/database');
        const { email, userId, limit } = req.body || {};

        if (typeof email !== 'string') {
            return res.status(400).json({ success: false, error: 'email is required' });
        }

        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || cleanEmail.length > 254) {
            return res.status(400).json({ success: false, error: 'email is invalid' });
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(cleanEmail)) {
            return res.status(400).json({ success: false, error: 'email is invalid' });
        }

        let cleanUserId = null;
        if (typeof userId !== 'undefined' && userId !== null && userId !== '') {
            cleanUserId = Number(userId);
            if (!Number.isInteger(cleanUserId) || cleanUserId <= 0) {
                return res.status(400).json({ success: false, error: 'userId must be a positive integer' });
            }
        }

        const maxLimit = 100;
        const parsedLimit = Number(limit);
        const cleanLimit = Number.isInteger(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, maxLimit)
            : 50;

        await ensureAdminNotificationsSchema(query);

        const params = [cleanEmail, cleanLimit];
        let userFilter = '';

        if (cleanUserId !== null) {
            params.push(String(cleanUserId));
            userFilter = ` AND COALESCE(payload->>'userId', '') = $3 `;
        }

        const result = await query(
            `SELECT
                id,
                COALESCE(payload->>'subject', title) AS subject,
                message,
                admin_reply,
                created_at,
                admin_replied_at
             FROM admin_notifications
             WHERE notification_type = 'support_message'
               AND payload->>'email' = $1
               AND COALESCE(admin_reply, '') <> ''
               ${userFilter}
             ORDER BY admin_replied_at DESC NULLS LAST, created_at DESC
             LIMIT $2`,
            params
        );

        return res.json({
            success: true,
            replies: result.rows || []
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to fetch support replies' });
    }
});

// Support inbox page (HTML)
router.get('/support', requireAuth, async (req, res) => {
    try {
        const { query } = require('../config/database');
        await ensureAdminNotificationsSchema(query);

        const result = await query(
            `SELECT
                id,
                title,
                message,
                created_at,
                TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS submitted_at_ts,
                COALESCE(is_read, false) AS is_read,
                admin_reply,
                admin_replied_at,
                TO_CHAR(admin_replied_at, 'YYYY-MM-DD HH24:MI:SS') AS admin_replied_at_ts,
                COALESCE(payload->>'name', 'Unknown') AS name,
                COALESCE(payload->>'email', 'N/A') AS email,
                COALESCE(payload->>'subject', title) AS subject
             FROM admin_notifications
             WHERE notification_type = 'support_message'
             ORDER BY created_at DESC
             LIMIT 200`
        );

        res.render('support.html', {
            admin: req.admin,
            supportMessages: result.rows || [],
            supportError: null
        });
    } catch (error) {
        res.render('support.html', {
            admin: req.admin,
            supportMessages: [],
            supportError: error.message || 'Failed to load support messages'
        });
    }
});

// Mark one support notification as read
router.post('/api/support/:id/read', requireAuth, async (req, res) => {
    try {
        const { query } = require('../config/database');
        await ensureAdminNotificationsSchema(query);
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid support notification id' });
        }

        const result = await query(
            `UPDATE admin_notifications
             SET is_read = true, read_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND notification_type = 'support_message'
               AND COALESCE(is_read, false) = false`,
            [id]
        );

        return res.json({
            success: true,
            updated: result.rowCount || 0
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to mark support notification as read'
        });
    }
});

// Save/update admin reply for one support notification
router.post('/api/support/:id/reply', requireAuth, async (req, res) => {
    try {
        const { query } = require('../config/database');
        await ensureAdminNotificationsSchema(query);

        const id = Number(req.params.id);
        const { reply } = req.body || {};

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid support notification id' });
        }

        if (typeof reply !== 'string') {
            return res.status(400).json({ success: false, error: 'reply is required' });
        }

        const cleanReply = reply.trim();
        if (!cleanReply) {
            return res.status(400).json({ success: false, error: 'reply cannot be empty' });
        }

        if (cleanReply.length > 5000) {
            return res.status(400).json({ success: false, error: 'reply is too long' });
        }

        const adminId = req.admin && Number.isInteger(req.admin.id) ? req.admin.id : null;

        const result = await query(
            `WITH target AS (
                SELECT
                    id,
                    NULLIF(LOWER(TRIM(payload->>'email')), '') AS email_key,
                    LOWER(TRIM(COALESCE(payload->>'name', ''))) AS name_key
                FROM admin_notifications
                WHERE id = $1
                  AND notification_type = 'support_message'
            ),
            replied AS (
                UPDATE admin_notifications n
                SET admin_reply = $2,
                    admin_replied_at = CURRENT_TIMESTAMP,
                    replied_by_admin_id = $3,
                    is_read = true,
                    read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                FROM target t
                WHERE n.id = t.id
                RETURNING n.id, n.admin_reply, n.admin_replied_at, t.email_key, t.name_key
            ),
            marked_thread AS (
                UPDATE admin_notifications n
                SET is_read = true,
                    read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                FROM replied r
                WHERE n.notification_type = 'support_message'
                  AND COALESCE(n.is_read, false) = false
                  AND (
                    (r.email_key IS NOT NULL AND NULLIF(LOWER(TRIM(n.payload->>'email')), '') = r.email_key)
                    OR
                    (r.email_key IS NULL AND LOWER(TRIM(COALESCE(n.payload->>'name', ''))) = r.name_key)
                  )
                RETURNING n.id
            )
            SELECT id, admin_reply, admin_replied_at
            FROM replied`,
            [id, cleanReply, adminId]
        );

        if (!result.rowCount) {
            return res.status(404).json({ success: false, error: 'Support message not found' });
        }

        return res.json({
            success: true,
            reply: result.rows[0]
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to save support reply'
        });
    }
});

// Delete one support message
router.post('/api/support/:id/delete', requireAuth, async (req, res) => {
    try {
        const { query } = require('../config/database');
        await ensureAdminNotificationsSchema(query);

        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid support notification id' });
        }

        const result = await query(
            `DELETE FROM admin_notifications
             WHERE id = $1
               AND notification_type = 'support_message'`,
            [id]
        );

        return res.json({
            success: true,
            deleted: result.rowCount || 0
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete support message'
        });
    }
});

// Delete entire support thread using message id as anchor
router.post('/api/support/:id/delete-thread', requireAuth, async (req, res) => {
    try {
        const { query } = require('../config/database');
        await ensureAdminNotificationsSchema(query);

        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid support notification id' });
        }

        const result = await query(
            `WITH target AS (
                SELECT
                    id,
                    NULLIF(LOWER(TRIM(payload->>'email')), '') AS email_key,
                    LOWER(TRIM(COALESCE(payload->>'name', ''))) AS name_key
                FROM admin_notifications
                WHERE id = $1
                  AND notification_type = 'support_message'
            ),
            deleted AS (
                DELETE FROM admin_notifications n
                USING target t
                WHERE n.notification_type = 'support_message'
                  AND (
                    (t.email_key IS NOT NULL AND NULLIF(LOWER(TRIM(n.payload->>'email')), '') = t.email_key)
                    OR
                    (t.email_key IS NULL AND LOWER(TRIM(COALESCE(n.payload->>'name', ''))) = t.name_key)
                  )
                RETURNING n.id
            )
            SELECT COUNT(*)::int AS deleted_count
            FROM deleted`,
            [id]
        );

        const deleted = result.rows[0] ? Number(result.rows[0].deleted_count) : 0;
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Support thread not found' });
        }

        return res.json({
            success: true,
            deleted
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete support thread'
        });
    }
});

// Delete selected support messages
router.post('/api/support/delete', requireAuth, async (req, res) => {
    try {
        const { query } = require('../config/database');
        await ensureAdminNotificationsSchema(query);

        const { ids } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'ids array is required' });
        }

        const cleanIds = Array.from(new Set(ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)));
        if (cleanIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid ids provided' });
        }

        const result = await query(
            `DELETE FROM admin_notifications
             WHERE notification_type = 'support_message'
               AND id = ANY($1::int[])
             RETURNING id`,
            [cleanIds]
        );

        return res.json({
            success: true,
            deleted: result.rowCount || 0,
            deletedIds: result.rows.map(row => row.id)
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete selected support messages'
        });
    }
});

// Mark all support notifications as read
router.post('/api/support/mark-all-read', requireAuth, async (req, res) => {
    try {
        const { query } = require('../config/database');
        await ensureAdminNotificationsSchema(query);

        const result = await query(
            `UPDATE admin_notifications
             SET is_read = true, read_at = CURRENT_TIMESTAMP
             WHERE notification_type = 'support_message'
               AND COALESCE(is_read, false) = false`
        );

        return res.json({
            success: true,
            updated: result.rowCount || 0
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to mark all support notifications as read'
        });
    }
});

// Backup & Restore page (HTML)
router.get('/backup-restore', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    res.render('backup-restore.html', { admin: req.admin });
});

// Database Management page (HTML)
router.get('/database-management', requireAuth, requireRole('admin', 'super_admin'), (req, res) => {
    res.render('database-management.html', { admin: req.admin });
});

// Analysis & Testing page (HTML)
router.get('/analysis-testing', requireAuth, async (req, res) => {
    try {
        const { query } = require('../config/database');
        const result = await query(
            `SELECT user_id, violation_type, details, occurred_at, ip_address, user_agent
             FROM admin_rate_limiter_violations
             ORDER BY occurred_at DESC
             LIMIT 100`
        );
        res.render('analysis-testing.html', { admin: req.admin, rateLimiterViolations: result.rows || [] });
    } catch (error) {
        res.render('analysis-testing.html', { admin: req.admin, rateLimiterViolations: [] });
    }
});

// Route for analysis & testing API endpoints
router.use('/analysis-testing', analysisTestingRoutes);

// Root route
router.get('/', (req, res) => {
    if (req.session && req.session.adminId) {
        return res.redirect('/dashboard');
    }
    res.redirect('/login');
});

module.exports = router;




















































