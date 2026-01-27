const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { runPresenceDiagnostics } = require('../services/presenceTestService');

router.get('/run', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
        const payload = await runPresenceDiagnostics();
        res.json({ success: true, ...payload });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to execute presence diagnostics',
            details: error.message
        });
    }
});

module.exports = router;
