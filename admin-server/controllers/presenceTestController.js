const presenceTestService = require('../services/presenceTestService');
const logger = require('../utils/logger');

const runDiagnostics = async (req, res) => {
    try {
        const diagnostics = await presenceTestService.runPresenceDiagnostics();
        return res.json({
            success: true,
            ...diagnostics
        });
    } catch (error) {
        logger.error('Failed to run presence diagnostics', { error: error.message });
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to run presence diagnostics'
        });
    }
};

const listEndpoints = (req, res) => {
    return res.json({
        success: true,
        message: 'Presence diagnostics API endpoints',
        endpoints: [
            'GET /api/presence-tests/run - Execute the full diagnostics suite'
        ]
    });
};

module.exports = {
    runDiagnostics,
    listEndpoints
};
