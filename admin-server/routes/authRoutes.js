const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

// Login page
router.get('/login', (req, res) => {
    if (req.session && req.session.adminId) {
        return res.redirect('/dashboard');
    }
    res.render('login.html', {
        error: req.query.error || null
    });
});

// Login handler
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.redirect('/login?error=Username and password required');
        }

        // Find admin user
        const result = await query(
            'SELECT id, username, email, password_hash, role, status FROM admin_users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            logger.warn(`Failed login attempt for username: ${username}`);
            return res.redirect('/login?error=Invalid credentials');
        }

        const admin = result.rows[0];

        // Check if admin is active
        if (admin.status !== 'active') {
            logger.warn(`Login attempt for inactive admin: ${username}`);
            return res.redirect('/login?error=Account is inactive');
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, admin.password_hash);
        if (!passwordMatch) {
            logger.warn(`Failed login attempt for username: ${username}`);
            return res.redirect('/login?error=Invalid credentials');
        }

        // Create session
        req.session.adminId = admin.id;
        req.session.adminUsername = admin.username;
        req.session.adminRole = admin.role;

        // Update last login
        await query(
            'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
            [admin.id]
        );

        logger.info(`Admin logged in: ${username} (ID: ${admin.id})`);

        res.redirect('/dashboard');
    } catch (error) {
        logger.error('Login error:', error);
        res.redirect('/login?error=Login failed, please try again');
    }
});

// Logout handler
router.post('/logout', requireAuth, (req, res) => {
    const username = req.session.adminUsername;
    req.session.destroy((err) => {
        if (err) {
            logger.error('Logout error:', err);
        } else {
            logger.info(`Admin logged out: ${username}`);
        }
        res.redirect('/login');
    });
});

// Dashboard (protected)
router.get('/dashboard', requireAuth, (req, res) => {
    res.render('dashboard.html', {
        admin: req.admin
    });
});

// Change password endpoint
router.post('/api/auth/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const adminId = req.session.adminId;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'New password must be at least 8 characters long'
            });
        }

        // Get current password hash
        const result = await query(
            'SELECT password_hash FROM admin_users WHERE id = $1',
            [adminId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Admin user not found'
            });
        }

        const admin = result.rows[0];

        // Verify current password
        const passwordMatch = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!passwordMatch) {
            logger.warn(`Failed password change attempt for admin ID: ${adminId}`);
            return res.status(401).json({
                success: false,
                error: 'Current password is incorrect'
            });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        // Update password
        await query(
            'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
            [newPasswordHash, adminId]
        );

        logger.info(`Admin password changed: ${req.session.adminUsername} (ID: ${adminId})`);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        logger.error('Password change error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to change password. Please try again.'
        });
    }
});

module.exports = router;




















































