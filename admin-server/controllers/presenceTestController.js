const presenceTestService = require('../services/presenceTestService');
const logger = require('../utils/logger');

const runDiagnostics = async (req, res) => {
    try {
        const startTime = new Date().toISOString();
        const diagnostics = await presenceTestService.runPresenceDiagnostics();
        
        // Format the response with additional metadata
        const response = {
            success: true,
            timestamp: startTime,
            summary: {
                total: diagnostics.summary.total,
                passing: diagnostics.summary.passed,
                failing: diagnostics.summary.failed,
                usersTested: diagnostics.summary.usersTested,
                usersPassing: diagnostics.summary.usersPassing
            },
            tests: diagnostics.tests.map(test => ({
                id: test.id,
                label: test.label,
                description: test.description,
                status: test.status,
                durationMs: test.durationMs,
                ...(test.status === 'pass' ? { details: test.details } : { error: test.error })
            }))
        };
        
        logger.info('Presence diagnostics completed', {
            summary: response.summary
        });
        
        return res.json(response);
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
            {
                method: 'GET',
                path: '/api/presence-tests/run',
                description: 'Execute the full diagnostics suite'
            },
            {
                method: 'GET',
                path: '/api/presence-tests/',
                description: 'List available diagnostic endpoints'
            }
        ]
    });
};

module.exports = {
    runDiagnostics,
    listEndpoints
};
