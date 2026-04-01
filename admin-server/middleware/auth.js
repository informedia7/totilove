const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Middleware to check if user is authenticated (has active session)
 */
const requireAuth = async (req, res, next) => {
    try {
        if (!req.session || !req.session.adminId) {
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }
            return res.redirect('/login');
        }

        // Verify admin user still exists and is active
        const result = await query(
            'SELECT id, username, role, status FROM admin_users WHERE id = $1 AND status = $2',
            [req.session.adminId, 'active']
        );

        if (result.rows.length === 0) {
            req.session.destroy();
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({
                    success: false,
                    error: 'Admin account not found or inactive'
                });
            }
            return res.redirect('/login');
        }

        // Attach admin info to request
        req.admin = result.rows[0];
        next();
    } catch (error) {
        logger.error('Auth middleware error:', error);
        if (req.path.startsWith('/api/')) {
            return res.status(500).json({
                success: false,
                error: 'Authentication error'
            });
        }
        return res.redirect('/login');
    }
};

/**
 * Middleware to check admin role/permissions
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        if (!allowedRoles.includes(req.admin.role)) {
            logger.warn(`Access denied for admin ${req.admin.id} - role: ${req.admin.role}, required: ${allowedRoles.join(', ')}`);
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }

        next();
    };
};

/**
 * Middleware to check IP whitelist (if configured)
 */
const checkIPWhitelist = (req, res, next) => {
    const config = require('../config/server');
    const ipWhitelist = config.security.ipWhitelist;
    
    if (!ipWhitelist || ipWhitelist.length === 0) {
        return next(); // No whitelist configured
    }

    const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    
    if (!ipWhitelist.includes(clientIP)) {
        logger.warn(`IP ${clientIP} not in whitelist`);
        return res.status(403).json({
            success: false,
            error: 'Access denied from this IP address'
        });
    }

    next();
};

module.exports = {
    requireAuth,
    requireRole,
    checkIPWhitelist
};




















































