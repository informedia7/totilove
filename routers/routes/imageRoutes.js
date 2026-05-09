/**
 * Image Routes
 * Handles image upload and management endpoints
 * 
 * Routes:
 * - POST /api/profile/upload-images - Upload images (multer middleware)
 * - DELETE /api/profile/delete-image - Delete image
 * - POST /api/profile/set-profile-image - Set profile image
 * - POST /api/profile/set-featured-image - Set featured image
 * 
 * Features:
 * - Virus scanning with ClamAV (see env vars below)
 * - Image compression and optimization
 * - Thumbnail generation
 * - Image metadata extraction
 * - Image moderation
 * - Monitoring and metrics
 * - Configurable via environment variables
 *
 * ClamAV env:
 * - CLAMAV_DISABLED=true — skip scanning entirely (dev/local without daemon)
 * - CLAMAV_REQUIRED=true — reject uploads with 503 if scanner cannot initialize
 * - CLAMD_SOCKET — path to clamd UNIX socket (optional)
 * - CLAMD_HOST / CLAMD_PORT — TCP to clamd (port defaults to 3310 when host is set)
 * - CLAMDSCAN_PATH / CLAMSCAN_PATH — binary paths (defaults /usr/bin/clamdscan, /usr/bin/clamscan)
 * - CLAMD_BYPASS_PING=true — skip initial TCP/socket ping test
 * - CLAMD_LOCAL_FALLBACK=false — do not fall back to local clamscan binary when using TCP/socket
 * - CLAMAV_PREFERENCE — clamscan | clamdscan (auto: clamdscan if socket/host set)
 * - CLAMAV_FAIL_CLOSED=true — treat scan errors like outages (503) even if CLAMAV_REQUIRED is false
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { resolveUploadsDir, ensureDirSync } = require('../../utils/uploads');
const {
    getClamScanner,
    isClamAvExplicitlyDisabled,
    isClamAvRequired
} = require('../../utils/clamAvScanner');
const { imageUploadLimiter } = require('../middleware/rateLimiter');
const { requestLogger } = require('../middleware/requestLogger');
const { requireAuth } = require('../middleware/authMiddleware');

// ============================================================================
// 1. IMAGE PROCESSING CONFIGURATION
// ============================================================================
const IMAGE_CONFIG = {
    MAX_DIMENSION: parseInt(process.env.IMAGE_MAX_DIMENSION) || 800,
    QUALITY: parseInt(process.env.IMAGE_QUALITY) || 70,
    MAX_FILE_SIZE: parseInt(process.env.IMAGE_MAX_SIZE) || 5 * 1024 * 1024, // 5MB
    MAX_FILES: parseInt(process.env.IMAGE_MAX_FILES) || 10,
    MAX_USER_IMAGES: parseInt(process.env.IMAGE_MAX_PER_USER) || 6,
    ALLOWED_MIME_TYPES: [
        'image/jpeg',
        'image/jpg',
        'image/pjpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp',
        'image/x-ms-bmp',
        'image/tiff',
        'image/tif'
    ],
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.jfif', '.jpe', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff'],
    THUMBNAIL_SIZES: {
        small: { width: 150, height: 150, quality: 60 },
        medium: { width: 400, height: 400, quality: 70 }
    }
};

// ============================================================================
// 2. ERROR MESSAGES
// ============================================================================
const ERROR_MESSAGES = {
    FILE_TYPE: 'Please upload only image files (JPEG, PNG, GIF, WebP)',
    FILE_SIZE: `Image size must be less than ${Math.round(IMAGE_CONFIG.MAX_FILE_SIZE / 1024 / 1024)}MB`,
    MAX_FILES: `You can upload up to ${IMAGE_CONFIG.MAX_FILES} images at once`,
    MAX_USER_IMAGES: `Maximum ${IMAGE_CONFIG.MAX_USER_IMAGES} images allowed per user`,
    VIRUS_DETECTED: 'The uploaded file appears to be unsafe and has been rejected',
    PROCESSING_FAILED: 'Failed to process image. Please try again.',
    NO_IMAGES: 'No images provided',
    USER_ID_REQUIRED: 'User ID is required',
    IMAGE_NOT_FOUND: 'Image not found',
    UNAUTHORIZED: 'Unauthorized',
    CLAMAV_UNAVAILABLE: 'Virus scanning is required but the scanner is not available. Try again later.'
};

// ============================================================================
// 3. API RESPONSE STANDARDIZATION
// ============================================================================
class ApiResponse {
    constructor(success, data = null, meta = null) {
        this.success = success;
        this.data = data;
        this.meta = meta;
        this.timestamp = new Date().toISOString();
    }
    
    static success(data, meta = null) {
        return new ApiResponse(true, data, meta);
    }
    
    static error(message, code = null) {
        return new ApiResponse(false, null, { message, code });
    }
}

class ApiError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.status = statusCode;
        this.name = 'ApiError';
    }
}

// ============================================================================
// 4. VIRUS SCANNING via ../../utils/clamAvScanner (shared with chat uploads)
// ============================================================================
async function unlinkUploadedFiles(files) {
    if (!files || !files.length) {
        return;
    }
    await Promise.all(
        files.map(async (f) => {
            try {
                if (f?.path && fs.existsSync(f.path)) {
                    await fs.promises.unlink(f.path);
                }
            } catch {
                // ignore
            }
        })
    );
}

// ============================================================================
// 5. MONITORING AND METRICS
// ============================================================================
const imageMetrics = {
    totalUploads: 0,
    successfulUploads: 0,
    failedUploads: 0,
    totalBytes: 0,
    totalProcessingTime: 0
};

function trackImageUpload(userId, success, fileSize, processingTime) {
    imageMetrics.totalUploads++;
    if (success) {
        imageMetrics.successfulUploads++;
        imageMetrics.totalBytes += fileSize;
        imageMetrics.totalProcessingTime += processingTime;
    } else {
        imageMetrics.failedUploads++;
    }
    
    // Log to console (can be extended to send to monitoring system)
    console.log({
        event: 'image_upload',
        userId,
        success,
        fileSize,
        processingTime,
        timestamp: new Date().toISOString()
    });
}

// ============================================================================
// 6. IMAGE METADATA EXTRACTION
// ============================================================================
async function extractImageMetadata(filePath) {
    try {
        const metadata = await sharp(filePath).metadata();
        const stats = await fs.promises.stat(filePath);
        return {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            size: stats.size,
            hasAlpha: metadata.hasAlpha || false,
            orientation: metadata.orientation || 1,
            channels: metadata.channels,
            density: metadata.density
        };
    } catch (error) {
        console.warn('[ImageRoutes] Failed to extract image metadata:', error.message);
        return null;
    }
}

// ============================================================================
// 7. IMAGE MODERATION SYSTEM
// ============================================================================
async function moderateImage(imagePath) {
    try {
        const metadata = await sharp(imagePath).metadata();
        
        const checks = {
            hasReasonableDimensions: metadata.width >= 100 && metadata.height >= 100,
            aspectRatioValid: metadata.width / metadata.height > 0.1 && metadata.width / metadata.height < 10,
            notTooSmall: metadata.width >= 50 && metadata.height >= 50,
            notTooLarge: metadata.width <= 10000 && metadata.height <= 10000
        };
        
        const passed = Object.values(checks).every(check => check === true);
        
        return {
            passed,
            checks,
            reason: !passed ? 'Image failed basic validation checks' : null
        };
    } catch (error) {
        console.error('[ImageRoutes] Moderation check failed:', error);
        return {
            passed: false,
            checks: {},
            reason: 'Unable to validate image'
        };
    }
}

// ============================================================================
// 8. IMAGE COMPRESSION OPTIMIZATION
// ============================================================================
async function optimizeImage(inputPath, outputPath, userId) {
    try {
        const metadata = await sharp(inputPath).metadata();
        
        // Determine optimal settings based on image characteristics
        let quality = IMAGE_CONFIG.QUALITY;
        let progressive = true;
        
        // Lower quality for large images
        if (metadata.width > 2000 || metadata.height > 2000) {
            quality = Math.max(quality - 20, 50);
        }
        
        // Different settings for PNG vs JPEG
        const pipeline = sharp(inputPath).rotate();
        
        if (metadata.format === 'png' && metadata.hasAlpha) {
            // For PNG with transparency
            await pipeline
                .resize(IMAGE_CONFIG.MAX_DIMENSION, IMAGE_CONFIG.MAX_DIMENSION, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .png({ 
                    quality: quality,
                    progressive: true,
                    compressionLevel: 9
                })
                .toFile(outputPath);
        } else {
            // For JPEG and other formats
            await pipeline
                .resize(IMAGE_CONFIG.MAX_DIMENSION, IMAGE_CONFIG.MAX_DIMENSION, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ 
                    quality: quality,
                    progressive: progressive,
                    mozjpeg: true,
                    optimizeCoding: true,
                    chromaSubsampling: '4:4:4',
                    optimizeScans: true,
                    trellisQuantisation: true,
                    overshootDeringing: true
                })
                .toFile(outputPath);
        }
        
        return outputPath;
    } catch (error) {
        console.error('[ImageRoutes] Image optimization failed:', error);
        throw error;
    }
}

// ============================================================================
// 9. THUMBNAIL GENERATION
// ============================================================================
async function generateThumbnails(imagePath, userId, filename) {
    const baseName = path.basename(filename, path.extname(filename));
    const dirName = path.dirname(imagePath);
    const thumbnails = {};

    // Small thumbnail (150x150)
    const smallThumb = path.join(dirName, `${baseName}_thumb_small.jpg`);
    await sharp(imagePath)
        .resize(IMAGE_CONFIG.THUMBNAIL_SIZES.small.width, IMAGE_CONFIG.THUMBNAIL_SIZES.small.height, {
            fit: 'cover'
        })
        .jpeg({ quality: IMAGE_CONFIG.THUMBNAIL_SIZES.small.quality })
        .toFile(smallThumb);
    thumbnails.small = path.basename(smallThumb);

    // Medium thumbnail (400x400)
    const mediumThumb = path.join(dirName, `${baseName}_thumb_medium.jpg`);
    await sharp(imagePath)
        .resize(IMAGE_CONFIG.THUMBNAIL_SIZES.medium.width, IMAGE_CONFIG.THUMBNAIL_SIZES.medium.height, {
            fit: 'inside',
            withoutEnlargement: true
        })
        .jpeg({ quality: IMAGE_CONFIG.THUMBNAIL_SIZES.medium.quality })
        .toFile(mediumThumb);
    thumbnails.medium = path.basename(mediumThumb);

    return thumbnails;
}

// ============================================================================
// 10. IMAGE VALIDATION MIDDLEWARE
// ============================================================================
function validateImageUpload(req, res, next) {
    if (!req.files || req.files.length === 0) {
        return next(new ApiError(400, ERROR_MESSAGES.NO_IMAGES));
    }

    // Check each file
    for (const file of req.files) {
        // Validate MIME type
        if (!IMAGE_CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return next(new ApiError(400, ERROR_MESSAGES.FILE_TYPE));
        }

        // Validate file size
        if (file.size > IMAGE_CONFIG.MAX_FILE_SIZE) {
            return next(new ApiError(400, ERROR_MESSAGES.FILE_SIZE));
        }

        // Validate file extension
        const ext = path.extname(file.originalname).toLowerCase();
        if (!IMAGE_CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
            return next(new ApiError(400, ERROR_MESSAGES.FILE_TYPE));
        }
    }

    next();
}

// ============================================================================
// 11. MULTER CONFIGURATION
// ============================================================================
function createProfileImageUpload(baseDir) {
    const profileImageStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadDir = resolveUploadsDir('profile_images');
            ensureDirSync(uploadDir);
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 15);
            const ext = path.extname(file.originalname).toLowerCase();
            const filename = `user_${timestamp}_${randomStr}${ext}`;
            cb(null, filename);
        }
    });

    return multer({
        storage: profileImageStorage,
        limits: {
            fileSize: IMAGE_CONFIG.MAX_FILE_SIZE,
            files: IMAGE_CONFIG.MAX_FILES
        },
        fileFilter: (req, file, cb) => {
            if (IMAGE_CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new ApiError(400, ERROR_MESSAGES.FILE_TYPE), false);
            }
        }
    });
}

// ============================================================================
// MAIN ROUTE CREATION FUNCTION
// ============================================================================
function createImageRoutes(db, authMiddleware, baseDir = __dirname) {
    if (!db) {
        throw new Error('Database connection is required for image routes');
    }

    // Apply rate limiting and logging to API routes only
    router.use('/api', imageUploadLimiter);
    router.use(requestLogger);

    // Require authentication for all image routes
    if (authMiddleware) {
        router.use('/api', requireAuth(authMiddleware));
    }

    // Create multer instance
    const profileImageUpload = createProfileImageUpload(baseDir);

    /**
     * POST /api/profile/upload-images - Upload images
     */
    router.post('/api/profile/upload-images', 
        profileImageUpload.array('images', IMAGE_CONFIG.MAX_FILES),
        validateImageUpload,
        async (req, res) => {
            try {
                const startTime = Date.now();
                const authenticatedUserId = req.user?.id || req.userId;
                const userId = req.body.userId || authenticatedUserId;

                if (!userId) {
                    return res.status(400).json({
                        success: false,
                        error: ERROR_MESSAGES.USER_ID_REQUIRED
                    });
                }

                // Check if user already has max images (limit)
                const existingImagesResult = await db.query(
                    'SELECT COUNT(*) as count FROM user_images WHERE user_id = $1',
                    [userId]
                );
                const existingCount = parseInt(existingImagesResult.rows[0].count) || 0;
                const maxImages = IMAGE_CONFIG.MAX_USER_IMAGES;
                const remainingSlots = maxImages - existingCount;

                if (!req.files || req.files.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: ERROR_MESSAGES.NO_IMAGES
                    });
                }

                if (req.files.length > remainingSlots) {
                    return res.status(400).json({
                        success: false,
                        error: `You can only upload ${remainingSlots} more image(s). ${ERROR_MESSAGES.MAX_USER_IMAGES}.`
                    });
                }

                const uploadedImages = [];
                const errors = [];

                let scannedForViruses = false;
                const avScanner = await getClamScanner();

                if (!avScanner && isClamAvRequired()) {
                    await unlinkUploadedFiles(req.files);
                    return res.status(503).json({
                        success: false,
                        error: ERROR_MESSAGES.CLAMAV_UNAVAILABLE,
                        code: 'CLAMAV_UNAVAILABLE'
                    });
                }

                if (avScanner) {
                    scannedForViruses = true;
                    for (const file of req.files) {
                        try {
                            const scanResult = await avScanner.isInfected(file.path);
                            if (scanResult.isInfected) {
                                await unlinkUploadedFiles(req.files);
                                return res.status(400).json({
                                    success: false,
                                    error: ERROR_MESSAGES.VIRUS_DETECTED,
                                    details: {
                                        filename: file.originalname,
                                        reason: 'File contains malware or virus'
                                    }
                                });
                            }
                        } catch (scanError) {
                            console.error('[ImageRoutes] Virus scan error:', scanError);
                            await unlinkUploadedFiles(req.files);
                            const scanFailedClosed =
                                isClamAvRequired() ||
                                String(process.env.CLAMAV_FAIL_CLOSED || '').toLowerCase() === 'true';
                            const status = scanFailedClosed ? 503 : 400;
                            const errorMsg = scanFailedClosed
                                ? ERROR_MESSAGES.CLAMAV_UNAVAILABLE
                                : 'File security check failed';
                            return res.status(status).json({
                                success: false,
                                error: errorMsg,
                                code: scanFailedClosed ? 'CLAMAV_SCAN_FAILED' : undefined,
                                details: scanFailedClosed
                                    ? undefined
                                    : {
                                          filename: file.originalname,
                                          reason: 'Unable to verify file safety'
                                      }
                            });
                        }
                    }
                }

                // Process each image
                for (const file of req.files) {
                    const fileStartTime = Date.now();
                    try {
                        const imagePath = file.path;
                        
                        // Image moderation
                        const moderationResult = await moderateImage(imagePath);
                        if (!moderationResult.passed) {
                            throw new Error(moderationResult.reason || 'Image validation failed');
                        }
                        
                        // Optimize image
                        const tempPath = imagePath + '.tmp';
                        await optimizeImage(imagePath, tempPath, userId);
                        
                        // Replace original with optimized version
                        await fs.promises.unlink(imagePath);
                        await fs.promises.rename(tempPath, imagePath);
                        
                        // Rename to include userId in filename
                        const timestamp = Date.now();
                        const randomStr = Math.random().toString(36).substring(2, 15);
                        const newFileName = `user_${userId}_${timestamp}_${randomStr}.jpg`;
                        const oldPath = imagePath;
                        const newPath = path.join(path.dirname(oldPath), newFileName);
                        await fs.promises.rename(oldPath, newPath);
                        file.filename = newFileName;
                        file.path = newPath;
                        
                        // Generate thumbnails
                        const thumbnails = await generateThumbnails(newPath, userId, newFileName);
                        
                        // Extract metadata
                        const metadata = await extractImageMetadata(newPath);
                        
                        // Build explicit thumbnail paths
                        const thumbnailSmallPath = thumbnails && thumbnails.small
                            ? `/uploads/profile_images/${thumbnails.small}`
                            : null;
                        const thumbnailMediumPath = thumbnails && thumbnails.medium
                            ? `/uploads/profile_images/${thumbnails.medium}`
                            : null;
                        const thumbnailPath = thumbnailMediumPath || thumbnailSmallPath;
                        
                        // Insert — approval_status 'pending' so admin image-approval lists new uploads
                        const insertParams = [
                            userId,
                            file.filename,
                            metadata ? JSON.stringify(metadata) : null,
                            thumbnailPath,
                            thumbnailSmallPath,
                            thumbnailMediumPath
                        ];
                        let insertResult;
                        try {
                            insertResult = await db.query(
                                `
                            INSERT INTO user_images (
                                user_id,
                                file_name,
                                is_profile,
                                featured,
                                metadata,
                                thumbnail_path,
                                thumbnail_small_path,
                                thumbnail_medium_path,
                                approval_status
                            ) VALUES ($1, $2, 0, 0, $3, $4, $5, $6, 'pending')
                            RETURNING id, file_name, is_profile, featured, uploaded_at, thumbnail_path, thumbnail_small_path, thumbnail_medium_path, metadata
                        `,
                                insertParams
                            );
                        } catch (insertErr) {
                            if (insertErr && insertErr.code === '42703') {
                                insertResult = await db.query(
                                    `
                            INSERT INTO user_images (
                                user_id,
                                file_name,
                                is_profile,
                                featured,
                                metadata,
                                thumbnail_path,
                                thumbnail_small_path,
                                thumbnail_medium_path
                            ) VALUES ($1, $2, 0, 0, $3, $4, $5, $6)
                            RETURNING id, file_name, is_profile, featured, uploaded_at, thumbnail_path, thumbnail_small_path, thumbnail_medium_path, metadata
                        `,
                                    insertParams
                                );
                            } else {
                                throw insertErr;
                            }
                        }

                        const imageRow = insertResult.rows[0];
                        const processingTime = Date.now() - fileStartTime;
                        
                        // Track metrics
                        trackImageUpload(userId, true, file.size, processingTime);
                        
                        uploadedImages.push({
                            id: imageRow.id,
                            file_name: imageRow.file_name,
                            is_profile: imageRow.is_profile === true || imageRow.is_profile === 1 || imageRow.is_profile === '1' || imageRow.is_profile === 'true',
                            featured: imageRow.featured !== undefined ? (imageRow.featured === true || imageRow.featured === 1 || imageRow.featured === '1' || imageRow.featured === 'true') : false,
                            uploaded_at: imageRow.uploaded_at,
                            thumbnail_path: imageRow.thumbnail_path || thumbnailPath || null,
                            thumbnail_small_path: imageRow.thumbnail_small_path || thumbnailSmallPath || null,
                            thumbnail_medium_path: imageRow.thumbnail_medium_path || thumbnailMediumPath || null,
                            metadata: metadata,
                            thumbnails: thumbnails
                        });
                    } catch (error) {
                        const processingTime = Date.now() - fileStartTime;
                        trackImageUpload(userId, false, file.size || 0, processingTime);
                        
                        console.error('[ImageRoutes] Error processing image:', error.message);
                        // Delete file if processing failed
                        try {
                            if (fs.existsSync(file.path)) {
                                await fs.promises.unlink(file.path);
                            }
                        } catch (unlinkError) {
                            // Ignore cleanup errors
                        }
                        errors.push({ 
                            filename: file.originalname, 
                            error: error.message || ERROR_MESSAGES.PROCESSING_FAILED 
                        });
                    }
                }

                const totalProcessingTime = Date.now() - startTime;
                
                res.json(ApiResponse.success({
                    uploaded: uploadedImages,
                    count: uploadedImages.length,
                    errors: errors.length > 0 ? errors : undefined
                }, {
                    scannedForViruses,
                    compressionApplied: true,
                    thumbnailsGenerated: uploadedImages.length > 0,
                    processingTime: totalProcessingTime,
                    remainingSlots: maxImages - (existingCount + uploadedImages.length)
                }));
            } catch (error) {
                console.error('[ImageRoutes] Error in upload-images:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to upload images'
                });
            }
        }
    );

    /**
     * DELETE /api/profile/delete-image - Delete image
     */
    router.delete('/api/profile/delete-image', async (req, res) => {
        try {
            const authenticatedUserId = req.user?.id || req.userId;
            const { imageId, fileName } = req.body;

            if (!imageId || !fileName) {
                return res.status(400).json({
                    success: false,
                    error: 'Image ID and file name are required'
                });
            }

            // Verify image belongs to user
            const imageResult = await db.query(
                'SELECT user_id FROM user_images WHERE id = $1',
                [imageId]
            );

            if (imageResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: ERROR_MESSAGES.IMAGE_NOT_FOUND
                });
            }

            const imageUserId = imageResult.rows[0].user_id;
            
            if (imageUserId !== authenticatedUserId) {
                return res.status(403).json({
                    success: false,
                    error: ERROR_MESSAGES.UNAUTHORIZED
                });
            }

            // Delete from database
            await db.query('DELETE FROM user_images WHERE id = $1', [imageId]);

            // Delete file and thumbnails
            const filePath = resolveUploadsDir('profile_images', fileName);
            const baseName = path.basename(fileName, path.extname(fileName));
            const dirName = path.dirname(filePath);
            
            const filesToDelete = [
                filePath,
                path.join(dirName, `${baseName}_thumb_small.jpg`),
                path.join(dirName, `${baseName}_thumb_medium.jpg`),
                // Legacy uploads may still have this file
                path.join(dirName, `${baseName}_thumb_normal.jpg`)
            ];
            
            for (const fileToDelete of filesToDelete) {
                try {
                    if (fs.existsSync(fileToDelete)) {
                        await fs.promises.unlink(fileToDelete);
                    }
                } catch (fileError) {
                    console.error('[ImageRoutes] Error deleting file:', fileError);
                    // Continue even if file deletion fails
                }
            }

            res.json(ApiResponse.success({
                message: 'Image deleted successfully'
            }));
        } catch (error) {
            console.error('[ImageRoutes] Error in delete-image:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete image'
            });
        }
    });

    /**
     * POST /api/profile/set-profile-image - Set profile image
     */
    router.post('/api/profile/set-profile-image', async (req, res) => {
        try {
            const authenticatedUserId = req.user?.id || req.userId;
            const { imageId } = req.body;

            if (!imageId) {
                return res.status(400).json({
                    success: false,
                    error: 'Image ID is required'
                });
            }

            // Verify image belongs to user
            const imageResult = await db.query(
                'SELECT user_id FROM user_images WHERE id = $1',
                [imageId]
            );

            if (imageResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: ERROR_MESSAGES.IMAGE_NOT_FOUND
                });
            }

            if (imageResult.rows[0].user_id !== authenticatedUserId) {
                return res.status(403).json({
                    success: false,
                    error: ERROR_MESSAGES.UNAUTHORIZED
                });
            }

            // Unset all other profile images for this user
            await db.query(
                'UPDATE user_images SET is_profile = 0 WHERE user_id = $1',
                [authenticatedUserId]
            );

            // Set this image as profile
            await db.query(
                'UPDATE user_images SET is_profile = 1 WHERE id = $1',
                [imageId]
            );

            res.json(ApiResponse.success({
                message: 'Profile image updated successfully'
            }));
        } catch (error) {
            console.error('[ImageRoutes] Error in set-profile-image:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to set profile image'
            });
        }
    });

    /**
     * POST /api/profile/set-featured-image - Set featured image
     */
    router.post('/api/profile/set-featured-image', async (req, res) => {
        try {
            const authenticatedUserId = req.user?.id || req.userId;
            const { imageId, featured } = req.body;

            if (!imageId || featured === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Image ID and featured status are required'
                });
            }

            // Verify image belongs to user
            const imageResult = await db.query(
                'SELECT user_id FROM user_images WHERE id = $1',
                [imageId]
            );

            if (imageResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: ERROR_MESSAGES.IMAGE_NOT_FOUND
                });
            }

            if (imageResult.rows[0].user_id !== authenticatedUserId) {
                return res.status(403).json({
                    success: false,
                    error: ERROR_MESSAGES.UNAUTHORIZED
                });
            }

            // Update featured status (featured column exists)
            // If setting as featured, first unfeature all other images for this user
            if (featured) {
                await db.query(
                    'UPDATE user_images SET featured = 0 WHERE user_id = $1 AND id != $2',
                    [authenticatedUserId, imageId]
                );
            }
            
            // Update featured status (convert boolean to integer for smallint column)
            const featuredValue = featured ? 1 : 0;
            await db.query(
                'UPDATE user_images SET featured = $1 WHERE id = $2',
                [featuredValue, imageId]
            );

            res.json(ApiResponse.success({
                message: `Image ${featured ? 'featured' : 'unfeatured'} successfully`
            }));
        } catch (error) {
            console.error('[ImageRoutes] Error in set-featured-image:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to set featured status'
            });
        }
    });

    /**
     * GET /api/image/metrics - Get image upload metrics (admin only - optional)
     */
    router.get('/api/image/metrics', async (req, res) => {
        try {
            res.json(ApiResponse.success({
                metrics: {
                    ...imageMetrics,
                    averageProcessingTime: imageMetrics.totalUploads > 0 
                        ? Math.round(imageMetrics.totalProcessingTime / imageMetrics.totalUploads)
                        : 0,
                    averageFileSize: imageMetrics.successfulUploads > 0
                        ? Math.round(imageMetrics.totalBytes / imageMetrics.successfulUploads)
                        : 0
                }
            }));
        } catch (error) {
            console.error('[ImageRoutes] Error in image metrics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get image metrics'
            });
        }
    });

    if (!isClamAvExplicitlyDisabled()) {
        getClamScanner()
            .then((scanner) => {
                if (scanner) {
                    console.log('[ImageRoutes] ClamAV scanner ready for profile uploads');
                } else if (isClamAvRequired()) {
                    console.error(
                        '[ImageRoutes] CLAMAV_REQUIRED=true but ClamAV did not initialize — uploads will be rejected until fixed'
                    );
                } else {
                    console.warn(
                        '[ImageRoutes] ClamAV not running — uploads proceed without scanning (set CLAMD_HOST + CLAMD_PORT or CLAMD_SOCKET; CLAMAV_DISABLED=true silences this)'
                    );
                }
            })
            .catch((e) => {
                console.error('[ImageRoutes] ClamAV warmup failed:', e.message || e);
            });
    }

    router.use((err, req, res, next) => {
        if (res.headersSent) {
            return next(err);
        }
        const status = err.statusCode || err.status || (err.name === 'MulterError' ? 400 : 500);
        const message =
            err.message ||
            (err.name === 'MulterError' ? ERROR_MESSAGES.NO_IMAGES : 'Upload failed');
        res.status(status).json({
            success: false,
            error: message
        });
    });

    return router;
}

module.exports = createImageRoutes;
