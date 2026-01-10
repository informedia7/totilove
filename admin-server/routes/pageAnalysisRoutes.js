const express = require('express');
const router = express.Router();
const pageAnalysisController = require('../controllers/pageAnalysisController');
const { requireAuth } = require('../middleware/auth');

// All routes require authentication
router.use(requireAuth);

// Run analysis
router.post('/analyze', (req, res) => {
    pageAnalysisController.analyze(req, res);
});

// Get cached report
router.get('/report', (req, res) => {
    pageAnalysisController.getReport(req, res);
});

// Get summary
router.get('/summary', (req, res) => {
    pageAnalysisController.getSummary(req, res);
});

// Get issues
router.get('/issues', (req, res) => {
    pageAnalysisController.getIssues(req, res);
});

// Get page details
router.get('/page/:pageName', (req, res) => {
    pageAnalysisController.getPageDetails(req, res);
});

module.exports = router;





















