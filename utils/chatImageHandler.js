const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const virusScanner = require('./virusScanner');
const chatVirusScanConfigured = virusScanner.isScannerConfigured();
if (chatVirusScanConfigured) {
    console.info('[ChatImageHandler] Virus scanning configured; ClamAV will initialize on first use');
} else {
    console.info('[ChatImageHandler] Virus scanning disabled (ENABLE_VIRUS_SCANNER not true)');
}

class ChatImageHandler {
    constructor() {
        this.uploadDir = path.join(__dirname, '..', 'app', 'uploads', 'chat_images');
        this.imagesDir = path.join(this.uploadDir, 'images');
        this.thumbnailsDir = path.join(this.uploadDir, 'thumbnails');
        this.tempDir = path.join(this.uploadDir, 'temp');
        this.ensureDirectories();
        
        // Supported image formats
        this.allowedMimeTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp'
        ];
        
        // Size limits
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.thumbnailSize = 300; // 300x300 pixels (increased by 50% from 200px)
        this.maxImageDimension = 1920; // Max width/height for resizing
    }

    ensureDirectories() {
        const directories = [this.uploadDir, this.imagesDir, this.thumbnailsDir, this.tempDir];
        for (const dir of directories) {
            try {
                fsSync.mkdirSync(dir, { recursive: true });
            } catch (error) {
                console.error(`[ChatImageHandler] Failed to create directory ${dir}:`, error.message);
            }
        }
    }

    isVirusScannerEnabled() {
        return virusScanner.isScannerConfigured();
    }

    async scanUploadedFile(filePath) {
        try {
            const scanResult = await virusScanner.scanFileWithClamAV(filePath);
            if (!scanResult) {
                return { clean: true };
            }
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
                if (this.allowedMimeTypes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error(`Invalid file type. Allowed: ${this.allowedMimeTypes.join(', ')}`), false);
                }
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

            // Get image metadata
            const metadata = await sharp(tempFilePath).metadata();
            
            // Resize main image if too large
            let imageProcessor = sharp(tempFilePath);
            if (metadata.width > this.maxImageDimension || metadata.height > this.maxImageDimension) {
                imageProcessor = imageProcessor.resize(this.maxImageDimension, this.maxImageDimension, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            // Save processed main image
            await imageProcessor
                .jpeg({ quality: 90 }) // Convert to JPEG for consistency
                .toFile(imagePath);

            // Generate thumbnail
            await sharp(tempFilePath)
                .resize(this.thumbnailSize, this.thumbnailSize, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 85 })
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
            errors.push(`Invalid file type. Allowed: ${this.allowedMimeTypes.join(', ')}`);
        }

        if (file && file.size > this.maxFileSize) {
            errors.push(`File too large. Maximum size: ${this.maxFileSize / 1024 / 1024}MB`);
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
                    // Fix path resolution: database paths start with /uploads/chat_images/
                    // but the actual files are in app/uploads/chat_images/
                    let resolvedImagePath;
                    if (filePath.startsWith('/uploads/chat_images/')) {
                        // Remove leading slash and add 'app' prefix
                        const relativePath = 'app' + filePath; // Add 'app' prefix
                        resolvedImagePath = path.join(process.cwd(), relativePath);
                    } else {
                        resolvedImagePath = path.join(process.cwd(), filePath);
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
                        // Remove leading slash and add 'app' prefix
                        const relativePath = 'app' + thumbnailPath; // Add 'app' prefix
                        resolvedThumbPath = path.join(process.cwd(), relativePath);
                    } else {
                        resolvedThumbPath = path.join(process.cwd(), thumbnailPath);
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
