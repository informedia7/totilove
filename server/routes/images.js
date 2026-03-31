/**
 * Image Serving Routes
 * Handles chat image and thumbnail serving
 */

const path = require('path');
const fs = require('fs');

/**
 * Setup image serving routes
 * @param {Object} app - Express application instance
 */
function setupImageRoutes(app) {
    // Chat image serving routes
    app.get('/api/images/:filename', (req, res) => {
        try {
            const filename = req.params.filename;
            const imagePath = path.join(__dirname, '../../app', 'uploads', 'chat_images', 'images', filename);
            
            if (fs.existsSync(imagePath)) {
                res.sendFile(imagePath);
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Image not found',
                    filename: filename
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });
    
    // Chat image thumbnail serving routes
    app.get('/api/thumbnails/:filename', (req, res) => {
        try {
            const filename = req.params.filename;
            const thumbnailPath = path.join(__dirname, '../../app', 'uploads', 'chat_images', 'thumbnails', filename);
            
            if (fs.existsSync(thumbnailPath)) {
                res.sendFile(thumbnailPath);
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Thumbnail not found',
                    filename: filename
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });
    
}

module.exports = { setupImageRoutes };







