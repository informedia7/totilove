const exportImportService = require('../services/exportImportService');
const logger = require('../utils/logger');

class ExportImportController {
    /**
     * Export uploads folder as ZIP (Railway only)
     */
    async exportUploadsFolder(req, res) {
        try {
            const result = await exportImportService.createUploadsArchiveStream();

            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);

            // Proxy mode: result.stream is an http.IncomingMessage
            if (result.stream) {
                result.stream.pipe(res);
                result.stream.on('error', (error) => {
                    logger.error('Proxy stream error:', error);
                    if (!res.headersSent) {
                        res.status(502).json({ success: false, error: 'Upstream stream error' });
                    }
                });
                return;
            }

            // Direct mode: result.archive is an archiver instance
            result.archive.on('error', (error) => {
                logger.error('Archive streaming error:', error);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: 'Failed to stream uploads archive' });
                }
            });
            result.archive.pipe(res);
            result.archive.finalize();
        } catch (error) {
            logger.error('Error in exportUploadsFolder controller:', error);
            res.status(400).json({
                success: false,
                error: error.message || 'Failed to export uploads folder'
            });
        }
    }

    /**
     * Export users
     */
    async exportUsers(req, res) {
        try {
            const format = req.query.format || 'csv'; // csv or json
            const userIds = req.query.user_ids ? req.query.user_ids.split(',').map(id => parseInt(id)) : null;
            
            const filters = {
                search: req.query.search || '',
                status: req.query.status || '',
                emailVerified: req.query.email_verified !== undefined ? req.query.email_verified === 'true' : undefined
            };

            if (format === 'csv') {
                const result = await exportImportService.exportUsersToCSV({ userIds, filters });
                
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                res.send(result.csv);
            } else if (format === 'json') {
                const result = await exportImportService.exportUsersToJSON({ userIds, filters });
                
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                res.json({
                    success: true,
                    count: result.count,
                    data: result.data
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid format. Use "csv" or "json"'
                });
            }
        } catch (error) {
            logger.error('Error in exportUsers controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to export users'
            });
        }
    }

    /**
     * Import users
     */
    async importUsers(req, res) {
        try {
            const format = req.body.format || 'json';
            const data = req.body.data;

            if (!data) {
                return res.status(400).json({
                    success: false,
                    error: 'Data is required'
                });
            }

            const result = await exportImportService.importUsers(data, format);

            res.json({
                success: true,
                message: `Import completed: ${result.success} succeeded, ${result.failed} failed`,
                results: result
            });
        } catch (error) {
            logger.error('Error in importUsers controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to import users'
            });
        }
    }

    /**
     * Export payments
     */
    async exportPayments(req, res) {
        try {
            const filters = {
                userId: req.query.user_id ? parseInt(req.query.user_id) : null,
                status: req.query.status || ''
            };

            const result = await exportImportService.exportPaymentsToCSV({ filters });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
            res.send(result.csv);
        } catch (error) {
            logger.error('Error in exportPayments controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to export payments'
            });
        }
    }
}

module.exports = new ExportImportController();




















































