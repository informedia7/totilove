const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const statisticsController = require('../controllers/statisticsController');

// All stats routes require authentication
router.use(requireAuth);
router.use(auditLog);

// Statistics routes
router.get('/dashboard', statisticsController.getDashboardStats.bind(statisticsController));
router.get('/users', statisticsController.getUserStats.bind(statisticsController));
router.get('/activity', statisticsController.getActivityStats.bind(statisticsController));
router.get('/growth', statisticsController.getGrowthMetrics.bind(statisticsController));
router.get('/quality', statisticsController.getQualityMetrics.bind(statisticsController));

// Root route - list available endpoints
router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Statistics API endpoints',
        endpoints: [
            'GET /api/stats/dashboard - Dashboard statistics',
            'GET /api/stats/users - User statistics',
            'GET /api/stats/activity - Activity statistics',
            'GET /api/stats/growth - Growth metrics',
            'GET /api/stats/quality - Quality metrics'
        ]
    });
});

module.exports = router;




















































