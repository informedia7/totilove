const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Middleware to log all admin actions to audit log
 */
const auditLog = async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to capture response
    res.json = function(data) {
        // Log the action after response is sent
        if (req.admin && req.path.startsWith('/api/')) {
            logAdminAction(req, data).catch(err => {
                logger.error('Failed to log admin action:', err);
            });
        }
        return originalJson(data);
    };

    next();
};

/**
 * Log admin action to database
 */
const logAdminAction = async (req, data) => {
    try {
        const actionType = determineActionType(req);
        const targetUserId = extractTargetUserId(req);
        const details = {
            method: req.method,
            path: req.path,
            params: req.params,
            query: req.query,
            body: sanitizeBody(req.body),
            success: data.success !== false,
            response: sanitizeResponse(data)
        };

        await query(
            `INSERT INTO admin_actions (admin_id, action_type, target_user_id, details, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [req.admin.id, actionType, targetUserId, JSON.stringify(details)]
        );
    } catch (error) {
        logger.error('Error logging admin action:', error);
    }
};

/**
 * Determine action type from request
 */
const determineActionType = (req) => {
    const path = req.path.toLowerCase();
    const method = req.method.toUpperCase();

    if (path.includes('/users')) {
        if (method === 'GET') return 'view_user';
        if (method === 'PUT') return 'update_user';
        if (method === 'DELETE') return 'delete_user';
        if (path.includes('/ban')) return method === 'POST' ? 'ban_user' : 'unban_user';
        if (path.includes('/verify')) return method === 'POST' ? 'verify_user' : 'unverify_user';
        if (path.includes('/reset-password')) return 'reset_password';
        if (path.includes('/notify')) return 'send_notification';
        if (path.includes('/bulk')) return 'bulk_operation';
    }

    if (path.includes('/stats')) return 'view_stats';
    if (path.includes('/config')) return method === 'PUT' ? 'update_config' : 'view_config';
    if (path.includes('/export')) return 'export_data';
    if (path.includes('/import')) return 'import_data';

    return 'unknown_action';
};

/**
 * Extract target user ID from request
 */
const extractTargetUserId = (req) => {
    if (req.params.id) return parseInt(req.params.id);
    if (req.params.userId) return parseInt(req.params.userId);
    if (req.body.userId) return parseInt(req.body.userId);
    if (req.body.userIds && Array.isArray(req.body.userIds)) {
        return req.body.userIds[0]; // Return first ID for bulk operations
    }
    return null;
};

/**
 * Sanitize request body (remove sensitive data)
 */
const sanitizeBody = (body) => {
    if (!body) return null;
    const sanitized = { ...body };
    delete sanitized.password;
    delete sanitized.password_hash;
    delete sanitized.session_token;
    return sanitized;
};

/**
 * Sanitize response data
 */
const sanitizeResponse = (data) => {
    if (!data) return null;
    // Only include success status, not full data
    return {
        success: data.success,
        message: data.message || null
    };
};

module.exports = {
    auditLog
};




















































