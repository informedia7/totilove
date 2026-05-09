const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const imageApprovalController = require('../controllers/imageApprovalController');
const logger = require('../utils/logger');

// All routes require authentication
router.use(requireAuth);
router.use(auditLog);

// Serve image files (fallback if static serving doesn't work)
// This route must be defined before other routes to ensure proper matching
router.get('/image/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;

        if (
            !filename ||
            filename !== path.basename(filename) ||
            filename.includes('..') ||
            /[/\\]/.test(filename)
        ) {
            return res.status(400).json({
                success: false,
                error: 'Invalid filename'
            });
        }

        // Check if it's an image file first
        const ext = path.extname(filename).toLowerCase();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        if (!imageExtensions.includes(ext)) {
            return res.status(403).json({
                success: false,
                error: 'Invalid file type'
            });
        }

        const contentType =
            {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp'
            }[ext] || 'image/jpeg';

        // Try multiple possible locations for uploads directory
        const possibleUploadPaths = [
            process.env.UPLOADS_PATH,
            path.join(__dirname, '..', '..', 'app', 'uploads', 'profile_images'), // Direct profile_images path
            path.join(__dirname, '..', '..', 'app', 'uploads'), // ../app/uploads
            path.join(__dirname, '..', '..', 'uploads'),
            path.join(__dirname, '..', 'uploads'),
            path.join(process.cwd(), 'uploads'),
            path.join(process.cwd(), '..', 'uploads'),
            path.join(process.cwd(), '..', 'app', 'uploads'),
            path.join(process.cwd(), '..', '..', 'uploads')
        ]
            .filter(Boolean)
            .map(p => path.resolve(p)); // Normalize all paths to absolute paths

        let imagePath = null;
        
        // First, check if the path itself is already profile_images directory
        for (const uploadPath of possibleUploadPaths) {
            if (path.basename(uploadPath) === 'profile_images') {
                const fullPath = path.join(uploadPath, filename);
                if (fs.existsSync(fullPath)) {
                    imagePath = fullPath;
                    break;
                }
            }
        }
        
        // If not found, try looking in profile_images subdirectory
        if (!imagePath) {
            for (const uploadPath of possibleUploadPaths) {
                // Skip if this path is already profile_images
                if (path.basename(uploadPath) === 'profile_images') {
                    continue;
                }
                const profileImagesPath = path.join(uploadPath, 'profile_images');
                const fullPath = path.join(profileImagesPath, filename);
                if (fs.existsSync(fullPath)) {
                    imagePath = fullPath;
                    break;
                }
            }
        }
        
        // If not found, try the uploads directory directly
        if (!imagePath) {
            for (const uploadPath of possibleUploadPaths) {
                // Skip if this path is already profile_images
                if (path.basename(uploadPath) === 'profile_images') {
                    continue;
                }
                const fullPath = path.join(uploadPath, filename);
                if (fs.existsSync(fullPath)) {
                    imagePath = fullPath;
                    break;
                }
            }
        }

        if (!imagePath) {
            logger.warn(`Image not found locally: ${filename}`);
            if (possibleUploadPaths.length > 0) {
                logger.warn(`Sample paths checked: ${possibleUploadPaths.slice(0, 3).join(', ')}`);
            }

            const base = (process.env.TOTILOVE_URL || '').trim().replace(/\/$/, '');
            if (base) {
                try {
                    const fetch = require('node-fetch');
                    const url = `${base}/uploads/profile_images/${encodeURIComponent(filename)}`;
                    const upstream = await fetch(url, { timeout: 20000 });
                    if (upstream.ok) {
                        const ct = upstream.headers.get('content-type') || contentType;
                        res.setHeader('Content-Type', ct);
                        res.setHeader('Cache-Control', 'private, max-age=120');
                        upstream.body.pipe(res);
                        upstream.body.on('error', (err) => {
                            logger.warn(`Totilove image stream error (${filename}): ${err.message}`);
                            if (!res.headersSent) {
                                res.status(502).end();
                            }
                        });
                        return;
                    }
                    logger.warn(`Totilove image upstream ${upstream.status} for ${url}`);
                } catch (e) {
                    logger.warn(`Totilove image proxy failed (${filename}): ${e.message}`);
                }
            }

            return res.status(404).json({
                success: false,
                error: 'Image not found',
                filename: filename
            });
        }

        // Ensure path is absolute
        const absoluteImagePath = path.resolve(imagePath);

        res.setHeader('Content-Type', contentType);
        res.sendFile(absoluteImagePath);
    } catch (error) {
        logger.error('Error serving image:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to serve image'
        });
    }
});

// Settings routes
router.get('/settings', imageApprovalController.getSettings.bind(imageApprovalController));
router.put('/settings', requireRole('admin', 'super_admin'), imageApprovalController.updateSettings.bind(imageApprovalController));

// Image routes
router.get('/pending', imageApprovalController.getPendingImages.bind(imageApprovalController));
router.get('/', imageApprovalController.getImages.bind(imageApprovalController));
router.post('/:id/approve', imageApprovalController.approveImage.bind(imageApprovalController));
router.post('/:id/reject', imageApprovalController.rejectImage.bind(imageApprovalController));
router.post('/:id/disapprove', imageApprovalController.disapproveImage.bind(imageApprovalController));

// Statistics route
router.get('/statistics', imageApprovalController.getStatistics.bind(imageApprovalController));

module.exports = router;










