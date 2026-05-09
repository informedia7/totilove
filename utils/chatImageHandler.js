const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { resolveUploadsDir, ensureDirSync } = require('./uploads');

let ClamScan = null;
let clamscan = null;
try {
    ClamScan = require('clamscan');
    clamscan = new ClamScan();
    console.log('[ChatImageHandler] ClamAV virus scanning enabled');
} catch (error) {
    console.warn('[ChatImageHandler] ClamAV not available. Install with: npm install clamscan');
    console.warn('[ChatImageHandler] Virus scanning disabled for chat uploads.');
}

class ChatImageHandler {
    constructor() {
        this.uploadDir = resolveUploadsDir('chat_images');
        this.imagesDir = path.join(this.uploadDir, 'images');
        this.thumbnailsDir = path.join(this.uploadDir, 'thumbnails');
        this.tempDir = path.join(this.uploadDir, 'temp');

        ensureDirSync(this.uploadDir);
        ensureDirSync(this.imagesDir);
        ensureDirSync(this.thumbnailsDir);
        ensureDirSync(this.tempDir);
        
        // Supported image formats
        this.allowedMimeTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp'
        ];

        this.allowedExtensions = [
            '.jpg',
            '.jpeg',
            '.png',
            '.gif',
            '.webp'
        ];

        this.allowedSharpFormats = new Set(['jpeg', 'png', 'gif', 'webp']);
        
        // Size limits
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.thumbnailSize = 200; // max 200px, aspect ratio preserved
        this.maxImageDimension = 800; // Max width/height for resizing (aligned with profile photos)

        // Basic moderation checks (aligned with profile photo flow)
        // Chat should allow very small images (e.g. stickers / small icons)
        this.minDimension = 20; // absolute minimum
        this.recommendedMinDimension = 20; // keep same as minimum (no extra gate)
        this.maxDecodedDimension = 10000; // reject extreme images even before resizing
        this.minAspectRatio = 0.1;
        this.maxAspectRatio = 10;
    }

    formatBytes(bytes) {
        const value = Number(bytes) || 0;
        const kb = Math.max(0, Math.round(value / 1024));
        const mb = Math.max(0, Math.round((value / (1024 * 1024)) * 10) / 10); // 1 decimal
        if (mb >= 1) {
            return `${mb} MB (${kb} KB)`;
        }
        return `${kb} KB`;
    }

    isVirusScannerEnabled() {
        return !!clamscan;
    }

    async scanUploadedFile(filePath) {
        if (!clamscan) {
            return { clean: true };
        }

        try {
            const scanResult = await clamscan.scanFile(filePath);
            if (scanResult.isInfected) {
                return {
                    clean: false,
                    threats: scanResult.viruses || []
                };
            }
            return { clean: true };
        } catch (error) {
            console.error('[ChatImageHandler] Virus scan error:', error);
            throw new Error('File security check failed');
        }
    }

    async deleteTempFile(filePath) {
        if (!filePath) {
            return;
        }
        try {
            await fs.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('[ChatImageHandler] Unable to delete temp file:', error.message);
            }
        }
    }

    // Configure multer for file upload
    getMulterConfig() {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.tempDir);
            },
            filename: (req, file, cb) => {
                const timestamp = Date.now();
                const randomStr = crypto.randomBytes(6).toString('hex');
                const ext = path.extname(file.originalname).toLowerCase();
                const filename = `temp_${timestamp}_${randomStr}${ext}`;
                cb(null, filename);
            }
        });

        return multer({
            storage: storage,
            fileFilter: (req, file, cb) => {
                const mimetype = (file.mimetype || '').toLowerCase();
                const ext = path.extname(file.originalname || '').toLowerCase();

                if (!this.allowedMimeTypes.includes(mimetype)) {
                    cb(new Error(`Not an image. Allowed types: ${this.allowedMimeTypes.join(', ')}`), false);
                    return;
                }

                if (ext && !this.allowedExtensions.includes(ext)) {
                    cb(new Error(`Not an image file. Allowed extensions: ${this.allowedExtensions.join(', ')}`), false);
                    return;
                }

                cb(null, true);
            },
            limits: {
                fileSize: this.maxFileSize
            }
        });
    }

    // Generate unique filename for chat image
    generateFilename(userId, partnerId, originalName) {
        const timestamp = Date.now();
        const randomStr = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(originalName).toLowerCase();
        
        // Format: chat_{userId}_{partnerId}_{timestamp}_{random}.{ext}
        return `chat_${userId}_${partnerId}_${timestamp}_${randomStr}${ext}`;
    }

    // Process uploaded image (resize, generate thumbnail)
    async processImage(tempFilePath, finalFilename, userId, partnerId) {
        try {
            const imagePath = path.join(this.imagesDir, finalFilename);
            const thumbnailPath = path.join(this.thumbnailsDir, finalFilename);

            // Use the same optimization style as profile-photo uploads.
            const scanResult = await this.scanUploadedFile(tempFilePath);
            if (!scanResult.clean) {
                await this.deleteTempFile(tempFilePath);
                const threats = Array.isArray(scanResult.threats) && scanResult.threats.length > 0
                    ? ` (${scanResult.threats.join(', ')})`
                    : '';
                throw new Error(`The uploaded file appears to be unsafe and has been rejected${threats}`);
            }

            const metadata = await sharp(tempFilePath).metadata();
            const decodedFormat = (metadata && metadata.format ? String(metadata.format).toLowerCase() : '').trim();
            if (!decodedFormat || !this.allowedSharpFormats.has(decodedFormat)) {
                await this.deleteTempFile(tempFilePath);
                throw new Error('Invalid image content. Please upload a JPEG, PNG, GIF, or WebP image.');
            }

            // Moderation-style validation: block tiny/extreme/invalid images
            const width = Number(metadata.width || 0);
            const height = Number(metadata.height || 0);
            if (!width || !height) {
                await this.deleteTempFile(tempFilePath);
                throw new Error('Unable to validate image dimensions. Please upload a different image.');
            }

            const aspectRatio = width / height;
            if (width < this.minDimension || height < this.minDimension) {
                await this.deleteTempFile(tempFilePath);
                throw new Error(`Image is too small. Minimum allowed is ${this.minDimension}×${this.minDimension}px.`);
            }

            if (width < this.recommendedMinDimension || height < this.recommendedMinDimension) {
                await this.deleteTempFile(tempFilePath);
                throw new Error(`Image is too small. Minimum allowed is ${this.recommendedMinDimension}×${this.recommendedMinDimension}px.`);
            }

            if (width > this.maxDecodedDimension || height > this.maxDecodedDimension) {
                await this.deleteTempFile(tempFilePath);
                throw new Error(`Image is too large. Maximum allowed dimensions are ${this.maxDecodedDimension}×${this.maxDecodedDimension}px.`);
            }

            if (!(aspectRatio > this.minAspectRatio && aspectRatio < this.maxAspectRatio)) {
                await this.deleteTempFile(tempFilePath);
                throw new Error('Image has an unsupported aspect ratio.');
            }
            let quality = 70;
            if (metadata.width > 2000 || metadata.height > 2000) {
                quality = Math.max(quality - 20, 50);
            }

            const imageProcessor = sharp(tempFilePath).rotate();
            await imageProcessor
                .resize(this.maxImageDimension, this.maxImageDimension, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({
                    quality,
                    progressive: true,
                    mozjpeg: true,
                    optimizeCoding: true,
                    chromaSubsampling: '4:4:4',
                    optimizeScans: true,
                    trellisQuantisation: true,
                    overshootDeringing: true
                })
                .toFile(imagePath);

            // Generate thumbnail
            await sharp(tempFilePath)
                .resize(this.thumbnailSize, this.thumbnailSize, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: 70 })
                .toFile(thumbnailPath);

            // Get final image metadata
            const finalMetadata = await sharp(imagePath).metadata();

            // Clean up temp file
            await fs.unlink(tempFilePath);

            return {
                imagePath: `/uploads/chat_images/images/${finalFilename}`,
                thumbnailPath: `/uploads/chat_images/thumbnails/${finalFilename}`,
                width: finalMetadata.width,
                height: finalMetadata.height,
                fileSize: finalMetadata.size || 0
            };

        } catch (error) {
            // Clean up temp file on error
            try {
                await fs.unlink(tempFilePath);
            } catch (cleanupError) {
                console.error('Error cleaning up temp file:', cleanupError);
            }
            throw error;
        }
    }

    // Validate image upload
    validateImageUpload(file, userId, partnerId) {
        const errors = [];

        if (!file) {
            errors.push('No image file provided');
        }

        if (!userId || !partnerId) {
            errors.push('User ID and Partner ID are required');
        }

        if (file && !this.allowedMimeTypes.includes(file.mimetype)) {
            errors.push(`Not an image. Allowed types: ${this.allowedMimeTypes.join(', ')}`);
        }

        if (file && file.size > this.maxFileSize) {
            errors.push(`File too large. Maximum size: ${this.formatBytes(this.maxFileSize)}`);
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Clean up old temp files (run periodically)
    async cleanupTempFiles(maxAge = 3600000) { // 1 hour default
        try {
            const files = await fs.readdir(this.tempDir);
            const now = Date.now();

            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                const stats = await fs.stat(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    await fs.unlink(filePath);
                    console.log(`Cleaned up old temp file: ${file}`);
                }
            }
        } catch (error) {
            console.error('Error cleaning up temp files:', error);
        }
    }

    // Delete image and thumbnail files completely
    async deleteImageFiles(filename) {
        try {
            const imagePath = path.join(this.imagesDir, filename);
            const thumbnailPath = path.join(this.thumbnailsDir, filename);
            
            let deletedCount = 0;
            
            // Delete main image file
            try {
                await fs.unlink(imagePath);
                console.log(`🗑️ Deleted image file: ${filename}`);
                deletedCount++;
            } catch (fileError) {
                if (fileError.code !== 'ENOENT') {
                    console.warn(`⚠️ Could not delete image file ${filename}:`, fileError.message);
                }
            }
            
            // Delete thumbnail file
            try {
                await fs.unlink(thumbnailPath);
                console.log(`🗑️ Deleted thumbnail file: ${filename}`);
                deletedCount++;
            } catch (fileError) {
                if (fileError.code !== 'ENOENT') {
                    console.warn(`⚠️ Could not delete thumbnail file ${filename}:`, fileError.message);
                }
            }
            
            return {
                success: true,
                deletedCount: deletedCount,
                message: `Deleted ${deletedCount} file(s) for ${filename}`
            };
            
        } catch (error) {
            console.error(`❌ Error deleting image files for ${filename}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Delete image files by file paths (for database cleanup)
    async deleteImageFilesByPaths(filePath, thumbnailPath) {
        try {
            let deletedCount = 0;
            
            // Delete main image file
            if (filePath) {
                try {
                    let resolvedImagePath;
                    if (filePath.startsWith('/uploads/chat_images/')) {
                        resolvedImagePath = path.join(resolveUploadsDir(), filePath.replace('/uploads/', ''));
                    } else {
                        resolvedImagePath = path.isAbsolute(filePath)
                            ? filePath
                            : path.join(process.cwd(), filePath);
                    }
                    
                            // Attempting to delete image file
                    
                    await fs.unlink(resolvedImagePath);
                    console.log(`🗑️ Deleted image file: ${filePath}`);
                    deletedCount++;
                } catch (fileError) {
                    if (fileError.code !== 'ENOENT') {
                        console.warn(`⚠️ Could not delete image file ${filePath}:`, fileError.message);
                    } else {
                        console.log(`ℹ️ Image file not found (already deleted): ${filePath}`);
                    }
                }
            }
            
            // Delete thumbnail file
            if (thumbnailPath) {
                try {
                    // Fix path resolution: database paths start with /uploads/chat_images/
                    // but the actual files are in app/uploads/chat_images/
                    let resolvedThumbPath;
                    if (thumbnailPath.startsWith('/uploads/chat_images/')) {
                        resolvedThumbPath = path.join(resolveUploadsDir(), thumbnailPath.replace('/uploads/', ''));
                    } else {
                        resolvedThumbPath = path.isAbsolute(thumbnailPath)
                            ? thumbnailPath
                            : path.join(process.cwd(), thumbnailPath);
                    }
                    
                            // Attempting to delete thumbnail
                    
                    await fs.unlink(resolvedThumbPath);
                    console.log(`🗑️ Deleted thumbnail file: ${thumbnailPath}`);
                    deletedCount++;
                } catch (fileError) {
                    if (fileError.code !== 'ENOENT') {
                        console.warn(`⚠️ Could not delete thumbnail file ${thumbnailPath}:`, fileError.message);
                    } else {
                        console.log(`ℹ️ Thumbnail file not found (already deleted): ${thumbnailPath}`);
                    }
                }
            }
            
            return {
                success: true,
                deletedCount: deletedCount,
                message: `Deleted ${deletedCount} file(s)`
            };
            
        } catch (error) {
            console.error(`❌ Error deleting image files by paths:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get image info for URL generation
    static getImageUrls(filename) {
        return {
            original: `/uploads/chat_images/images/${filename}`,
            thumbnail: `/uploads/chat_images/thumbnails/${filename}`
        };
    }
}

module.exports = ChatImageHandler;
