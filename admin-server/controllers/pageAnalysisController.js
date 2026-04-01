const PageAnalyzer = require('../scripts/analyze-pages');
const fs = require('fs').promises;
const path = require('path');

class PageAnalysisController {
    constructor() {
        this.reportPath = path.join(__dirname, '..', 'data', 'page-analysis-report.json');
        this.analyzer = new PageAnalyzer();
    }

    /**
     * Run analysis and return report
     */
    async analyze(req, res) {
        try {
            console.log('🔍 Starting page analysis...');
            await this.analyzer.analyzeAllPages();
            const report = this.analyzer.generateReport();
            
            // Save report
            await fs.mkdir(path.dirname(this.reportPath), { recursive: true });
            await fs.writeFile(this.reportPath, JSON.stringify(report, null, 2));
            
            res.json({
                success: true,
                report: report,
                message: 'Analysis completed successfully'
            });
        } catch (error) {
            console.error('❌ Analysis error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to analyze pages',
                details: error.message
            });
        }
    }

    /**
     * Get cached report
     */
    async getReport(req, res) {
        try {
            const reportData = await fs.readFile(this.reportPath, 'utf-8');
            const report = JSON.parse(reportData);
            
            res.json({
                success: true,
                report: report
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.status(404).json({
                    success: false,
                    error: 'No analysis report found. Run analysis first.'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Failed to load report',
                    details: error.message
                });
            }
        }
    }

    /**
     * Get summary statistics
     */
    async getSummary(req, res) {
        try {
            const reportData = await fs.readFile(this.reportPath, 'utf-8');
            const report = JSON.parse(reportData);
            
            res.json({
                success: true,
                summary: report.summary,
                timestamp: report.timestamp,
                totalPages: report.totalPages
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to load summary',
                details: error.message
            });
        }
    }

    /**
     * Get issues by severity
     */
    async getIssues(req, res) {
        try {
            const reportData = await fs.readFile(this.reportPath, 'utf-8');
            const report = JSON.parse(reportData);
            
            const severity = req.query.severity || 'all';
            let issues = [];
            
            if (severity === 'all') {
                issues = [
                    ...report.issues.error,
                    ...report.issues.warning,
                    ...report.issues.info
                ];
            } else {
                issues = report.issues[severity] || [];
            }
            
            res.json({
                success: true,
                issues: issues,
                count: issues.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to load issues',
                details: error.message
            });
        }
    }

    /**
     * Get page details
     */
    async getPageDetails(req, res) {
        try {
            const reportData = await fs.readFile(this.reportPath, 'utf-8');
            const report = JSON.parse(reportData);
            
            const pageName = req.params.pageName;
            const page = report.pages.find(p => p.name === pageName);
            
            if (!page) {
                return res.status(404).json({
                    success: false,
                    error: 'Page not found'
                });
            }
            
            res.json({
                success: true,
                page: page
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to load page details',
                details: error.message
            });
        }
    }
}

module.exports = new PageAnalysisController();





















